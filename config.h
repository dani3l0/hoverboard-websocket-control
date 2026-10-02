#define WIFI_SSID             "mywifi"
#define WIFI_PASSWORD         "mywifipass"
#define EMERGENCY_AP_SSID     "Hoverboard32"
#define EMERGENCY_AP_PASSWORD "12345678"
#define EMERGENCY_AP_TIMEOUT  20
#define RX_PIN                22
#define TX_PIN                21
#define SERIAL2_BAUD_RATE     115200
#define POWER_PIN             17

// Custom config overrides go here
#if __has_include("config-custom.h")
  #include "config-custom.h"
#endif
