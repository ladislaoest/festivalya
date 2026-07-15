self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { /* payload no era JSON */ }

    const title = data.title || 'FestivalYa Talkie';
    const options = {
        body: data.body || 'Alguien está hablando',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-32.png',
        tag: data.tag || 'talkie',
        renotify: true,
        data: { url: data.url || './index.html' }
    };

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
            const hasVisible = clientsList.some((c) => c.visibilityState === 'visible');
            if (!hasVisible) {
                return self.registration.showNotification(title, options);
            }
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
            for (const client of clientsList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(event.notification.data.url || './index.html');
            }
        })
    );
});
