import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/logo.png'],
      manifest: {
        name: 'RAM Handling — PTM Dashboard',
        short_name: 'PTM Dashboard',
        description: 'Dashboard de gestion des connexions passagers en transit PTM',
        theme_color: '#08101E',
        background_color: '#08101E',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icons/logo.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/sheets\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'sheets-api', expiration: { maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, strictPort: false },
  build:  { outDir: 'dist', sourcemap: false },
})
