import { initApp } from "./index.js";

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    navigator.serviceWorker
        .register("./sw.js")
        .then(() => {
            console.log("Service Worker Registered");
        })
        .catch((error) => {
            console.log("Service Worker registration failed:", error);
        });
}

function bootstrap() {
    initApp();
    registerServiceWorker();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
    bootstrap();
}
