
#ifndef REGFILE_H
#define REGFILE_H

#include <Arduino.h>
#include <Stream.h>

template<typename REGW, size_t REG_COUNT>
class regfile_c {
    private:
        REGW registers[REG_COUNT];
        Stream *ser;
        void pp8hex(uint8_t i) {
            if (ser) {
                if (i < 16) ser->print("0");
                ser->print(i,HEX);
            }
        }
        void pp32hex(REGW i) {
            uint8_t j = sizeof(REGW);
            while (j) {
                pp8hex((uint8_t)((i >> ((j-1)*8)) & 0xff));
                j--;
            }
        }

    public:
        regfile_c() {
          ser = 0;
        }
        void set_debug(Stream *nser) {
          ser = nser;
        }
        void clear() {
          for (uint8_t i=0;i<REG_COUNT;i++) registers[i] = 0;
        };

        void dump() {
            if (ser) {
                ser->print("[ ");
                for (uint8_t i=0; i< REG_COUNT; i++) {
                    ser->print("0x");
                    pp32hex(registers[i]);
                    if (i < (REG_COUNT-1)) ser->print(", ");
                }
                ser->println(" ]");
            }
        }

        REGW get(uint8_t addr) { return registers[addr & (REG_COUNT-1)]; }
        void set(uint8_t addr, REGW val) {
            registers[addr & (REG_COUNT-1)] = val;
        }
        REGW *getptr(uint8_t addr) {
            addr = addr % REG_COUNT;
            return &(registers[addr]);
        };
        REGW update(uint8_t act, uint8_t addr, REGW arg, bool debug = true) {
            act &= 0x3;
            addr &= (REG_COUNT-1);
            if (addr != (REG_COUNT-1)) {
            
                if (ser && debug) {
                    ser->print(" arg  "); ser->print(arg,HEX);
                    ser->print(" addr "); ser->print(addr,HEX);
                    ser->print(" act  "); ser->println(act,HEX);
                }
                switch (act) {
                    case 0 : registers[addr]  = arg; break;
                    case 1 : registers[addr] |= arg; break;
                    case 2 : registers[addr] &= ~arg; break;
                    case 3 : registers[addr] ^= arg; break;
                    default: break;
                }
            } else {
               if (ser && debug) { ser->println("warn: RF will not update top reg; it's constant"); }
            }

            REGW rv = registers[addr];
            if (ser && debug) { ser->print("RF return: "); ser->println(rv,HEX); }
            return rv;
        }
};

#endif
