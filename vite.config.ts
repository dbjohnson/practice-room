import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';
import { workspaceViteConfig } from './src/platform/vite.ts';

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
export default mergeConfig(
  defineConfig({
    plugins: [
      react(),
      alphaTab({ assetOutputDir: false }),
      {
        name: 'alphatab-worker-base',
        apply: 'serve',
        enforce: 'post',
        transform(code, id) {
          if (!id.includes('?alphatab_worker&type=')) return;
          // Vite 8 resolves module imports before adding the public base. alphaTab
          // 1.8 injects it too early, breaking workers under /dev/build/<id>/.
          return {
            code: code.replace(/^import "[^"\n]*\/@vite\/env"/, 'import "/@vite/env"'),
            map: null,
          };
        },
      },
    ],
    worker: { format: 'es' },
    server: { port: 5174, watch: { ignored: ['**/coverage/**', '**/spikes/**'] } },
    build: { chunkSizeWarningLimit: 1500 },
  }),
  workspaceViteConfig(),
);
