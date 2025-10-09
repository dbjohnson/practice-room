import './styles.css';
import { startMetronome, stopMetronome } from './audio/metronome';
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

    canvasContext.fillStyle = 'rgba(255, 255, 255, 0.35)';
    canvasContext.fillRect(0, trackY, canvasCssWidth, trackHeight);

    if (progressBeatsPerBar > 0 && progressBarCount > 0) {
      canvasContext.save();
      const totalBeats = progressBeatsPerBar * progressBarCount;
      const beatWidth =
        totalBeats > 0 ? canvasCssWidth / totalBeats : canvasCssWidth;

      canvasContext.fillStyle = 'rgba(255, 255, 255, 0.18)';
      const beatLineHeight = canvasCssHeight * 0.25;
      const beatLineY = (canvasCssHeight - beatLineHeight) / 2;
      for (let beat = 1; beat < totalBeats; beat += 1) {
        if (beat % progressBeatsPerBar === 0) {
          continue;
        }
        const beatX = Math.round(beat * beatWidth) + 0.5;
        canvasContext.fillRect(beatX, beatLineY, 1, beatLineHeight);
      }

      canvasContext.fillStyle = 'rgba(255, 255, 255, 0.28)';
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
  playPauseButton.textContent = 'Play';
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
      playPauseButton.textContent = 'Stop';
      playPauseButton.setAttribute('aria-label', 'Stop');
    } else {
      playPauseButton.textContent = 'Play';
      playPauseButton.setAttribute('aria-label', 'Play');
    }
  };

  const finalizePlayback = (errored: boolean) => {
    playbackPromise = null;
    stopProgressAnimation();
    setCountdown(null);
    setTransportState('idle');
    if (errored || playbackStopRequested) {
      setProgress(0);
    } else {
      setProgress(1);
    }
    playbackStopRequested = false;
  };

  const beginPlayback = () => {
    if (playbackPromise) {
      return;
    }

    playbackStopRequested = false;
    setTransportState('playing');

    stopProgressAnimation();
    setProgress(0);
    setCountdown(null);
    updateBarGuides();

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
      setProgress(0);
      setCountdown(null);
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
  };

  playPauseButton.addEventListener('click', () => {
    if (playbackPromise) {
      void stopPlayback();
    } else {
      beginPlayback();
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
      beginPlayback();
    }
  };

  window.addEventListener('keydown', handleTransportShortcut);
  setTransportState('idle');

  form.append(tempoControl, beatsPerBarControl, barCountControl, transport);
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
