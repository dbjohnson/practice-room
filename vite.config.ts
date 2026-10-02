import { cpSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';
import { workspaceViteConfig } from './src/platform/vite.ts';
import { prepareSoundFont } from './src/audio/soundfont/prepare.ts';
import { devAlphaTabAssets } from './src/audio/devAlphaTabAssets.ts';

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
const soundFont = prepareSoundFont(fileURLToPath(new URL('.', import.meta.url)));
const soundFontVersion = createHash('sha256')
  .update(readFileSync(soundFont))
  .digest('hex')
  .slice(0, 16);
export default mergeConfig(
  defineConfig({
    define: { __RECORDED_BANK_VERSION__: JSON.stringify(soundFontVersion) },
    plugins: [
      react(),
      devAlphaTabAssets(),
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
