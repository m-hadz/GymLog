import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { syncPush } from './lib/push.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (generado por vite-plugin-pwa en el build): la app abre sin señal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker no registrado', e));
    syncPush(); // aviso de fin de descanso (feature 11): mantener la suscripción al día
  });
  // Tocar la notificación "Descanso terminado" con la app ya abierta: ir al entrenamiento
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.hash === 'string' && e.data.hash.startsWith('#/')) location.hash = e.data.hash;
  });
}
