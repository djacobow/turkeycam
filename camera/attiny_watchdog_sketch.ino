#include <Arduino.h>


const uint8_t OFF_PIN = 7;
const uint8_t PULSE_PIN = 8;
const uint8_t DAYTIME_PIN = 3;
const uint8_t DEBUG1_PIN = 2;
const uint8_t DEBUG2_PIN = 4;

// #define DEBUG

#ifdef DEBUG
const uint32_t NIGHT_DURATION_SECONDS    = 30;
const uint32_t HOLD_OFF_DURATION_SECONDS = 30;
const uint32_t WATCHDOG_TIMEOUT_SECONDS  = 30;
const uint32_t SHUTDOWN_DELAY_SECONDS    = 15;

#else
const uint32_t NIGHT_DURATION_SECONDS    = 10 * 60 * 60;
const uint32_t HOLD_OFF_DURATION_SECONDS = 15 * 60;
const uint32_t WATCHDOG_TIMEOUT_SECONDS  = 2 * 60;
const uint32_t SHUTDOWN_DELAY_SECONDS    = 60;
#endif


typedef enum modes_t {
  mode_normal_on,
  mode_night_pre_off,
  mode_night_off,
  mode_emergency_off,
} modes_t;


modes_t current_mode;

uint32_t time_off;
uint32_t time_unpinged;
uint32_t time_pre_off;

bool foobs;

void setup() {
    pinMode(DAYTIME_PIN, INPUT);
    pinMode(PULSE_PIN,   INPUT);
    pinMode(OFF_PIN,     OUTPUT);
    pinMode(DEBUG1_PIN,  OUTPUT);
    pinMode(DEBUG2_PIN,  OUTPUT);
    digitalWrite(OFF_PIN, LOW);

    time_off = 0;
    time_unpinged = 0;
    time_pre_off = 0;
    current_mode = mode_normal_on; 
}

void loop() {
    switch (current_mode) {
        case mode_normal_on:
            digitalWrite(DEBUG1_PIN, LOW);
            digitalWrite(DEBUG2_PIN, LOW);
            if (time_unpinged > WATCHDOG_TIMEOUT_SECONDS) {
              current_mode = mode_emergency_off;
              time_off = 0;
              time_unpinged = 0;
            }
            
            if (!digitalRead(DAYTIME_PIN)) {
              current_mode = mode_night_pre_off;
              time_pre_off = 0;
            }
            break;
            
        case mode_night_pre_off:
            digitalWrite(DEBUG1_PIN, HIGH);
            digitalWrite(DEBUG2_PIN, LOW);

            if (time_pre_off > SHUTDOWN_DELAY_SECONDS) {
              current_mode = mode_night_off;
              time_pre_off = 0;
            } else {
              time_pre_off += 1;
            }
            break;
            
        case mode_night_off:
            digitalWrite(DEBUG1_PIN, LOW);
            digitalWrite(DEBUG2_PIN, HIGH);

            if (time_off > NIGHT_DURATION_SECONDS) {
              current_mode = mode_normal_on;
              time_off = 0;
            } else {
              time_off += 1;
            }
            break;
            
        case mode_emergency_off:
            digitalWrite(DEBUG1_PIN, HIGH);
            digitalWrite(DEBUG2_PIN, HIGH);

            if (time_off > HOLD_OFF_DURATION_SECONDS) {
              time_off = 0;
              time_unpinged = 0;
              current_mode = mode_normal_on;
            } else {
              time_off += 1;
            }
    }
    
    if (!digitalRead(PULSE_PIN)) {
      time_unpinged = 0;
    } else {
      time_unpinged += 1;
    }

    bool off = (current_mode == mode_night_off) ||
               (current_mode == mode_emergency_off);
    digitalWrite(OFF_PIN, off);
    delay(1000);

}
