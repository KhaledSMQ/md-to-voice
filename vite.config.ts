import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'md to voice',
        short_name: 'md2voice',
        description: 'Karaoke-style Markdown reader with local TTS',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Bundled TTS worker + ORT wasm exceed Workbox’s default 2 MiB cap.
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,wasm}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Mirror the Hugging Face Hub fetches transformers.js makes for the Kokoro
            // model so they stay available when offline (transformers.js maintains its
            // own cache too — this is a belt-and-suspenders fallback).
            urlPattern: /^https:\/\/(?:cdn-lfs\.)?huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'huggingface-assets',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['kokoro-js', '@huggingface/transformers'],
  },
})
