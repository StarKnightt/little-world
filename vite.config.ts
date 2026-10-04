import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/little-world/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 7000,
    rollupOptions: {
      input: command === 'build' ? { main: resolve(import.meta.dirname, 'index.html') } : undefined,
    },
  },
  worker: { format: 'es' },
  server: { hmr: process.env.NO_HMR ? false : undefined },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Little World',
        short_name: 'Little World',
        description: 'A tiny 3D island for your daily routine. Gemma runs on your device.',
        theme_color: '#1b2a4a',
        background_color: '#0e1730',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
}));
