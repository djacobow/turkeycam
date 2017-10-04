#!/usr/bin/env python3

import time
import datetime
import pytz
from astral import Astral

class Daylight():
    def __init__(self, icfg):
        self.a = Astral()
        self.a.solar_depression = 'civil';
        self.city = self.a[icfg['city']]
        self.cfg  = icfg


    def isDaylight(self):
        if self.cfg.get('stay_up',False):
            return True

        def dateToSSM(d):
            ssm = (d - d.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds()
            return ssm

        now = pytz.timezone('utc').localize(datetime.datetime.now())

        n0 = now
        n1 = n0

        sun = self.city.sun(date=now, local = True)
        sunset_ssm  = self.cfg.get('sunset_ssm', dateToSSM(sun['sunset']))
        sunrise_ssm = self.cfg.get('sunrise_ssm',dateToSSM(sun['sunrise']))

        now_ssm     = dateToSSM(n1) 
        if False:
            print('now_ssm:  ' + str(now_ssm))
            print('set_ssm:  ' + str(sunset_ssm))
            print('rise_ssm: ' + str(sunrise_ssm))

        daylight = now_ssm > sunrise_ssm and now_ssm < sunset_ssm
        return daylight


    def timeToSunUp(self):
        if self.cfg.get('stay_up',False):
            return 0

        def dateToSSM(d):
            ssm = (d - d.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds()
            return ssm

        now = pytz.timezone('utc').localize(datetime.datetime.now())

        sun = self.city.sun(date=now, local = True)
        sunset_ssm  = self.cfg.get('sunset_ssm', dateToSSM(sun['sunset']))
        sunrise_ssm = self.cfg.get('sunrise_ssm',dateToSSM(sun['sunrise']))

        tomorrow_now = now + datetime.timedelta(days=1)
        tomorrow_sun = self.city.sun(date=tomorrow_now, local = True)
        tomorrow_sunrise_ssm = self.cfg.get('sunrise_ssm',dateToSSM(tomorrow_sun['sunrise']))

        now_ssm     = dateToSSM(now) 

        if now_ssm < sunrise_ssm:
            #print("before sunrise")
            return sunrise_ssm - now_ssm
        elif now_ssm > sunset_ssm:
            #print("after sunset, now: {0} sunset {1} tomorrow sunrise {2}".format(now_ssm,sunset_ssm,tomorrow_sunrise_ssm))
            return 24*60*60 - now_ssm + tomorrow_sunrise_ssm
        else:
            #print("sun is up")
            return 0


if __name__ == '__main__':
    cfg = {'city':'San Francisco'}
    d = Daylight(cfg)
    while True:
        print(d.timeToSunUp())
        time.sleep(1)

