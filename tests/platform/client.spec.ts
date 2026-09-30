import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('browser storage separation', () => {
  it('preserves ordinary local data when the gateway is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<html>Vite</html>', { headers: { 'content-type': 'text/html' } }),
      ),
    );
    const client = await import('../../src/workspace/client');
    await client.initializeWorkspace();
    expect(client.storageNamespace('library')).toBe('library');
    expect(client.getWorkspaceSession()).toBeNull();
  });
  it('separates dev builds and Google accounts without changing the original storage name', async () => {
    vi.stubEnv('VITE_WORKSPACE_ID', 'dev-one-1234');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          storageId: 'a'.repeat(32),
          user: { email: 'owner@example.test', name: 'Owner' },
          developer: true,
          csrf: 'random',
        }),
      ),
    );
    const client = await import('../../src/workspace/client');
    await client.initializeWorkspace();
    expect(client.storageNamespace('library')).toBe(
      `library:account:${'a'.repeat(32)}:build:dev-one-1234`,
    );
    expect(client.storageNamespace('scores-v1')).toBe(
      `scores-v1:account:${'a'.repeat(32)}:build:dev-one-1234`,
    );
  });
  it('does not fall back to shared local history when a hosted session is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ storageId: 'invalid' })),
    );
    const client = await import('../../src/workspace/client');
    await expect(client.initializeWorkspace()).rejects.toThrow('invalid session');
  });
});
