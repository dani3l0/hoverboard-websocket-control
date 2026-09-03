#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include "config.h"

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
AsyncWebSocket wsRssi("/rssi");
int connectedClients = 0;

// Handle websocket incoming messages
void handleWebSocketMessage(void *arg, uint8_t *data, size_t len) {
  AwsFrameInfo *info = (AwsFrameInfo*)arg;
  if (!info->final || info->index || info->len != len || info->opcode != WS_BINARY) return;

  // Handle message
  Serial2.write(data, len);
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
      handleWebSocketMessage(arg, data, len);
      break;
  }
}

void setup(){
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
  server.addHandler(&ws);
  server.addHandler(&wsRssi);
  server.serveStatic("/", LittleFS, "/html/").setDefaultFile("index.html");
  server.begin();
}

int websocketSendCounter = 0;

void loop() {
  // Cleanup obsolete websocket clients
  ws.cleanupClients();
  wsRssi.cleanupClients();
  
  // Send RSSI information
  if (websocketSendCounter++ > 100) {
    if (WiFi.status() == WL_CONNECTED) wsRssi.textAll(String(WiFi.RSSI()) + "," + String(connectedClients));
    websocketSendCounter = 0;
  }

  // Read Serial2 data and send it via websockets
  if (Serial2.available()) {
    uint8_t buffer[256];
    int len = 0;
    while (Serial2.available() && len < 256) {
      buffer[len++] = Serial2.read();
    }
    ws.binaryAll(buffer, len);
  }

  // Minor sleep
  delay(5);
}