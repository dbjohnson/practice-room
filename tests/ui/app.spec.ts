import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { MetronomeOptions } from '../../src/audio/metronome';

const startMetronomeMock = vi.fn<[MetronomeOptions], Promise<void>>();
const stopMetronomeMock = vi.fn<[], Promise<void>>();
const getMetronomeContextMock = vi.fn(() => ({} as AudioContext));

vi.mock('../../src/audio/metronome', () => ({
  startMetronome: startMetronomeMock,
  stopMetronome: stopMetronomeMock,
  getMetronomeContext: getMetronomeContextMock,
}));

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const keydownListeners: Array<EventListenerOrEventListenerObject> = [];
const originalAddEventListener = window.addEventListener.bind(window);
const originalRemoveEventListener = window.removeEventListener.bind(window);

vi.spyOn(window, 'addEventListener').mockImplementation(
  (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === 'keydown' && listener) {
      keydownListeners.push(listener);
    }

    return originalAddEventListener(
      type,
      listener as EventListenerOrEventListenerObject,
      options as boolean | AddEventListenerOptions | undefined,
    );
  },
);

vi.spyOn(window, 'removeEventListener').mockImplementation(
  (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => {
    if (type === 'keydown' && listener) {
      const index = keydownListeners.indexOf(listener);
      if (index !== -1) {
        keydownListeners.splice(index, 1);
      }
    }

    return originalRemoveEventListener(
      type,
      listener as EventListenerOrEventListenerObject,
      options as boolean | EventListenerOptions | undefined,
    );
  },
);

describe('Tempo Trainer transport controls', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    for (const listener of keydownListeners.splice(0)) {
      originalRemoveEventListener('keydown', listener);
    }
    startMetronomeMock.mockReset();
    stopMetronomeMock.mockReset();
    getMetronomeContextMock.mockClear();
    getMetronomeContextMock.mockReturnValue({} as AudioContext);
    startMetronomeMock.mockResolvedValue(undefined);
    stopMetronomeMock.mockResolvedValue(undefined);
    vi.resetModules();
  });

  test('renders configuration selectors and transport buttons with defaults', async () => {
    await import('../../src/main.ts');

    const tempoSelect = document.querySelector<HTMLSelectElement>('#tempo');
    const beatsSelect =
      document.querySelector<HTMLSelectElement>('#beatsPerBar');
    const barsSelect = document.querySelector<HTMLSelectElement>('#barCount');
    const playPauseButton =
      document.querySelector<HTMLButtonElement>('#playPauseButton');
    const progressCanvas =
      document.querySelector<HTMLCanvasElement>('.progress__canvas');
    const autoGainCheckbox =
      document.querySelector<HTMLInputElement>('#autoGain');
    const manualGainSlider =
      document.querySelector<HTMLInputElement>('#manualGain');

    expect(tempoSelect?.value).toBe('90');
    expect(beatsSelect?.value).toBe('4');
    expect(barsSelect?.value).toBe('1');
    expect(progressCanvas).toBeTruthy();
    expect(playPauseButton?.textContent?.trim()).toBe('▶');
    expect(playPauseButton?.dataset.state).toBe('idle');
    expect(autoGainCheckbox?.checked).toBe(true);
    expect(manualGainSlider?.disabled).toBe(true);
  });

  test('auto gain toggle enables manual gain slider', async () => {
    await import('../../src/main.ts');

    const autoGainCheckbox =
      document.querySelector<HTMLInputElement>('#autoGain');
    const manualGainSlider =
      document.querySelector<HTMLInputElement>('#manualGain');
    const manualGainValue =
      document.querySelector<HTMLSpanElement>('.gain-controls__value');

    expect(autoGainCheckbox).toBeTruthy();
    expect(manualGainSlider).toBeTruthy();

    if (!autoGainCheckbox || !manualGainSlider || !manualGainValue) {
      throw new Error('Gain controls not initialised');
    }

    autoGainCheckbox.checked = false;
    autoGainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(autoGainCheckbox.checked).toBe(false);
    expect(manualGainSlider.disabled).toBe(false);

    manualGainSlider.value = '2.5';
    manualGainSlider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(manualGainValue.textContent).toBe('2.5');
  });

  test('play/pause button starts metronome and toggles transport state', async () => {
    await import('../../src/main.ts');

    const playPauseButton =
      document.querySelector<HTMLButtonElement>('#playPauseButton');
    expect(playPauseButton).toBeTruthy();

    let resolvePlayback: (() => void) | undefined;
    startMetronomeMock.mockImplementation(
      (options) =>
        new Promise<void>((resolve) => {
          resolvePlayback = resolve;
          options.onSchedule?.({
            audioContext: {} as AudioContext,
            startTime: 0,
            playbackStartTime: 0,
            playbackDuration: 1,
            secondsPerBeat: 1,
            countInBeats: 4,
            beatsPerBar: 4,
            playbackBeats: 4,
          });
        }),
    );

    playPauseButton?.click();
    await flushMicrotasks();

    expect(startMetronomeMock).toHaveBeenCalledTimes(1);
    expect(startMetronomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tempo: 90,
        beatsPerBar: 4,
        barCount: 1,
      }),
    );
    expect(playPauseButton?.textContent?.trim()).toBe('⏸');
    expect(playPauseButton?.dataset.state).toBe('playing');

    resolvePlayback?.();
    await flushMicrotasks();

    expect(playPauseButton?.textContent?.trim()).toBe('▶');
    expect(playPauseButton?.dataset.state).toBe('idle');
  });

  test('pressing stop state on play button invokes stopMetronome and resets the transport', async () => {
    await import('../../src/main.ts');

    const playPauseButton =
      document.querySelector<HTMLButtonElement>('#playPauseButton');

    let resolvePlayback: (() => void) | undefined;
    startMetronomeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlayback = resolve;
        }),
    );

    playPauseButton?.click();
    await flushMicrotasks();

    playPauseButton?.click();
    await flushMicrotasks();
    expect(stopMetronomeMock).toHaveBeenCalledTimes(1);

    resolvePlayback?.();
    await flushMicrotasks();

    expect(playPauseButton?.textContent?.trim()).toBe('▶');
  });

  test('space key toggles play and pause', async () => {
    await import('../../src/main.ts');

    const playPauseButton =
      document.querySelector<HTMLButtonElement>('#playPauseButton');
    expect(playPauseButton).toBeTruthy();

    let resolvePlayback: (() => void) | undefined;
    startMetronomeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlayback = resolve;
        }),
    );

    const initialStartCount = startMetronomeMock.mock.calls.length;
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', key: ' ' }),
    );
    await flushMicrotasks();
    expect(startMetronomeMock.mock.calls.length).toBe(initialStartCount + 1);
    expect(playPauseButton?.dataset.state).toBe('playing');

    const initialStopCount = stopMetronomeMock.mock.calls.length;
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', key: ' ' }),
    );
    await flushMicrotasks();
    expect(stopMetronomeMock.mock.calls.length).toBe(initialStopCount + 1);

    resolvePlayback?.();
    await flushMicrotasks();
    expect(playPauseButton?.dataset.state).toBe('idle');
  });
});
