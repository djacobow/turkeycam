#!/usr/bin/env python3

import time
import datetime
import pidog
import subprocess
import re

consts = {
    'STAT_BIT_WDOG_EN'   : 0x0001,
    'STAT_BIT_WDOG_FIRED': 0x0002,
    'STAT_BIT_WDOG_SOON' : 0x0004,
    'STAT_BIT_WAKE_EN'   : 0x0008,
    'STAT_BIT_WAKE_FIRED': 0x0010,
    'STAT_BIT_PWR_ON'    : 0x0020,
    'STAT_BIT_LED_WARN'  : 0x0040,
}


class Wdog:
    def __init__(self,icfg):
        self.cfg = icfg
        self.last_heartbeat = datetime.datetime.now()
        self.hb_in_progress = False

    def debug(self):
        regvals = self.pidog.getAll()
        print(regvals)


    def setup(self):
        self.pidog = pidog.PiDog()
        self.pidog.reset()
        self.pidog.set('on_remaining',    self.cfg['on_resetval'])
        self.pidog.set('on_rem_resetval', self.cfg['on_resetval'])
        self.pidog.set('off_rem_resetval',self.cfg['off_resetval'])
        self.pidog.setBits('status',consts['STAT_BIT_WDOG_EN'] | consts['STAT_BIT_WAKE_EN'] | consts['STAT_BIT_PWR_ON'])
        self.pidog.clearBits('status',consts['STAT_BIT_WDOG_FIRED'] | consts['STAT_BIT_WAKE_FIRED'])


    def unsetup(self):
        pass

    def battIsOK(self):
        # this is set up for sensa input of PiDog set to an open
        # drain low battery pin on the boost converter. When it is
        # pulled low, the boost converter is signalling that the
        # batter is low
        lb_volts = self.pidog.get('vsensa_vsensb')['vsensa']
        print('lb_volts',lb_volts) 
        if lb_volts < 1000:
            return False

        return True

    def beatHeart(self):
        #self.debug()
        now = datetime.datetime.now()
        if (now - self.last_heartbeat > datetime.timedelta(seconds=self.cfg['heartbeat_period'])):
            self.pidog.set('on_remaining', self.cfg['on_resetval'])
            self.debug()
            self.last_heartbeat = now



    def shutdown(self, time_to_light = None):

        # First, just wait for shutdown_delay seconds. This is really only allow
        # for David to stop shutdowns before they actually complete while debugging.
        print('Shutting down in {0} seconds!'.format(str(self.cfg['shutdown_delay'])))
        print('Shutdown will last {0} seconds'.format(str(time_to_light)))
        self.pidog.set('on_remaining', self.cfg['shutdown_delay'] + 30)
        st = datetime.datetime.now()
        while (datetime.datetime.now() - st).seconds < self.cfg['shutdown_delay']:
            print(' waiting to start shutdown....')
            time.sleep(2)

        print('Telling watchdog to turn off power.')
        self.pidog.set('on_remaining', self.cfg['allow_clean_shutdown_delay'])
        shutdown_duration = self.cfg['shutdown_duration']
        if time_to_light is not None:
            shutdown_duration = int(time_to_light)
        self.pidog.set('off_resetval', shutdown_duration)

        if True:
            print('Shutting down.')
            process = subprocess.Popen(self.cfg['shutdown_cmd'].split(), stdout=subprocess.PIPE)
            output = process.communicate()[0]
            print(output)


    def wait_for_time_sync(self):
        ready = False
        max_iters = int(self.cfg['timesync_wait_max'] / self.cfg['timesync_wait_iter_delay'])
        itr = 0;
        self.pidog.set('on_remaining', self.cfg['timesync_wait_max'] + 30)
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
            itr += 1
        # if we haven't synced in three minutes, it's probably because the network is not 
        # coming up. Let's just give up but at least shut down gracefully to try later.
        if not ready:
            self.shutdown()



