import { speak } from "./voice.js";
import { log } from "./utils.js";

const serviceUuid = 0x181A;
const voiceUuid = "a0451b3a-f056-4ce5-bc13-0838e26b2d68";
const DISTUUID = "c3f1b2a4-9d67-4f8a-8e12-5a9b7c4d210f";
const FEEDBACK_UUID = "e528b1c4-d3f9-4e6a-8b2c-1f4d9e3a7c5b";

const UuidTargets = [voiceUuid, DISTUUID];
let server;
let service;
let device;

const handlers = {
    onConnected() { },
    onDisconnected() { },
    onDistanceChange() { },
    onVoiceMode() { },
};

export function setBluetoothHandlers(nextHandlers = {}) {
    Object.assign(handlers, nextHandlers);
}

export async function bleSearch() {
    try {
        log('Requesting Bluetooth Device...');
        device = await navigator.bluetooth.requestDevice({
            optionalServices: [serviceUuid],
            filters: [{ name: "WhiteCane" }]
        });

        device.addEventListener('gattserverdisconnected', reConnect);
        await connectDevice();
        return "success";

    } catch (error) {
        speak('連接錯誤，請重新連接');
        log('Argh! ' + error);
        return "failed";
    }
}

export async function bleDisconnect() {
    try {
        await stopNotifications();
        if (device) {
            device.removeEventListener('gattserverdisconnected', reConnect);
        }
        if (server && server.connected) {
            server.disconnect();
        }
        handlers.onDisconnected();
        speak('已斷開連接');
        log('> Notifications stopped');
    } catch (error) {
        log('Argh! ' + error);
    }
}

async function connectDevice() {
    try {
        time('Connecting to Bluetooth Device... ');
        log('Connecting to GATT Server...');
        server = await device.gatt.connect();

        log('Getting Service...');
        service = await server.getPrimaryService(serviceUuid);

        log('Getting Characteristic...');
        await startNotifications();
        speak('成功連接');
        handlers.onConnected();
    } catch (error) {
        console.log("連接錯誤", error);
        throw error;
    }
}

async function reConnect() {

    exponentialBackoff(3 /* max retries */, 2 /* seconds delay */,
        connectDevice,
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
        const voiceMode = dv.getUint8(0);
        handlers.onVoiceMode(voiceMode);

        console.log("VOICE =", voiceMode);
        return;
    }

    if (uuid === DISTUUID) {
        const num = dv.getUint16(0, true);
        handlers.onDistanceChange(Math.round(num / 10), num);
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
        const characteristicTarget = await getFeedbackCharacteristic();
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
        const characteristicTarget = await getFeedbackCharacteristic();
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
    log('[' + new Date().toISOString().slice(11, 19) + '] ' + text);
}

async function startNotifications() {
    for (const UuidTarget of UuidTargets) {
        const characteristicTarget = await service.getCharacteristic(UuidTarget);
        characteristicTarget.removeEventListener("characteristicvaluechanged", callback);
        characteristicTarget.addEventListener("characteristicvaluechanged", callback);
        await characteristicTarget.startNotifications();
    }
}

async function stopNotifications() {
    if (!service) {
        return;
    }
    for (const UuidTarget of UuidTargets) {
        const characteristicTarget = await service.getCharacteristic(UuidTarget);
        await characteristicTarget.stopNotifications();
        characteristicTarget.removeEventListener("characteristicvaluechanged", callback);
    }
}

async function getFeedbackCharacteristic() {
    if (!service) {
        throw new Error("Bluetooth service is not connected.");
    }
    return service.getCharacteristic(FEEDBACK_UUID);
}
