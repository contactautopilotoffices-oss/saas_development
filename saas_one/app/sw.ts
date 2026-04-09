/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: [
        {
            matcher: ({ url }) =>
                url.pathname.startsWith("/login") ||
                url.pathname.startsWith("/signup") ||
                url.pathname.startsWith("/forgot-password") ||
                url.pathname.startsWith("/reset-password"),
            handler: new NetworkOnly(),
        },
        ...defaultCache,
    ],
});

serwist.addEventListeners();

// Listen for push notifications
self.addEventListener("push", (event) => {
    const data = event.data?.json() ?? {};
    const title = data.title || "Autopilot Notice";
    const options = {
        body: data.body || "You have a new notification from Autopilot",
        icon: "/android-chrome-192x192.png",
        badge: "/android-chrome-192x192.png",
        data: data.url ? { url: data.url } : undefined,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url;

    if (url) {
        event.waitUntil(
            self.clients.matchAll({ type: "window" }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url === url && "focus" in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(url);
                }
            })
        );
    }
});
