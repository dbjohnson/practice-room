import { expect, it, vi } from 'vitest';
import { workspaceSnapshot, devAssetCache } from '../../src/platform/devAssets';

it('shares workspace checks across concurrent assets and expires them promptly', async () => {
  let now = 0;
  const list = vi.fn(async () => []);
  const snapshot = workspaceSnapshot(list, () => now);
  await Promise.all(Array.from({ length: 100 }, () => snapshot()));
  expect(list).toHaveBeenCalledOnce();
  now = 1001;
  await snapshot();
  expect(list).toHaveBeenCalledTimes(2);
});
it('keeps protected responses uncached and requires validation for unversioned assets', () => {
  expect(devAssetCache('/dev/build/x/src/main.tsx', 'text/javascript', 'no-cache', 200)).toBe(
    'private, no-cache',
  );
  expect(devAssetCache('/dev/build/x/deps/react.js?v=0123abcd', 'text/javascript', '', 200)).toBe(
    'private, max-age=31536000, immutable',
  );
  for (const [url, type, cache, status] of [
    ['/dev/build/x/', 'text/html', '', 200],
    ['/dev/build/x/api/user.js', 'text/javascript', '', 200],
    ['/dev/build/x/src/private.js', 'text/javascript', 'no-store', 200],
    ['/dev/build/x/file.js', 'text/javascript', '', 403],
  ] as const)
    expect(devAssetCache(url, type, cache, status)).toBe('private, no-store');
});
