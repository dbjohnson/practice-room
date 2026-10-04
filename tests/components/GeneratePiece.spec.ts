// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GeneratePiece } from '../../src/components/GeneratePiece';
import { defaultGenerationModel } from '../../src/domain/generation';

declare const jsdom: { window: Window };
beforeEach(() => vi.stubGlobal('localStorage', jsdom.window.localStorage));

const context = vi.hoisted(() => ({ developer: true }));
vi.mock('../../src/workspace/client', () => ({
  getWorkspaceSession: () => ({ developer: context.developer }),
  storageNamespace: (key: string) => key + ':test-account:test-build',
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  context.developer = true;
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

it('defaults to Sonnet, remembers developer selection and sends it with the generation request', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (url) =>
      String(url).includes('generation/models')
        ? json({ models: [{ id: 'example/other', name: 'Other model' }] })
        : json({ alphaTex: ':4 0.6 |' }),
    );
  vi.stubGlobal('fetch', fetcher);
  const onAdd = vi.fn();
  const props = { ready: true, busy: false, onAdd };
  const view = render(createElement(GeneratePiece, props));
  await screen.findByText('Other model');
  expect((screen.getByLabelText('Generation model') as HTMLInputElement).value).toBe(
    defaultGenerationModel,
  );
  fireEvent.change(screen.getByLabelText('Generation model'), {
    target: { value: 'example/other' },
  });
  view.unmount();
  render(createElement(GeneratePiece, props));
  expect((screen.getByLabelText('Generation model') as HTMLInputElement).value).toBe(
    'example/other',
  );
  fireEvent.change(screen.getByLabelText('What you want to practise'), {
    target: { value: 'A blues riff' },
  });
  fireEvent.change(screen.getByLabelText('Instrumentation'), {
    target: { value: 'Guitar, bass, piano and drums' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Write it' }));
  await act(async () => {
    await onAdd.mock.calls[0][1]();
  });
  const call = fetcher.mock.calls.find(([url]) => String(url).endsWith('/generate'))!;
  expect(JSON.parse(call[1].body).model).toBe('example/other');
  expect(JSON.parse(call[1].body).instrumentation).toBe('Guitar, bass, piano and drums');
});
it('uses the server default for regular users even if a developer selection was saved', async () => {
  context.developer = false;
  localStorage.setItem(
    'practice-room:test-account:test-build:generation-model',
    JSON.stringify('example/other'),
  );
  const fetcher = vi.fn().mockImplementation(async () => json({ alphaTex: ':4 0.6 |' }));
  vi.stubGlobal('fetch', fetcher);
  const onAdd = vi.fn();
  render(createElement(GeneratePiece, { ready: true, busy: false, onAdd }));
  expect(screen.queryByLabelText('Generation model')).toBeNull();
  fireEvent.change(screen.getByLabelText('What you want to practise'), {
    target: { value: 'A bass riff' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Write it' }));
  await act(async () => {
    await onAdd.mock.calls[0][1]();
  });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBeUndefined();
});
it('keeps manual model entry usable when the catalogue cannot load', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(createElement(GeneratePiece, { ready: true, busy: false, onAdd: vi.fn() }));
  await screen.findByText(/Model list unavailable/);
  fireEvent.change(screen.getByLabelText('What you want to practise'), {
    target: { value: 'A riff' },
  });
  fireEvent.change(screen.getByLabelText('Generation model'), { target: { value: 'bad model' } });
  expect((screen.getByRole('button', { name: 'Write it' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText('Generation model'), { target: { value: '' } });
  expect((screen.getByRole('button', { name: 'Write it' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
