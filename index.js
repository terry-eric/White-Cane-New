import { mouseTouchChange } from "./mouse_event.js";
import { speak } from "./voice.js";
import { wakeLockStart, wakeLockStop } from "./keep_wake.js";
import { bleSearch, bleDisconnect, sendModeEvent, sendThreshold, sendCalibration } from "./bluetooth.js";
import { log } from "./utils.js";
import { lock, positionBarCal, startPoint, unlock } from "./animation_erase.js";
import { voiceState, setVoiceState } from "./state.js";

mouseTouchChange();

// export let voiceState = "Ring"; // Moved to state.js
var startButton = document.getElementById("myButton");
var modeButton = document.getElementById("bleButton");
var modeText = document.getElementById("voice-toggle");
startButton.addEventListener("click", toggleColor);
modeButton.addEventListener("click", toggleColorBle);

// 紀錄起始位置，將X移動距離和畫面X做比較，大於筏值即可解鎖
var lockScreen = document.getElementById("lock-screen");
lockScreen.addEventListener("mousedown", startPoint);
lockScreen.addEventListener("mousemove", positionBarCal, false);
lockScreen.addEventListener("mouseup", unlock);

document.getElementById("btn-lock").addEventListener("click", lock)

document.getElementById("btn-height").addEventListener("click", function () {
  if (voiceState == "Ring") {
    document.getElementById('b_mp3').play();
  } else {
    speak("注意高低差");
  }
})
document.getElementById("btn-GuideBrick").addEventListener("click", function () {
  if (voiceState == "Ring") {
    document.getElementById('g_mp3').play();
  } else {
    speak("發現導盲磚");
    // speak("發現斑馬線");
  }
})
document.getElementById("btn-obstacle").addEventListener("click", function () {
  if (voiceState == "Ring") {
    document.getElementById('f_mp3').play();
  } else {
    // speak("發現導盲磚");
    speak("注意障礙物");
  }
})

// 設定閥值按鈕事件
document.getElementById("btn-set-obstacle").addEventListener("click", function () {
  const val = document.getElementById("obstacle-threshold").value;
  if (val) {
    sendThreshold(1, parseInt(val)); // Type 1: 障礙物
  }
});

document.getElementById("btn-set-height").addEventListener("click", function () {
  const val = document.getElementById("height-threshold").value;
  if (val) {
    sendThreshold(2, parseInt(val)); // Type 2: 高低差
  }
});

// 自動校正按鈕事件
document.getElementById("btn-start-calibrate").addEventListener("click", async function () {
  const btn = this;
  btn.disabled = true;
  btn.textContent = "校正中...";

  try {
    const result = await sendCalibration();
    console.log("Calibration result:", result);
  } catch (e) {
    console.log("Calibration error (may be disconnected):", e);
  }

  // 等待設備回傳數據
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 獲取當前 dist-box 的值作為校正結果
  const distBox = document.getElementById("dist-box");
  const currentDist = distBox.textContent.trim();
  console.log("Current dist-box value:", currentDist);

  const distValue = parseInt(currentDist, 10);
  console.log("Parsed distValue:", distValue);

  // 顯示校正結果
  document.getElementById("calibrate-height-val").textContent = currentDist || "--";
  document.getElementById("calibrate-result").style.display = "block";

  // 同時更新高低差閥值輸入框
  const heightInput = document.getElementById("height-threshold");

  if (!isNaN(distValue) && distValue > 0) {
    const calibratedValue = Math.round(distValue / 10) + 8; // 除10轉cm，再加 8cm
    heightInput.value = calibratedValue;
    document.getElementById("calibrate-height-val").textContent = calibratedValue; // 更新顯示
    console.log("Height input value set to:", calibratedValue);
    speak("校正成功，閥值已設定為" + calibratedValue + "公分");
    // 自動發送設定到設備
    try {
      sendThreshold(2, calibratedValue);
    } catch (e) {
      console.log("Send threshold error:", e);
    }
  } else {
    // 顯示提示訊息
    alert("校正失敗！請確認：\n1. 已點擊「點擊開始」連接藍牙\n2. 設備正在傳送距離數據\n3. 螢幕上顯示有距離數值");
    console.log("distValue is invalid, not setting input value");
  }

  btn.disabled = false;
  btn.textContent = "開始校正";
});

// 當 Modal 關閉時重置結果顯示
document.getElementById("calibrateModal").addEventListener("hidden.bs.modal", function () {
  document.getElementById("calibrate-result").style.display = "none";
});

function toggleColor() {
  if (startButton.classList.contains("btn-primary")) {
    onStartButtonClick();
  } else {
    onStopButtonClick();
  }
}

function toggleColorBle() {
  if (modeButton.classList.contains("btn-warning")) {
    modeButton.classList.remove("btn-warning");
    modeButton.classList.add("btn-info");
    modeText.innerHTML = "語音";
    modeButton.classList.add("btn-info");
    modeText.innerHTML = "語音";
    setVoiceState("Ring");
  } else {
    modeButton.classList.remove("btn-info");
    modeButton.classList.add("btn-warning");
    modeText.innerHTML = "鈴聲";
    setVoiceState("Voice");
  }
}

async function onStartButtonClick() {
  wakeLockStart();
  bleSearch().then(function (result) {
    if (result == "success") {
      startButton.classList.remove("btn-primary");
      startButton.classList.add("btn-danger");
      startButton.innerHTML = "點擊結束";
    };
  })
}

async function onStopButtonClick() {
  wakeLockStop();
  startButton.classList.remove("btn-danger");
  startButton.classList.add("btn-primary");
  startButton.innerHTML = "點擊開始";

  try {
    bleDisconnect();

  } catch (error) {
    console.error(error)
    log('Argh! ' + error);
  }
}
