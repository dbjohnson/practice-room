import './styles.css';
import {
  getMetronomeContext,
  startMetronome,
  stopMetronome,
} from './audio/metronome';
import type { MetronomeSchedule } from './audio/metronome';
import { MicrophoneRecorder } from './audio/microphoneRecorder';

interface TempoControlConfig {
  id: string;
  label: string;
  options: Array<{ label: string; value: number }>;
  defaultValue: number;
}

const DEFAULTS = {
  tempoBpm: 90,
  beatsPerBar: 4,
  barCount: 4,
};

const formatGain = (gain: number): string => gain.toFixed(1);

function createSelect({
  id,
  label,
  options,
  defaultValue,
}: TempoControlConfig): HTMLLabelElement {
  const selectLabel = document.createElement('label');
  selectLabel.setAttribute('for', id);
  selectLabel.className = 'control';

  const title = document.createElement('span');
  title.textContent = label;
  title.className = 'control__label';

  const select = document.createElement('select');
  select.id = id;
  select.name = id;
  select.className = 'control__input';

  for (const option of options) {
    const optionElement = document.createElement('option');
    optionElement.value = String(option.value);
    optionElement.textContent = option.label;
    if (option.value === defaultValue) {
      optionElement.selected = true;
    }
    select.append(optionElement);
  }

  selectLabel.append(title, select);
  return selectLabel;
}

function renderApp(root: HTMLElement): void {
  const page = document.createElement('main');
  page.className = 'app';

  const heading = document.createElement('h1');
  heading.textContent = 'Tempo Trainer';

  const form = document.createElement('form');
  form.className = 'controls';
  form.setAttribute('aria-label', 'Tempo configuration');

  const progressSection = document.createElement('section');
  progressSection.className = 'progress';

  const progressCanvas = document.createElement('canvas');
  progressCanvas.className = 'progress__canvas';
  progressCanvas.setAttribute('aria-hidden', 'true');

  const microphone = new MicrophoneRecorder();

  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress__container';
  progressContainer.append(progressCanvas);

  progressSection.append(progressContainer);

  const canvasContext = progressCanvas.getContext('2d');
  if (!canvasContext) {
    console.warn('Progress canvas unavailable; visuals will be limited');
  }

  let animationFrameId: number | null = null;
  let progressAmount = 0;
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;
  let countdownValue: number | null = null;
  let progressBeatsPerBar = 0;
  let progressBarCount = 0;

  const renderProgressCanvas = () => {
    if (canvasCssWidth <= 0 || canvasCssHeight <= 0) {
      return;
    }

    if (!canvasContext) {
      return;
    }

    canvasContext.clearRect(0, 0, canvasCssWidth, canvasCssHeight);

    const trackHeight = Math.max(1, Math.min(2, canvasCssHeight * 0.02));
    const trackY = (canvasCssHeight - trackHeight) / 2;

    canvasContext.fillStyle = 'rgba(255, 255, 255, 0.24)';
    canvasContext.fillRect(0, trackY, canvasCssWidth, trackHeight);

    const waveform = microphone.getPeaks();
    if (waveform.lastIndex >= 0) {
      const points = waveform.min.length;
      const upper = waveform.max;
      const lower = waveform.min;
      const amplitude = canvasCssHeight * 0.3;
      const midY = canvasCssHeight / 2;
      const displayGain = waveform.gain;

      canvasContext.save();
      canvasContext.beginPath();

      let started = false;
      for (let i = 0; i <= waveform.lastIndex; i += 1) {
        const x = (i / Math.max(1, points - 1)) * canvasCssWidth;
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
        const x = (i / Math.max(1, points - 1)) * canvasCssWidth;
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
      const beatWidth =
        totalBeats > 0 ? canvasCssWidth / totalBeats : canvasCssWidth;

      canvasContext.fillStyle = 'rgba(255, 194, 122, 0.45)';
      const beatLineHeight = canvasCssHeight * 0.25;
      const beatLineY = (canvasCssHeight - beatLineHeight) / 2;
      for (let beat = 1; beat < totalBeats; beat += 1) {
        if (beat % progressBeatsPerBar === 0) {
          continue;
        }
        const beatX = Math.round(beat * beatWidth) + 0.5;
        canvasContext.fillRect(beatX, beatLineY, 1, beatLineHeight);
      }

      canvasContext.fillStyle = 'rgba(255, 226, 133, 0.75)';
      const barWidth = beatWidth * progressBeatsPerBar;
      const barLineHeight = canvasCssHeight * 0.75;
      const barLineY = (canvasCssHeight - barLineHeight) / 2;

      for (let bar = 0; bar <= progressBarCount; bar += 1) {
        const x = Math.round(bar * barWidth) + 0.5;
        canvasContext.fillRect(x, barLineY, 1, barLineHeight);
      }
      canvasContext.restore();
    }

    const indicatorWidth = Math.max(3, canvasCssWidth * 0.006);
    const indicatorX = progressAmount * canvasCssWidth;
    const indicatorLeft = indicatorX - indicatorWidth / 2;

    canvasContext.fillStyle = '#f6f9ff';
    canvasContext.fillRect(indicatorLeft, 0, indicatorWidth, canvasCssHeight);

    if (countdownValue && countdownValue > 0) {
      const text = String(countdownValue);
      const fontSize = Math.min(canvasCssHeight * 0.42, 64);
      canvasContext.save();
      canvasContext.font = `600 ${fontSize}px 'Segoe UI', Tahoma, sans-serif`;
      canvasContext.textAlign = 'center';
      canvasContext.textBaseline = 'middle';
      canvasContext.fillStyle = 'rgba(246, 249, 255, 0.95)';
      canvasContext.shadowColor = 'rgba(110, 176, 255, 0.45)';
      canvasContext.shadowBlur = fontSize * 0.35;
      canvasContext.shadowOffsetX = 0;
      canvasContext.shadowOffsetY = 0;
      canvasContext.fillText(text, canvasCssWidth / 2, canvasCssHeight / 2);
      canvasContext.restore();
    }
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

    if (!canvasContext) {
      return;
    }

    canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    canvasContext.scale(dpr, dpr);

    renderProgressCanvas();
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
      microphone.captureSample(now, playbackStartTime, playbackDuration);

      if (now < playbackStartTime) {
        if (now < startTime) {
          setCountdown(countInBeats);
        } else {
          const remainingBeats = Math.ceil(
            (playbackStartTime - now) / secondsPerBeat,
          );
          setCountdown(remainingBeats > 0 ? remainingBeats : null);
        }
        setProgress(0);
      } else {
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

  const tempoControl = createSelect({
    id: 'tempo',
    label: 'Tempo (BPM)',
    defaultValue: DEFAULTS.tempoBpm,
    options: [
      { label: '60', value: 60 },
      { label: '75', value: 75 },
      { label: '90', value: 90 },
      { label: '105', value: 105 },
      { label: '120', value: 120 },
    ],
  });

  const beatsPerBarControl = createSelect({
    id: 'beatsPerBar',
    label: 'Beats per bar',
    defaultValue: DEFAULTS.beatsPerBar,
    options: [
      { label: '2', value: 2 },
      { label: '3', value: 3 },
      { label: '4', value: 4 },
      { label: '5', value: 5 },
      { label: '6', value: 6 },
    ],
  });

  const barCountControl = createSelect({
    id: 'barCount',
    label: 'Bars',
    defaultValue: DEFAULTS.barCount,
    options: [
      { label: '1', value: 1 },
      { label: '2', value: 2 },
      { label: '3', value: 3 },
      { label: '4', value: 4 },
      { label: '5', value: 5 },
      { label: '6', value: 6 },
      { label: '8', value: 8 },
    ],
  });

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

  const tempoSelect = tempoControl.querySelector<HTMLSelectElement>('select');
  const beatsPerBarSelect =
    beatsPerBarControl.querySelector<HTMLSelectElement>('select');
  const barCountSelect =
    barCountControl.querySelector<HTMLSelectElement>('select');

  if (!tempoSelect || !beatsPerBarSelect || !barCountSelect) {
    throw new Error('Missing select controls');
  }

  const updateBarGuides = () => {
    const beatsPerBar = Number(beatsPerBarSelect.value);
    const barCount = Number(barCountSelect.value);
    progressBeatsPerBar =
      beatsPerBar > 0 ? beatsPerBar : DEFAULTS.beatsPerBar;
    progressBarCount = barCount > 0 ? barCount : DEFAULTS.barCount;
    renderProgressCanvas();
  };
  beatsPerBarSelect.addEventListener('change', updateBarGuides);
  barCountSelect.addEventListener('change', updateBarGuides);

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

  updateManualGainState();
  requestAnimationFrame(() => {
    updateBarGuides();
    initializeCanvas();
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
    playbackPromise = null;
    stopProgressAnimation();
    void microphone.stop();
    setCountdown(null);
    setTransportState('idle');
    if (!errored && !playbackStopRequested) {
      setProgress(1);
    }
    playbackStopRequested = false;
  };

  const beginPlayback = async (): Promise<void> => {
    if (playbackPromise) {
      return;
    }

    playbackStopRequested = false;
    setTransportState('playing');

    stopProgressAnimation();
    setProgress(0);
    setCountdown(null);
    updateBarGuides();
    microphone.reset();

    try {
      const context = getMetronomeContext();
      if (!autoGainCheckbox.checked) {
        microphone.setManualGain(Number(manualGainSlider.value));
      }
      await microphone.start(context);
    } catch (error) {
      console.error('Unable to prepare microphone input', error);
    }

    const tempo = Number(tempoSelect.value);
    const beatsPerBar = Number(beatsPerBarSelect.value);
    const barCount = Number(barCountSelect.value);

    try {
      playbackPromise = startMetronome({
        tempo,
        beatsPerBar,
        barCount,
        onSchedule: startProgressAnimation,
      });
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

  const stopPlayback = async () => {
    if (!playbackPromise) {
      playbackStopRequested = false;
      stopProgressAnimation();
      void microphone.stop();
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

    await microphone.stop();
  };

  playPauseButton.addEventListener('click', () => {
    if (playbackPromise) {
      void stopPlayback();
    } else {
      void beginPlayback();
    }
  });

  const handleTransportShortcut = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat) {
      return;
    }

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

    event.preventDefault();

    if (playbackPromise) {
      void stopPlayback();
    } else {
      void beginPlayback();
    }
  };

  window.addEventListener('keydown', handleTransportShortcut);
  setTransportState('idle');

  gainControls.style.display = 'none';
  form.append(
    tempoControl,
    beatsPerBarControl,
    barCountControl,
    gainControls,
    transport,
  );
  page.append(heading, form, progressSection);

  root.replaceChildren(page);
}

function bootstrap(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('Expected #app container to exist');
  }

  renderApp(appRoot);
}

bootstrap();
