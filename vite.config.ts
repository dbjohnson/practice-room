import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';

// Prepare assets before Vite scans public/. The upstream buildStart hook runs too late
// for Vite 8's development public-file cache on a fresh checkout.
const engine = new URL('.', import.meta.resolve('@coderline/alphatab'));
for (const directory of ['font', 'soundfont']) {
  cpSync(
    fileURLToPath(new URL(directory, engine)),
    fileURLToPath(new URL(`./public/${directory}`, import.meta.url)),
    { recursive: true },
  );
}
export default defineConfig({
  base: './',
  plugins: [react(), alphaTab({ assetOutputDir: false })],
  worker: { format: 'es' },
  server: { port: 5173, watch: { ignored: ['**/coverage/**', '**/spikes/**'] } },
  build: { chunkSizeWarningLimit: 1500 },
});
