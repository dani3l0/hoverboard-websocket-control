#define WIFI_SSID           "mywifi"
#define WIFI_PASSWORD       "mywifipass"
#define RX_PIN              1
#define TX_PIN              2
#define SERIAL2_BAUD_RATE   115200

#if __has_include("config-custom.h")
  #include "config-custom.h"
#endif
