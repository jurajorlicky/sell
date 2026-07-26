import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const buildVersion = new Date().toISOString()

const versionManifestPlugin = (): Plugin => ({
  name: 'version-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: buildVersion }, null, 2)
    });
  }
})

export default defineConfig({
  plugins: [react(), versionManifestPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          xlsx: ['xlsx'],
          pdf: ['jspdf']
        }
      }
    }
  },
  define: {
    'process.env': {},
    __APP_VERSION__: JSON.stringify(buildVersion)
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js']
  }
})
