const CACHE_NAME = "white-cane-cache-v2";
const ASSETS = [
    "./",
    "./index.html",
    "./sytle.css",
    "./main.js",
    "./index.js",
    "./alerts.js",
    "./animation_erase.js",
    "./bluetooth.js",
    "./dom.js",
    "./keep_wake.js",
    "./mouse_event.js",
    "./state.js",
    "./utils.js",
    "./voice.js",
    "./manifest.webmanifest",
    "./icon/fox-icon.png",
    "./a.mp3",
    "./b.mp3",
    "./c.mp3",
    "./d.mp3",
    "./e.mp3",
    "./f.mp3",
    "./g.mp3",
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cacheResponse) => {
            if (cacheResponse) {
                return cacheResponse;
            }
            return fetch(event.request);
        })
    );
});
