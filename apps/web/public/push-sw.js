// Service worker push and notification click handlers for Web Push notifications.

self.addEventListener('push', (event) => {
  let title = 'CoinCrew';
  /** @type {NotificationOptions} */
  const options = {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        if (payload.title) {
          title = payload.title;
        }
        if (payload.body !== undefined && payload.body !== null) {
          options.body = payload.body;
        }
        if (payload.tag !== undefined && payload.tag !== null) {
          options.tag = payload.tag;
        }
        if (payload.url) {
          options.data = { url: payload.url };
        }
      }
    } catch {
      // On unparseable payload show title 'CoinCrew' with no body (iOS requires every push to show).
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        let isSameOrigin = false;
        try {
          isSameOrigin = new URL(client.url).origin === self.location.origin;
        } catch {
          isSameOrigin = false;
        }

        if (isSameOrigin) {
          try {
            await client.focus();
          } catch {
            // Focus might be denied or restricted; continue to navigate.
          }

          if ('navigate' in client) {
            try {
              await client.navigate(url);
              return;
            } catch {
              client.postMessage({ type: 'NAVIGATE', url });
              return;
            }
          } else {
            client.postMessage({ type: 'NAVIGATE', url });
            return;
          }
        }
      }

      if (self.clients.openWindow) {
        try {
          await self.clients.openWindow(url);
        } catch {
          // openWindow might fail if popup blocking or permissions restrict it.
        }
      }
    })()
  );
});
