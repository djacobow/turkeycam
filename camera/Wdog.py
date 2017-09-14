#!/usr/bin/env python3

import time
import datetime
import RPi.GPIO as GPIO
import subprocess
import re

class Wdog:
    def __init__(self,icfg):
        self.cfg = icfg
        self.last_heartbeat = datetime.datetime.now()
        self.batt_nok_count = 0
        self.hb_in_progress = False

    def setup(self):

        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BOARD)
        GPIO.setup(self.cfg['heartbeat_pin'], GPIO.OUT, initial = GPIO.HIGH)
        GPIO.setup(self.cfg['shutdown_pin'], GPIO.OUT, initial = GPIO.HIGH)
        GPIO.setup(self.cfg['lowbatt_pin'], GPIO.IN, pull_up_down=GPIO.PUD_UP)

    def signalShutdownRequest(self):
        # not one, but several pulses are required to get watchdog
        # to initiate power-off 
        GPIO.output(self.cfg['heartbeat_pin'], GPIO.HIGH)
        for x in range(4):
            print("Pulse " + str(x))
            GPIO.output(self.cfg['shutdown_pin'], GPIO.HIGH)
            GPIO.output(self.cfg['heartbeat_pin'], GPIO.LOW)
            time.sleep(2)
            GPIO.output(self.cfg['shutdown_pin'], GPIO.LOW)
            GPIO.output(self.cfg['heartbeat_pin'], GPIO.HIGH)
            time.sleep(2)

    def unsetup(self):
        GPIO.output(self.cfg['heartbeat_pin'], GPIO.HIGH)
        GPIO.output(self.cfg['shutdown_pin'], GPIO.HIGH)

    def battIsOK(self):
        batt_ok = GPIO.input(self.cfg['lowbatt_pin'])
        if not batt_ok:
            batt_nok_count += 1
        else:
            batt_nok_count = 0
        return batt_nok_count < self.cfg['max_lowbatt_before_shutdown']

    def beatHeart(self):
        now = datetime.datetime.now()
        if self.hb_in_progress:
            if now - self.last_heartbeat > datetime.timedelta(seconds=self.cfg['heartbeat_low_secs']):
                self.hb_in_progress = False
                GPIO.output(self.cfg['heartbeat_pin'], GPIO.HIGH)
                print('hb_FINISH');
        else:
            if now - self.last_heartbeat > datetime.timedelta(seconds=self.cfg['heartbeat_period']):
                self.last_heartbeat = now
                self.hb_in_progress = True
                GPIO.output(self.cfg['heartbeat_pin'], GPIO.LOW)
                print('hb_START');


    def shutdown(self):

        print('Shutting down in ' + str(self.cfg['shutdown_delay']) + ' seconds!')
        st = datetime.datetime.now()
        while (datetime.datetime.now() - st).seconds < self.cfg['shutdown_delay']:
            print(datetime.datetime.now() - st)
            GPIO.output(self.cfg['heartbeat_pin'], GPIO.LOW)
            time.sleep(2)
            GPIO.output(self.cfg['heartbeat_pin'], GPIO.HIGH)
            time.sleep(2)

        print('Telling watchdog to turn off power.')
        self.signalShutdownRequest()
        if True:
            print('Shutting down.')
            process = subprocess.Popen(self.cfg['shutdown_cmd'].split(), stdout=subprocess.PIPE)
            output = process.communicate()[0]
            print(output)

    def wait_for_time_sync(self):
        ready = False
        while not ready:
            process = subprocess.Popen(self.cfg['datetimecmd'].split(), stdout=subprocess.PIPE)
            output = [x.decode('ascii') for x in process.communicate()[0].splitlines() ]

            for line in output:
                if re.match(r'NTP synchronized: yes',line):
                    print('Time synchronized.')
                    ready = True
            if not ready:
                print('Waiting for clock to be ready.')
                time.sleep(5)


