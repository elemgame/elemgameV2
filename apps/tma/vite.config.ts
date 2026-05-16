import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_PAGES === 'true' ? '/elemgameV2/' : '/');

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Resolve the shared workspace package directly from source
      // so we don't need a pre-built dist/ during development.
      '@elmental/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
