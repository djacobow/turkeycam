#include <Arduino.h>
#include <Wire.h>
#include <avr/wdt.h>
#include <avr/sleep.h>
#include <avr/power.h>
#include "regfile.h"
#include "ema.h"

const uint8_t MY_I2C_ADDR        = 42;
const uint8_t REG_STATUS           = 0;
const uint8_t REG_OUTPUT           = 1;
const uint8_t REG_ON_REMAINING     = 2;
const uint8_t REG_OFF_REMAINING    = 3;
const uint8_t REG_ON_REM_RESETVAL  = 4;
const uint8_t REG_OFF_REM_RESETVAL = 5;

const uint8_t PIN_PWR  = 6;
const uint8_t PIN_LED0 = 7;
const uint8_t PIN_LED1 = 8;
const uint8_t PIN_LED2 = 9;

typedef uint32_t reg_t;

const reg_t   OUT_BIT_PWR_ON      = 0x0001;
const reg_t   OUT_BIT_LED0        = 0x0010;
const reg_t   OUT_BIT_LED1        = 0x0020;
const reg_t   OUT_BIT_LED2        = 0x0040;
const reg_t   STAT_BIT_WDOG_EN    = 0x0001;
const reg_t   STAT_BIT_WDOG_FIRED = 0x0002;
const reg_t   STAT_BIT_WAKE_EN    = 0x0004;
const reg_t   STAT_BIT_WAKE_FIRED = 0x0008;
const reg_t   STAT_BIT_WDOG_SOON  = 0x0010;
const reg_t   STAT_BIT_PWR_ON     = 0x0020;

//#define TESTING 1
#ifdef TESTING
const reg_t   DEFAULT_ON_TIME     = 60;
const reg_t   DEFAULT_OFF_TIME    = 60;
#else
const reg_t   DEFAULT_ON_TIME     = 5 * 60;
const reg_t   DEFAULT_OFF_TIME    = 5 * 60;
#endif
const uint8_t  WARN_SECS           = 30;

const size_t rf_size = 8;



regfile_c<reg_t, rf_size> rf;
volatile bool isr_running     = false;
void          *rf_baseptr;
bool          handled_receive = false;
bool          handled_request = false;
reg_t         last_opattern;
reg_t         *pon_rem;
reg_t         *poff_rem;
reg_t         *prstat;
reg_t         *poutput;

// there is only one request type, and it is very simple:
// dump the entire register file. We don't even need to
// examine the "command"
void requestEvent() {
    isr_running = true;
    Wire.write((uint8_t *)rf_baseptr,rf_size * sizeof(reg_t));
    isr_running = false;
    handled_request = true;
}


void receiveEvent(int count) {
    isr_running = true;
    if (count == 5) {
        uint8_t cmd = Wire.read();
        reg_t val = 0;
        for (uint8_t i=0; i<4; i++) {
            val <<= 8;
            val |= Wire.read() & 0xff;    
        }
        rf.update((cmd >> 4) & 0x0f, cmd & 0xf, val, false);
    } else {
        while (count) {
            uint8_t x = Wire.read();
            count--;
        }
    }
    isr_running = false;
    handled_receive = true;
}


void setb(reg_t *r, reg_t b) { *r |= b;  };
void clrb(reg_t *r, reg_t b) { *r &= ~b; };
void setclrb(reg_t *r, reg_t b, bool c) {
    if (c) setb(r,b); else clrb(r,b);
}
void decr_by(reg_t *p, uint8_t a) {
    *p = (a > *p) ? 0 : *p - a;
};

void calcleds(reg_t *pout,
              reg_t *pstat,
              reg_t *ponrem,
              reg_t *poffrem) {
    setclrb(pout, OUT_BIT_LED2, *pstat & STAT_BIT_WDOG_FIRED);
    setclrb(pout, OUT_BIT_LED0, *pstat & STAT_BIT_WAKE_FIRED);
    bool fire_soon = ((*pstat & STAT_BIT_WDOG_EN) &&
                      (*pstat & STAT_BIT_PWR_ON) &&
                      (*ponrem < WARN_SECS)) ||
                     ((*pstat & STAT_BIT_WAKE_EN) &&
                      !(*pstat & STAT_BIT_PWR_ON) &&
                      (*poffrem < WARN_SECS));
    setclrb(pout, OUT_BIT_LED1, fire_soon);
}

void setoutputs(reg_t *pout) {
    digitalWrite(PIN_PWR,  (*pout & OUT_BIT_PWR_ON) ? LOW  : HIGH);
    digitalWrite(PIN_LED0, (*pout & OUT_BIT_LED0)   ? HIGH : LOW);
    digitalWrite(PIN_LED1, (*pout & OUT_BIT_LED1)   ? HIGH : LOW);
    digitalWrite(PIN_LED2, (*pout & OUT_BIT_LED2)   ? HIGH : LOW);
}


void timer2_setup() {
    TCCR2A = 0;
    TCCR2B = 0;
    TCNT2  = 0;
    // This yields approximately 31.0020 Hz
    OCR2A  = 252;
    TCCR2A = (1 << WGM20);
    TCCR2B = (1 << WGM22) | (1 << CS22) | (1 << CS21) | (1 << CS20);
    TIMSK2 |= (1 << OCIE2A);
}

void setup_sleep() {
    ADCSRA = 0;
    power_adc_disable();    // don't need ADC
    power_spi_disable();    // don't need SPI
    //power_timer0_disable(); // don't need millis() clock
    power_timer1_disable(); // don't need TIMER1
    // DO need: timer1, TWI
}

void enter_sleep() {
    // :-( Idle is the only sleep mode I've been able to get
    // to work correctly with TWI (i2c), even though the deep
    // sleep modes are supposed to respond to TWI address and
    // wake the processor in only a few cycles.
    set_sleep_mode(SLEEP_MODE_IDLE);
    noInterrupts();
    sleep_enable();
    sleep_bod_disable();
    setup_sleep();
    interrupts();
    sleep_cpu();
    sleep_disable();
}

void setup() {
    noInterrupts();

    Wire.begin(MY_I2C_ADDR);
    Wire.onReceive(receiveEvent);
    Wire.onRequest(requestEvent);

    pinMode(PIN_PWR,  OUTPUT);
    pinMode(PIN_LED0, OUTPUT);
    pinMode(PIN_LED1, OUTPUT);
    pinMode(PIN_LED2, OUTPUT);

    pon_rem     = rf.getptr(REG_ON_REMAINING);
    poff_rem    = rf.getptr(REG_OFF_REMAINING);
    prstat      = rf.getptr(REG_STATUS);
    poutput     = rf.getptr(REG_OUTPUT);
    rf_baseptr  = rf.getptr(0);

    // initialize the register file, start
    // in shutdon mode
    rf.clear();
    rf.set_debug(&Serial);
    *pon_rem    =  DEFAULT_ON_TIME;
    *poff_rem   = DEFAULT_OFF_TIME;
    *poutput    = OUT_BIT_PWR_ON;
    *prstat     = STAT_BIT_WDOG_EN |
                  STAT_BIT_WAKE_EN |
                  STAT_BIT_PWR_ON;
    rf.set(REG_OFF_REM_RESETVAL, DEFAULT_OFF_TIME);
    rf.set(REG_ON_REM_RESETVAL,  DEFAULT_ON_TIME);
    last_opattern = *poutput;

    wdt_enable(WDTO_8S);
    timer2_setup();

    setup_sleep();

    interrupts();

    Serial.begin(57600);
    Serial.println("We're ready to roll!");
}


uint8_t tick_count = 0;

ISR(TIMER2_COMPA_vect) {
    tick_count += 1;
};


#ifdef CALIBRATING_TICKER
uint32_t last_millis = 0;
ema_c<double, double, 1, 200> averager;
#endif

void timer_routine() {
   
    reg_t *opattern = rf.getptr(REG_OUTPUT);

#ifdef CALIBRATING_TICKER
    static bool first = true;
    uint32_t now = millis();
    if (first) {
        averager.init(1000);
        first = false;
    } else {
        uint32_t diff = now - last;
        double avg = 100.0 * averager.update(diff);
        Serial.print(avg);
    }   
    last = now;
#endif

    setoutputs(opattern);

    if (handled_receive) {
        Serial.println("handled receive"); handled_receive = false;
    }
    if (handled_request) {
        Serial.println("handled request"); handled_request = false;
    }

    const uint8_t seconds_elapsed = 1;


    if (seconds_elapsed && !isr_running) {

        if (true) {
            Serial.print("On rem:  ");      Serial.print(*pon_rem);
            Serial.print(", Off rem: ");    Serial.print(*poff_rem);
            Serial.print(", rstat: 0x");    Serial.print(*prstat,HEX);
            Serial.print(", poutput:  0x"); Serial.println(*poutput,HEX);
        }

        calcleds(opattern, prstat, pon_rem, poff_rem);

        if (*prstat & STAT_BIT_PWR_ON) {
            if (*prstat & STAT_BIT_WDOG_EN) {
                if (!*pon_rem) {
                    *prstat    |= STAT_BIT_WDOG_FIRED;
                    *opattern  &= ~OUT_BIT_PWR_ON;
                    *prstat    &= ~STAT_BIT_PWR_ON;
                    *poff_rem  =  rf.get(REG_OFF_REM_RESETVAL);
                } else {
                    if (seconds_elapsed > *pon_rem) *pon_rem = 0;
                    else *pon_rem -= seconds_elapsed;
                }
            } 
        } else {
            if (*prstat & STAT_BIT_WAKE_EN) {
                if (!*poff_rem) {
                    *prstat |= STAT_BIT_WAKE_FIRED |
                               STAT_BIT_WDOG_EN |
                               STAT_BIT_PWR_ON;
                    *opattern |= OUT_BIT_PWR_ON;
                    *pon_rem = rf.get(REG_ON_REM_RESETVAL);
                } else {
                    decr_by(poff_rem, seconds_elapsed);
                }
            }
        }
    }

    last_opattern = *opattern;

    wdt_reset();
};


uint16_t loops = 0;

void loop() {
    uint8_t ticks_per_second = 31;
    if (loops == 16000) ticks_per_second = 32;
    if (tick_count >= ticks_per_second) {
        tick_count = 0;
        timer_routine();
    }
    loops += 1;
    enter_sleep();
}
