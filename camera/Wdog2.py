#!/usr/bin/env python3

import time
import datetime
import rigmi2c
import subprocess
import re

consts = {
    'REG_STATUS'          : 0,
    'REG_OUTPUT'          : 1,
    'REG_ON_REMAINING'    : 2,
    'REG_OFF_REMAINING'   : 3,
    'REG_ON_REM_RESETVAL' : 4,
    'REG_OFF_REM_RESETVAL': 5,

    'OUT_BIT_PWR_ON'     : 0x0001,
    'OUT_BIT_LED0'       : 0x0010,
    'OUT_BIT_LED1'       : 0x0020,
    'OUT_BIT_LED2'       : 0x0040,

    'STAT_BIT_WDOG_EN'   : 0x0001,
    'STAT_BIT_WDOG_FIRED': 0x0002,
    'STAT_BIT_WAKE_EN'   : 0x0004,
    'STAT_BIT_WDOG_FIRED': 0x0008,
    'STAT_BIT_WDOG_SOON' : 0x0010,
    'STAT_BIT_PWR_ON'    : 0x0020,
}

class Wdog:
    def __init__(self,icfg):
        self.cfg = icfg
        self.last_heartbeat = datetime.datetime.now()
        self.hb_in_progress = False

    def setup(self):
        self.i2c = rigmi2c()
        self.i2c.setWord(consts['REG_ON_REMAINING']     , 5 * 60)
        self.i2c.setWord(consts['REG_ON_REM_RESETVAL']  , 5 * 60)
        self.i2c.setWord(consts['REG_OFF_REM_RESETVAL'] , 5 * 60)
        self.i2c.setWord(consts['REG_STATUS'], consts['STAT_BIT_WDOG_EN'] | consts['STAT_BIT_WAKE_EN'] | consts['STAT_BIT_PWR_ON'])


    def signalShutdownRequest(self,waittime,offtime):
        # not one, but several pulses are required to get watchdog
        # to initiate power-off 
        self.i2c.setWord(consts['REG_ON_REMAINING'], waittime);
        self.i2c.setWord(cosnts['REG_OFF_REM_RESETVAL'], offtime)

    def unsetup(self):
        pass

    def battIsOK(self):
        # need to revisit
        return True

    def beatHeart(self):
        self.i2c.setWord(consts['REG_ON_REMAINING'], 180)


    def shutdown(self):

        print('Shutting down in ' + str(self.cfg['shutdown_delay']) + ' seconds!')
        st = datetime.datetime.now()
        while (datetime.datetime.now() - st).seconds < self.cfg['shutdown_delay']:
            time.sleep(2)

        print('Telling watchdog to turn off power.')
        self.signalShutdownRequest(30,3600)
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


