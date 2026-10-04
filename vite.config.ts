import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Inline the built stylesheet into index.html so first paint doesn't wait on a second request. */
function inlineCss(): Plugin {
  return {
    name: 'inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let src = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== 'asset' || !name.endsWith('.css')) continue;
        const re = new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
        if (!re.test(src)) continue;
        src = src.replace(re, () => `<style>${String(file.source)}</style>`);
        delete bundle[name];
      }
      html.source = src;
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/little-world/' : '/',
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
    inlineCss(),
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
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}', '**/*latin-wght*.woff2'],
        // the WebLLM runtime is only fetched by people who load Gemma, so cache it on first use instead
        globIgnores: ['**/lib-*.js', '**/llm.worker-*.js', '**/llm-*.js', 'og.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'little-world-runtime', expiration: { maxEntries: 40 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
}));
