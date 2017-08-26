#!/usr/bin/env python3

import picamera
import time
import io
from PIL import Image
import requests
import datetime
import base64
import json

token = '+gI0O6wTIuo9Les7iSdfWxTvXrShJyrLpu0opBfkI='

def myIP():
    try:
        return requests.get('https://api.ipify.org/?format=json').json()['ip']
    except:
        return 'dunno'

def captureToImage():
    image = None
    stream = None
    with picamera.PiCamera() as camera:
        camera.resolution = (800, 600)
        stream = io.BytesIO()
        camera.capture(stream, format='jpeg')
        stream.seek(0)
        image = Image.open(stream)
        stream.seek(0)

    return { 'image': image, 'stream': stream }




def uploadOne(img, ip = None):
    url = 'https://skunkworks.lbl.gov/turkeycam/newimage'
    now = datetime.datetime.now()
    data = {
        'token': token,
        'source': 'turkeyCam',
        'date': now.isoformat(),
        'source_ip': ip,
        'image_jpeg': base64.b64encode(img['stream'].getvalue()).decode('utf-8'),
    }
    return requests.post(url, data = data)
 


if __name__ == '__main__':
    ip = myIP()
    while True:
        try:
            w = captureToImage()
            res = uploadOne(w,ip)
            print(res.body)
        except:
            print('well, that didn\'t work')

        time.sleep(30);
    
