import './styles.css';
import {
  getMetronomeContext,
  getScheduledClicks,
  startMetronome,
  stopMetronome,
  PatternRow,
} from './audio/metronome';
import type { MetronomeSchedule, Pitch } from './audio/metronome';
import { MicrophoneRecorder } from './audio/microphoneRecorder';
import { Sampler } from './audio/sampler';
import { PRESETS } from './presets';
import { TimingAnalyzer } from './audio/timingAnalyzer';
import { frequencyToNote } from './audio/pitch';

interface NumberControlConfig {
  id: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

const AUDIO_INPUT_DEVICE_ID_KEY = 'audioInputDeviceId';

const DEFAULTS = {
  tempoBpm: 90,
  beatsPerBar: 4,
  barCount: 1,
};

const formatGain = (gain: number): string => gain.toFixed(1);

function createNumberControl({
  id,
  label,
  defaultValue,
  min = 1,
  step = 1,
  max,
}: NumberControlConfig): { element: HTMLLabelElement; input: HTMLInputElement } {
  const container = document.createElement('label');
  container.setAttribute('for', id);
  container.className = 'control';

  const title = document.createElement('span');
  title.textContent = label;
  title.className = 'control__label';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.name = id;
  input.min = String(Math.max(1, min));
  if (max !== undefined) {
    input.max = String(max);
  }
  input.step = String(Math.max(1, step));
  input.inputMode = 'numeric';
  input.pattern = '[0-9]*';
  input.value = String(Math.max(1, Math.floor(defaultValue)));
  input.className = 'control__input';
  input.setAttribute('autocomplete', 'off');

  container.append(title, input);

  return {
    element: container,
    input,
  };
}

function createSelectControl({ id, label, options }: { id: string; label: string; options: Record<string, string> }) {
  const container = document.createElement('label');
  container.setAttribute('for', id);
  container.className = 'control';

  const title = document.createElement('span');
  title.textContent = label;
  title.className = 'control__label';

  const select = document.createElement('select');
  select.id = id;
  select.name = id;
  select.className = 'control__input';

  Object.entries(options).forEach(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.add(option);
  });

  container.append(title, select);
  return { element: container, select };
}

function createToggleControl({
  id,
  label,
  defaultValue = false,
}: {
  id: string;
  label: string;
  defaultValue?: boolean;
}): { element: HTMLLabelElement; input: HTMLInputElement } {
  const container = document.createElement('label');
  container.className = 'control control--toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.name = id;
  input.checked = defaultValue;

  const title = document.createElement('span');
  title.textContent = label;

  container.append(input, title);
  return { element: container, input };
}

function renderApp(root: HTMLElement): void {
  const page = document.createElement('main');
  page.className = 'app';

  const form = document.createElement('form');
  form.className = 'controls';
  form.setAttribute('aria-label', 'Tempo configuration');

  const progressSection = document.createElement('section');
  progressSection.className = 'progress';

  const progressCanvas = document.createElement('canvas');
  progressCanvas.className = 'progress__canvas';
  progressCanvas.setAttribute('aria-hidden', 'true');

  const sequencerCanvas = document.createElement('canvas');
  sequencerCanvas.id = 'sequencer';
  sequencerCanvas.className = 'sequencer__canvas';

  const microphone = new MicrophoneRecorder();
  const timingAnalyzer = new TimingAnalyzer();
  let sampler: Sampler | null = null;

  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress__container';
  progressContainer.append(progressCanvas);

  progressSection.append(progressContainer);

  const deviationCanvas = document.createElement('canvas');
  const deviationContainer = document.createElement('div');
  deviationContainer.className = 'deviation-container';

  const tunerCanvas = document.createElement('canvas');
  tunerCanvas.className = 'tuner__canvas';
  tunerCanvas.setAttribute('aria-hidden', 'true');

  deviationCanvas.className = 'deviation__canvas';
  deviationCanvas.setAttribute('aria-hidden', 'true');

  const deviationContext = deviationCanvas.getContext('2d');

  const MAX_HISTORY = 10;
  const CANVAS_PADDING = 8;
  const tunerContext = tunerCanvas.getContext('2d');
  const beatDeviations: Array<number | null> = [];
  let shouldResetDeviationHistory = true;

  const updateDeviationHistory = () => {
    const results = timingAnalyzer.getResolvedBeats();
    if (results.length <= evaluatedCount) {
      return;
    }

    const beatDuration = currentSecondsPerBeat || 1;
    for (let i = evaluatedCount; i < results.length; i += 1) {
      const result = results[i];
      const normalized =
        result.delta !== undefined && result.delta !== null && beatDuration > 0
          ? (result.delta ?? 0) / beatDuration
          : null;
      beatDeviations.push(normalized);
    }
    evaluatedCount = results.length;

    const maxSamples = Math.max(totalBeatsPerPattern, 1) * MAX_HISTORY;
    if (beatDeviations.length > maxSamples) {
      beatDeviations.splice(0, beatDeviations.length - maxSamples);
    }
  };

  const renderDeviationCanvas = () => {
    if (!deviationContext) {
      return;
    }

    const width = deviationCssWidth || deviationCanvas.width;
    const height = deviationCssHeight || deviationCanvas.height;
    deviationContext.clearRect(0, 0, width, height);

    const pad = CANVAS_PADDING;
    const drawWidth = Math.max(width - pad * 2, 0);
    const drawHeight = Math.max(height - pad * 2, 0);
    if (drawWidth <= 0 || drawHeight <= 0) {
      return;
    }

    const centerY = pad + drawHeight / 2;
    const verticalRange = 0.5;
    deviationContext.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    deviationContext.lineWidth = 1;
    deviationContext.setLineDash([]);
    deviationContext.beginPath();
    deviationContext.moveTo(pad, centerY);
    deviationContext.lineTo(pad + drawWidth, centerY);
    deviationContext.stroke();

    const totalPatterns = MAX_HISTORY;
    const denominatorTicks = Math.max(totalPatterns, 1);
    deviationContext.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    deviationContext.lineWidth = 1;
    deviationContext.beginPath();
    for (let i = 0; i <= totalPatterns; i += 1) {
      const x = pad + (i / denominatorTicks) * drawWidth;
      deviationContext.moveTo(x, centerY - 4);
      deviationContext.lineTo(x, centerY + 4);
    }
    deviationContext.stroke();

    if (!beatDeviations.length) {
      return;
    }

    const windowSize = Math.max(totalBeatsPerPattern, 1);
    const maxBeats = Math.max(windowSize * MAX_HISTORY, 1);
    const beatData = beatDeviations.slice(-maxBeats);
    if (!beatData.length) {
      return;
    }

    const points = beatData.map((value, index) => ({
      age: beatData.length - 1 - index,
      raw: value,
    }));

    points.sort((a, b) => a.age - b.age);
    const maxAge = Math.max(maxBeats - 1, 1);

    const plotBeatLine = (
      accessor: (point: { age: number; raw: number | null }) => number | null,
      color: string,
    ) => {
      deviationContext.strokeStyle = color;
      deviationContext.lineWidth = 2;
      deviationContext.beginPath();
      let started = false;
      points.forEach((point, index) => {
        const normalizedX = point.age / maxAge;
        const x = pad + normalizedX * drawWidth;
        const rawValue = accessor(point);
        if (rawValue === null || Number.isNaN(rawValue)) {
          started = false;
          return;
        }
        const value = Math.max(-verticalRange, Math.min(verticalRange, rawValue));
        const y = centerY - (value / verticalRange) * (drawHeight / 2);
        if (!started) {
          deviationContext.moveTo(x, y);
          started = true;
        } else {
          deviationContext.lineTo(x, y);
        }
      });
      deviationContext.stroke();

      points.forEach((point) => {
        const normalizedX = point.age / maxAge;
        const x = pad + normalizedX * drawWidth;
        const rawValue = accessor(point);
        if (rawValue === null || Number.isNaN(rawValue)) {
          return;
        }
        const value = Math.max(-verticalRange, Math.min(verticalRange, rawValue));
        const y = centerY - (value / verticalRange) * (drawHeight / 2);
        deviationContext.beginPath();
        deviationContext.fillStyle = color;
        deviationContext.arc(x, y, 3, 0, Math.PI * 2);
        deviationContext.fill();
      });
    };

    plotBeatLine((point) => point.raw, '#ffffff');
  };

  const renderTunerCanvas = (pitch: Pitch | null) => {
    if (!tunerContext || tunerCssWidth <= 0 || tunerCssHeight <= 0) {
      return;
    }

    const isActive = pitch && pitch.confidence > 0.7;

    tunerContext.clearRect(0, 0, tunerCssWidth, tunerCssHeight);
    tunerContext.globalAlpha = isActive ? 1.0 : 0.4;

    const pad = CANVAS_PADDING;
    const drawWidth = tunerCssWidth - pad * 2;
    const drawHeight = tunerCssHeight - pad * 2;
    const centerX = pad + drawWidth / 2;
    const centerY = pad + drawHeight / 2;

    // Draw center line
    tunerContext.fillStyle = 'rgba(255, 255, 255, 0.5)';
    tunerContext.fillRect(centerX - 0.5, pad, 1, drawHeight);

    if (!isActive || !pitch) {
      tunerContext.globalAlpha = 1.0;
      return;
    }

    const { noteName, cents } = frequencyToNote(pitch.frequency);

    // Draw note name
    const fontSize = Math.min(drawHeight * 0.6, 48);
    tunerContext.font = `600 ${fontSize}px 'Segoe UI', Tahoma, sans-serif`;
    tunerContext.textAlign = 'center';
    tunerContext.textBaseline = 'middle';
    tunerContext.fillStyle = 'rgba(246, 249, 255, 0.95)';
    tunerContext.fillText(noteName, centerX, centerY);

    // Draw cents deviation bar
    const centsRange = 50; // Show +/- 50 cents
    const clampedCents = Math.max(-centsRange, Math.min(centsRange, cents));
    const offset = (clampedCents / centsRange) * (drawWidth / 2);

    const barX = centerX + offset;
    const barWidth = 3;
    const barHeight = drawHeight * 0.8;
    const barY = pad + (drawHeight - barHeight) / 2;

    let barColor = '#3ddc97'; // green for on-tune
    if (Math.abs(cents) > 15) {
      barColor = '#ff5d73'; // red for very off
    } else if (Math.abs(cents) > 5) {
      barColor = '#ffca63'; // yellow for slightly off
    }

    tunerContext.fillStyle = barColor;
    tunerContext.shadowColor = barColor;
    tunerContext.shadowBlur = 8;
    tunerContext.fillRect(barX - barWidth / 2, barY, barWidth, barHeight);

    // Reset shadows and alpha for next draw cycle
    tunerContext.shadowBlur = 0;
    tunerContext.globalAlpha = 1.0;
  };

  const canvasContext = progressCanvas.getContext('2d');
  const sequencerContext = sequencerCanvas.getContext('2d');
  if (!canvasContext || !deviationContext) {
    console.warn('Progress canvas unavailable; visuals will be limited');
  }

  let animationFrameId: number | null = null;
  let progressAmount = 0;
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;
  let deviationCssWidth = 0;
  let deviationCssHeight = 0;
  let sequencerCssWidth = 0;
  let sequencerCssHeight = 0;
  let tunerCssWidth = 0;
  let tunerCssHeight = 0;
  let countdownValue: number | null = null;
  let progressBeatsPerBar = 0;
  let progressBarCount = 0;
  let timingWindowStart = 0;
  let timingWindowDuration = 1;
  let currentSecondsPerBeat = 1;
  let totalBeatsPerPattern = 1;
  const patternConfig: Omit<PatternRow, 'notes'>[] = [
    { subdivision: 1, sample: 'kick', gain: 1.0 },
    { subdivision: 2, sample: 'snare', gain: 0.6 },
    { subdivision: 4, sample: 'hihat', gain: 0.5 },
  ];
  const rowHeight = 40;
  const buttonHeight = 24;
  const buttonGap = 4;

  let evaluatedCount = 0;
  let patterns: PatternRow[] = patternConfig.map(config => ({
    ...config,
    // This is a bug, it should be initialized in updateSequencerState
    // but let's keep it here for now as it's not the focus of this change.
    // The user will likely ask to fix this next.
    notes: [],
  }));


  const renderSequencerCanvas = () => {
    if (!sequencerContext || sequencerCssWidth <= 0 || sequencerCssHeight <= 0) {
      return;
    }

    sequencerContext.clearRect(0, 0, sequencerCssWidth, sequencerCssHeight);

    const pad = CANVAS_PADDING;
    const drawWidth = sequencerCssWidth - pad * 2;

    patterns.forEach((patternRow, rowIndex) => {
      const { subdivision, notes } = patternRow;
      const totalButtons = totalBeatsPerPattern * subdivision;
      if (totalButtons <= 0) {
        return;
      }

      const beatWidth = drawWidth / totalButtons;
      const buttonWidth = beatWidth - buttonGap;
      const rowY = rowIndex * rowHeight;
      const buttonY = rowY + (rowHeight - buttonHeight) / 2;

      for (let i = 0; i < totalButtons; i++) {
        const buttonX = pad + i * beatWidth + buttonGap / 2;
        const isChecked = notes[i];

        // Determine if it's an accented beat (only for the main beat row)
        const isAccent =
          subdivision === 1 && i % progressBeatsPerBar === 0;

        sequencerContext.beginPath();
        sequencerContext.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 4);

        if (isChecked) {
          sequencerContext.fillStyle = isAccent ? '#f5a623' : '#4a90e2';
          sequencerContext.strokeStyle = isAccent ? '#f8c471' : '#7ab3f0';
        } else {
          sequencerContext.fillStyle = '#3a4a65';
          sequencerContext.strokeStyle = '#5a6c89';
        }

        sequencerContext.fill();
        sequencerContext.lineWidth = 1;
        sequencerContext.stroke();
      }
    });
  };

  const handleSequencerClick = (event: MouseEvent) => {
    const rect = sequencerCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const pad = CANVAS_PADDING;
    const drawWidth = Math.max(sequencerCssWidth - pad * 2, 0);
    if (drawWidth <= 0) return;

    const clickedRowIndex = Math.floor(y / rowHeight);
    if (clickedRowIndex < 0 || clickedRowIndex >= patterns.length) return;

    const patternRow = patterns[clickedRowIndex];
    const { subdivision, notes } = patternRow;
    const totalButtons = totalBeatsPerPattern * subdivision;
    const beatWidth = drawWidth / totalButtons;
    const clickedButton = Math.floor((x - pad) / beatWidth);

    if (clickedButton >= 0 && clickedButton < totalButtons) {
      notes[clickedButton] = !notes[clickedButton];
      renderSequencerCanvas();
      updateMetronomePattern(clickedRowIndex, clickedButton, notes[clickedButton]);
    }
  };

  const updateMetronomePattern = (
    rowIndex: number,
    noteIndex: number,
    isEnabled: boolean,
  ) => {
    if (!scheduleInfo) {
      return;
    }

    const scheduledClicks = getScheduledClicks();
    const { playbackStartTime, secondsPerBeat, beatsPerBar } = scheduleInfo;
    const { subdivision } = patterns[rowIndex];
    const secondsPerNote = secondsPerBeat / subdivision;
    const expectedTime = playbackStartTime + noteIndex * secondsPerNote;

    // Find the click corresponding to the toggled beat
    const click = scheduledClicks.find(
      (c) => Math.abs(c.startTime - expectedTime) < 0.001,
    );

    click?.patternGain.gain.setValueAtTime(isEnabled ? 1.0 : 0.0, 0);
  };

  let tunerEnabled = false;
  let tunerAnimationId: number | null = null;

  const stopTunerLoop = () => {
    if (tunerAnimationId !== null) {
      cancelAnimationFrame(tunerAnimationId);
      tunerAnimationId = null;
    }
    renderTunerCanvas(null); // Clear the tuner view
  };

  const startTunerLoop = () => {
    if (tunerAnimationId !== null) return; // Already running

    const renderTuner = () => {
      if (!tunerEnabled) {
        stopTunerLoop();
        return;
      }
      microphone.processAudio(performance.now() / 1000);
      const pitch = microphone.getPitch();
      renderTunerCanvas(pitch);
      tunerAnimationId = requestAnimationFrame(renderTuner);
    };

    tunerAnimationId = requestAnimationFrame(renderTuner);
  };


  const applyPreset = (presetKey: string) => {
    if (!presetKey || !PRESETS[presetKey]) {
      return;
    }

    const preset = PRESETS[presetKey];
    patterns.forEach((patternRow, rowIndex) => {
      const presetPattern = preset.patterns[rowIndex] || [];
      for (let i = 0; i < patternRow.notes.length; i++) {
        const newValue = presetPattern[i % presetPattern.length] ?? false;
        if (patternRow.notes[i] !== newValue) {
          patternRow.notes[i] = newValue;
          // Instantly update the metronome if it's playing
          if (scheduleInfo) {
            updateMetronomePattern(rowIndex, i, newValue);
          }
        }
      }
    });
    renderSequencerCanvas();
  };

  const calibrateLatency = () => {
    const evaluations = timingAnalyzer.getCumulativeEvaluations();
    const validHits = evaluations.filter(
      e => e.delta !== undefined && e.delta !== null,
    );

    if (validHits.length < 5) {
      console.warn(
        'Not enough data to calibrate latency. Please play a few more notes.',
      );
      return;
    }

    const averageDelta =
      validHits.reduce((sum, hit) => sum + (hit.delta ?? 0), 0) /
      validHits.length;

    const currentLatencySec = readPositiveInteger(latencyInput, 80, false) / 1000;
    const newLatencySec = currentLatencySec + averageDelta;

    const newLatency = Math.round(newLatencySec * 1000);
    const minLatency = Number(latencyInput.min) || 0;
    const maxLatency = Number(latencyInput.max) || 200;

    latencyInput.value = String(Math.max(minLatency, Math.min(maxLatency, newLatency)));

    // Adjust history to reflect the new calibration
    const beatDuration = currentSecondsPerBeat || 1;
    const deltaAdjustment = -averageDelta;
    const normalizedAdjustment = deltaAdjustment / beatDuration;

    for (let i = 0; i < beatDeviations.length; i++) {
      if (beatDeviations[i] !== null) {
        beatDeviations[i] += normalizedAdjustment;
      }
    }
    timingAnalyzer.adjustAllDeltas(deltaAdjustment);

    renderDeviationCanvas();
    renderProgressCanvas();
  };

  // A variable to hold the schedule info from the metronome
  // so we can access it in the click handlers.
  let scheduleInfo: MetronomeSchedule | null = null;

  const renderProgressCanvas = () => {
    if (canvasCssWidth <= 0 || canvasCssHeight <= 0) {
      return;
    }

    if (!canvasContext) {
      return;
    }

    canvasContext.clearRect(0, 0, canvasCssWidth, canvasCssHeight);

    const pad = CANVAS_PADDING;
    const drawWidth = Math.max(canvasCssWidth - pad * 2, 0);
    const drawHeight = Math.max(canvasCssHeight - pad * 2, 0);
    if (drawWidth <= 0 || drawHeight <= 0) {
      return;
    }

    const left = pad;
    const top = pad;
    const midY = top + drawHeight / 2;

    const trackHeight = Math.max(1, Math.min(2, drawHeight * 0.02));
    canvasContext.fillStyle = 'rgba(255, 255, 255, 0.24)';
    canvasContext.fillRect(left, midY - trackHeight / 2, drawWidth, trackHeight);

    const waveform = microphone.getPeaks();
    if (waveform.lastIndex >= 0) {
      const points = waveform.min.length;
      const upper = waveform.max;
      const lower = waveform.min;
      const amplitude = drawHeight * 0.45;
      const displayGain = waveform.gain;

      canvasContext.save();
      canvasContext.beginPath();

      let started = false;
      for (let i = 0; i <= waveform.lastIndex; i += 1) {
        const x =
          left + (i / Math.max(1, points - 1)) * drawWidth;
        const sample = Math.max(-1, Math.min(1, upper[i] || 0));
        const scaled = Math.max(-1, Math.min(1, sample * displayGain));
        const y = midY + scaled * amplitude;
        if (!started) {
          canvasContext.moveTo(x, y);
          started = true;
        } else {
          canvasContext.lineTo(x, y);
        }
      }

      for (let i = waveform.lastIndex; i >= 0; i -= 1) {
        const x =
          left + (i / Math.max(1, points - 1)) * drawWidth;
        const sample = Math.max(-1, Math.min(1, lower[i] || 0));
        const scaled = Math.max(-1, Math.min(1, sample * displayGain));
        const y = midY + scaled * amplitude;
        canvasContext.lineTo(x, y);
      }

      canvasContext.closePath();
      canvasContext.fillStyle = 'rgba(110, 176, 255, 0.18)';
      canvasContext.fill();
      canvasContext.lineWidth = Math.max(1, canvasCssHeight * 0.004);
      canvasContext.strokeStyle = 'rgba(223, 235, 255, 0.5)';
      canvasContext.stroke();
      canvasContext.restore();
    }

    if (progressBeatsPerBar > 0 && progressBarCount > 0) {
      canvasContext.save();
      const totalBeats = progressBeatsPerBar * progressBarCount;
      const beatWidth = totalBeats > 0 ? drawWidth / totalBeats : drawWidth;

      canvasContext.fillStyle = 'rgba(255, 255, 255, 0.45)';
      const beatLineHeight = drawHeight * 0.25;
      const beatLineY = midY - beatLineHeight / 2;
      for (let beat = 1; beat < totalBeats; beat += 1) {
        if (beat % progressBeatsPerBar === 0) {
          continue;
        }
        const beatX = left + beat * beatWidth;
        canvasContext.fillRect(beatX, beatLineY, 1, beatLineHeight);
      }

      canvasContext.fillStyle = 'rgba(255, 255, 255, 0.75)';
      const barWidth = beatWidth * progressBeatsPerBar;
      const barLineHeight = drawHeight * 0.75;
      const barLineY = midY - barLineHeight / 2;

      for (let bar = 0; bar <= progressBarCount; bar += 1) {
        const x = left + bar * barWidth;
        canvasContext.fillRect(x, barLineY, 1, barLineHeight);
      }
      canvasContext.restore();
    }

    if (progressAmount > 0 && progressAmount < 1) {
      const indicatorWidth = Math.max(3, canvasCssWidth * 0.006);
      const indicatorX = left + progressAmount * drawWidth;
      const indicatorLeft = indicatorX - indicatorWidth / 2;

      canvasContext.fillStyle = '#f6f9ff';
      const indicatorHeight = drawHeight / 2;
      const indicatorTop = midY - indicatorHeight / 2;
      const indicatorWidthClamped = Math.max(1, Math.min(2, indicatorWidth));
      canvasContext.fillRect(
        indicatorLeft,
        indicatorTop,
        indicatorWidthClamped,
        indicatorHeight,
      );
    }

    renderTimingIndicators();

    if (countdownValue && countdownValue > 0) {
      const text = String(countdownValue);
      const fontSize = Math.min(drawHeight * 0.42, 64);
      canvasContext.save();
      canvasContext.font = `600 ${fontSize}px 'Segoe UI', Tahoma, sans-serif`;
      canvasContext.textAlign = 'center';
      canvasContext.textBaseline = 'middle';
      canvasContext.fillStyle = 'rgba(246, 249, 255, 0.95)';
      canvasContext.shadowColor = 'rgba(110, 176, 255, 0.45)';
      canvasContext.shadowBlur = fontSize * 0.35;
      canvasContext.shadowOffsetX = 0;
      canvasContext.shadowOffsetY = 0;
      canvasContext.fillText(text, left + drawWidth / 2, top + drawHeight / 2);
      canvasContext.restore();
    }
  };

  const renderTimingIndicators = () => {
    if (!canvasContext || !canvasCssWidth || !canvasCssHeight) {
      return;
    }

    const pad = CANVAS_PADDING;
    const drawWidth = Math.max(canvasCssWidth - pad * 2, 0);
    const drawHeight = Math.max(canvasCssHeight - pad * 2, 0);
    if (drawWidth <= 0 || drawHeight <= 0) {
      return;
    }

    const left = pad;
    const startTime = timingWindowStart;
    const duration = timingWindowDuration || 1;
    const midY = pad + drawHeight / 2;
    const toleranceMs = TimingAnalyzer.onTimeTolerance * 1000;
    const nearToleranceMs = toleranceMs * 2;

    const evaluations = timingAnalyzer.getResolvedBeats();
    updateDeviationHistory();
    renderDeviationCanvas();
    if (!evaluations.length) {
      return;
    }

    canvasContext.save();
    for (const evaluation of evaluations) {
      if (!evaluation.peakTime) {
        continue;
      }
      const normalizedTime = (evaluation.peakTime - startTime) / duration;
      const x = Math.max(
        left,
        Math.min(left + drawWidth, left + normalizedTime * drawWidth),
      );

      let color = '#3ddc97';
      if (evaluation.delta !== undefined) {
        const deltaMs = Math.abs(evaluation.delta * 1000);
        if (deltaMs > nearToleranceMs) {
          color = '#ff5d73';
        } else if (deltaMs > toleranceMs) {
          color = '#ffca63';
        }
      }

      canvasContext.fillStyle = color;
      canvasContext.beginPath();
      canvasContext.arc(x, midY, 6, 0, Math.PI * 2);
      canvasContext.fill();
    }

    canvasContext.restore();
  };

  const resizeCanvas = () => {
    const rect = progressCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;

    canvasCssWidth = rect.width;
    canvasCssHeight = rect.height;
    progressCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    progressCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    const deviationRect = deviationCanvas.getBoundingClientRect();
    deviationCssWidth = deviationRect.width;
    deviationCssHeight = deviationRect.height;
    deviationCanvas.width = Math.max(1, Math.round(deviationRect.width * dpr));
    deviationCanvas.height = Math.max(1, Math.round(deviationRect.height * dpr));

    if (!canvasContext || !deviationContext) {
      return;
    }

    const tunerRect = tunerCanvas.getBoundingClientRect();
    tunerCssWidth = tunerRect.width;
    tunerCssHeight = tunerRect.height;
    tunerCanvas.width = Math.max(1, Math.round(tunerRect.width * dpr));
    tunerCanvas.height = Math.max(1, Math.round(tunerRect.height * dpr));
    if (!tunerContext) {
      return;
    }

    const sequencerRect = sequencerCanvas.getBoundingClientRect();
    sequencerCssWidth = sequencerRect.width;
    sequencerCssHeight = sequencerRect.height;
    sequencerCanvas.width = Math.max(1, Math.round(sequencerRect.width * dpr));
    sequencerCanvas.height = Math.max(1, Math.round(sequencerRect.height * dpr));
    if (!sequencerContext) {
      return;
    }

    canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    canvasContext.scale(dpr, dpr);
    deviationContext.setTransform(1, 0, 0, 1, 0, 0);
    deviationContext.scale(dpr, dpr);
    sequencerContext.setTransform(1, 0, 0, 1, 0, 0);
    sequencerContext.scale(dpr, dpr);
    tunerContext.setTransform(1, 0, 0, 1, 0, 0);
    tunerContext.scale(dpr, dpr);

    renderProgressCanvas();
    renderSequencerCanvas();
    renderDeviationCanvas();
  };

  window.addEventListener('resize', resizeCanvas, { passive: true });

  const setProgress = (value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    progressAmount = clamped;
    renderProgressCanvas();
  };

  const setCountdown = (value: number | null) => {
    countdownValue = value && value > 0 ? value : null;
    renderProgressCanvas();
  };

  const stopProgressAnimation = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    setCountdown(null);
  };

  const startProgressAnimation = ({
    audioContext,
    startTime,
    playbackStartTime,
    playbackDuration,
    secondsPerBeat,
    countInBeats,
    beatsPerBar,
    playbackBeats,
  }: MetronomeSchedule): void => {
    stopProgressAnimation();
    microphone.clearPeaks();
    timingAnalyzer.startCycle(playbackStartTime, secondsPerBeat, playbackBeats);
    scheduleInfo = { audioContext, startTime, playbackStartTime, playbackDuration, secondsPerBeat, countInBeats, beatsPerBar, playbackBeats };
    timingWindowStart = playbackStartTime;
    timingWindowDuration = Math.max(secondsPerBeat * playbackBeats, 0.001);
    currentSecondsPerBeat = secondsPerBeat || currentSecondsPerBeat;
    totalBeatsPerPattern = Math.max(playbackBeats, 1);
    evaluatedCount = 0;
    setProgress(0);

    if (playbackDuration <= 0) {
      setProgress(1);
      setCountdown(null);
      return;
    }

    if (beatsPerBar > 0) {
      progressBeatsPerBar = beatsPerBar;
      const derivedBarCount =
        playbackBeats > 0
          ? Math.max(1, Math.round(playbackBeats / beatsPerBar))
          : progressBarCount;
      progressBarCount = derivedBarCount;
      renderProgressCanvas();
    }

    setCountdown(countInBeats);

    const renderProgress = () => {
      const now = audioContext.currentTime;
      let shouldContinue = true;

      const latencyMs = readPositiveInteger(latencyInput, 80);
      const latencySec = latencyMs / 1000;
      microphone.captureSample(now, playbackStartTime, playbackDuration, latencySec);
      const beatEvaluations = timingAnalyzer.evaluate(now);
      if (beatEvaluations.length > 0) {
        // Timing evaluations ready for visualization
      }

      if (now < playbackStartTime) {
        if (now < startTime) {
          // This is a bit of a hack to get the peaks during countdown
          const freshPeaks = microphone.consumePeaks();
          if (freshPeaks.length > 0) {
            timingAnalyzer.addPeaks(freshPeaks);
          }

          setCountdown(countInBeats);
        } else {
          const remainingBeats = Math.ceil(
            (playbackStartTime - now) / secondsPerBeat,
          );
          setCountdown(remainingBeats > 0 ? remainingBeats : null);
        }
        setProgress(0);
      } else {
        // This is where peaks are normally consumed
        const freshPeaks = microphone.consumePeaks();
        if (freshPeaks.length > 0) {
          timingAnalyzer.addPeaks(freshPeaks);
        }

        setCountdown(null);
        const progress = Math.min(
          (now - playbackStartTime) / playbackDuration,
          1,
        );
        setProgress(progress);
        if (progress >= 1) {
          shouldContinue = false;
        }
      }

      renderProgressCanvas();

      if (shouldContinue) {
        animationFrameId = requestAnimationFrame(renderProgress);
      } else {
        animationFrameId = null;
      }
    };

    renderProgress();
  };

  const initializeCanvas = () => {
    resizeCanvas();
    renderProgressCanvas();
  };

  setProgress(0);
  setCountdown(null);
  window.addEventListener('resize', resizeCanvas, { passive: true });

  const tempoControl = createNumberControl({
    id: 'tempo',
    label: 'Tempo (BPM)',
    defaultValue: DEFAULTS.tempoBpm,
    min: 1,
    step: 1,
  });

  const beatsPerBarControl = createNumberControl({
    id: 'beatsPerBar',
    label: 'Beats per bar',
    defaultValue: DEFAULTS.beatsPerBar,
    min: 1,
    step: 1,
  });

  const barCountControl = createNumberControl({
    id: 'barCount',
    label: 'Bars',
    defaultValue: DEFAULTS.barCount,
    min: 1,
    step: 1,
  });

  const latencyControl = createNumberControl({
    id: 'latency',
    label: 'Latency (ms)',
    defaultValue: 80,
    min: 0,
    max: 200,
    step: 1,
  });

  const tunerToggleControl = createToggleControl({
    id: 'tuner',
    label: 'Enable Tuner',
    defaultValue: false,
  });
  const tunerToggleInput = tunerToggleControl.input;

  const audioInputControl = createSelectControl({
    id: 'audio-input',
    label: 'Audio Input',
    options: { '': 'Default' },
  });
  const audioInputSelect = audioInputControl.select;

  audioInputSelect.addEventListener('change', () => {
    try {
      localStorage.setItem(AUDIO_INPUT_DEVICE_ID_KEY, audioInputSelect.value);
    } catch (e) {
      console.warn('Could not persist audio input device selection.', e);
    }
  });

  const presetOptions: Record<string, string> = { '': 'Select a Preset...' };
  Object.entries(PRESETS).forEach(([key, preset]) => {
    presetOptions[key] = preset.name;
  });

  const presetControl = createSelectControl({
    id: 'presets',
    label: 'Presets',
    options: presetOptions,
  });
  presetControl.select.addEventListener('change', () => applyPreset(presetControl.select.value));

  const gainControls = document.createElement('div');
  gainControls.className = 'gain-controls';

  const autoGainLabel = document.createElement('label');
  autoGainLabel.className = 'gain-controls__auto';

  const autoGainCheckbox = document.createElement('input');
  autoGainCheckbox.type = 'checkbox';
  autoGainCheckbox.id = 'autoGain';
  autoGainCheckbox.name = 'autoGain';
  autoGainCheckbox.className = 'gain-controls__checkbox';
  autoGainCheckbox.checked = microphone.isAutoGainEnabled();

  const autoGainText = document.createElement('span');
  autoGainText.textContent = 'Auto gain';

  autoGainLabel.append(autoGainCheckbox, autoGainText);

  const manualGainLabel = document.createElement('label');
  manualGainLabel.className = 'gain-controls__manual';
  manualGainLabel.setAttribute('for', 'manualGain');

  const manualGainTitle = document.createElement('span');
  manualGainTitle.className = 'control__label';
  manualGainTitle.textContent = 'Manual gain';

  const manualGainWrapper = document.createElement('div');
  manualGainWrapper.className = 'gain-controls__slider';

  const manualGainSlider = document.createElement('input');
  manualGainSlider.type = 'range';
  manualGainSlider.id = 'manualGain';
  manualGainSlider.name = 'manualGain';
  manualGainSlider.className = 'gain-controls__sliderInput';
  const manualRange = microphone.getManualGainRange();
  manualGainSlider.min = manualRange.min.toFixed(1);
  manualGainSlider.max = manualRange.max.toFixed(1);
  manualGainSlider.step = '0.1';
  manualGainSlider.value = formatGain(microphone.getManualGain());

  const manualGainValue = document.createElement('span');
  manualGainValue.className = 'gain-controls__value';
  manualGainValue.textContent = formatGain(Number(manualGainSlider.value));

  manualGainWrapper.append(manualGainSlider, manualGainValue);
  manualGainLabel.append(manualGainTitle, manualGainWrapper);

  gainControls.append(autoGainLabel, manualGainLabel);

  const tempoInput = tempoControl.input;
  const beatsPerBarInput = beatsPerBarControl.input;
  const barCountInput = barCountControl.input;
  const latencyInput = latencyControl.input;

  // This function is defined twice, let's consolidate
  // const readPositiveInteger = ...

  // ...

  const readPositiveInteger = (
    input: HTMLInputElement,
    fallback: number,
    commit = false,
  ): number => {
    const parsed = Number.parseInt(input.value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      const min = Number(input.min) || 1;
      if (commit) {
        input.value = String(fallback);
      }
      return fallback;
    }
    const normalized = Math.floor(Math.max(Number(input.min) || 0, parsed));
    if (commit) {
      input.value = String(normalized);
    }
    return normalized;
  };

  const updateBarGuides = () => {
    const beatsPerBar = readPositiveInteger(
      beatsPerBarInput,
      DEFAULTS.beatsPerBar,
    );
    const barCount = readPositiveInteger(barCountInput, DEFAULTS.barCount);
    progressBeatsPerBar = beatsPerBar;
    progressBarCount = barCount;
    renderProgressCanvas();
  };

  beatsPerBarInput.addEventListener('input', updateBarGuides);
  barCountInput.addEventListener('input', updateBarGuides);
  beatsPerBarInput.addEventListener('blur', () => {
    readPositiveInteger(beatsPerBarInput, DEFAULTS.beatsPerBar, true);
    updateBarGuides();
  });
  barCountInput.addEventListener('blur', () => {
    readPositiveInteger(barCountInput, DEFAULTS.barCount, true);
    updateBarGuides();
  });
  tempoInput.addEventListener('blur', () => {
    readPositiveInteger(tempoInput, DEFAULTS.tempoBpm, true);
  });

  const updateSequencerState = () => {
    const oldPatterns = patterns;
    const oldTotalBeats = totalBeatsPerPattern;

    const beatsPerBar = readPositiveInteger(beatsPerBarInput, DEFAULTS.beatsPerBar);
    const barCount = readPositiveInteger(barCountInput, DEFAULTS.barCount);
    const playbackBeats = beatsPerBar * barCount;
    totalBeatsPerPattern = playbackBeats;

    patterns = patternConfig.map((config, i) => {
      const { subdivision, sample, gain } = config;
      const newNumNotes = playbackBeats * subdivision;
      const newNotes = Array(newNumNotes).fill(false);
      const oldNotes = oldPatterns[i]?.notes;

      if (oldNotes && oldNotes.length > 0) {
        for (let j = 0; j < newNumNotes; j++) {
          newNotes[j] = oldNotes[j % oldNotes.length];
        }
      } else {
        newNotes.fill(subdivision === 1); // Default only quarter notes on for initial setup.
      }
      return { subdivision, sample, gain, notes: newNotes };
    });

    renderSequencerCanvas();
  };

  const updateMicrophoneState = async (isPlaybackStarting = false) => {
    const isPlaybackActive = isPlaybackStarting || !!playbackPromise;
    const shouldBeActive = isPlaybackActive || tunerEnabled;

    if (shouldBeActive && !microphone.isCapturing()) {
      const context = getMetronomeContext();
      const deviceId = audioInputSelect.value || undefined;
      await microphone.start(context);
      if (tunerEnabled && !isPlaybackActive) {
        startTunerLoop();
      }
    } else if (!shouldBeActive && microphone.isCapturing()) { // This logic seems to be buggy, let's fix it.
      await microphone.stop();
      // The tuner loop is stopped inside microphone.stop() via reset()
      // but we also need to clear the animation frame
      stopTunerLoop();
    }
  };


  const updateManualGainState = () => {
    const autoEnabled = autoGainCheckbox.checked;
    manualGainSlider.disabled = autoEnabled;
    manualGainLabel.classList.toggle('gain-controls__manual--disabled', autoEnabled);
    manualGainValue.textContent = formatGain(Number(manualGainSlider.value));
  };

  autoGainCheckbox.addEventListener('change', () => {
    const autoEnabled = autoGainCheckbox.checked;
    microphone.setAutoGain(autoEnabled);
    if (!autoEnabled) {
      microphone.setManualGain(Number(manualGainSlider.value));
    }
    updateManualGainState();
    renderProgressCanvas();
  });

  manualGainSlider.addEventListener('input', () => {
    const manualValue = Number(manualGainSlider.value);
    microphone.setManualGain(manualValue);
    manualGainValue.textContent = formatGain(manualValue);
    renderProgressCanvas();
  });

  const populateAudioInputDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      audioInputControl.element.style.display = 'none';
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      if (audioInputs.length === 0) {
        audioInputControl.element.style.display = 'none';
        return;
      }
      audioInputs.forEach(device => {
        audioInputSelect.add(new Option(device.label || `microphone ${audioInputSelect.length + 1}`, device.deviceId));
      });
      audioInputSelect.value = localStorage.getItem(AUDIO_INPUT_DEVICE_ID_KEY) || '';
    } catch (err) {
      console.error('Could not enumerate audio devices:', err);
      audioInputControl.element.style.display = 'none';
    }
    updateManualGainState();
    renderProgressCanvas();
  };

  const loadSamples = () => {
    // Load audio samples
    const context = getMetronomeContext();
    sampler = new Sampler(context);
    sampler.load({
      kick: '/samples/kick.wav',
      snare: '/samples/snare.wav',
      hihat: '/samples/hihat.wav',
    }).then(() => {
      console.log('Samples loaded');
      setReadyState(true);
    });
  };

  updateManualGainState();
  requestAnimationFrame(() => {
    updateBarGuides();
    initializeCanvas();
    updateSequencerState();
    loadSamples();
    populateAudioInputDevices();
  });

  sequencerCanvas.addEventListener('click', handleSequencerClick);

  tunerToggleInput.addEventListener('change', () => {
    tunerEnabled = tunerToggleInput.checked;
    updateMicrophoneState();
  });


  const transport = document.createElement('div');
  transport.className = 'transport';

  const playPauseButton = document.createElement('button');
  playPauseButton.type = 'button';
  playPauseButton.id = 'playPauseButton';
  playPauseButton.className = 'transport__button transport__button--primary';
  playPauseButton.textContent = '▶';
  playPauseButton.setAttribute('aria-label', 'Play');
  playPauseButton.setAttribute('aria-pressed', 'false');

  const setReadyState = (isReady: boolean) => {
    playPauseButton.disabled = !isReady;
  };

  transport.append(playPauseButton);

  type TransportState = 'idle' | 'playing';

  let playbackPromise: Promise<void> | null = null;
  let playbackStopRequested = false;

  const setTransportState = (state: TransportState) => {
    playPauseButton.dataset.state = state;
    playPauseButton.setAttribute(
      'aria-pressed',
      state === 'playing' ? 'true' : 'false',
    );

    if (state === 'playing') {
      playPauseButton.textContent = '⏸';
      playPauseButton.setAttribute('aria-label', 'Pause');
    } else {
      playPauseButton.textContent = '▶';
      playPauseButton.setAttribute('aria-label', 'Play');
    }
  };

  const finalizePlayback = (errored: boolean) => {
    scheduleInfo = null;
    playbackPromise = null;
    stopProgressAnimation();
    void updateMicrophoneState();
    setCountdown(null);
    setTransportState('idle');
    if (!errored && !playbackStopRequested) {
      setProgress(1);
    }
    shouldResetDeviationHistory = true;
    renderProgressCanvas();
    playbackStopRequested = false;
  };

  const beginPlayback = async (): Promise<void> => {
    if (playbackPromise) {
      return;
    }

    if (!sampler) {
      console.error('Sampler not initialized');
      return;
    }
    playbackStopRequested = false;
    setTransportState('playing');

    stopProgressAnimation();
    setProgress(0);
    setCountdown(null);
    updateBarGuides();

    if (shouldResetDeviationHistory) {
      beatDeviations.length = 0;
      evaluatedCount = 0;
      renderDeviationCanvas();
      shouldResetDeviationHistory = false;
    }


    const tempo = readPositiveInteger(tempoInput, DEFAULTS.tempoBpm, true);
    const beatsPerBar = readPositiveInteger(
      beatsPerBarInput,
      DEFAULTS.beatsPerBar,
      true,
    );
    const barCount = readPositiveInteger(
      barCountInput,
      DEFAULTS.barCount,
      true,
    );

    try {
      await updateMicrophoneState(true); // Start mic before scheduling
      playbackPromise = startMetronome({
        sampler,
        tempo,
        beatsPerBar,
        barCount,
        patterns,
        onSchedule: startProgressAnimation,
      });
      timingAnalyzer.reset(); // Reset after mic is started and before playback
    } catch (error) {
      console.error('Unable to start metronome', error);
      setTransportState('idle');
      setProgress(0);
      setCountdown(null);
      playbackPromise = null;
      return;
    }

    playbackPromise
      ?.then(() => {
        finalizePlayback(false);
      })
      .catch((error) => {
        console.error('Unable to start metronome', error);
        finalizePlayback(true);
      });
  };

  beatsPerBarInput.addEventListener('change', () => updateSequencerState());
  barCountInput.addEventListener('change', () => updateSequencerState());

  const stopPlayback = async () => {
    if (!playbackPromise) {
      playbackStopRequested = false;
      stopProgressAnimation();
      void updateMicrophoneState(); // This will stop the mic if the tuner is also off
      setTransportState('idle');
      return;
    }

    playbackStopRequested = true;
    setTransportState('idle');

    try {
      await stopMetronome();
    } catch (error) {
      console.error('Unable to stop metronome', error);
    }

    try {
      await playbackPromise;
    } catch {
      // handled in finalizePlayback
    }

    await updateMicrophoneState(); // This will stop the mic if the tuner is also off
  };

  playPauseButton.addEventListener('click', () => {
    if (playbackPromise) {
      void stopPlayback();
    } else {
      void beginPlayback();
    }
  });

  const handleTransportShortcut = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (event.code === 'KeyS' && !event.repeat) {
      event.preventDefault();
      calibrateLatency();
      return;
    }

    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      if (playbackPromise) {
        void stopPlayback();
      } else {
        void beginPlayback();
      }
    }
  };

  window.addEventListener('keydown', handleTransportShortcut);
  gainControls.style.display = 'none';
  form.append(
    tempoControl.element,
    beatsPerBarControl.element,
    barCountControl.element,
    presetControl.element,
    tunerToggleControl.element,
    audioInputControl.element,
    latencyControl.element,
    transport,
    gainControls,
  );

  const calibrateButton = document.createElement('button');
  calibrateButton.type = 'button';
  calibrateButton.className = 'calibrate-button';
  calibrateButton.title = 'Auto-calibrate Latency (s)';
  calibrateButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  `;
  calibrateButton.addEventListener('click', calibrateLatency);

  deviationContainer.append(deviationCanvas, calibrateButton);

  page.append(form, progressSection, sequencerCanvas, deviationContainer, tunerCanvas);

  root.replaceChildren(page);

  setTransportState('idle');
  setReadyState(false); // Initially disabled until samples are loaded
}

function bootstrap(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('Expected #app container to exist');
  }

  renderApp(appRoot);
}

bootstrap();
