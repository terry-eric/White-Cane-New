import { mouseTouchChange } from "./mouse_event.js";
import { speak } from "./voice.js";
import { wakeLockStart, wakeLockStop } from "./keep_wake.js";
import { bleSearch, bleDisconnect, sendModeEvent } from "./bluetooth.js";
import { log } from "./utils.js";
import { lock, positionBarCal, startPoint, unlock } from "./animation_erase.js";

mouseTouchChange();

export let voiceState = "Ring";
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
    voiceState = "Ring";
  } else {
    modeButton.classList.remove("btn-info");
    modeButton.classList.add("btn-warning");
    modeText.innerHTML = "鈴聲";
    voiceState = "Voice";
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
