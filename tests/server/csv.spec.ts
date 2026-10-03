import { describe, expect, it } from 'vitest';
import { csvRows } from '../../src/server/csv';

async function rows(...chunks: string[]) {
  const out = [];
  for await (const row of csvRows(
    (async function* () {
      yield* chunks;
    })(),
  ))
    out.push(row);
  return out;
}
describe('CSV reader', () => {
  it('handles quotes, embedded commas and newlines, and chunk boundaries', async () => {
    expect(await rows('a,b\n1,"x, ""y""', '\nz"\r\n2,', 'plain')).toEqual([
      { a: '1', b: 'x, "y"\nz' },
      { a: '2', b: 'plain' },
    ]);
  });
  it('skips blank lines and fills missing cells', async () => {
    expect(await rows('a,b\n\nonly\n')).toEqual([{ a: 'only', b: '' }]);
  });
});
