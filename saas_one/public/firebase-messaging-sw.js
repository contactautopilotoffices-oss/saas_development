importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBcZ3cFsWiLfp7QFUcwOwjvSeM5Y-0hRZk",
    authDomain: "web-notification-52467.firebaseapp.com",
    projectId: "web-notification-52467",
    messagingSenderId: "758776193487",
    appId: "1:758776193487:web:37aded7039fffec6a432ba",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Note: We do NOT call showNotification here because the browser automatically
    // shows the notification when 'webpush.notification' is present in the FCM payload.
});

self.addEventListener('notificationclick', function (event) {
    console.log('[firebase-messaging-sw.js] Notification clicked', event);

    event.notification.close();

    // Prioritize deep_link from data, fallback to root
    const data = event.notification.data || {};
    const relativeUrl = data.deep_link || data.url || '/';

    // Ensure we have a valid absolute URL
    const targetUrl = new URL(relativeUrl, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // 1. Try to find an existing tab with this exact URL and focus it
            for (let client of windowClients) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }

            // 2. If no exact match, find any tab on same origin and navigate it
            for (let client of windowClients) {
                if ('navigate' in client && 'focus' in client) {
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }

            // 3. Last resort: open a brand new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
