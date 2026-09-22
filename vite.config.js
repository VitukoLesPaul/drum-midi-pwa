import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Drum MIDI PWA',
        short_name: 'DrumMIDI',
        description: 'Extrae batería y bajo de tus canciones y genera MIDI para Logic Pro',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,onnx}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50 MB para modelos ONNX
      }
    })
  ],
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          onnx: ['onnxruntime-web']
        }
      }
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
