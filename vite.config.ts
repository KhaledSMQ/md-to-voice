import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const GITHUB_REPO_URL = 'https://github.com/KhaledSMQ/md-to-voice'

function gitMeta(): { short: string; commitUrl: string } {
  try {
    const short = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const full = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    // Unpushed local commits 404 on /commit/<sha>; fall back to the history page.
    const onRemote = execSync(`git branch -r --contains ${full}`, { encoding: 'utf8' }).trim()
    return {
      short,
      commitUrl: onRemote
        ? `${GITHUB_REPO_URL}/commit/${short}`
        : `${GITHUB_REPO_URL}/commits/main`,
    }
  } catch {
    return { short: 'unknown', commitUrl: `${GITHUB_REPO_URL}/commits/main` }
  }
}

const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  .version as string
const { short: gitCommit, commitUrl: gitCommitUrl } = gitMeta()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __GIT_COMMIT_URL__: JSON.stringify(gitCommitUrl),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'icon-192.png', 'icon-512.png'],
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
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
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
  // Lightning CSS (Vite 8 default) still warns on valid ::highlight() selectors
  // (parcel-bundler/lightningcss#1017) even though it preserves them. Use esbuild
  // until a lightningcss release recognizes the Custom Highlight API pseudo.
  build: {
    cssMinify: 'esbuild',
    // Emit .map files so production stack traces resolve to source.
    sourcemap: true,
    // Kokoro/ORT live in the TTS worker (~2 MB JS + ~21 MB wasm). Already
    // isolated via Worker; raising the limit avoids a noisy false alarm.
    chunkSizeWarningLimit: 2500,
  },
  optimizeDeps: {
    exclude: ['kokoro-js', '@huggingface/transformers'],
  },
})
