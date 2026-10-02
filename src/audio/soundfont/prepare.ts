import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { woodblockSoundFont } from './woodblockSoundFont.ts';
import { bandSoundFont } from './bandSoundFont.ts';
import type { BandRegion } from './bandTypes.ts';
import { splitSamples } from './splitSamples.ts';

export function prepareSoundFont(root: string) {
  const original = fileURLToPath(
    new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab')),
  );
  const output = resolve(root, 'public/soundfont/practice-room.sf3');
  const soundFont = woodblockSoundFont(
    readFileSync(original),
    readFileSync(resolve(root, 'src/audio/assets/woody-block.wav')),
  );
  mkdirSync(resolve(root, 'public/soundfont'), { recursive: true });
  const regions = JSON.parse(
    readFileSync(resolve(root, 'src/audio/assets/band-manifest.json'), 'utf8'),
  ) as BandRegion[];
  const bank = bandSoundFont(soundFont, regions, (file) =>
    readFileSync(resolve(root, 'src/audio/assets', file)),
  );
  writeFileSync(output, bank);
  const split = splitSamples(bank);
  mkdirSync(resolve(root, 'public/soundfont/samples'), { recursive: true });
  writeFileSync(
    resolve(root, 'public/soundfont/sample-manifest.json'),
    JSON.stringify(split.manifest),
  );
  writeFileSync(resolve(root, 'public/soundfont/sample-template.sf2'), split.template);
  split.files.forEach((bytes, i) =>
    writeFileSync(resolve(root, 'public/soundfont', split.manifest.samples[i].file), bytes),
  );
  cpSync(resolve(root, 'src/audio/assets/licenses'), resolve(root, 'public/soundfont/credits'), {
    recursive: true,
  });
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepareSoundFont(process.cwd());
