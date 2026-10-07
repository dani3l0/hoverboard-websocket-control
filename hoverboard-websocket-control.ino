#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <Ticker.h>
#include "config.h"

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);
AsyncWebSocket wsSteer("/ws");
AsyncWebSocket wsSystem("/system");
int connectedClients = 0;

// Used to power on and off the hoverboard
Ticker powerPin;
void powerPinStop() {
  digitalWrite(POWER_PIN, LOW);
}

// When something happens on WiFi
void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    Serial.printf("Connected to WiFi network!\n");
    Serial.printf("IP Address: %s\n", WiFi.localIP().toString());
  } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    Serial.printf("Disconnected from WiFi network\n");
  }
}

// Toggle between STA and AP modes
void toggleWiFiMode(bool ap) {
  if (!ap) {
    // Run in STA mode (wifi client)
    Serial.printf("Running in STA mode\n");
    Serial.printf("Connecting to network '%s'...\n", WIFI_SSID);
    WiFi.disconnect();
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    // Run in AP mode (wifi hotspot)
    Serial.printf("Running in AP mode\n");
    Serial.printf("Hosting an access point named '%s' with password '%s'...\n", EMERGENCY_AP_SSID, EMERGENCY_AP_PASSWORD);
    WiFi.disconnect();
    WiFi.mode(WIFI_AP);
    WiFi.setAutoReconnect(false);
    WiFi.softAP(EMERGENCY_AP_SSID, EMERGENCY_AP_PASSWORD);
    Serial.printf("Hotspot active!\n");
    Serial.printf("IP Address: %s\n", WiFi.softAPIP().toString());
  }
}

// Websocket serial forwarder
void onSteerEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (!info->final || info->index || info->len != len || info->opcode != WS_BINARY) return;
    Serial2.write(data, len);
  }
}

// System websocket server events
void onSystemEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_DATA) {

    // Parse connection
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (!info->final || info->index || info->len != len) return;

    // Compose received message
    String message = "";
    for (int i = 0; i < len; i++) {
      message += (char)data[i];
    }
    Serial.printf("Websocket system message received: '%s'\n", message);

    // Power switch command
    if (message == "power") {
      digitalWrite(POWER_PIN, HIGH);
      powerPin.once(1, powerPinStop);
    }
    else if (message == "switchwifi") {
      toggleWiFiMode(WiFi.getMode() != WIFI_AP);
    }
  }
  else if (type == WS_EVT_CONNECT) {
    Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString());
    connectedClients++;
  }
  else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
    connectedClients--;
  }
}


void setup(){
  // Pin config
  pinMode(POWER_PIN, OUTPUT);
  powerPinStop();

  // Serial port for debugging purposes
  Serial.begin(115200);

  // Serial port for communication with hoverboard
  Serial2.begin(SERIAL2_BAUD_RATE, SERIAL_8N1, RX_PIN, TX_PIN);

  // Smart-connect to Wi-Fi (or host an emergency AP)
  WiFi.onEvent(onWiFiEvent);
  toggleWiFiMode(false);
  int timeout = EMERGENCY_AP_TIMEOUT;
  while (WiFi.status() != WL_CONNECTED && timeout > 0) {
    Serial.printf("Waiting for network connection... %d\n", timeout--);
    delay(1000);
  }
  if (WiFi.status() != WL_CONNECTED) toggleWiFiMode(true);

  // LittleFS for static web files
  LittleFS.begin(true);

  // Initialize HTTP & websocket server
  wsSteer.onEvent(onSteerEvent);
  wsSystem.onEvent(onSystemEvent);
  server.addHandler(&wsSteer);
  server.addHandler(&wsSystem);
  server.serveStatic("/", LittleFS, "/html/").setDefaultFile("index.html");
  server.begin();
}

// System information variables
int websocketSendCounter = 0;
bool hoverboardIsTurnedOn = false;

// Hoverboard connection variables
// multiply by 2 because int16 from the controller, 9 is the number of data fields (18 bytes in total)
const int bufferSize = 2 * 9;
uint8_t buffer[bufferSize];
int len = 0;
unsigned long lastByteTime = 0;


void loop() {
  // Send system information, each 500ms
  if (websocketSendCounter++ > 500) {
    wsSystem.textAll(
      String(WiFi.RSSI()) + "," +
      String(connectedClients) + "," +
      String(hoverboardIsTurnedOn)
    );
    websocketSendCounter = 0;
  }

  // Check if hoverboard is still running, 2s without serial data means it's not
  hoverboardIsTurnedOn = (micros() - lastByteTime) <= 2000000;

  // Cleanup Serial2 last incomplete packet, 5ms window
  if (len > 0 && (micros() - lastByteTime) >= 5000) len = 0;

  // Read Serial2 data and send it via websockets
  while (Serial2.available()) {
    if (len < bufferSize) buffer[len++] = Serial2.read();
    else Serial2.read();
    if (len == bufferSize) {
      wsSteer.binaryAll(buffer, len);
      len = 0;
    }
    lastByteTime = micros();
  }

  // Cleanup obsolete websocket clients
  wsSteer.cleanupClients();
  wsSystem.cleanupClients();

  // Sleep...
  delay(1);
}