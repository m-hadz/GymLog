import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (generado por vite-plugin-pwa en el build): la app abre sin señal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker no registrado', e));
  });
}
