import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { SourceHit } from '../../domain/sources';

export interface SourceFile {
  bytes: Uint8Array;
  filename: string;
}
export interface SourceProvider {
  id: string;
  name: string;
  /** One line telling the player what this source holds and how far to trust its licence. */
  note: string;
  ready(): boolean;
  search(query: string, signal: AbortSignal): Promise<SourceHit[]>;
  /** Absent for sources whose results only link out. */
  file?(id: string, signal: AbortSignal): Promise<SourceFile>;
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const agent =
  'PracticeRoom/0.2 (personal practice app; +https://github.com/dbjohnson/practice-room)';

/** Catalogue data lives outside the repository so worktrees and deployments share it. */
export const sourceData = (name: string) =>
  resolve(
    process.env.PRACTICE_ROOM_DATA ||
      resolve(process.env.XDG_DATA_HOME || resolve(homedir(), '.local/share'), 'practice-room'),
    'sources',
    name,
  );

/** Fetches from a fixed upstream host with a size cap; callers build the URL from validated ids. */
export async function download(url: string, signal: AbortSignal, limit = MAX_FILE_BYTES) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { 'User-Agent': agent, Accept: '*/*' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`The source answered ${response.status}.`);
  if (Number(response.headers.get('content-length')) > limit)
    throw new Error('The source file is too large.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > limit) throw new Error('The source file is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export const decodeHtml = (text: string) =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
