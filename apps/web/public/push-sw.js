// Service worker push and notification click handlers for Web Push notifications.

function resolvePayloadUrl(rawUrl) {
  try {
    const target = new URL(String(rawUrl || '/'), self.location.origin);
    return target.origin === self.location.origin ? target.href : '/';
  } catch {
    return '/';
  }
}

self.addEventListener('push', (event) => {
  let title = 'CoinCrew';
  /** @type {NotificationOptions} */
  const options = {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: resolvePayloadUrl('/') },
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
        options.data = { url: resolvePayloadUrl(payload.url) };
      }
    } catch {
      // On unparseable payload show title 'CoinCrew' with no body (iOS requires every push to show).
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = resolvePayloadUrl(event.notification.data && event.notification.data.url);

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
              // client.navigate threw; fallback to openWindow
            }
          }

          if (self.clients.openWindow) {
            await self.clients.openWindow(url);
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});
