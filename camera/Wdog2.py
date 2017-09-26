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
    'STAT_BIT_WAKE_FIRED': 0x0008,
    'STAT_BIT_WDOG_SOON' : 0x0010,
    'STAT_BIT_PWR_ON'    : 0x0020,
}


class Wdog:
    def __init__(self,icfg):
        self.cfg = icfg
        self.last_heartbeat = datetime.datetime.now()
        self.hb_in_progress = False

    def debug(self):
        stats = []
        regs = self.i2c.readall();
        for regname in consts:
            if regname.startswith('REG_'):
                v = regs[consts[regname]]
                print('{:<20}: {:08x} {:d}'.format(regname,v,v))
            if regname.startswith('STAT_BIT_'):
                b = regs[consts['REG_STATUS']] & consts[regname]
                if b:
                    stats.append(regname)
        print(', '.join(stats))
        print('')



    def setup(self):
        self.i2c = rigmi2c.rigmi2c()
        self.i2c.setWord(consts['REG_ON_REMAINING']     , self.cfg['on_resetval'])
        self.i2c.setWord(consts['REG_ON_REM_RESETVAL']  , self.cfg['on_resetval'])
        self.i2c.setWord(consts['REG_OFF_REM_RESETVAL'] , self.cfg['off_resetval'])
        self.i2c.setBits(consts['REG_STATUS'], consts['STAT_BIT_WDOG_EN'] | consts['STAT_BIT_WAKE_EN'] | consts['STAT_BIT_PWR_ON'])
        self.i2c.clrBits(consts['REG_STATUS'], consts['STAT_BIT_WDOG_FIRED'] | consts['STAT_BIT_WAKE_FIRED'])


    def unsetup(self):
        pass

    def battIsOK(self):
        # need to revisit
        return True

    def beatHeart(self):
        #self.debug()
        now = datetime.datetime.now()
        if (now - self.last_heartbeat > datetime.timedelta(seconds=self.cfg['heartbeat_period'])):
            self.i2c.setWord(consts['REG_ON_REMAINING'], self.cfg['on_resetval'])
            self.last_heartbeat = now



    def shutdown(self):

        # First, just wait for shutdown_delay seconds. This is really only allow
        # for David to stop shutdowns before they actually complete while debugging.
        print('Shutting down in ' + str(self.cfg['shutdown_delay']) + ' seconds!')
        self.i2c.setWord(consts['REG_ON_REMAINING'], self.cfg['shutdown_delay'] + 30)
        st = datetime.datetime.now()
        while (datetime.datetime.now() - st).seconds < self.cfg['shutdown_delay']:
            print(' waiting to start shutdown....')
            time.sleep(2)

        print('Telling watchdog to turn off power.')
        self.i2c.setWord(consts['REG_ON_REMAINING'], self.cfg['allow_clean_shutdown_delay']);
        self.i2c.setWord(consts['REG_OFF_REM_RESETVAL'], self.cfg['shutdown_duration'])

        if True:
            print('Shutting down.')
            process = subprocess.Popen(self.cfg['shutdown_cmd'].split(), stdout=subprocess.PIPE)
            output = process.communicate()[0]
            print(output)


    def wait_for_time_sync(self):
        ready = False
        max_iters = int(self.cfg['timesync_wait_max'] / self.cfg['timesync_wait_iter_delay'])
        itr = 0;
        self.i2c.setWord(consts['REG_ON_REMAINING'], self.cfg['timesync_wait_max'] + 30)
        while not ready and itr < max_iters:
            process = subprocess.Popen(self.cfg['datetimecmd'].split(), stdout=subprocess.PIPE)
            output = [x.decode('ascii') for x in process.communicate()[0].splitlines() ]

            for line in output:
                if re.match(r'NTP synchronized: yes',line):
                    print('Time synchronized.')
                    ready = True
            if not ready:
                print('Waiting for clock to be ready.')
                time.sleep(self.cfg['timesync_wait_iter_delay'])
        # if we haven't synced in three minutes, it's probably because the network is not 
        # coming up. Let's just give up but at least shut down gracefully to try later.
        if not ready:
            self.shutdown()



