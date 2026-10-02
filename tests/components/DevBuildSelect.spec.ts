// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DevBuildSelect } from '../../src/components/DevBuildSelect';

const { halt, stop } = vi.hoisted(() => ({ halt: vi.fn(), stop: vi.fn() }));
vi.mock('../../src/app/RoomContext', () => ({
  useRoom: () => ({ halt, input: { stop } }),
}));
vi.mock('../../src/workspace/client', () => ({ workspaceId: 'dev-current' }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const response = (data: unknown) => ({ ok: true, json: async () => data });

it('lists running branches and refreshes when navigation reopens', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      response([
        { id: 'dev-current', branch: 'dev/current' },
        { id: 'dev-next', branch: 'dev/next' },
        { id: '//bad-url', branch: 'Invalid' },
      ]),
    )
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetch);
  const { container } = render(
    createElement('div', { popover: 'auto' }, createElement(DevBuildSelect)),
  );
  await screen.findByRole('option', { name: 'dev/current (current)' });
  expect(screen.getByRole('combobox').getAttribute('aria-busy')).toBe('false');
  expect(screen.queryByRole('option', { name: 'Invalid' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Production' })).toBeTruthy();
  const event = new Event('toggle');
  Object.defineProperty(event, 'newState', { value: 'open' });
  fireEvent(container.firstChild!, event);
  await screen.findByText('No dev builds running');
  expect(screen.queryByRole('option', { name: 'dev/next' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Current dev build' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith(
    '/__workspace/builds',
    expect.objectContaining({
      credentials: 'same-origin',
      cache: 'no-store',
    }),
  );
});

it('keeps the current build available on failure and allows a retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(response([{ id: 'dev-next', branch: 'dev/next' }])),
  );
  render(createElement(DevBuildSelect));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry build list' }));
  await screen.findByRole('option', { name: 'dev/next' });
  expect(screen.queryByRole('button', { name: 'Retry build list' })).toBeNull();
});

it('stops audio before switching builds and preserves navigation state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response([{ id: 'dev-next', branch: 'dev/next' }])),
  );
  render(createElement(DevBuildSelect));
  await screen.findByRole('option', { name: 'dev/next' });
  const assign = vi.fn();
  vi.stubGlobal('window', { location: { assign, hash: '#section=gym&gym=routines' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dev-next' } });
  expect(assign).toHaveBeenCalledWith('/dev/use/dev-next#section=gym&gym=routines');
  expect(halt).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledOnce();
});
