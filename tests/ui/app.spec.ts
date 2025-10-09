import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MetronomeOptions } from '../../src/audio/metronome';

const startMetronomeMock = vi.fn<[MetronomeOptions], Promise<void>>();

vi.mock('../../src/audio/metronome', () => ({
  startMetronome: startMetronomeMock,
}));

describe('Tempo Trainer bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    startMetronomeMock.mockReset();
    startMetronomeMock.mockResolvedValue(undefined);
    vi.resetModules();
  });

  test('renders tempo, beats per bar, and bar count selectors with defaults', async () => {
    await import('../../src/main.ts');

    const tempoSelect = document.querySelector<HTMLSelectElement>('#tempo');
    const beatsSelect =
      document.querySelector<HTMLSelectElement>('#beatsPerBar');
    const barsSelect = document.querySelector<HTMLSelectElement>('#barCount');
    const startButton =
      document.querySelector<HTMLButtonElement>('#startButton');
    const progressCanvas =
      document.querySelector<HTMLCanvasElement>('.progress__canvas');

    expect(tempoSelect?.value).toBe('90');
    expect(beatsSelect?.value).toBe('4');
    expect(barsSelect?.value).toBe('4');
    expect(startButton).toBeTruthy();
    expect(progressCanvas).toBeTruthy();
  });

  test('starts metronome with current selections and disables start button while playing', async () => {
    await import('../../src/main.ts');

    const startButton =
      document.querySelector<HTMLButtonElement>('#startButton');
    expect(startButton).toBeTruthy();

    let resolvePlayback: (() => void) | undefined;
    startMetronomeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlayback = resolve;
        }),
    );

    startButton?.click();

    expect(startMetronomeMock).toHaveBeenCalledTimes(1);
    expect(startMetronomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tempo: 90,
        beatsPerBar: 4,
        barCount: 4,
      }),
    );

    const metronomeArgs = startMetronomeMock.mock.calls[0]?.[0];
    expect(typeof metronomeArgs?.onSchedule).toBe('function');

    expect(startButton?.disabled).toBe(true);

    resolvePlayback?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(startButton?.disabled).toBe(false);
  });
});
