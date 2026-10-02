// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Settings, midi, type model } from '@coderline/alphatab';
import { useScorePlayer, type PlayerOptions } from '../../src/audio/useScorePlayer';
import { loadScoreSamples } from '../../src/audio/loadScoreSamples';
import { takeFixture } from '../app/takeFixture';

const { createApi } = vi.hoisted(() => ({ createApi: vi.fn() }));
vi.mock('@coderline/alphatab', async (original) => ({
  ...(await original<typeof import('@coderline/alphatab')>()),
  AlphaTabApi: class {
    constructor() {
      return createApi();
    }
  },
}));
vi.mock('../../src/audio/loadScoreSamples', () => ({ loadScoreSamples: vi.fn() }));
vi.mock('../../src/audio/configurePlayer', () => ({ configurePlayer: vi.fn() }));
vi.mock('../../src/audio/useSwingPlayback', () => ({ useSwingPlayback: vi.fn() }));
vi.mock('../../src/audio/attachPlaybackEffects', () => ({
  attachPlaybackEffects: () => ({ configure: vi.fn(), dispose: vi.fn() }),
}));
vi.stubGlobal('__RECORDED_BANK_VERSION__', 'test-bank');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function event() {
  const callbacks: ((value?: unknown) => void)[] = [];
  return {
    on: (callback: (value?: unknown) => void) => {
      callbacks.push(callback);
      return () => {};
    },
    emit: (value?: unknown) => callbacks.forEach((callback) => callback(value)),
  };
}
function setup() {
  vi.stubGlobal('__RECORDED_BANK_VERSION__', 'test-bank');
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const events = Object.fromEntries(
    [
      'error',
      'renderStarted',
      'renderFinished',
      'postRenderFinished',
      'playerReady',
      'midiLoad',
      'midiEventsPlayed',
      'playerStateChanged',
      'playerPositionChanged',
      'playedBeatChanged',
      'playerFinished',
    ].map((name) => [name, event()]),
  );
  const fixture = takeFixture();
  const api = {
    ...events,
    score: null as model.Score | null,
    tracks: [] as model.Track[],
    settings: new Settings(),
    player: { output: {} },
    endTick: 3840,
    stop: vi.fn(),
    destroy: vi.fn(),
    render: vi.fn(),
    renderTracks: vi.fn(),
    updateSettings: vi.fn(),
    load: vi.fn((score: model.Score, tracks: number[]) => {
      api.score = score;
      api.tracks = tracks.map((id) => score.tracks[id]);
      events.midiLoad.emit(new midi.MidiFile());
    }),
    loadSoundFont: vi.fn(() => events.playerReady.emit()),
  };
  createApi.mockReturnValue(api);
  const options: PlayerOptions = {
    score: fixture.options.score,
    track: 1,
    tempo: 90,
    range: { start: 1, end: 4 },
    loop: false,
    view: 'both',
    zoom: 100,
    mode: 'listen',
    click: true,
    countIn: false,
    muted: [],
    volumes: {},
    effects: { compression: 30, reverb: 40 },
    swing: null,
    replaying: false,
    replayBacking: true,
    onStatus: vi.fn(),
    onReady: vi.fn(),
    onPosition: vi.fn(),
    onFinish: vi.fn(),
  };
  function Probe({ options }: { options: PlayerOptions }) {
    return createElement('div', { ref: useScorePlayer(options) });
  }
  const view = render(createElement(Probe, { options }));
  const flush = () => {
    const queued = frames.splice(0);
    queued.forEach((callback) => callback(0));
  };
  return { api, events, options, view, Probe, flush };
}

it('paints before loading notes, gates playback on samples, and avoids reloading on layout changes', async () => {
  let complete!: (bank: Uint8Array) => void;
  vi.mocked(loadScoreSamples).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const { api, events, options, view, Probe, flush } = setup();
  act(() => events.renderFinished.emit());
  expect(loadScoreSamples).not.toHaveBeenCalled();
  act(flush);
  expect(loadScoreSamples).not.toHaveBeenCalled();
  act(flush);
  expect(loadScoreSamples).toHaveBeenCalledOnce();
  act(() => events.playerReady.emit());
  expect(options.onStatus).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false, instrumentsReady: false }),
  );
  const bank = new Uint8Array([1]);
  await act(async () => complete(bank));
  expect(api.loadSoundFont).toHaveBeenCalledExactlyOnceWith(bank, false);
  expect(options.onStatus).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: true, instrumentsReady: true }),
  );
  view.rerender(createElement(Probe, { options: { ...options, zoom: 75 } }));
  act(() => events.renderFinished.emit());
  act(flush);
  act(flush);
  expect(loadScoreSamples).toHaveBeenCalledOnce();
});

it('rejects stale sample completion when another piece is selected during loading', async () => {
  const complete: ((bank: Uint8Array) => void)[] = [];
  vi.mocked(loadScoreSamples).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete.push(resolve);
      }),
  );
  const { api, options, view, Probe, flush } = setup();
  act(flush);
  act(flush);
  const oldSignal = vi.mocked(loadScoreSamples).mock.calls[0][4];
  const nextScore = takeFixture().options.score;
  view.rerender(createElement(Probe, { options: { ...options, score: nextScore } }));
  expect(oldSignal.aborted).toBe(true);
  act(flush);
  act(flush);
  expect(complete).toHaveLength(2);
  await act(async () => complete[0](new Uint8Array([1])));
  expect(api.loadSoundFont).not.toHaveBeenCalled();
  await act(async () => complete[1](new Uint8Array([2])));
  expect(api.loadSoundFont).toHaveBeenCalledExactlyOnceWith(new Uint8Array([2]), false);
});
