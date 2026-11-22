// Aviso de fin de descanso (feature 11). Lo importa el service worker de Workbox (vite.config.js).
// El push llega sin contenido: el texto es fijo. Cada aviso reemplaza al anterior (tag 'rest').
// En iPhone cada push debe mostrar una notificación (si no, Safari quita la suscripción): se muestra
// siempre y, si la app está a la vista, se cierra enseguida (ya sonó en la app).
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    await self.registration.showNotification('Descanso terminado', {
      body: 'Vamos con la siguiente serie',
      tag: 'rest',
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { hash: '#/workout' },
    });
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === 'visible')) {
      const open = await self.registration.getNotifications({ tag: 'rest' });
      open.forEach((n) => n.close());
    }
  })());
});

// Tocar la notificación abre la app en el entrenamiento en curso
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = event.notification.data?.hash || '#/workout';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) {
        c.postMessage({ type: 'open', hash });
        await c.focus();
        return;
      }
    }
    await self.clients.openWindow(`/${hash}`);
  })());
});
