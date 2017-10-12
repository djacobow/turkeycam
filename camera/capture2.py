#!/usr/bin/env python3

import time
import datetime
import pytz
import ServerConnection
from Daylight import Daylight
from Camera import Camera

def getSerial():
    cpuserial = "0000000000000000"
    try:
        with open('/proc/cpuinfo','r') as fh:
            for line in fh:
                if line[0:6]=='Serial':
                    cpuserial = line[10:26]
    except:
        cpuserial = "ERROR000000000"
    return cpuserial


base_config = {
    'wdog_use_i2c': False,
    'wdog2': {
        'shutdown_cmd': '/usr/bin/sudo /sbin/shutdown -h now',
        'max_lowbatt_before_shutdown': 4,
        'heartbeat_period': 60,
        'shutdown_delay': 90,
        'datetimecmd': '/usr/bin/timedatectl',
        'allow_clean_shutdown_delay': 30,
        'shutdown_duration': 60 * 60,
        'on_resetval': 3 * 60,
        'off_resetval': 10 * 60,
        'timesync_wait_iter_delay': 5,
        'timesync_wait_max': 180,
    },
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
    'daylight': {
        'city': 'San Francisco',
    },
    'picture_period': 10,
    'tick_length': 0.5,
    'cam_params': {
    },
    # if we get a series of bad network responses, either the server
    # or the network is down. We will just shutdown and try again in 
    # a few minutes
    'max_consec_net_errs': 10,
    'net_reboot_off_period': 180,
    'cam_params': {
        'resolution': (2560, 2048),
        #'resolution': (3280, 2464),  # max native res for pi camera2
        # auto iso
        #'iso': 100,
        'vflip': False,
        'image_effect': 'denoise',
    }
}

def pre_run():

    cconn = Camera()

    server_config = {
        'provisioning_token_path': './provisioning_token.json',
        'url_base': 'https://skunkworks.lbl.gov/turkeycam',
        'credentials_path': './credentials.json',
        'params_path': './local_config.json',
        'device_name': None,
        'device_type': 'picamera',
        'device_serial': cconn.getSerial(),
    }
    sconn = ServerConnection.ServerConnection(server_config)

    cfg = { k:base_config[k] for k in base_config }
    cfg['sconn'] = sconn
    cfg['cconn'] = cconn
    sconn.getParams(cfg)
    cconn.setParams(cfg['cam_params'])

    if cfg.get('wdog_use_i2c',False):
        from Wdog2 import Wdog
        cfg['wdog'] = Wdog(cfg['wdog2'])
    else:
        from Wdog import Wdog
        cfg['wdog'] = Wdog(cfg['wdog'])

    cfg['wdog'].setup()

    return cfg



def mymain(cfg):

    cfg['wdog'].wait_for_time_sync()

    day = Daylight(cfg['daylight'])

    last_shot      = pytz.timezone('utc').localize(datetime.datetime.fromtimestamp(0))
    last_cfg_check = pytz.timezone('utc').localize(datetime.datetime.fromtimestamp(0))
    last_ping      = pytz.timezone('utc').localize(datetime.datetime.fromtimestamp(0))

    count = 0
    running = True;
    batt_nok_count = 0
    consec_net_errs = 0

    while running:
        now = pytz.timezone('utc').localize(datetime.datetime.now())

        time_to_light = day.timeToSunUp()
        if time_to_light != 0:
            running = False
            cfg['wdog'].shutdown(time_to_light)

        if not cfg['wdog'].battIsOK():
            cfg['wdog'].shutown()

        if consec_net_errs > cfg['max_consec_net_errs']:
            cfg['wdog'].shutdown(cfg['net_reboot_off_period']);

        did_upload = False
        if now - last_shot > datetime.timedelta(seconds=cfg['picture_period']):
            last_shot = now
            phdata = cfg['cconn'].takeAndComparePhoto()
            if phdata:
                cfg['sconn'].push(phdata)

        if not did_upload and now - last_ping > datetime.timedelta(seconds=cfg['ping_period']):
            last_ping = now
            res = cfg['sconn'].ping()
            if res.status_code == 200:
                consec_net_errs = 0
            else:
                consec_net_errs += 1

        if now - last_cfg_check > datetime.timedelta(seconds=cfg['config_check_period']):
            last_cfg_check = now
            cfg['sconn'].getParams(cfg)

        cfg['wdog'].beatHeart()

        time.sleep(cfg['tick_length']);
        count += 1
  

if __name__ == '__main__':
    cfg = None
    try:
        cfg = pre_run()
        if cfg:
            mymain(cfg)
    except Exception as e:
        print('Whoops!')
        print(e)
    
        if cfg and cfg.get('wdog',None):
            cfg['wdog'].unsetup()
