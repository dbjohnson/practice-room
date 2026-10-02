import { describe, expect, it } from 'vitest';
import { recordingCoordinate, waveformPeaks, wavBlob } from '../../src/audio/recording';

describe('recorded audio', () => {
  it('encodes mono PCM without clipping beyond the WAV integer range', async () => {
    const blob = wavBlob(new Float32Array([-2, -1, 0, 0.5, 1, 2]), 48000);
    const view = new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(12);
    expect(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true))).toEqual([
      -32768, -32768, 0, 16383, 32767, 32767,
    ]);
  });
  it('keeps silence and transients in the waveform rather than inventing amplitudes', () => {
    expect(waveformPeaks(new Float32Array([0, 0, -0.8, 0.1, 0, 0]), 100)).toEqual([
      0,
      expect.closeTo(0.8),
      0,
    ]);
  });
  it('maps between elapsed audio and musical ticks across tempo changes', () => {
    const timeline = [
      { seconds: 0, tick: 3840 },
      { seconds: 1, tick: 4800 },
      { seconds: 3, tick: 5760 },
    ];
    expect(recordingCoordinate(timeline, 0.5, 'seconds')).toBe(4320);
    expect(recordingCoordinate(timeline, 2, 'seconds')).toBe(5280);
    expect(recordingCoordinate(timeline, 5280, 'tick')).toBe(2);
    expect(recordingCoordinate(timeline, 0, 'tick')).toBe(0);
    expect(recordingCoordinate(timeline, 10, 'seconds')).toBe(5760);
  });
});
