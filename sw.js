self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open('fox-store').then((cache) => cache.addAll([
            '/White-Cane-New/sytle.css',
            '/White-Cane-New/index.js',
            '/White-Cane-New/animation_erase.js',
            '/White-Cane-New/bluetooth.js',
            '/White-Cane-New/chart.js',
            '/White-Cane-New/csv_save.js',
            '/White-Cane-New/keep_wake.js',
            '/White-Cane-New/mouse_event.js',
            '/White-Cane-New/voice.js',
            '/White-Cane-New/utils.js',
        ])),
    );
});

self.addEventListener('fetch', (e) => {
    console.log(e.request.url);
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request)),
    );
});