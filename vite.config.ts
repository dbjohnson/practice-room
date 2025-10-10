import path from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      '@audio': path.resolve(__dirname, 'src/audio'),
      '@time': path.resolve(__dirname, 'src/time'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@lib': path.resolve(__dirname, 'src/lib'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
