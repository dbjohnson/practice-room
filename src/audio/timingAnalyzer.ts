export type BeatStatus = 'early' | 'late' | 'on' | 'miss';

export interface BeatEvaluation {
  index: number;
  expectedTime: number;
  status: BeatStatus;
  peakTime?: number;
  delta?: number;
  amplitude?: number;
}

interface BeatTracking {
  index: number;
  expectedTime: number;
  result?: BeatEvaluation;
}

interface PendingPeak {
  time: number;
  amplitude: number;
}

export class TimingAnalyzer {
  private static readonly evaluationDelay = 0.15;
  public static readonly onTimeTolerance = 0.025;
  private static readonly searchWindow = 0.35;

  private beats: BeatTracking[] = [];
  private pendingPeaks: PendingPeak[] = [];
  private cumulativeEvaluations: BeatEvaluation[] = [];

  startCycle(
    playbackStartTime: number,
    secondsPerBeat: number,
    beatCount: number,
    activeSteps?: boolean[],
  ): void {
    const stepsPerBeat = activeSteps ? activeSteps.length / beatCount : 1;
    const secondsPerStep = secondsPerBeat / stepsPerBeat;

    const stepsToEvaluate = activeSteps
      ? activeSteps
          .map((isActive, index) => (isActive ? index : -1))
          .filter(index => index !== -1)
      : Array.from({ length: beatCount }, (_, i) => i * stepsPerBeat);

    this.beats = stepsToEvaluate.map(stepIndex => ({
      index: stepIndex,
      expectedTime: playbackStartTime + stepIndex * secondsPerStep,
    }));

    this.pendingPeaks = this.pendingPeaks.filter(
      peak => peak.time >= playbackStartTime - TimingAnalyzer.searchWindow,
    );
  }

  reset(): void {
    this.beats = [];
    this.pendingPeaks = [];
    this.cumulativeEvaluations = [];
  }

  adjustAllDeltas(deltaAdjustment: number): void {
    this.beats.forEach(beat => {
      if (beat.result?.delta !== undefined) {
        beat.result.delta += deltaAdjustment;
      }
    });
    // No need to adjust cumulative, as they are references to the same objects
  }

  addPeaks(peaks: PendingPeak[]): void {
    if (peaks.length === 0) {
      return;
    }
    this.pendingPeaks.push(...peaks);
  }

  evaluate(now: number): BeatEvaluation[] {
    const evaluations: BeatEvaluation[] = [];
    const delay = TimingAnalyzer.evaluationDelay;
    const window = TimingAnalyzer.searchWindow;
    const tolerance = TimingAnalyzer.onTimeTolerance;

    for (const beat of this.beats) {
      if (beat.result) {
        continue;
      }
      if (now < beat.expectedTime + delay) {
        break;
      }

      let bestIndex = -1;
      let bestDelta = Number.POSITIVE_INFINITY;

      for (let i = 0; i < this.pendingPeaks.length; i += 1) {
        const peak = this.pendingPeaks[i];
        const delta = peak.time - beat.expectedTime;
        const absDelta = Math.abs(delta);
        if (absDelta < bestDelta && absDelta <= window) {
          bestDelta = absDelta;
          bestIndex = i;
        }
      }

      if (bestIndex !== -1) {
        const peak = this.pendingPeaks.splice(bestIndex, 1)[0];
        const delta = peak.time - beat.expectedTime;
        const status =
          Math.abs(delta) <= tolerance ? 'on' : delta < 0 ? 'early' : 'late';
        beat.result = {
          index: beat.index,
          expectedTime: beat.expectedTime,
          peakTime: peak.time,
          delta,
          amplitude: peak.amplitude,
          status,
        };
        evaluations.push(beat.result);
        this.cumulativeEvaluations.push(beat.result);
      } else if (now > beat.expectedTime + window) {
        beat.result = {
          index: beat.index,
          expectedTime: beat.expectedTime,
          status: 'miss',
        };
        evaluations.push(beat.result);
        this.cumulativeEvaluations.push(beat.result);
      }
    }

    const earliestPendingBeat = this.beats.find(
      (beat) => !beat.result || beat.result.status === 'miss',
    );
    const cutoff =
      (earliestPendingBeat?.expectedTime ?? now) - TimingAnalyzer.searchWindow;
    this.pendingPeaks = this.pendingPeaks.filter((peak) => peak.time >= cutoff);

    return evaluations;
  }

  getResults(): BeatEvaluation[] {
    return this.beats
      .filter((beat) => beat.result)
      .map((beat) => beat.result!) as BeatEvaluation[];
  }

  getResolvedBeats(): BeatEvaluation[] {
    return this.beats
      .filter((beat) => beat.result !== undefined)
      .map((beat) => beat.result!) as BeatEvaluation[];
  }

  getCumulativeEvaluations(): BeatEvaluation[] {
    return this.cumulativeEvaluations.slice();
  }
}
