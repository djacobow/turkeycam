#!/usr/bin/env python3

import time
import datetime
import pytz
from astral import Astral

class Daylight():
    def __init__(self, icity):
        self.a = Astral()
        self.a.solar_depression = 'civil';
        self.city = self.a[icity]


    def isDaylight(self):

        def dateToSSM(d):
            ssm = (d - d.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds()
            return ssm

        now = pytz.timezone('utc').localize(datetime.datetime.now())

        n0 = now
        n1 = n0

        sun = self.city.sun(date=now, local = True)
        sunset_ssm  = dateToSSM(sun['sunset'])
        sunrise_ssm = dateToSSM(sun['sunrise'])
        now_ssm     = dateToSSM(n1) 
        if False:
            print('now_ssm:  ' + str(now_ssm))
            print('set_ssm:  ' + str(sunset_ssm))
            print('rise_ssm: ' + str(sunrise_ssm))

        daylight = now_ssm > sunrise_ssm and now_ssm < sunset_ssm
        return daylight


