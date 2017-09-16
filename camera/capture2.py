#!/usr/bin/env python3

import sys
import time
import io
import datetime
import string
import random
import pytz
import base64
import json
import picamera
from skimage.measure import compare_ssim as ssim
import numpy as np
from PIL import Image
import requests
from urllib.parse import urlencode
from Wdog import Wdog
from Daylight import Daylight
from SelfProvision import loadCredentials

last_idata = None
trailing_average_sameness = None

url_base = 'https://skunkworks.lbl.gov/turkeycam'

creds = loadCredentials('./secret_code.json');

cfg = {
    'wdog': {
        'shutdown_pin': 13,
        'heartbeat_pin': 11,
        'lowbatt_pin': 15,
        'shutdown_cmd': '/usr/bin/sudo /sbin/shutdown -h now',
        'max_lowbatt_before_shutdown': 4,
        'heartbeat_period': 10,
        'heartbeat_low_secs': 5,
        'shutdown_delay': 90,
        'datetimecmd': '/usr/bin/timedatectl',
    },
    'config_check_period': 7200,
    'ping_period': 60,
    'token': creds['token'],
    'camera_name': creds['camera_name'],
    'post_url': url_base + '/newimage',
    'ping_url': url_base + '/stillhere',
    'config_url': url_base + '/camparams/' + creds['camera_name'],
    'daylight': {
        'city': 'San Francisco',
    },
    'picture_period': 10,
    'tick_length': 0.5,
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
        return requests.get('https://ipinfo.io').json()['ip']
    except:
        return 'dunno'


def captureToBytesRGB():
    stream = None
    image = None

    with picamera.PiCamera() as camera:
        for param in cfg['cam_params']:
            setattr(camera,param,cfg['cam_params'][param])
        stream = io.BytesIO()
        time.sleep(1) # this is for the camera to adjust its exposure
        print('Capture image')
        camera.capture(stream, format='rgb')
        width = cfg['cam_params']['resolution'][0]
        height = cfg['cam_params']['resolution'][1]
        stream.seek(0)
        image = np.frombuffer(stream.getvalue(), dtype=np.uint8).reshape(height, width, 3)
        stream.seek(0)
    return {'npimage': image, 'stream': stream}
        


def compareImages(i0,i1):
    # this basically resizes a 2d array, to make a pic smaller
    def rebin(a, shape):
        sh = shape[0],a.shape[0]//shape[0],shape[1],a.shape[1]//shape[1]
        return a.reshape(sh).mean(-1).mean(1)

    if not i0 or not i1:
        return None

    # convert to grayscale
    gs0 = np.mean(i0['npimage'], axis=2)
    gs1 = np.mean(i1['npimage'], axis=2)
    # shrink to make calc faster
    newshape = [ int(x/4) for x in gs0.shape ]

    sm0 = rebin(gs0,newshape)
    sm1 = rebin(gs1,newshape)

    s = ssim(sm0, sm1)
    return s

def takePhotoAndMaybeUpload(ip):
    global last_idata
    global trailing_average_sameness

    try:
        idata = captureToBytesRGB()
        sameness = compareImages(idata, last_idata)

        if sameness is not None:
            if trailing_average_sameness is None:
                trailing_average_sameness = sameness

            print('Sameness: {0}, Trailing: {1}'.format(str(sameness),str(trailing_average_sameness)))
            
            trailing_average_sameness += -0.1 * trailing_average_sameness + 0.1 * sameness
            res = None
            if sameness < 0.90 * trailing_average_sameness:
                res = uploadImage(idata,ip)
                print(res)

        last_idata = idata

    except Exception as e:
        print('well, that didn\'t work')
        print(e)


def sayHi(ip = None):
    print('sayHi()')
    now = datetime.datetime.now()

    data = {
        'camera_name': cfg.get('camera_name',''),
        'token': cfg['token'],
        'source': 'turkeyCam',
        'date': now.isoformat(),
        'source_ip': ip,
    }
    return requests.post(cfg['ping_url'], data = data, timeout=20)

def uploadImage(img, ip = None):
    print('uploadImage()')
    now = datetime.datetime.now()

    pilimg = Image.fromarray(img['npimage'],'RGB')
    fstr   = io.BytesIO()
    pilimg.save(fstr,format='jpeg')
    fstr.seek(0)

    data = {
        'camera_name': cfg.get('camera_name',''),
        'token': cfg['token'],
        'source': 'turkeyCam',
        'date': now.isoformat(),
        'source_ip': ip,
        'image_jpeg': base64.b64encode(fstr.getvalue()).decode('utf-8'),
    }
    return requests.post(cfg['post_url'], data = data, timeout=60)
 



def configOverride(cfg):
    try:
        url = cfg['config_url'] + '?' + urlencode({'token':cfg['token']})
        res = requests.get(url, timeout=30)
        if res.status_code == 200:
            data = res.json()
            for key in data:
                print('Setting cfg[{0}] = {1}'.format(key,json.dumps(data[key])))
                cfg[key] = data[key]
        else:
            print('Got error code fetching params from server.')
    except Exception as e:
        print('Got exception fetching params.')
        print(e)





def mymain():

    wdog = Wdog(cfg['wdog'])
    wdog.setup()
    wdog.wait_for_time_sync()

    configOverride(cfg)

    day = Daylight(cfg['daylight'])

    last_shot      = pytz.timezone('utc').localize(datetime.datetime.now())
    last_cfg_check = pytz.timezone('utc').localize(datetime.datetime.now())
    last_ping      = pytz.timezone('utc').localize(datetime.datetime.now())

    ip = myIP()
    count = 0
    running = True;
    batt_nok_count = 0

    while running:
        now = pytz.timezone('utc').localize(datetime.datetime.now())

        
        if not day.isDaylight():
        #if False:
            running = False
            wdog.shutdown()

        if not wdog.battIsOK():
            wdog.shutown()

        did_upload = False
        if now - last_shot > datetime.timedelta(seconds=cfg['picture_period']):
            last_shot = now
            did_upload = takePhotoAndMaybeUpload(ip)

        if not did_upload and now - last_ping > datetime.timedelta(seconds=cfg['ping_period']):
            last_ping = now
            res = sayHi(ip)

        if now - last_cfg_check > datetime.timedelta(seconds=cfg['config_check_period']):
            last_cfg_check = now
            configOverride(cfg)

        wdog.beatHeart()

        time.sleep(cfg['tick_length']);
        count += 1
  

if __name__ == '__main__':
    try:
        mymain()
    except Exception as e:
        print('Whoops!')
        print(e)
    
        wdog.unsetup()
