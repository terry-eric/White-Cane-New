import { ALERT_TYPE, getAlertTypeByVoiceMode, playAlert } from "./alerts.js";
import { createLockController } from "./animation_erase.js";
import { bleSearch, bleDisconnect, sendCalibration, sendThreshold, setBluetoothHandlers } from "./bluetooth.js";
import { getAppElements } from "./dom.js";
import { wakeLockStart, wakeLockStop } from "./keep_wake.js";
import { mouseTouchChange } from "./mouse_event.js";
import { voiceState, setVoiceState } from "./state.js";
import { log } from "./utils.js";
import { speak } from "./voice.js";

const THRESHOLD_TYPE = Object.freeze({
  OBSTACLE: 1,
  HEIGHT: 2,
});

const CALIBRATE_WAIT_MS = 1000;
const CALIBRATE_HEIGHT_OFFSET_CM = 8;
const CALIBRATE_OBSTACLE_GAP_CM = 20;
const MIN_OBSTACLE_CM = 10;

export function initApp() {
  mouseTouchChange();

  const elements = getAppElements();
  const lockController = createLockController(elements.lockScreen, elements.unlockBar);

  bindLockScreenHandlers(elements, lockController);
  bindModeButtons(elements);
  bindAlertButtons(elements);
  bindThresholdHandlers(elements);
  bindCalibrationHandlers(elements);
  configureBluetoothHandlers(elements);
}

function bindLockScreenHandlers(elements, lockController) {
  elements.lockScreen.addEventListener("mousedown", lockController.startPoint);
  elements.lockScreen.addEventListener("mousemove", lockController.positionBarCal, false);
  elements.lockScreen.addEventListener("mouseup", lockController.unlock);
  elements.btnLock.addEventListener("click", lockController.lock);
}

function bindModeButtons(elements) {
  elements.startButton.addEventListener("click", async () => {
    if (elements.startButton.classList.contains("btn-primary")) {
      await onStartButtonClick(elements.startButton);
      return;
    }
    await onStopButtonClick(elements.startButton);
  });

  elements.modeButton.addEventListener("click", () => {
    toggleVoiceMode(elements.modeButton, elements.modeText);
  });
}

function bindAlertButtons(elements) {
  elements.btnHeight.addEventListener("click", () => {
    playAlert(ALERT_TYPE.HEIGHT, voiceState, elements.audio);
  });

  elements.btnGuideBrick.addEventListener("click", () => {
    playAlert(ALERT_TYPE.GUIDE_BRICK, voiceState, elements.audio);
  });

  elements.btnObstacle.addEventListener("click", () => {
    playAlert(ALERT_TYPE.OBSTACLE, voiceState, elements.audio);
  });
}

function bindThresholdHandlers(elements) {
  elements.btnSetObstacle.addEventListener("click", () => {
    const value = parseInt(elements.obstacleInput.value, 10);
    if (!Number.isNaN(value)) {
      sendThreshold(THRESHOLD_TYPE.OBSTACLE, value);
    }
  });

  elements.btnSetHeight.addEventListener("click", () => {
    const value = parseInt(elements.heightInput.value, 10);
    if (!Number.isNaN(value)) {
      sendThreshold(THRESHOLD_TYPE.HEIGHT, value);
    }
  });

  bindSyncInputAndSlider(elements.obstacleInput, elements.obstacleSlider);
  bindSyncInputAndSlider(elements.heightInput, elements.heightSlider);
}

function bindCalibrationHandlers(elements) {
  elements.btnStartCalibrate.addEventListener("click", async () => {
    const btn = elements.btnStartCalibrate;
    btn.disabled = true;
    btn.textContent = "校正中...";

    try {
      await sendCalibration();
    } catch (error) {
      console.log("Calibration error (may be disconnected):", error);
    }

    await sleep(CALIBRATE_WAIT_MS);

    const currentDist = elements.distBox.textContent.trim();
    const distValue = parseInt(currentDist, 10);

    elements.calibrateHeightVal.textContent = currentDist || "--";
    elements.calibrateResult.style.display = "block";

    if (!Number.isNaN(distValue) && distValue > 0) {
      const calibratedValue = distValue + CALIBRATE_HEIGHT_OFFSET_CM;
      const obstacleValue = Math.max(calibratedValue - CALIBRATE_OBSTACLE_GAP_CM, MIN_OBSTACLE_CM);

      elements.heightInput.value = calibratedValue;
      elements.heightSlider.value = calibratedValue;
      elements.calibrateHeightVal.textContent = calibratedValue;

      elements.obstacleInput.value = obstacleValue;
      elements.obstacleSlider.value = obstacleValue;

      speak(`校正成功，高低差閥值${calibratedValue}公分，障礙物閥值${obstacleValue}公分`);

      try {
        await Promise.all([
          sendThreshold(THRESHOLD_TYPE.HEIGHT, calibratedValue),
          sendThreshold(THRESHOLD_TYPE.OBSTACLE, obstacleValue),
        ]);
      } catch (error) {
        console.log("Send threshold error:", error);
      }
    } else {
      alert("校正失敗！請確認：\n1. 已點擊「點擊開始」連接藍牙\n2. 設備正在傳送距離數據\n3. 螢幕上顯示有距離數值");
    }

    btn.disabled = false;
    btn.textContent = "開始校正";
  });

  elements.calibrateModal.addEventListener("hidden.bs.modal", () => {
    elements.calibrateResult.style.display = "none";
  });
}

function configureBluetoothHandlers(elements) {
  setBluetoothHandlers({
    onDistanceChange(distanceCm) {
      elements.distBox.textContent = distanceCm;
    },
    onVoiceMode(voiceMode) {
      const alertType = getAlertTypeByVoiceMode(voiceMode);
      if (!alertType) {
        return;
      }
      playAlert(alertType, voiceState, elements.audio);
    },
  });
}

function toggleVoiceMode(modeButton, modeText) {
  if (modeButton.classList.contains("btn-warning")) {
    modeButton.classList.remove("btn-warning");
    modeButton.classList.add("btn-info");
    modeText.innerHTML = "語音";
    setVoiceState("Ring");
    return;
  }

  modeButton.classList.remove("btn-info");
  modeButton.classList.add("btn-warning");
  modeText.innerHTML = "鈴聲";
  setVoiceState("Voice");
}

async function onStartButtonClick(startButton) {
  wakeLockStart();
  const result = await bleSearch();
  if (result === "success") {
    startButton.classList.remove("btn-primary");
    startButton.classList.add("btn-danger");
    startButton.innerHTML = "點擊結束";
  }
}

async function onStopButtonClick(startButton) {
  wakeLockStop();
  startButton.classList.remove("btn-danger");
  startButton.classList.add("btn-primary");
  startButton.innerHTML = "點擊開始";

  try {
    await bleDisconnect();
  } catch (error) {
    console.error(error);
    log(`Argh! ${error}`);
  }
}

function bindSyncInputAndSlider(input, slider) {
  slider.addEventListener("input", () => {
    input.value = slider.value;
  });
  input.addEventListener("input", () => {
    slider.value = input.value;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
