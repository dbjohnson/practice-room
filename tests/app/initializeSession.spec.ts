import { afterEach, expect, it, vi } from 'vitest';
import { initializeSession } from '../../src/app/initializeSession';
const { initializeWorkspace } = vi.hoisted(() => ({ initializeWorkspace: vi.fn() }));
vi.mock('../../src/workspace/client', () => ({ initializeWorkspace }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each(['localhost', '127.0.0.1', '[::1]'])(
  'skips Google session checks for local dev on %s',
  async (hostname) => {
    vi.stubEnv('DEV', true);
    vi.stubGlobal('window', { location: { hostname } });
    await initializeSession();
    expect(initializeWorkspace).not.toHaveBeenCalled();
  },
);

it.each([
  { dev: true, hostname: 'practice.loomen.net' },
  { dev: false, hostname: 'localhost' },
  { dev: true, hostname: 'localhost.example.com' },
])('retains session checks for $hostname (dev=$dev)', async ({ dev, hostname }) => {
  vi.stubEnv('DEV', dev);
  vi.stubGlobal('window', { location: { hostname } });
  await initializeSession();
  expect(initializeWorkspace).toHaveBeenCalledOnce();
});
