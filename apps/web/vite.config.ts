import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The SPA talks only to Express at /api/v1 (relative). In dev, Vite proxies that
// to the API server so cookies stay first-party on http://localhost:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
