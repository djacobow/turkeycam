#include <Arduino.h>
#include <Wire.h>
#include "regfile.h"
#include "ema.h"


const uint8_t MY_I2C_ADDR = 42;
const uint8_t REG_STATUS        = 0;
const uint8_t REG_OUTPUT        = 1;
const uint8_t REG_ON_REMAINING  = 2;
const uint8_t REG_OFF_REMAINING = 3;
const uint8_t REG_ON_REM_RESETVAL = 4;
const uint8_t REG_OFF_REM_RESETVAL = 5;

const uint8_t PIN_PWR = 6;
const uint8_t PIN_LED0 = 7;
const uint8_t PIN_LED1 = 8;
const uint8_t PIN_LED2 = 9;

const uint32_t OUT_BIT_PWR_ON      = 0x0001;
const uint32_t OUT_BIT_LED0        = 0x0010;
const uint32_t OUT_BIT_LED1        = 0x0020;
const uint32_t OUT_BIT_LED2        = 0x0040;
const uint32_t STAT_BIT_WDOG_EN    = 0x0001;
const uint32_t STAT_BIT_WDOG_FIRED = 0x0002;
const uint32_t STAT_BIT_WAKE_EN    = 0x0004;
const uint32_t STAT_BIT_WAKE_FIRED = 0x0008;
const uint32_t STAT_BIT_WDOG_SOON  = 0x0010;
const uint32_t STAT_BIT_PWR_ON     = 0x0020;

#define TESTING 1
#ifdef TESTING
const uint32_t DEFAULT_ON_TIME     = 20;
const uint32_t DEFAULT_OFF_TIME    = 20;
#else
const uint32_t DEFAULT_ON_TIME     = 5 * 60;
const uint32_t DEFAULT_OFF_TIME    = 5 * 60;
#endif

const size_t rf_size = 8;
regfile_c<uint32_t, rf_size> rf;

// there is only one request type, and it is very simple:
// dump the entire register file. We don't even need to
// examine the "command"
void requestEvent() {
  void *rf0 = rf.getptr(0);
  Wire.write((uint8_t *)rf0,rf_size * sizeof(uint32_t));
  Serial.println("requestEvent");
}
/*
void requestEvent() {
  Wire.write(11);
}
*/
void receiveEvent(int count) {
  Serial.println("receiveEvent");
  if (count == 5) {
    uint8_t cmd = Wire.read();
    uint32_t val = 0;
    for (uint8_t i=0; i<4; i++) {
      val <<= 8;
      val |= Wire.read() & 0xff;     
    }
    rf.update((cmd >> 4) & 0x0f, cmd & 0xf, val);
  } else {
    while (count) {
      uint8_t x = Wire.read();
      count--;
    }
  }
}


uint32_t last_opattern;
uint32_t now = millis();
uint32_t last_loop = now;

void setup() {

  Wire.begin(MY_I2C_ADDR);
  Wire.onReceive(receiveEvent);
  Wire.onRequest(requestEvent);

  // our output wires
  pinMode(PIN_PWR, OUTPUT);
  pinMode(PIN_LED0, OUTPUT);
  pinMode(PIN_LED1, OUTPUT);
  pinMode(PIN_LED2, OUTPUT);

  // initialize the register file, start
  // in shutdon mode
  rf.clear();
  rf.set(REG_ON_REMAINING,  DEFAULT_ON_TIME);
  rf.set(REG_OFF_REMAINING, DEFAULT_OFF_TIME);
  rf.set(REG_OFF_REM_RESETVAL, DEFAULT_OFF_TIME);
  rf.set(REG_ON_REM_RESETVAL, DEFAULT_ON_TIME);
  rf.set(REG_OUTPUT,        OUT_BIT_PWR_ON);
  rf.set(REG_STATUS,        STAT_BIT_WDOG_EN | STAT_BIT_WAKE_EN | STAT_BIT_PWR_ON);
  rf.set_debug(&Serial);
  last_opattern = rf.get(REG_OUTPUT);

  interrupts();
  Serial.begin(9600);
  Serial.println("Heyyo!");

}

void setb(uint32_t &r, uint32_t b) { r |= b;  };
void clrb(uint32_t &r, uint32_t b) { r &= ~b; };
void setclrb(uint32_t &r, uint32_t b, bool c) {
  if (c) setb(r,b); else clrb(r,b);
}

bool foo = 0;

void loop() {

  now = millis();
  uint32_t rx_data;
  uint32_t opattern = rf.get(REG_OUTPUT);

  if (opattern != last_opattern) {
      Serial.print("New pat: ");
      Serial.println(opattern,HEX);
      // digitalWrite(PIN_PWR,  (opattern & OUT_BIT_PWR_ON) ? LOW  : HIGH);
      digitalWrite(PIN_LED0, (opattern & OUT_BIT_LED0)   ? HIGH : LOW);
      digitalWrite(PIN_LED1, (opattern & OUT_BIT_LED1)   ? HIGH : LOW);
      digitalWrite(PIN_LED2, (opattern & OUT_BIT_LED2)   ? HIGH : LOW);

  }

  
  bool new_second = (now / 1000) != (last_loop / 1000);
  
  if (new_second) {
    noInterrupts();
    uint32_t on_rem  = rf.get(REG_ON_REMAINING);
    uint32_t off_rem = rf.get(REG_OFF_REMAINING);
    uint32_t rstat   = rf.get(REG_STATUS);

    if (true) {
      Serial.print("On rem:  "); Serial.println(on_rem,HEX);
      Serial.print("Off rem: "); Serial.println(off_rem,HEX);
      Serial.print("rstat:   "); Serial.println(rstat,HEX);
      Serial.print("oput:    "); Serial.println(rf.get(REG_OUTPUT));
      Serial.println("------");
    }

    if (false) {
      setclrb(opattern, OUT_BIT_LED0, rstat & STAT_BIT_WDOG_FIRED);
      setclrb(opattern, OUT_BIT_LED1, rstat & STAT_BIT_WAKE_FIRED);
      setclrb(opattern, OUT_BIT_LED2, (rstat & STAT_BIT_WDOG_EN) && (on_rem < 30));
    }

    if (rstat & STAT_BIT_PWR_ON) {
      
      if (rstat & STAT_BIT_WDOG_EN) {
        if (!on_rem) {
          rstat |= STAT_BIT_WDOG_FIRED;
          // rstat &= ~STAT_BIT_WDOG_EN;
          opattern &= ~OUT_BIT_PWR_ON;
          rstat &= ~STAT_BIT_PWR_ON;
          off_rem = rf.get(REG_OFF_REM_RESETVAL);
        } else {
          on_rem -= 1;
        }
      }

    } else {
      
       
      if (rstat & STAT_BIT_WAKE_EN) {
        if (!off_rem) {
          rstat |= STAT_BIT_WAKE_FIRED | STAT_BIT_WDOG_EN | STAT_BIT_PWR_ON;
          // rstat &= ~STAT_BIT_WAKE_EN;
          opattern |= OUT_BIT_PWR_ON;
          on_rem = rf.get(REG_ON_REM_RESETVAL);
        } {
          if (!on_rem) off_rem -= 1;
        }
      
      }
    }
    
    rf.set(REG_ON_REMAINING, on_rem);
    rf.set(REG_OFF_REMAINING, off_rem);
    rf.set(REG_STATUS, rstat);
    rf.set(REG_OUTPUT, opattern);
    last_opattern = opattern;
    interrupts();
  }
  

  last_loop = now;

  delay(100);
};
