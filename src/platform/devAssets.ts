import type { Workspace } from './registry';

/** Coalesce asset bursts; authorization still runs for every request at the gateway. */
export function workspaceSnapshot(list: () => Promise<Workspace[]>, now = Date.now) {
  let snapshot: Promise<Workspace[]> | undefined;
  let expires = 0;
  return () => {
    if (!snapshot || now() >= expires) {
      expires = now() + 1000;
      snapshot = list().catch((error) => {
        snapshot = undefined;
        throw error;
      });
    }
    return snapshot;
  };
}

export function devAssetCache(url: string, contentType: string, upstream: string, status: number) {
  if (status !== 200 && status !== 304) return 'private, no-store';
  const path = new URL(url, 'http://localhost');
  if (path.pathname.includes('/api/') || /no-store/i.test(upstream)) return 'private, no-store';
  const asset =
    /^(?:text\/(?:javascript|css)|application\/(?:javascript|wasm)|font\/|image\/|audio\/)/i.test(
      contentType,
    );
  if (!asset) return 'private, no-store';
  // Only content-versioned assets can outlive the current request without validation.
  return /^[a-f0-9]{8,64}$/i.test(path.searchParams.get('v') ?? '')
    ? 'private, max-age=31536000, immutable'
    : 'private, no-cache';
}
