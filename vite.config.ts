import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import packageJson from './package.json';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.PACKAGE_BUILD_DATE': JSON.stringify(new Date().toISOString())
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'auto',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5000000,
      },
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'pwa-72x72.png',
        'pwa-96x96.png',
        'pwa-128x128.png',
        'pwa-144x144.png',
        'pwa-152x152.png',
        'pwa-180x180.png',
        'pwa-192x192.png',
        'pwa-384x384.png',
        'pwa-512x512.png',
        'maskable-icon-192x192.png',
        'maskable-icon-512x512.png',
        'apple-touch-icon.png'
      ],
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'ChatBoot CRM',
        short_name: 'ChatBoot',
        description: 'Plataforma Premium de WhatsApp CRM',
        theme_color: '#111b21',
        background_color: '#0b141a',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen', 'minimal-ui'],
        orientation: 'portrait',
        categories: ['business', 'productivity'],
        lang: 'pt-BR',
        dir: 'ltr',
        id: '/',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-72x72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-128x128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-180x180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'pwa-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
});
