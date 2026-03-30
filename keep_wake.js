const canWakeLock = "wakeLock" in navigator;
let wakeLock = null;

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", onWakeLockReleased);
        console.log("Wake Lock is active!");
    } catch (err) {
        console.log(`${err.name}, ${err.message}`);
    }
}

function onWakeLockReleased() {
    wakeLock = null;
    console.log("Wake Lock has been released");
}

async function reWakeScreen() {
    if (document.visibilityState === "visible" && wakeLock === null) {
        await requestWakeLock();
    }
}

export function wakeLockStart() {
    if (!canWakeLock) {
        return;
    }
    requestWakeLock();
    document.addEventListener("visibilitychange", reWakeScreen);
}

export function wakeLockStop() {
    if (!canWakeLock) {
        return;
    }

    document.removeEventListener("visibilitychange", reWakeScreen);
    if (!wakeLock) {
        return;
    }

    wakeLock.removeEventListener("release", onWakeLockReleased);
    wakeLock.release().then(() => {
        wakeLock = null;
        console.log("release wake lock");
    });
}
