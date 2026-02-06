import { speak } from "./voice.js";
import { bytes2int16, log } from "./utils.js";
import { voiceState } from "./state.js";

// add new
let serviceUuid = 0x181A;
// let serviceUuid = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
let voiceUuid = "a0451b3a-f056-4ce5-bc13-0838e26b2d68";
let DISTUUID = "c3f1b2a4-9d67-4f8a-8e12-5a9b7c4d210f";
let FEEDBACK_UUID = "e528b1c4-d3f9-4e6a-8b2c-1f4d9e3a7c5b"; // 新增的回傳 UUID

// 宣告一個包含兩個 UUID 的陣列
let UuidTargets = [voiceUuid, DISTUUID];
let server;
let service;
let device;
const US = [];

export async function bleSearch() {
    try {
        log('Requesting Bluetooth Device...');
        device = await navigator.bluetooth.requestDevice({
            // add newDD
            optionalServices: [serviceUuid],
            // acceptAllDevices: true
            filters: [{ name: "WhiteCane" }]
        });

        connectDevice();
        device.addEventListener('gattserverdisconnected', reConnect);
        return "success"

    } catch (error) {
        speak('連接錯誤，請重新連接');
        log('Argh! ' + error);
    }
}

export async function bleDisconnect() {
    // 停止所有 characteristic 的通知功能
    for (const [index, UuidTarget] of UuidTargets.entries()) {
        const characteristicTarget = await service.getCharacteristic(UuidTarget);
        await characteristicTarget.stopNotifications();
        characteristicTarget.removeEventListener('characteristicvaluechanged',
            callback);
    }
    device.removeEventListener('gattserverdisconnected', reConnect);
    await server.disconnect(); // 需要手動斷開 GATT 伺服器的連線
    speak('已斷開連接');
    log('> Notifications stopped');
}

async function connectDevice() {
    try {
        time('Connecting to Bluetooth Device... ');
        log('Connecting to GATT Server...');
        server = await device.gatt.connect();

        log('Getting Service...');
        service = await server.getPrimaryService(serviceUuid);

        log('Getting Characteristic...');
        // add new

        // 使用 for...of 迴圈遍歷陣列中的元素，取得每個 UUID 對應的 characteristic 並啟用通知
        for (const [index, UuidTarget] of UuidTargets.entries()) {

            // 使用 service.getCharacteristic() 方法來取得指定 UUID 對應的 characteristic
            let characteristicTarget = await service.getCharacteristic(UuidTarget);

            // 當 characteristic 的值發生改變時，執行 callback 函數
            characteristicTarget.addEventListener("characteristicvaluechanged", callback);

            // 啟用 characteristic 的通知功能，這樣當 characteristic 的值改變時，就會發送通知
            await characteristicTarget.startNotifications();
        };
        speak('成功連接');
    } catch (error) {
        console.log("連接錯誤", error);
    }
}

async function reConnect() {

    exponentialBackoff(3 /* max retries */, 2 /* seconds delay */,
        async function toTry() {

        },
        function success() {
            log('> Bluetooth Device connected. Try disconnect it now.');
            speak('成功連接');
            log('> Notifications started');
        },
        function fail() {
            time('Failed to reconnect.');

        });
}

function callback(event) {
    const uuid = event.currentTarget.uuid;
    const dv = event.currentTarget.value;

    if (uuid === voiceUuid) {
        const voiceMode = dv.getUint8(0);   // ✅ 正確解析

        if (voiceMode === 4) {
            if (voiceState === "Ring") document.getElementById('b_mp3').play();
            else speak("注意高低差");
        } else if (voiceMode === 0) {
            if (voiceState === "Ring") document.getElementById('g_mp3').play();
            else speak("發現導盲磚");
        } else if (voiceMode === 5) {
            if (voiceState === "Ring") document.getElementById('f_mp3').play();
            else speak("注意障礙物");
        }

        console.log("VOICE =", voiceMode);
        return;
    }

    if (uuid === DISTUUID) {
        console.log("DIST notify arrived", event.currentTarget.value.byteLength);
        const num = dv.getUint16(0, true);  // ✅ 你 peripheral 用 writeData16
        document.getElementById("dist-box").textContent = Math.round(num / 10); // 除10顯示
        // console.log("DIST =", num);

        // 判斷 TOF 數值並回傳給邊緣端 -> 改為由使用者設定閥值，不在此處自動判斷
        // judgeDistance(num);
        return;
    }
}

// 傳送閥值設定給邊緣端
// type: 1 為障礙物, 2 為高低差
export async function sendThreshold(type, value) {
    // 準備要傳送的資料 (Uint8Array: [type, value])
    // 假設 value 小於 255cm，如果大於 255 需要改用 Uint16
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint8(0, type);
    view.setUint8(1, value);

    try {
        // 回傳到 FEEDBACK_UUID
        let characteristicTarget = await service.getCharacteristic(FEEDBACK_UUID);
        await characteristicTarget.writeValue(buffer);
        console.log(`Sent threshold - Type: ${type}, Value: ${value}`);
        speak("設定成功");
    } catch (error) {
        console.log("設定錯誤", error);
        speak("設定失敗");
    }
}

// 傳送自動校正命令給邊緣端
// type: 3 為自動校正
export async function sendCalibration() {
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint8(0, 3);  // Type 3: 自動校正
    view.setUint8(1, 0);  // 預留值

    try {
        let characteristicTarget = await service.getCharacteristic(FEEDBACK_UUID);
        await characteristicTarget.writeValue(buffer);
        console.log('Sent calibration command');
        speak("校正指令已發送");
        return { success: true };
    } catch (error) {
        console.log("校正錯誤", error);
        speak("校正失敗");
        return { success: false, error: error };
    }
}

export async function sendModeEvent(message, Uuid) {
    try {
        // 傳送訊息
        console.log(message);
        const encoder = new TextEncoder(); // 文字編碼器
        const data = encoder.encode(message); // 將字串轉換為Uint8Array數據
        let characteristicBle = await service.getCharacteristic(Uuid);
        await new Promise((resolve, reject) => {
            characteristicBle.writeValue(data)
                .then(() => {
                    console.log('訊息傳送成功');
                    resolve();
                })
                .catch((error) => {
                    console.error('Argh! ' + error);
                    reject(error);
                });
        });

    } catch (error) {
        log('Argh! ' + error);
    }

}


/* Utils */
// This function keeps calling "toTry" until promise resolves or has
// retried "max" number of times. First retry has a delay of "delay" seconds.
// "success" is called upon success.
async function exponentialBackoff(max, delay, toTry, success, fail) {
    try {
        const result = await toTry();
        success(result);
        console.log(result);
    } catch (error) {
        if (max === 0) {
            return fail();
        }
        time('Retrying in ' + delay + 's... (' + max + ' tries left)');
        setTimeout(function () {
            exponentialBackoff(--max, delay * 2, toTry, success, fail);
        }, delay * 1000);
    }
}

function time(text) {
    log('[' + new Date().toJSON().substring(11, 8) + '] ' + text);
}

