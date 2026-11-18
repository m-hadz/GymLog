import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// La app se compila a /dist (Vercel la sirve desde ahí; /api sigue siendo serverless).
// El service worker (Workbox) precachea la app compilada y guarda en caché el
// catálogo de ejercicios y sus imágenes para que todo funcione sin señal.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GymLog',
        short_name: 'GymLog',
        description: 'Registro de entrenamientos personal',
        lang: 'es',
        start_url: '/#/train',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1114',
        theme_color: '#0f1114',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/exercises\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'gymlog-catalog' },
          },
          {
            urlPattern: /\.(?:jpg|jpeg|png|webp)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'gymlog-images', expiration: { maxEntries: 600 } },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
});
