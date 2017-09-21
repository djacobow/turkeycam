#!/usr/bin/env python3

import time
from smbus import SMBus

class rigmi2c(object):
    def __init__(self):
        self.bus = SMBus(1)
        self.addr = 42

    def readall(self):
        try:
            data = self.bus.read_i2c_block_data(self.addr, 1, 32)
            rd = []
            for i in range(8):
                rd.append(data[4*i] | (data[1+4*i] << 8) | (data[2+4*i] << 16) | (data[3+4*i] << 24))
            return rd 
        except Exception as e:
            print(e)
            return None

    def _writeReg(self,cmd,addr,val):
        try:
            addr &= 0xf
            cmd &= 0xf
            c  = (cmd << 4) | addr
            d3 = (val >> 24) & 0xff
            d2 = (val >> 16) & 0xff
            d1 = (val >> 8) & 0xff
            d0 = val & 0xff
            self.bus.write_i2c_block_data(self.addr,c,[d3,d2,d1,d0])
            time.sleep(0.30) # necessary to avoid some kind of i2c error
            return True
        except Exception as e:
            print('- Error writing to i2c device.');
            print(e)
        return False

    def setWord(self,addr,bits):
        return self._writeReg(0,addr,bits)

    def setBits(self,addr,bits):
        return self._writeReg(1,addr,bits)

    def clrBits(self,addr,bits):
        return self._writeReg(2,addr,bits)

    def tglBits(self,addr,bits):
        return self._writeReg(3,addr,bits)



if __name__ == '__main__':
    r = rigmi2c()

    if True:
        r.setWord(0,0x11111111)
        r.setWord(1,0x71)
        r.setWord(2,0x33333333)
        r.setWord(3,0x44444444)
        r.setWord(4,0x55555555)
        r.setWord(5,0x66666666)
        r.setWord(6,0x77777777)
        r.setWord(7,0x88888888)
       
    if True:
        res = r.readall()
        rhex = [ format(x, '08X') for x in res ]
        print(rhex)

