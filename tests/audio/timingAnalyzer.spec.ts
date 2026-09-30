import { describe, expect, test } from 'vitest';

import { TimingAnalyzer } from '../../src/audio/timingAnalyzer';

const TOLERANCE = TimingAnalyzer.onTimeTolerance;

// With activeSteps the analyzer evaluates exactly the active step indices and
// derives `secondsPerStep` from `activeSteps.length / beatCount`, giving full
// control over expected times in these unit tests.
function cycleWithSteps(start: number, secondsPerBeat: number, beatsPerBar: number, active: boolean[]) {
  const analyzer = new TimingAnalyzer();
  analyzer.startCycle(start, secondsPerBeat, beatsPerBar, active);
  return analyzer;
}

describe('TimingAnalyzer', () => {
  test('marks a peak within tolerance as "on"', () => {
    const start = 10;
    const secondsPerBeat = 0.5;
    // One active step on the downbeat.
    const active = [true, false, false, false];
    const analyzer = cycleWithSteps(start, secondsPerBeat, 1, active);
    analyzer.addPeaks([{ time: start + TOLERANCE / 2, amplitude: 0.5 }]);
    const results = analyzer.evaluate(start + 1);
    const on = results.filter((r) => r.status === 'on');
    expect(on).toHaveLength(1);
    expect(on[0].delta).toBeCloseTo(TOLERANCE / 2, 5);
  });

  test('marks an early peak as "early"', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: -0.05, amplitude: 0.5 }]);
    const [result] = analyzer.evaluate(5);
    expect(result.status).toBe('early');
    expect(result.delta ?? 0).toBeLessThan(0);
  });

  test('marks a late peak as "late"', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: 0.06, amplitude: 0.5 }]);
    const [result] = analyzer.evaluate(5);
    expect(result.status).toBe('late');
    expect(result.delta ?? 0).toBeGreaterThan(0);
  });

  test('records a "miss" when no peak arrives within the window', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    const results = analyzer.evaluate(5);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('miss');
  });

  test('only evaluates beats whose evaluation delay has elapsed', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: 0, amplitude: 0.5 }]);
    expect(analyzer.evaluate(0.05)).toHaveLength(0);
    expect(analyzer.evaluate(5)).toHaveLength(1);
  });

  test('matches each peak to its nearest expected beat', () => {
    // 4 active steps spaced 0.25s apart -> indices 0,1,2,3
    const analyzer = cycleWithSteps(0, 1, 1, [true, true, true, true]);
    analyzer.addPeaks([
      { time: 0.0, amplitude: 0.5 },
      { time: 0.26, amplitude: 0.5 },
      { time: 0.52, amplitude: 0.5 },
      { time: 0.74, amplitude: 0.5 },
    ]);
    const results = analyzer.evaluate(5);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  test('respects activeSteps to only evaluate active steps', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true, false, true, false]);
    analyzer.addPeaks([
      { time: 0, amplitude: 0.5 },
      { time: 0.5, amplitude: 0.5 },
    ]);
    const results = analyzer.evaluate(5);
    expect(results.map((r) => r.index)).toEqual([0, 2]);
  });

  test('reset clears all accumulated state', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: 0, amplitude: 0.5 }]);
    analyzer.evaluate(5);
    expect(analyzer.getResolvedBeats()).toHaveLength(1);
    analyzer.reset();
    expect(analyzer.getResolvedBeats()).toHaveLength(0);
    expect(analyzer.getCumulativeEvaluations()).toHaveLength(0);
  });

  test('cumulative evaluations persist across cycles until reset', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: 0, amplitude: 0.5 }]);
    analyzer.evaluate(5);
    expect(analyzer.getCumulativeEvaluations()).toHaveLength(1);

    analyzer.startCycle(10, 1, 1, [true]);
    analyzer.addPeaks([{ time: 10, amplitude: 0.5 }]);
    analyzer.evaluate(15);
    expect(analyzer.getCumulativeEvaluations()).toHaveLength(2);
  });

  test('adjustAllDeltas shifts resolved deltas by the given amount', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: 0.03, amplitude: 0.5 }]);
    analyzer.evaluate(5);
    const before = analyzer.getResolvedBeats()[0].delta ?? 0;
    analyzer.adjustAllDeltas(-0.02);
    const after = analyzer.getResolvedBeats()[0].delta ?? 0;
    expect(after).toBeCloseTo(before - 0.02, 5);
  });

  test('handles high BPM (short beat windows)', () => {
    const bpm = 240;
    const secondsPerBeat = 60 / bpm;
    // 4 active subdivisions per beat
    const analyzer = cycleWithSteps(0, secondsPerBeat, 1, [true, true, true, true]);
    analyzer.addPeaks([{ time: secondsPerBeat * 0.5, amplitude: 0.5 }]);
    const results = analyzer.evaluate(2);
    const matched = results.filter((r) => r.status !== 'miss');
    expect(matched.length).toBeGreaterThanOrEqual(1);
  });

  test('getResults and getResolvedBeats return the resolved beats', () => {
    const analyzer = cycleWithSteps(0, 1, 1, [true]);
    analyzer.addPeaks([{ time: 0, amplitude: 0.5 }]);
    analyzer.evaluate(5);
    expect(analyzer.getResults()).toHaveLength(1);
    expect(analyzer.getResolvedBeats()).toHaveLength(1);
    expect(analyzer.getResolvedBeats()[0].status).toBe('on');
  });
});
