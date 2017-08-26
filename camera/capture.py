#!/usr/bin/env python3

import sys
import picamera
import time
import io
from PIL import Image
import requests
import datetime
import base64
import json
import RPi.GPIO as GPIO
from astral import Astral
import pytz

cfg = {
    'token': '+gI0O6wTIuo9Les7iSdfWxTvXrShJyrLpu0opBfkI=',
    'image_res': (800, 600),
    'url': 'https://skunkworks.lbl.gov/turkeycam/newimage',
    'shutdown_cmd': '/usr/bin/sudo /sbin/shutdown -h now',
    'shutdown_pin': 13,
    'heartbeat_pin': 11,
    'city': 'San Francisco',
    'tzname': 'US/Pacific',
    'picture_period': 30,
    'heartbeat_period': 10,
    'tick_length': 0.5,
    'heartbeat_ticks': 10,
}


def myIP():
    try:
        return requests.get('https://api.ipify.org/?format=json').json()['ip']
    except:
        return 'dunno'

def captureToImage():
    image = None
    stream = None
    with picamera.PiCamera() as camera:
        camera.resolution = cfg['image_res']
        stream = io.BytesIO()
        camera.capture(stream, format='jpeg')
        stream.seek(0)
        image = Image.open(stream)
        stream.seek(0)

    return { 'image': image, 'stream': stream }




def uploadOne(img, ip = None):
    now = datetime.datetime.now()
    data = {
        'token': cfg['token'],
        'source': 'turkeyCam',
        'date': now.isoformat(),
        'source_ip': ip,
        'image_jpeg': base64.b64encode(img['stream'].getvalue()).decode('utf-8'),
    }
    return requests.post(cfg['url'], data = data)
 

def shutdown():
    print('Shutting down!')
    GPIO.output(cfg['shutdown_pin'], GPIO.LOW)
    GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
    if True:
        import subprocess
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
    GPIO.setmode(GPIO.BOARD)
    GPIO.setup(cfg['heartbeat_pin'], GPIO.OUT, initial = GPIO.HIGH)
    GPIO.setup(cfg['shutdown_pin'], GPIO.OUT, initial = GPIO.HIGH)

def unsetupGPIO():
    GPIO.output(cfg['heartbeat_pin'], GPIO.HIGH)
    GPIO.output(cfg['shutdown_pin'], GPIO.HIGH)

def mymain():
    setupGPIO()

    a = Astral()
    a.solar_depression = 'civil';
    city = a[cfg['city']]

    last_shot      = pytz.timezone(cfg['tzname']).localize(datetime.datetime.now())
    last_heartbeat = pytz.timezone(cfg['tzname']).localize(datetime.datetime.now())
    sun = city.sun(date=last_shot, local = True)

    ip = myIP()
    count = 0
    running = True;
    beat_count = 0

    while running:
        now = pytz.timezone(cfg['tzname']).localize(datetime.datetime.now())

        #if count > 40:
        if now > sun['sunset']:
            running = False
            shutdown()

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
