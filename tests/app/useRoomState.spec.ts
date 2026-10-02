// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomState } from '../../src/app/useRoomState';
import { openInstrumentCapture } from '../../src/audio/instrumentCapture';
import { takeFixture } from './takeFixture';

vi.mock('../../src/audio/instrumentCapture', () => ({ openInstrumentCapture: vi.fn() }));
vi.mock('../../src/audio/recordInstrument', () => ({
  recordInstrument: vi.fn(() => ({ finish: vi.fn(async () => null) })),
}));

declare const jsdom: { window: Window };
let now = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  now = 10;
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function captureFixture() {
  const capture = {
    track: new EventTarget(),
    analyser: { fftSize: 4096, getFloatTimeDomainData: vi.fn() },
    listen: vi.fn(),
    inputLatency: 0,
    context: { sampleRate: 48000 },
    deviceId: 'test-interface',
    label: 'Test interface',
    channelCount: 2,
    selectChannel: vi.fn(),
    setGain: vi.fn(),
    close: vi.fn(),
  };
  vi.mocked(openInstrumentCapture).mockResolvedValue(
    capture as unknown as Awaited<ReturnType<typeof openInstrumentCapture>>,
  );
  return capture;
}

async function setup() {
  const capture = captureFixture();
  const hook = renderHook(useRoomState, { reactStrictMode: true });
  const fixture = takeFixture(hook.result.current.library.score);
  await act(async () => hook.result.current.input.start('test-interface'));
  act(() => {
    hook.result.current.setApi(fixture.options.api.current);
    hook.result.current.updatePlayer({ ready: true });
    hook.result.current.setTrack(1);
    hook.result.current.setTempo(60);
    hook.result.current.setRange({ start: 2, end: 2 });
    hook.result.current.setMode('assess');
  });
  fixture.player.pause.mockClear();
  act(() => hook.result.current.play());
  expect(hook.result.current.takes.recording).toBe(true);
  return { ...hook, ...fixture, capture };
}

describe('recording with an audio interface', () => {
  it.each([false, true])('interrupts a removed input (music started: %s)', async (started) => {
    const { result, capture, player, startTick, notes } = await setup();
    act(() => {
      if (started) {
        now = 14;
        result.current.takes.onPosition(startTick, 60);
        result.current.takes.onObservation({
          time: now,
          midi: notes[0].midi,
          confidence: 0.99,
          rms: 0.2,
        });
        now = 14.5;
        result.current.takes.onPosition(startTick + 480, 60);
      }
      capture.track.dispatchEvent(new Event('ended'));
    });
    expect(result.current.input.status.state).toBe('error');
    expect(result.current.input.status.error).toContain('disconnected');
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(capture.close).toHaveBeenCalledTimes(1);
    expect(result.current.takes.recording).toBe(false);
    expect(result.current.takes.review).toMatchObject({
      interrupted: true,
      duration: started ? 0.5 : 0,
      notes: started ? [{ status: 'matched' }] : [],
    });
    expect(result.current.takes.takes).toEqual([]);
    // localStorage persistence dispatches its browser storage event asynchronously.
    act(() => vi.runOnlyPendingTimers());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can reconnect and record again without keeping the old input or take clock', async () => {
    const { result, capture, startTick } = await setup();
    act(() => capture.track.dispatchEvent(new Event('ended')));
    const firstId = result.current.takes.review?.id;
    const replacement = captureFixture();
    await act(async () => result.current.input.start('test-interface'));
    act(() => {
      now = 20;
      result.current.play();
      capture.track.dispatchEvent(new Event('ended'));
    });
    expect(result.current.takes.recording).toBe(true);
    expect(result.current.input.status.state).toBe('ready');
    act(() => {
      now = 24;
      result.current.takes.onPosition(startTick, 60);
      now = 25;
      result.current.halt();
    });
    expect(result.current.takes.review?.id).not.toBe(firstId);
    expect(result.current.takes.review?.duration).toBe(1);
    expect(result.current.takes.review?.notes.every((note) => note.status === 'unclear')).toBe(
      true,
    );
    expect(replacement.close).not.toHaveBeenCalled();
    expect(capture.close).toHaveBeenCalledTimes(1);
  });

  it('stops on navigation and releases the input when the room unmounts', async () => {
    const { result, player, capture, unmount } = await setup();
    act(() => result.current.setPage('library'));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(result.current.takes.recording).toBe(false);
    expect(result.current.takes.review?.interrupted).toBe(true);
    expect(result.current.page).toBe('library');
    unmount();
    expect(capture.close).toHaveBeenCalledTimes(1);
    // localStorage persistence dispatches its browser storage event asynchronously.
    act(() => vi.runOnlyPendingTimers());
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('detected notes and reported latency', () => {
  it('feeds worklet notes to the take and removes the delay the browser reports', async () => {
    const { result, capture, player, startTick, notes } = await setup();
    await act(async () => result.current.halt());
    const listener = capture.listen.mock.calls[0][0];
    act(() =>
      listener({
        type: 'frame',
        frame: { time: 10.2, midi: 40.02, confidence: 0.99, rms: 0.2, peak: 0.5, clipped: false },
      }),
    );
    expect(result.current.input.status.peakDb).toBeCloseTo(-6.02, 1);
    // 30 ms of output delay reported for the player; nothing calibrated.
    (player as unknown as { player: unknown }).player = {
      output: { context: { currentTime: 1, baseLatency: 0.01, outputLatency: 0.02 } },
    };
    act(() => result.current.updatePlayer({ bar: 2 }));
    act(() => {
      now = 20;
      result.current.play();
      now = 24;
      result.current.takes.onPosition(startTick, 60);
      listener({
        type: 'observation',
        observation: { time: 24.05, midi: notes[0].midi, confidence: 0.99, rms: 0.2 },
      });
      now = 24.5;
      result.current.halt();
    });
    const review = result.current.takes.review ?? result.current.takes.passResult;
    expect(review?.notes[0]).toMatchObject({ status: 'matched', delta: 20 });
    expect(review).toMatchObject({
      latencyMs: 30,
      latencySource: 'reported',
      calibrated: false,
      placementMs: 20,
    });
  });
});

describe('key transposition state', () => {
  it('always transposes the source, preserves swing, and resets when changing songs', async () => {
    const { result } = renderHook(useRoomState);
    const source = result.current.library.score;
    const pitch = () =>
      result.current.library.score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0]
        .realValue;
    const original = pitch();
    act(() => {
      result.current.setSwing(70);
      result.current.setTranspose(1);
    });
    expect(pitch()).toBe(original + 1);
    act(() => result.current.setTranspose(3));
    expect(pitch()).toBe(original + 3);
    expect(result.current.swing).toBe(70);
    act(() => result.current.takes.showExample());
    expect(result.current.takes.review?.transpose).toBe(3);
    act(() => result.current.setTranspose(0));
    expect(result.current.library.score).toBe(source);
    act(() => result.current.setTranspose(2));
    await act(async () => {
      await result.current.library.select(result.current.library.pieces[1]);
    });
    expect(result.current.transpose).toBe(0);
  });
});

describe('practice settings', () => {
  it('restores toggles and a piece’s tempo, loop and mix after a reload', async () => {
    const first = renderHook(useRoomState);
    const blues = first.result.current.library.pieces[1];
    act(() => {
      first.result.current.setClick(true);
      first.result.current.setCountIn(false);
      first.result.current.setLoop(false);
      first.result.current.setMixEffects((effects) => ({ ...effects, reverb: 10 }));
    });
    await act(async () => void (await first.result.current.library.select(blues)));
    act(() => {
      first.result.current.setTempo(64);
      first.result.current.setRange({ start: 5, end: 8 });
      first.result.current.setMuted([2]);
      first.result.current.setVolumes({ 3: 40 });
    });
    first.unmount();
    const { result } = renderHook(useRoomState);
    expect(result.current).toMatchObject({ click: true, countIn: false, loop: false });
    expect(result.current.mixEffects.reverb).toBe(10);
    // The open piece comes from the page address; its settings come back when it is opened.
    const study = result.current.library.piece;
    expect(result.current).toMatchObject({
      tempo: study.bpm,
      range: { start: 1, end: study.bars },
      muted: [],
    });
    await act(async () => void (await result.current.library.select(blues)));
    expect(result.current).toMatchObject({
      tempo: 64,
      range: { start: 5, end: 8 },
      muted: [2],
      volumes: { 3: 40 },
    });
  });
  it('ignores damaged stored values', () => {
    localStorage.setItem('practice-room:click', '"yes"');
    localStorage.setItem('practice-room:mixEffects', '{"compression":900}');
    localStorage.setItem(
      'practice-room:pieceSettings',
      JSON.stringify({ 'evening-study': { tempo: 9000, range: { start: 40, end: 2 } } }),
    );
    const { result } = renderHook(useRoomState);
    const bars = result.current.library.piece.bars;
    expect(result.current).toMatchObject({
      click: false,
      tempo: 240,
      range: { start: bars, end: bars },
    });
    expect(result.current.mixEffects.compression).toBe(30);
  });
});

describe('recording with a MIDI instrument', () => {
  it('connects, grades chords from exact keys and stops when the instrument is unplugged', async () => {
    const keyboard = {
      id: 'keys',
      name: 'Stage piano',
      state: 'connected',
      onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null,
    };
    const access = {
      inputs: new Map([['keys', keyboard]]),
      onstatechange: null as (() => void) | null,
    };
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: vi.fn(async () => access) });
    const hook = renderHook(useRoomState, { reactStrictMode: true });
    const { result } = hook;
    const fixture = takeFixture(result.current.library.score);
    await act(async () => result.current.midi.start('keys'));
    expect(result.current.midi.status).toMatchObject({
      state: 'ready',
      deviceLabel: 'Stage piano',
    });
    expect(result.current.inputConnected).toBe(true);
    const chordTrack = result.current.library.score.tracks.findIndex((track) =>
      track.staves[0].bars[0].voices[0].beats.some((beat) => beat.notes.length > 1),
    );
    expect(chordTrack).toBeGreaterThanOrEqual(0);
    act(() => {
      result.current.setApi(fixture.options.api.current);
      result.current.updatePlayer({ ready: true });
      result.current.setTrack(chordTrack);
      result.current.setTempo(60);
      result.current.setRange({ start: 1, end: 1 });
      result.current.setMode('assess');
    });
    expect(result.current.page).toBe('practice');
    act(() => result.current.play());
    expect(result.current.takes.recording).toBe(true);
    const beat = result.current.library.score.tracks[
      chordTrack
    ].staves[0].bars[0].voices[0].beats.find((b) => b.notes.length > 1)!;
    const beatTick = fixture.player.tickCache.getBeatStart(beat);
    act(() => {
      now = 14;
      result.current.takes.onPosition(0, 60);
      const at = 14000 + (beatTick / 960) * 1000;
      [...beat.notes].reverse().forEach((note, i) =>
        keyboard.onmidimessage!({
          data: new Uint8Array([0x90, note.realValue, 80]),
          timeStamp: at + 20 + i * 4,
        }),
      );
      now = 14 + beatTick / 960 + 1;
      result.current.takes.onPosition(beatTick + 960, 60);
    });
    act(() => {
      keyboard.state = 'disconnected';
      access.onstatechange!();
    });
    expect(result.current.midi.status.state).toBe('error');
    expect(result.current.takes.recording).toBe(false);
    const review = result.current.takes.review ?? result.current.takes.passResult;
    expect(review).toMatchObject({ origin: 'midi', rubric: 'midi-v1', interrupted: true });
    const chord = review!.notes.filter((n) => beat.notes.some((b) => b.realValue === n.midi));
    expect(chord.slice(0, beat.notes.length).every((n) => n.status === 'matched')).toBe(true);
    hook.unmount();
    expect(keyboard.onmidimessage).toBeNull();
  });
});
