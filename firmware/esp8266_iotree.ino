#include <FirebaseESP8266.h>
#include <ESP8266WiFi.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// -------------------- Credentials --------------------
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define FIREBASE_HOST "iottest-aeaba-default-rtdb.asia-southeast1.firebasedatabase.app"
#define API_KEY "YOUR_FIREBASE_WEB_API_KEY"
#define USER_EMAIL "YOUR_FIREBASE_USER_EMAIL"
#define USER_PASSWORD "YOUR_FIREBASE_USER_PASSWORD"

const String PLANT_ID = "plant1";

// -------------------- Firebase --------------------
FirebaseConfig firebaseConfig;
FirebaseAuth firebaseAuth;
FirebaseData fbRead;
FirebaseData fbWrite;

// -------------------- Pins --------------------
#define MOTOR_PIN D1
#define LED_PIN D2
#define SENSOR_PIN A0
#define CH1_PIN D3
#define CH2_PIN D4
#define CH3_PIN D5
#define CH4_PIN D6
#define CH5_PIN D7
#define CH6_PIN D8

// -------------------- Time --------------------
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

// -------------------- Runtime --------------------
unsigned long lastSensorWriteMs = 0;
unsigned long lastControlPollMs = 0;
const unsigned long SENSOR_INTERVAL_MS = 10000;
const unsigned long CONTROL_INTERVAL_MS = 500;

float currentMoisture = 0;
float threshold = 0;
String ledCmd = "OFF";
String motorCmd = "OFF";
int smHomeMask = 0;

const String BASE_PATH = "/plants/" + PLANT_ID;

// Active-low relay helper
void relayWrite(uint8_t pin, bool on) {
  digitalWrite(pin, on ? LOW : HIGH);
}

void setAllRelaysOff() {
  relayWrite(MOTOR_PIN, false);
  relayWrite(LED_PIN, false);
  relayWrite(CH1_PIN, false);
  relayWrite(CH2_PIN, false);
  relayWrite(CH3_PIN, false);
  relayWrite(CH4_PIN, false);
  relayWrite(CH5_PIN, false);
  relayWrite(CH6_PIN, false);
}

float readMoisturePercent() {
  int raw = analogRead(SENSOR_PIN);
  // Adjust 1024(dry) and 512(wet) to your sensor calibration
  float percent = map(raw, 1024, 512, 0, 10000) / 100.0;
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  return percent;
}

void writeSoilMoisture() {
  if (!Firebase.ready()) return;

  currentMoisture = readMoisturePercent();
  String moisturePath = BASE_PATH + "/sensors/soilMoisture";
  String tsPath = BASE_PATH + "/sensors/soilMoistureUpdatedAt";

  if (!Firebase.setFloat(fbWrite, moisturePath, currentMoisture)) {
    Serial.println("Failed writing soilMoisture: " + fbWrite.errorReason());
  }

  timeClient.update();
  unsigned long epoch = timeClient.getEpochTime();
  if (!Firebase.setInt(fbWrite, tsPath, epoch)) {
    Serial.println("Failed writing soilMoistureUpdatedAt: " + fbWrite.errorReason());
  }
}

void readThreshold() {
  String path = BASE_PATH + "/control/value";
  if (Firebase.getFloat(fbRead, path)) {
    threshold = fbRead.floatData();
  }
}

void readLedCommand() {
  String path = BASE_PATH + "/control/LED";
  if (Firebase.getString(fbRead, path)) {
    ledCmd = fbRead.stringData();
    ledCmd.trim();
    ledCmd.toUpperCase();
  }
}

void readMotorCommand() {
  String path = BASE_PATH + "/control/motor";
  if (Firebase.getString(fbRead, path)) {
    motorCmd = fbRead.stringData();
    motorCmd.trim();
    motorCmd.toUpperCase();
  }
}

void readSmhomeMask() {
  String path = BASE_PATH + "/control/SMhome";
  if (Firebase.getInt(fbRead, path)) {
    smHomeMask = fbRead.intData();
    if (smHomeMask < 0) smHomeMask = 0;
  }
}

void applyLed() {
  relayWrite(LED_PIN, ledCmd == "ON");
}

void applyMotor() {
  // Manual command has priority when ON.
  if (motorCmd == "ON") {
    relayWrite(MOTOR_PIN, true);
    return;
  }

  // Otherwise auto mode by threshold.
  if (threshold > 0 && currentMoisture <= threshold) {
    relayWrite(MOTOR_PIN, true);
  } else {
    relayWrite(MOTOR_PIN, false);
  }
}

void applySmhome() {
  relayWrite(CH1_PIN, (smHomeMask & (1 << 0)) != 0);
  relayWrite(CH2_PIN, (smHomeMask & (1 << 1)) != 0);
  relayWrite(CH3_PIN, (smHomeMask & (1 << 2)) != 0);
  relayWrite(CH4_PIN, (smHomeMask & (1 << 3)) != 0);
  relayWrite(CH5_PIN, (smHomeMask & (1 << 4)) != 0);
  relayWrite(CH6_PIN, (smHomeMask & (1 << 5)) != 0);
}

void setup() {
  Serial.begin(115200);

  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(CH1_PIN, OUTPUT);
  pinMode(CH2_PIN, OUTPUT);
  pinMode(CH3_PIN, OUTPUT);
  pinMode(CH4_PIN, OUTPUT);
  pinMode(CH5_PIN, OUTPUT);
  pinMode(CH6_PIN, OUTPUT);
  setAllRelaysOff();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print('.');
    delay(300);
  }
  Serial.println();
  Serial.print("WiFi connected. IP: ");
  Serial.println(WiFi.localIP());

  timeClient.begin();
  while (!timeClient.update()) {
    timeClient.forceUpdate();
    delay(200);
  }

  firebaseConfig.host = FIREBASE_HOST;
  firebaseConfig.api_key = API_KEY;
  firebaseAuth.user.email = USER_EMAIL;
  firebaseAuth.user.password = USER_PASSWORD;

  Firebase.begin(&firebaseConfig, &firebaseAuth);
  Firebase.reconnectWiFi(true);

  // Initial read/write so dashboard gets immediate state.
  writeSoilMoisture();
  readThreshold();
  readLedCommand();
  readMotorCommand();
  readSmhomeMask();
  applyLed();
  applyMotor();
  applySmhome();
}

void loop() {
  unsigned long now = millis();

  if (Firebase.ready() && now - lastSensorWriteMs >= SENSOR_INTERVAL_MS) {
    lastSensorWriteMs = now;
    writeSoilMoisture();
  }

  if (Firebase.ready() && now - lastControlPollMs >= CONTROL_INTERVAL_MS) {
    lastControlPollMs = now;

    readThreshold();
    readLedCommand();
    readMotorCommand();
    readSmhomeMask();

    applyLed();
    applyMotor();
    applySmhome();
  }

  delay(10);
}
