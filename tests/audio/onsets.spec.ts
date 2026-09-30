import { expect, it } from 'vitest';
import { OnsetTracker } from '../../src/audio/onsets';
const unclear = { midi: null, rms: 0.1, confidence: 0 };
const clear = { midi: 60, rms: 0.2, confidence: 0.99 };
it('waits for periodic audio without losing the original attack timestamp', () => {
  const tracker = new OnsetTracker();
  expect(tracker.observe(unclear, 1)).toBeNull();
  expect(tracker.observe(clear, 1.045)).toEqual({ ...clear, time: 1 });
  expect(tracker.observe(clear, 1.09)).toBeNull();
  expect(tracker.observe(clear, 1.2)).toBeNull();
});
it('detects a repeated note after a silent gap and a later legato pitch change', () => {
  const tracker = new OnsetTracker();
  expect(tracker.observe(clear, 0)?.midi).toBe(60);
  tracker.observe({ midi: null, confidence: 0, rms: 0 }, 0.3);
  expect(tracker.observe(clear, 0.5)?.time).toBe(0.5);
  expect(tracker.observe({ ...clear, midi: 64 }, 1)?.midi).toBe(64);
});
it('emits unclear evidence when an attack never resolves', () => {
  const tracker = new OnsetTracker();
  expect(tracker.observe(unclear, 0)).toBeNull();
  expect(tracker.observe(unclear, 0.2)).toEqual({ ...unclear, time: 0 });
});
