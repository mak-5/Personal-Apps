import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BUILD_TARGET=native npm run build  → for Capacitor/iOS
// npm run build                       → for GitHub Pages
const isNative = process.env.BUILD_TARGET === 'native'

export default defineConfig({
  base: isNative ? './' : '/apps/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Akshay Apps',
        short_name: 'Apps',
        description: 'Personal app hub — flight tracker, finance dashboard & more',
        theme_color: '#0c0c0f',
        background_color: '#0c0c0f',
        display: 'standalone',
        orientation: 'any',
        scope: '/apps/',
        start_url: '/apps/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /^https:\/\/api\.tequila\.kiwi\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'flight-api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 } }
          }
        ]
      }
    })
  ]
})
