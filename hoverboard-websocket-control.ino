#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <Ticker.h>
#include "config.h"

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
AsyncWebSocket wsSystem("/system");
int connectedClients = 0;

Ticker powerPin;
void powerPinStop() {
  digitalWrite(POWER_PIN, LOW);
}

// Handle websocket server events
void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  switch (type) {
    // On new client connection
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString());
      connectedClients++;
      break;

    // On client disconnected
    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      connectedClients--;
      break;

    // On new incoming data
    case WS_EVT_DATA:

      // Parse connection
      AwsFrameInfo *info = (AwsFrameInfo*)arg;
      if (!info->final || info->index || info->len != len || info->opcode != WS_BINARY) return;

      // Forward message to serial2
      Serial2.write(data, len);
      break;
  }
}

// Handle secondary websocket server events
void onSystemEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_DATA) {

    // Parse connection
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (!info->final || info->index || info->len != len) return;

    // Compose message
    String message = "";
    for (int i = 0; i < len; i++) {
      message += (char)data[i];
    }
    Serial.printf("Websocket system message received: %s\n", message);

    // Power switch command
    if (message == "power") {
      digitalWrite(POWER_PIN, HIGH);
      powerPin.once(1, powerPinStop);
    }
  }
}

void setup(){
  // Pin config
  pinMode(POWER_PIN, OUTPUT);
  powerPinStop();

  // Serial port for debugging purposes
  Serial.begin(115200);

  // Serial port for communication purposes
  Serial2.begin(SERIAL2_BAUD_RATE, SERIAL_8N1, RX_PIN, TX_PIN);

  // LittleFS for static files
  LittleFS.begin(true);

  // Connect to Wi-Fi
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < EMERGENCY_AP_TIMEOUT) {
    delay(1000);
    Serial.printf(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) Serial.printf("\nDevice IP: %s\n", WiFi.localIP().toString());
  else {
    Serial.printf("\nFailed to connect to '%s'. Hosting an emergency AP...\n", WIFI_SSID);
    WiFi.disconnect();
    WiFi.setAutoReconnect(false);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(EMERGENCY_AP_SSID, EMERGENCY_AP_PASSWORD);
    Serial.printf("Hotspot active! Connect to '%s' with password '%s'\n", EMERGENCY_AP_SSID, EMERGENCY_AP_PASSWORD);
    Serial.printf("Hostpot IP: %s\n", WiFi.softAPIP().toString());
  }

  // Initialize websocket server
  ws.onEvent(onEvent);
  wsSystem.onEvent(onSystemEvent);
  server.addHandler(&ws);
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
  // Cleanup obsolete websocket clients
  ws.cleanupClients();
  wsSystem.cleanupClients();
  
  // Send RSSI information, each 500ms
  if (websocketSendCounter++ > 500) {
    if (WiFi.status() == WL_CONNECTED) {
      wsSystem.textAll(
        String(WiFi.RSSI()) + "," +
        String(connectedClients) + "," +
        String(hoverboardIsTurnedOn)
      );
    }
    websocketSendCounter = 0;
  }

  // Cleanup last incomplete packet, 5ms window
  if (len > 0 && (micros() - lastByteTime) >= 5000) len = 0;

  // Check if hoverboard is still running, 2s without serial data means it's not
  hoverboardIsTurnedOn = (micros() - lastByteTime) <= 2000000;

  // Read Serial2 data and send it via websockets
  while (Serial2.available()) {
    if (len < bufferSize) buffer[len++] = Serial2.read();
    else Serial2.read();

    // Send data via websockets
    if (len == bufferSize) {
      ws.binaryAll(buffer, len);
      len = 0;
    }

    lastByteTime = micros();
  }

  // Sleep ...
  delay(1);
}