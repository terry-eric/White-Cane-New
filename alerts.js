import { speak } from "./voice.js";

export const ALERT_TYPE = Object.freeze({
    GUIDE_BRICK: "guideBrick",
    HEIGHT: "height",
    OBSTACLE: "obstacle",
});

const ALERT_CONFIG = Object.freeze({
    [ALERT_TYPE.HEIGHT]: {
        audioKey: "height",
        speech: "注意高低差",
    },
    [ALERT_TYPE.GUIDE_BRICK]: {
        audioKey: "guideBrick",
        speech: "發現導盲磚",
    },
    [ALERT_TYPE.OBSTACLE]: {
        audioKey: "obstacle",
        speech: "注意障礙物",
    },
});

export function getAlertTypeByVoiceMode(voiceMode) {
    if (voiceMode === 4) {
        return ALERT_TYPE.HEIGHT;
    }
    if (voiceMode === 0) {
        return ALERT_TYPE.GUIDE_BRICK;
    }
    if (voiceMode === 5) {
        return ALERT_TYPE.OBSTACLE;
    }
    return null;
}

export function playAlert(alertType, currentVoiceState, audioElements) {
    const config = ALERT_CONFIG[alertType];
    if (!config) {
        return;
    }

    if (currentVoiceState === "Ring") {
        const audio = audioElements[config.audioKey];
        if (!audio) {
            return;
        }
        audio.currentTime = 0;
        audio.play().catch(() => {
            // Browser autoplay or focus policies can block play(); ignore safely.
        });
        return;
    }

    speak(config.speech);
}
