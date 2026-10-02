import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

interface Recording {
  file: string;
  source: string;
  sourceSha256: string;
  start: number;
  duration: number;
  gainDb: number;
  sampleRate: number;
}

const [library = 'samples', prefix = ''] = process.argv.slice(2);
if (library === '--help') {
  console.info('Usage: npm run audio:import -- /path/to/samples [filename-prefix]');
  console.info('Rebuilds selected Ogg assets using FFmpeg and pinned, SHA-256 verified originals.');
  process.exit(0);
}
const assets = resolve('src/audio/assets');
const manifest = JSON.parse(
  readFileSync(resolve(assets, 'band-manifest.json'), 'utf8'),
) as Recording[];
const recordings = [...new Map(manifest.map((r) => [r.file, r])).values()].filter((r) =>
  r.file.startsWith(`band/${prefix}`),
);
if (!recordings.length) throw new Error(`No recordings matching ${prefix}`);
const scratch = mkdtempSync(resolve(tmpdir(), 'practice-room-audio-'));
try {
  for (const recording of recordings) {
    const { source, file, duration, start, gainDb, sampleRate } = recording;
    const raw = source.startsWith('local:')
      ? readFileSync(resolve(library, source.slice(6)))
      : await download(source);
    if (createHash('sha256').update(raw).digest('hex') !== recording.sourceSha256)
      throw new Error(`Source checksum mismatch: ${source}`);
    const input = resolve(scratch, source.endsWith('.flac') ? 'input.flac' : 'input.wav');
    writeFileSync(input, raw);
    const output = resolve(assets, file);
    mkdirSync(dirname(output), { recursive: true });
    const converted = resolve(scratch, 'output.ogg');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      input,
      '-af',
      `atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,volume=${gainDb}dB,afade=t=out:st=${Math.max(0, duration - 0.04)}:d=0.04`,
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-c:a',
      'libvorbis',
      '-q:a',
      '6',
      '-map_metadata',
      '-1',
      converted,
    ]);
    writeFileSync(output, readFileSync(converted));
    console.info(file);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

async function download(source: string): Promise<Buffer> {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${source}`);
  return Buffer.from(await response.arrayBuffer());
}
