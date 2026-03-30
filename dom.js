function getRequiredElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing required element: #${id}`);
    }
    return element;
}

export function getAppElements() {
    return {
        startButton: getRequiredElement("myButton"),
        modeButton: getRequiredElement("bleButton"),
        modeText: getRequiredElement("voice-toggle"),
        lockScreen: getRequiredElement("lock-screen"),
        unlockBar: getRequiredElement("unlock-bar"),
        btnLock: getRequiredElement("btn-lock"),
        btnHeight: getRequiredElement("btn-height"),
        btnGuideBrick: getRequiredElement("btn-GuideBrick"),
        btnObstacle: getRequiredElement("btn-obstacle"),
        btnSetObstacle: getRequiredElement("btn-set-obstacle"),
        btnSetHeight: getRequiredElement("btn-set-height"),
        obstacleSlider: getRequiredElement("obstacle-slider"),
        obstacleInput: getRequiredElement("obstacle-threshold"),
        heightSlider: getRequiredElement("height-slider"),
        heightInput: getRequiredElement("height-threshold"),
        distBox: getRequiredElement("dist-box"),
        calibrateModal: getRequiredElement("calibrateModal"),
        btnStartCalibrate: getRequiredElement("btn-start-calibrate"),
        calibrateResult: getRequiredElement("calibrate-result"),
        calibrateHeightVal: getRequiredElement("calibrate-height-val"),
        audio: {
            height: getRequiredElement("b_mp3"),
            guideBrick: getRequiredElement("g_mp3"),
            obstacle: getRequiredElement("f_mp3"),
        },
    };
}
