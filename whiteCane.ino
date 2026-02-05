#include "BLEDevice.h"
#include "PowerMode.h"
#include "WiFi.h"
#include "StreamIO.h"
#include "VideoStream.h"
#include "RTSP.h"
#include "NNObjectDetection.h"
#include "VideoStreamOverlay.h"
#include "ObjectClassList.h"
#include <Wire.h>
#include <FlashMemory.h> // ✅ Use FlashMemory for AMB82 mini

/*================================================================================
                                     BLE define
================================================================================*/
#define ENV_SENSE_UUID "0000181a-0000-1000-8000-00805f9b34fb"
#define VOICE_UUID "a0451b3a-f056-4ce5-bc13-0838e26b2d68"

// ✅ NEW: TOF distance characteristic UUID
#define DIST_UUID "c3f1b2a4-9d67-4f8a-8e12-5a9b7c4d210f"
// ✅ NEW: Feedback UUID for thresholds
#define FEEDBACK_UUID "e528b1c4-d3f9-4e6a-8b2c-1f4d9e3a7c5b"

BLEService envSenseService(ENV_SENSE_UUID);
BLECharacteristic voiceChar(VOICE_UUID);
BLECharacteristic distChar(DIST_UUID);
BLECharacteristic feedbackChar(FEEDBACK_UUID);

BLEAdvertData advdata;
BLEAdvertData scandata;

// ✅ Thresholds (Default: 70cm, 190cm)
int obstacle_th = 700;
int height_th = 1900;

// ✅ Flash Memory Magic Number (用於確認資料是否有效)
#define FLASH_MAGIC 0xA5A5
#define ADDR_MAGIC 0x1000
#define ADDR_OBSTACLE 0x1004
#define ADDR_HEIGHT 0x1008

// ✅ Callback for receiving thresholds (Ameba BLE style)
void writeCB(BLECharacteristic* chr, uint8_t connID) {
  uint8_t data[20];
  uint16_t len = chr->getData(data, sizeof(data));

  if (len >= 2) {
    uint8_t type = data[0];
    uint8_t val = data[1];

    // printf("BLE Write Received: Type=%d, Val=%d\n", type, val);

    // 寫入 Magic Number
    FlashMemory.writeWord(ADDR_MAGIC, FLASH_MAGIC);

    if (type == 1) {
      obstacle_th = val * 10; // cm -> mm
      FlashMemory.writeWord(ADDR_OBSTACLE, obstacle_th);
      // Serial.print("Set Obstacle Threshold: "); Serial.println(obstacle_th);
      // Serial.print("Written to Flash at 0x1004: "); Serial.println(FlashMemory.readWord(ADDR_OBSTACLE));
    } else if (type == 2) {
      height_th = val * 10; // cm -> mm
      FlashMemory.writeWord(ADDR_HEIGHT, height_th);
      // Serial.print("Set Height Threshold: "); Serial.println(height_th);
      // Serial.print("Written to Flash at 0x1008: "); Serial.println(FlashMemory.readWord(ADDR_HEIGHT));
    }
  }
}

bool notifyVoice = false;
bool notifyDist = false;

void readCB(BLECharacteristic* chr, uint8_t connID) {
  printf("Characteristic %s read by connection %d \n", chr->getUUID().str(), connID);
  chr->writeData8(50);
}

// ... (rest of the file until setup)



// ✅ CCCD callback：分辨 voice / dist
void notifCB(BLECharacteristic* chr, uint8_t connID, uint16_t cccd) {
  bool en = (cccd & GATT_CLIENT_CHAR_CONFIG_NOTIFY);

  String uuid = chr->getUUID().str();
  if (uuid == String(VOICE_UUID)) {
    notifyVoice = en;
    printf("VOICE notify %s (conn %d)\n", en ? "ENABLED" : "DISABLED", connID);
  } else if (uuid == String(DIST_UUID)) {
    notifyDist = en;
    printf("DIST  notify %s (conn %d)\n", en ? "ENABLED" : "DISABLED", connID);
  } else {
    printf("Notify %s on %s (conn %d)\n", en ? "ENABLED" : "DISABLED", uuid.c_str(), connID);
  }
}

/*=================================================================================
                                Vibration Motor + Alert (NON-BLOCKING)
=================================================================================*/
int vibration_motor_pin = 20;

// --- motor non-blocking timer
static uint32_t motorOffAtMs = 0;

// --- voice non-blocking / rate-limit
static uint8_t lastVoiceSent = 255;
static uint8_t pendingVoice = 255;
static bool voiceDirty = false;
static uint32_t lastNotifyAtMs = 0;

static inline void requestVoice(uint8_t id) {
  if (pendingVoice != id) {
    pendingVoice = id;
    voiceDirty = true;
  }
}

static inline void motorOnFor(uint16_t ms) {
  uint32_t now = millis();
  uint32_t off = now + ms;
  if (off > motorOffAtMs) motorOffAtMs = off;  // 延長
}

static inline void triggerAlertNB(uint8_t voiceId, uint16_t motorMs) {
  requestVoice(voiceId);
  motorOnFor(motorMs);
}

// 每次 loop 都呼叫：負責把 motor/voice 真正輸出（不卡住）
static void serviceAlertIO() {
  uint32_t now = millis();

  // motor
  if ((int32_t)(now - motorOffAtMs) < 0) {
    digitalWrite(vibration_motor_pin, HIGH);
  } else {
    digitalWrite(vibration_motor_pin, LOW);
  }

  // voice notify - ✅ 持續發送（每 200ms 重送一次，讓 APP 持續叫）
  // ✅ 注意：這裡保留你原本「持續叫」邏輯
  if (pendingVoice != 255 && pendingVoice != 1) {  // 警告狀態（非正常 voiceId=1）
    if ((now - lastNotifyAtMs) > 200) {            // 每 200ms 重送
      voiceChar.writeData8(pendingVoice);
      voiceChar.notify(0);
      lastVoiceSent = pendingVoice;
      lastNotifyAtMs = now;
    }
  } else if (voiceDirty && pendingVoice == 1) {  // 正常狀態只送一次
    voiceChar.writeData8(pendingVoice);
    voiceChar.notify(0);
    lastVoiceSent = pendingVoice;
    lastNotifyAtMs = now;
    voiceDirty = false;
  }
}

/*=================================================================================
                                Frame Detection define
=================================================================================*/
#define CHANNEL 0
#define CHANNELNN 3
#define NNWIDTH 576
#define NNHEIGHT 320

VideoSetting config(VIDEO_FHD, 30, VIDEO_H264, 0);
VideoSetting configNN(NNWIDTH, NNHEIGHT, 10, VIDEO_RGB, 0);

NNObjectDetection ObjDet;
RTSP rtsp;
StreamIO videoStreamer(1, 1);
StreamIO videoStreamerNN(1, 1);

char ssid[] = "Allen_HAO";
char pass[] = "82458028";
int status = WL_IDLE_STATUS;

IPAddress ip;
int rtsp_portnum;

/*=================================================================================
            Button Control define (NON-BLOCKING debounce)
=================================================================================*/
const int NV_pos_buttonPin = 16;  // Sleep Mode Button N/V+
const int PLAYbuttonPin = 11;     // PLAY Button

bool detect_loop_status = false;
bool isSleepMode = false;

static int lastNVRead = HIGH;
static uint32_t lastNVDebounceAtMs = 0;

static int lastPlayRead = HIGH;
static uint32_t lastPlayDebounceAtMs = 0;

/*=================================================================================
                                TOF Parsing (NON-BLOCKING)
=================================================================================*/
static int distance = -1;  // 最新距離
static bool distance_valid = false;

static char tofBuf[32];
static uint8_t tofIdx = 0;

static uint32_t lastDistPrintAtMs = 0;  // 控制印出頻率，避免 Serial 拖慢
static uint32_t lastRTSPPrintAtMs = 0;  // 控制 RTSP 印出頻率

// ✅ NEW: BLE distance notify rate limit

static void pollTOF() {
  while (Serial1.available()) {
    char c = (char)Serial1.read();

    if (c == '\n') {
      tofBuf[tofIdx] = '\0';
      tofIdx = 0;

      String s = String(tofBuf);
      s.trim();

      if (s.length() > 0) {
        int d = s.toInt();
        if (d > 0) {
          distance = d;
          distance_valid = true;
        }
      }
    } else if (c != '\r') {
      if (tofIdx < sizeof(tofBuf) - 1) {
        tofBuf[tofIdx++] = c;
      } else {
        tofIdx = 0;
      }
    }
  }
}

void setup() {
  pinMode(vibration_motor_pin, OUTPUT);
  digitalWrite(vibration_motor_pin, LOW);

  pinMode(NV_pos_buttonPin, INPUT_PULLUP);
  pinMode(PLAYbuttonPin, INPUT_PULLUP);



  Serial.begin(115200);
  Serial1.begin(115200);

  // ✅ Initialize Flash Memory
  // AMB82 mini FlashMemory usually works directly.
  // Address 0x00 is relative to the reserved data section.
  
  unsigned int stored_magic = FlashMemory.readWord(ADDR_MAGIC);

  if (stored_magic == FLASH_MAGIC) {
    // Magic Number 符合，讀取儲存的設定
    unsigned int val_obs = FlashMemory.readWord(ADDR_OBSTACLE);
    unsigned int val_hgt = FlashMemory.readWord(ADDR_HEIGHT);
    
    // 簡單檢查數值合理性
    if (val_obs > 0 && val_obs < 5000) obstacle_th = val_obs;
    if (val_hgt > 0 && val_hgt < 5000) height_th = val_hgt;
    
    // Serial.println("Flash Memory Valid. Loaded stored thresholds.");
  } else {
    // Magic Number 不符（新晶片或重置），寫入預設值
    // Serial.println("Flash Memory Invalid or New. Writing defaults.");
    FlashMemory.writeWord(ADDR_MAGIC, FLASH_MAGIC);
    FlashMemory.writeWord(ADDR_OBSTACLE, obstacle_th); // 700
    FlashMemory.writeWord(ADDR_HEIGHT, height_th);     // 1900
  }

  // Serial.print("Current Obstacle Threshold: "); Serial.println(obstacle_th);
  // Serial.print("Current Height Threshold: "); Serial.println(height_th);

  /*=================================================================================
                                        BLE Setup
  =================================================================================*/
  advdata.addFlags();
  advdata.addCompleteName("WhiteCane");

  // ---- voiceChar ----
  voiceChar.setReadProperty(true);
  voiceChar.setReadPermissions(GATT_PERM_READ);
  voiceChar.setReadCallback(readCB);
  voiceChar.setNotifyProperty(true);
  voiceChar.setCCCDCallback(notifCB);
  envSenseService.addCharacteristic(voiceChar);

  // ✅ NEW: distChar ----
  distChar.setReadProperty(true);
  distChar.setReadPermissions(GATT_PERM_READ);
  distChar.setNotifyProperty(true);
  distChar.setCCCDCallback(notifCB);
  envSenseService.addCharacteristic(distChar);

  // ✅ NEW: feedbackChar ----
  feedbackChar.setWriteProperty(true);
  feedbackChar.setWritePermissions(GATT_PERM_WRITE);
  feedbackChar.setWriteCallback(writeCB);
  envSenseService.addCharacteristic(feedbackChar);

  BLE.init();
  BLE.configAdvert()->setAdvData(advdata);
  BLE.configAdvert()->setScanRspData(scandata);
  BLE.configServer(1);
  BLE.addService(envSenseService);
  BLE.beginPeripheral();

  /*=================================================================================
                                   Frame Detection Setup
  =================================================================================*/
  // WiFi 連線你目前註解掉，所以 ip 會是 0.0.0.0（不影響 distance）
  // while (status != WL_CONNECTED) {
  //   Serial.print("Attempting to connect to WPA SSID: ");
  //   Serial.println(ssid);
  //   status = WiFi.begin(ssid, pass);
  //   delay(2000);
  // }
  // ip = WiFi.localIP();

  config.setBitrate(2 * 1024 * 1024);
  Camera.configVideoChannel(CHANNEL, config);
  Camera.configVideoChannel(CHANNELNN, configNN);
  Camera.videoInit();

  rtsp.configVideo(config);
  rtsp.begin();
  rtsp_portnum = rtsp.getPort();

  ObjDet.configVideo(configNN);
  ObjDet.modelSelect(OBJECT_DETECTION, CUSTOMIZED_YOLOV7TINY, NA_MODEL, NA_MODEL);
  ObjDet.begin();

  videoStreamer.registerInput(Camera.getStream(CHANNEL));
  videoStreamer.registerOutput(rtsp);
  if (videoStreamer.begin() != 0) {
    Serial.println("StreamIO link start failed");
  }
  Camera.channelBegin(CHANNEL);

  videoStreamerNN.registerInput(Camera.getStream(CHANNELNN));
  videoStreamerNN.setStackSize();
  videoStreamerNN.setTaskPriority();
  videoStreamerNN.registerOutput(ObjDet);
  if (videoStreamerNN.begin() != 0) {
    Serial.println("StreamIO link start failed");
  }
  Camera.channelBegin(CHANNELNN);

  OSD.configVideo(CHANNEL, config);
  OSD.begin();

  // 初始正常語音（避免一開始未定）
  requestVoice(1);
}

void loop() {
  uint32_t now = millis();

  /*=================================================================================
                                   Sleep Mode Control (debounce w/o delay)
  =================================================================================*/
  int nvRead = digitalRead(NV_pos_buttonPin);
  if (nvRead != lastNVRead) {
    lastNVDebounceAtMs = now;
    lastNVRead = nvRead;
  }
  if ((now - lastNVDebounceAtMs) > 60) {  // debounce 60ms
    static int nvStable = HIGH;
    if (nvRead != nvStable) {
      nvStable = nvRead;
      if (nvStable == LOW) {
        isSleepMode = !isSleepMode;
        if (isSleepMode) {
          Serial.println("Entering sleep mode...");
          PowerMode.start();
          return;
        } else {
          Serial.println("Exiting sleep mode...");
        }
      }
    }
  }

  if (isSleepMode) return;

  /*=================================================================================
                                      TOF Detection (NON-BLOCKING)
  =================================================================================*/
  pollTOF();

  // 印 distance 限速（避免 Serial 造成卡）
  // if (distance_valid && (now - lastDistPrintAtMs) > 200) {
  //   Serial.print("distance = ");
  //   Serial.println(distance);
  //   lastDistPrintAtMs = now;
  // }

  // ✅ NEW: 把 TOF distance 上傳到 DIST_UUID（uint16, 10Hz）
  uint16_t d16 = (uint16_t)distance;  // 若 distance 可能 >65535 再告訴我
  distChar.writeData16(d16);
  distChar.notify(0);

  // 距離警告（✅ 持續觸發，不用 cooldown）
  if (distance_valid) {
    // DEBUG: 每秒印一次，確認實際比較數值
    static uint32_t lastDebugMs = 0;
    if (now - lastDebugMs > 1000) {
      Serial.print("DEBUG: distance="); Serial.print(distance);
      Serial.print(" obstacle_th="); Serial.print(obstacle_th);
      Serial.print(" height_th="); Serial.println(height_th);
      lastDebugMs = now;
    }

    if (distance >= height_th) {
      triggerAlertNB(4, 300);
    } else if (distance <= obstacle_th) {
      triggerAlertNB(5, 300);
    } else {
      if ((int32_t)(now - motorOffAtMs) >= 0) {
        requestVoice(1);
      }
    }
  }

  /*=================================================================================
                                   Button Control Detection (debounce w/o while+delay)
  =================================================================================*/
  int playRead = digitalRead(PLAYbuttonPin);
  if (playRead != lastPlayRead) {
    lastPlayDebounceAtMs = now;
    lastPlayRead = playRead;
  }
  if ((now - lastPlayDebounceAtMs) > 60) {
    static int playStable = HIGH;
    if (playRead != playStable) {
      playStable = playRead;
      if (playStable == LOW) {
        detect_loop_status = !detect_loop_status;
      }
    }
  }

  /*=================================================================================
                                        Frame Detection
  =================================================================================*/
  std::vector<ObjectDetectionResult> results = ObjDet.getResult();
  uint16_t im_h = config.height();
  uint16_t im_w = config.width();

  // RTSP URL 不要每圈印（很拖），限速 2 秒一次
  // if ((now - lastRTSPPrintAtMs) > 2000) {
  //   Serial.print("Network URL for RTSP Streaming: ");
  //   Serial.print("rtsp://");
  //   Serial.print(ip);
  //   Serial.print(":");
  //   Serial.println(rtsp_portnum);
  //   Serial.println(" ");
  //   lastRTSPPrintAtMs = now;
  // }

  // printf("Total number of objects detected = %d\r\n", ObjDet.getResultCount());

  OSD.createBitmap(CHANNEL);
  if (ObjDet.getResultCount() > 0) {
    for (int i = 0; i < ObjDet.getResultCount(); i++) {
      if (!detect_loop_status) continue;

      int obj_type = results[i].type();
      int confidence_score = results[i].score();

      if (confidence_score >= 85 && itemList[obj_type].filter) {
        // ✅ 物件警告：持續震動 + 持續叫
        triggerAlertNB(0, 300);

        ObjectDetectionResult item = results[i];
        int xmin = (int)(item.xMin() * im_w);
        int xmax = (int)(item.xMax() * im_w);
        int ymin = (int)(item.yMin() * im_h);
        int ymax = (int)(item.yMax() * im_h);

        // printf("Item %d %s:\t%d %d %d %d\n\r", i, itemList[obj_type].objectName, xmin, xmax, ymin, ymax);
        OSD.drawRect(CHANNEL, xmin, ymin, xmax, ymax, 3, OSD_COLOR_WHITE);

        char text_str[20];
        snprintf(text_str, sizeof(text_str), "%s %d", itemList[obj_type].objectName, item.score());
        OSD.drawText(CHANNEL, xmin, ymin - OSD.getTextHeight(CHANNEL), text_str, OSD_COLOR_CYAN);
      }
    }
    OSD.update(CHANNEL);
  }

  serviceAlertIO();
}
