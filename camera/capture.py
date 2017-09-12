#!/usr/bin/env python3

import sys
import time
import io
import datetime
import pytz
import base64
import subprocess
import re
import json
import picamera
from PIL import Image
import requests
import RPi.GPIO as GPIO
from astral import Astral

with open('secret_code.json') as fh:
    secret = json.load(fh)


cfg = {
    'use_pil': False,
    'token': secret['token'],
    'url': 'https://skunkworks.lbl.gov/turkeycam/newimage',
    'shutdown_cmd': '/usr/bin/sudo /sbin/shutdown -h now',
    'datetimecmd': '/usr/bin/timedatectl',
    'shutdown_pin': 13,
    'heartbeat_pin': 11,
    'lowbatt_pin': 15,
    'max_lowbatt_before_shutdown': 4,
    'city': 'San Francisco',
    #'tzname': 'US/Pacific',
    'picture_period': 60,
    'heartbeat_period': 10,
    'tick_length': 0.5,
    'heartbeat_ticks': 10,
    'shutdown_delay': 90,
    'cam_params': {
        'resolution': (2560, 2048),
        #'resolution': (3280, 2464),  # max native res for pi camera2
        # auto iso
        #'iso': 100,
        'vflip': False,
        'image_effect': 'denoise',
    },
}


def myIP():
    try:
        # return requests.get('https://api.ipify.org/?format=json').json()['ip']
        return requests.get('https://ipinfo.io').json()['ip']
    except:
        return 'dunno'

def captureToImage():
    image = None
    stream = None
    with picamera.PiCamera() as camera:
        for param in cfg['cam_params']:
            setattr(camera,param,cfg['cam_params'][param])

        stream = io.BytesIO()
        time.sleep(1)
        camera.capture(stream, format='jpeg')
        stream.seek(0)
        if cfg['use_pil']:
            image = Image.open(stream)
            stream.seek(0)

    return { 'image': image, 'stream': stream }




def uploadOne(img, ip = None):
    now = datetime.datetime.now()
    data = {
        'camera_name': secret.get('camera_name',''),
        'token': cfg['token'],
        'source': 'turkeyCam',
        'date': now.isoformat(),
        'source_ip': ip,
        'image_jpeg': base64.b64encode(img['stream'].getvalue()).decode('utf-8'),
    }
    return requests.post(cfg['url'], data = data, timeout=60)
 

def wait_for_time_sync():
    ready = False
    while not ready:
        process = subprocess.Popen(cfg['datetimecmd'].split(), stdout=subprocess.PIPE)
        output = [x.decode('ascii') for x in process.communicate()[0].splitlines() ]

        for line in output:
            if re.match(r'NTP synchronized: yes',line):
                print('Time synchronized.')
                ready = True
        if not ready:
            print('Waiting for clock to be ready.')
            time.sleep(5)



def shutdown():

    def signalShutdownRequest():
        # not one, but several pulses are required to get watchdog
        # to initiate power-off 
        GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
        for x in range(4):
            print("Pulse " + str(x))
            GPIO.output(cfg['shutdown_pin'], GPIO.HIGH)
            GPIO.output(cfg['heartbeat_pin'], GPIO.LOW)
            time.sleep(2)
            GPIO.output(cfg['shutdown_pin'], GPIO.LOW)
            GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
            time.sleep(2)

    print('Shutting down in ' + str(cfg['shutdown_delay']) + ' seconds!')
    st = datetime.datetime.now()
    while (datetime.datetime.now() - st).seconds < cfg['shutdown_delay']:
        print(datetime.datetime.now() - st)
        GPIO.output(cfg['heartbeat_pin'], GPIO.LOW)
        time.sleep(2)
        GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
        time.sleep(2)

    print('Telling watchdog to turn off power.')
    signalShutdownRequest()
    if True:
        print('Shutting down.')
        process = subprocess.Popen(cfg['shutdown_cmd'].split(), stdout=subprocess.PIPE)
        output = process.communicate()[0]
        print(output)

def takeAndUploadPhoto(ip):
    try:
        print('Taking a photo.')
        w = captureToImage()
        res = uploadOne(w,ip)
        print(res)
    except Exception as e:
        print('well, that didn\'t work')
        print(e)

def setupGPIO():
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BOARD)
    GPIO.setup(cfg['heartbeat_pin'], GPIO.OUT, initial = GPIO.HIGH)
    GPIO.setup(cfg['shutdown_pin'], GPIO.OUT, initial = GPIO.HIGH)
    GPIO.setup(cfg['lowbatt_pin'], GPIO.IN)

def unsetupGPIO():
    GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
    GPIO.output(cfg['shutdown_pin'], GPIO.HIGH)


def isDaylight(now, city):

    def dateToSSM(d):
        ssm = (d - d.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds()
        return ssm

    #n0 = pytz.timezone('utc').localize(now)
    n0 = now
    #print('before: ' + str(dateToSSM(n0)))
    #n1 = n0.astimezone(pytz.timezone('US/Pacific'))
    #print('after: '  + str(dateToSSM(n1)))
    n1 = n0

    sun = city.sun(date=now, local = True)
    sunset_ssm  = dateToSSM(sun['sunset'])
    sunrise_ssm = dateToSSM(sun['sunrise'])
    now_ssm     = dateToSSM(n1) 
    if False:
        print('now_ssm:  ' + str(now_ssm))
        print('set_ssm:  ' + str(sunset_ssm))
        print('rise_ssm: ' + str(sunrise_ssm))

    daylight = now_ssm > sunrise_ssm and now_ssm < sunset_ssm
    return daylight


def mymain():

    wait_for_time_sync()

    setupGPIO()

    a = Astral()
    a.solar_depression = 'civil';
    city = a[cfg['city']]

    last_shot      = pytz.timezone('utc').localize(datetime.datetime.now())
    last_heartbeat = pytz.timezone('utc').localize(datetime.datetime.now())
    sun = city.sun(date=last_shot, local = True)

    ip = myIP()
    count = 0
    running = True;
    beat_count = 0
    batt_nok_count = 0

    while running:
        now = pytz.timezone('utc').localize(datetime.datetime.now())

        #if count > 40:
        if not isDaylight(now, city):
            running = False
            shutdown()

        batt_ok = GPIO.input(cfg['lowbatt_pin'])
        if batt_ok:
            batt_nok_count = 0
        else:
            print('Low battery detected.')
            batt_nok_count += 1
            if batt_nok_count > cfg['max_lowbatt_before_shutdown']:
                print('Non-transient low battery. Starting shutdown.')
                shutdown()

        #print('batt ok: ' + str(batt_ok))
        if now - last_shot > datetime.timedelta(seconds=cfg['picture_period']):
            last_shot = now
            takeAndUploadPhoto(ip)
            sun = city.sun(date=last_shot, local= True)

        if now - last_heartbeat > datetime.timedelta(seconds=cfg['heartbeat_period']):
            last_heartbeat = now
            GPIO.output(cfg['heartbeat_pin'], GPIO.LOW)
            beat_count = 0
        elif beat_count == cfg['heartbeat_ticks']:
            beat_count = 0
            GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
        else:
            beat_count += 1

        time.sleep(cfg['tick_length']);
        count += 1
  

if __name__ == '__main__':
    try:
        mymain()
    except Exception as e:
        print('Whoops!')
        print(e)
    
        unsetupGPIO()
