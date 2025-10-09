import './styles.css';
import { startMetronome } from './audio/metronome';
import type { MetronomeSchedule } from './audio/metronome';

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

  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress__label';
  progressLabel.textContent = 'Pattern progress';

  const progressCanvas = document.createElement('canvas');
  progressCanvas.className = 'progress__canvas';
  progressCanvas.setAttribute('aria-hidden', 'true');

  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress__container';
  progressContainer.append(progressCanvas);

  progressSection.append(progressLabel, progressContainer);

  const canvasContext = progressCanvas.getContext('2d');
  if (!canvasContext) {
    console.warn('Progress canvas unavailable; visuals will be limited');
  }

  let animationFrameId: number | null = null;
  let progressAmount = 0;
  let canvasCssWidth = 0;
  let canvasCssHeight = 0;
  let countdownValue: number | null = null;

  const renderProgressCanvas = () => {
    if (canvasCssWidth <= 0 || canvasCssHeight <= 0) {
      return;
    }

    if (!canvasContext) {
      return;
    }

    canvasContext.clearRect(0, 0, canvasCssWidth, canvasCssHeight);

    const trackHeight = Math.max(12, canvasCssHeight * 0.22);
    const trackY = (canvasCssHeight - trackHeight) / 2;

    canvasContext.fillStyle = 'rgba(255, 255, 255, 0.16)';
    canvasContext.fillRect(0, trackY, canvasCssWidth, trackHeight);

    const indicatorWidth = Math.max(6, canvasCssWidth * 0.012);
    const indicatorX = progressAmount * canvasCssWidth;
    const indicatorLeft = indicatorX - indicatorWidth / 2;

    canvasContext.fillStyle = '#f6f9ff';
    canvasContext.fillRect(indicatorLeft, 0, indicatorWidth, canvasCssHeight);

    const glowWidth = Math.max(indicatorWidth * 4, canvasCssWidth * 0.04);
    const glowLeft = indicatorX - glowWidth / 2;

    canvasContext.fillStyle = 'rgba(110, 176, 255, 0.28)';
    canvasContext.fillRect(
      glowLeft,
      trackY - trackHeight * 0.4,
      glowWidth,
      trackHeight * 1.8,
    );

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
  }: MetronomeSchedule): void => {
    stopProgressAnimation();

    if (playbackDuration <= 0) {
      setProgress(1);
      setCountdown(null);
      return;
    }

    setCountdown(countInBeats);

    const renderProgress = () => {
      const now = audioContext.currentTime;
      let shouldContinue = true;

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
  requestAnimationFrame(initializeCanvas);
  setCountdown(null);

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

  const tempoSelect = tempoControl.querySelector<HTMLSelectElement>('select');
  const beatsPerBarSelect =
    beatsPerBarControl.querySelector<HTMLSelectElement>('select');
  const barCountSelect =
    barCountControl.querySelector<HTMLSelectElement>('select');

  if (!tempoSelect || !beatsPerBarSelect || !barCountSelect) {
    throw new Error('Missing select controls');
  }

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.id = 'startButton';
  startButton.className = 'controls__button';
  startButton.textContent = 'Start';

  let isPlaying = false;

  startButton.addEventListener('click', async () => {
    if (isPlaying) {
      return;
    }

    isPlaying = true;
    startButton.disabled = true;
    stopProgressAnimation();
    setProgress(0);
    setCountdown(null);

    const tempo = Number(tempoSelect.value);
    const beatsPerBar = Number(beatsPerBarSelect.value);
    const barCount = Number(barCountSelect.value);

    try {
      await startMetronome({
        tempo,
        beatsPerBar,
        barCount,
        onSchedule: startProgressAnimation,
      });
    } catch (error) {
      console.error('Unable to start metronome', error);
    } finally {
      stopProgressAnimation();
      setProgress(1);
      setCountdown(null);
      startButton.disabled = false;
      isPlaying = false;
    }
  });

  form.append(tempoControl, beatsPerBarControl, barCountControl, startButton);
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
