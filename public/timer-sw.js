self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ("focus" in client) {
                    client.postMessage({ type: "timer-notification-clicked" });
                    return client.focus().then((focusedClient) => {
                        focusedClient.postMessage({ type: "timer-notification-clicked" });
                    });
                }
            }

            if (self.clients.openWindow) {
                return self.clients.openWindow("/");
            }

            return undefined;
        })
    );
});
