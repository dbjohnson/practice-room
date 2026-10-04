// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Settings, StaveProfile, type model } from '@coderline/alphatab';
import { useScorePreview, type PreviewStatus } from '../../src/audio/useScorePreview';
import { loadScoreSamples } from '../../src/audio/loadScoreSamples';
import { takeFixture } from '../app/takeFixture';

const { createApi } = vi.hoisted(() => ({ createApi: vi.fn() }));
vi.mock('@coderline/alphatab', async (original) => ({
  ...(await original<typeof import('@coderline/alphatab')>()),
  AlphaTabApi: class {
    constructor(_host: HTMLElement, settings: unknown) {
      return createApi(settings);
    }
  },
}));
vi.mock('../../src/audio/loadScoreSamples', () => ({ loadScoreSamples: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function event() {
  const callbacks: ((value?: unknown) => void)[] = [];
  return {
    on: (callback: (value?: unknown) => void) => void callbacks.push(callback),
    emit: (value?: unknown) => callbacks.forEach((callback) => callback(value)),
  };
}
function setup() {
  vi.stubGlobal('__RECORDED_BANK_VERSION__', 'test-bank');
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const events = Object.fromEntries(
    ['error', 'renderFinished', 'postRenderFinished', 'playerReady', 'playerStateChanged'].map(
      (name) => [name, event()],
    ),
  );
  const score = takeFixture().options.score;
  const api = {
    ...events,
    tracks: [] as model.Track[],
    settings: new Settings(),
    playPause: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    renderTracks: vi.fn(),
    updateSettings: vi.fn(),
    load: vi.fn((loaded: model.Score, tracks: number[]) => {
      api.tracks = tracks.map((index) => loaded.tracks[index]);
    }),
    loadSoundFont: vi.fn(() => events.playerReady.emit()),
  };
  createApi.mockReturnValue(api);
  const seen: { status: PreviewStatus; toggle: () => void }[] = [];
  function Probe({ track }: { track: number }) {
    const preview = useScorePreview(score, track);
    seen.push(preview);
    return createElement('div', null, createElement('div', { ref: preview.host }));
  }
  const view = render(createElement(Probe, { track: 0 }));
  const flush = () => frames.splice(0).forEach((callback) => callback(0));
  return { api, events, score, view, Probe, flush, latest: () => seen.at(-1)! };
}

it('paints the notation before loading sounds and plays once they arrive', async () => {
  let complete!: (bank: Uint8Array) => void;
  vi.mocked(loadScoreSamples).mockReturnValue(new Promise((resolve) => (complete = resolve)));
  const { api, events, score, flush, latest } = setup();
  expect(api.load).toHaveBeenCalledExactlyOnceWith(score, [0]);
  expect(latest().status).toMatchObject({ rendering: true, ready: false });
  act(() => events.renderFinished.emit());
  act(flush);
  expect(loadScoreSamples).not.toHaveBeenCalled();
  act(flush);
  expect(vi.mocked(loadScoreSamples).mock.calls[0][2]).toEqual({ score });
  expect(latest().status).toMatchObject({ rendering: false, ready: false });
  const bank = new Uint8Array([1]);
  await act(async () => complete(bank));
  expect(api.loadSoundFont).toHaveBeenCalledExactlyOnceWith(bank, false);
  expect(latest().status.ready).toBe(true);
  latest().toggle();
  expect(api.playPause).toHaveBeenCalledOnce();
  act(() => events.playerStateChanged.emit({ state: 1 }));
  expect(latest().status.playing).toBe(true);
});

it('shows another part without reloading, and stops everything when closed', async () => {
  let complete!: (bank: Uint8Array) => void;
  vi.mocked(loadScoreSamples).mockReturnValue(new Promise((resolve) => (complete = resolve)));
  const { api, events, score, view, Probe, flush } = setup();
  expect(createApi.mock.calls[0][0].display.staveProfile).toBe(StaveProfile.ScoreTab);
  score.tracks[1].staves.forEach((staff) => (staff.stringTuning.tunings = []));
  view.rerender(createElement(Probe, { track: 1 }));
  expect(api.renderTracks).toHaveBeenCalledExactlyOnceWith([score.tracks[1]]);
  expect(api.settings.display.staveProfile).toBe(StaveProfile.Score);
  expect(api.load).toHaveBeenCalledOnce();
  act(() => events.renderFinished.emit());
  act(flush);
  act(flush);
  view.unmount();
  expect(api.destroy).toHaveBeenCalledOnce();
  expect(vi.mocked(loadScoreSamples).mock.calls[0][4].aborted).toBe(true);
  await act(async () => complete(new Uint8Array([1])));
  expect(api.loadSoundFont).not.toHaveBeenCalled();
});

it('reports sounds that could not load', async () => {
  vi.mocked(loadScoreSamples).mockRejectedValue(
    new Error('Instrument sample index could not load.'),
  );
  const { events, flush, latest } = setup();
  act(() => events.renderFinished.emit());
  act(flush);
  await act(async () => flush());
  expect(latest().status).toMatchObject({
    ready: false,
    error: 'Instrument sample index could not load.',
  });
});
