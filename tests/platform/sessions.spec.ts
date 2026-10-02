import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { localReturn, Sessions } from '../../src/platform/sessions';

describe('gateway sessions', () => {
  it('persists hashed identifiers privately and supports expiry and revocation', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'workspace-sessions-'));
    const path = resolve(root, 'sessions.json');
    let now = 1000;
    try {
      const store = new Sessions(path, () => now);
      const user = { subject: '123', email: 'person@example.test', name: 'Person' };
      const id = store.create(user);
      expect(readFileSync(path, 'utf8')).not.toContain(id);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(new Sessions(path, () => now).get(id)?.user).toEqual(user);
      expect(store.get(id + 'tampered')).toBeNull();
      now += 7 * 24 * 3600_000 - 1;
      expect(store.get(id)?.user).toEqual(user);
      expect(new Sessions(path, () => now).get(id)?.user).toEqual(user);
      now += 1;
      expect(store.get(id)).toBeNull();
      expect(new Sessions(path, () => now).get(id)).toBeNull();
      const next = store.create(user);
      store.remove(next);
      expect(new Sessions(path, () => now).get(next)).toBeNull();
    } finally {
      rmSync(root, { recursive: true });
    }
  });
  it.each([
    '//evil.example',
    '/\\evil.example',
    '/%2f%2fevil.example',
    '/%5cevil',
    '/%0d%0aHeader:value',
    'https://evil.example',
    '/%zz',
  ])('rejects unsafe return paths: %s', (path) => {
    expect(localReturn(path)).toBe('/');
  });
});
