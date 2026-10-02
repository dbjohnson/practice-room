import { useCallback, useEffect, useRef, useState } from 'react';
import type { Take } from '../domain/types';
import {
  recordingCoordinate,
  type AudioRecordingSession,
  type RecordingData,
  type RecordingPosition,
} from '../audio/recording';
import { clearRecordings, readRecording, storeRecording } from '../storage/recordings';

export type RecordAudio = (onPeak: (peak: number) => void) => AudioRecordingSession;
export interface TakeWaveform {
  pieceId: string;
  track: number;
  points: { tick: number; peak: number }[];
}
type SelectedAudio = { take: Take; data: RecordingData };

export function useTakeAudio(notify: (message: string) => void) {
  const [selected, setSelected] = useState<SelectedAudio | null>(null);
  const [waveform, setWaveform] = useState<TakeWaveform | null>(null);
  const [processing, setProcessing] = useState(false);
  const cache = useRef(new Map<string, RecordingData>());
  const generation = useRef(0);
  const finishing = useRef(false);
  const active = useRef<{
    session: AudioRecordingSession;
    timeline: RecordingPosition[];
    waveform: TakeWaveform;
    swing: number | null;
  } | null>(null);
  const display = useCallback((take: Take, data: RecordingData) => {
    setSelected({ take, data });
    setWaveform({
      pieceId: take.pieceId,
      track: take.audio?.track ?? 0,
      points: data.peaks.map((peak, i) => ({
        tick: recordingCoordinate(
          data.timeline,
          (i / data.peaks.length) * data.duration,
          'seconds',
        ),
        peak,
      })),
    });
  }, []);
  const begin = (
    record: RecordAudio | undefined,
    pieceId: string,
    track: number,
    swing: number | null,
  ) => {
    if (!record) return;
    if (finishing.current) throw new Error('Wait for the previous recording to finish saving.');
    generation.current++;
    const next: TakeWaveform = { pieceId, track, points: [] };
    const session = record((peak) => {
      const current = active.current;
      const position = current?.timeline.at(-1);
      if (!current || !position) return;
      current.waveform.points.push({ tick: position.tick, peak });
      setWaveform({ ...current.waveform, points: [...current.waveform.points] });
    });
    active.current = { session, timeline: [], waveform: next, swing };
    setSelected(null);
    setWaveform(next);
  };
  const position = useCallback((tick: number, seconds: number, startTick: number) => {
    const current = active.current;
    if (!current) return;
    if (!current.timeline.length) current.timeline.push({ tick: startTick, seconds: 0 });
    const previous = current.timeline.at(-1)!;
    if (tick > previous.tick && seconds > previous.seconds)
      current.timeline.push({ tick, seconds });
  }, []);
  const finish = useCallback(
    async (
      take: Take,
      origin: number | null,
      ended: number,
      refine?: (blob: Blob) => Promise<Take>,
    ) => {
      const current = active.current;
      active.current = null;
      if (!current) return take;
      const token = generation.current;
      finishing.current = true;
      setProcessing(true);
      try {
        const audio = await current.session.finish(origin, ended);
        if (!audio) return take;
        const data: RecordingData = { ...audio, timeline: current.timeline };
        const assessed = refine ? await refine(audio.blob) : take;
        const result = {
          ...assessed,
          audio: { duration: data.duration, track: current.waveform.track, swing: current.swing },
        };
        cache.current.set(take.id, data);
        if (token === generation.current) display(result, data);
        return result;
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not finish the audio recording.');
        return take;
      } finally {
        finishing.current = false;
        setProcessing(false);
      }
    },
    [display, notify],
  );
  const snapshot = useCallback(
    async (
      take: Take,
      origin: number | null,
      ended: number,
      refine?: (blob: Blob) => Promise<Take>,
    ) => {
      const current = active.current;
      if (!current || origin === null) return take;
      const timeline = [...current.timeline];
      // The recorder remains connected; only the displayed pass/tick map resets.
      current.timeline = [];
      current.waveform = { ...current.waveform, points: [] };
      setWaveform(current.waveform);
      if (!current.session.snapshot) return take;
      try {
        const audio = await current.session.snapshot(origin, ended);
        if (!audio) return take;
        const data = { ...audio, timeline };
        const assessed = refine ? await refine(audio.blob) : take;
        const result = {
          ...assessed,
          audio: { duration: data.duration, track: current.waveform.track, swing: current.swing },
        };
        cache.current.set(take.id, data);
        // A completed clip can be reviewed later without replacing the active waveform.
        if (active.current === current) setSelected({ take: result, data });
        else if (selected?.take.id === take.id) display(result, data);
        return result;
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not prepare this pass recording.');
        return take;
      }
    },
    [display, notify, selected],
  );
  const load = async (take: Take) => {
    const token = ++generation.current;
    try {
      const data = cache.current.get(take.id) ?? (await readRecording(take.id));
      if (token !== generation.current) return null;
      if (!data) throw new Error('The audio for this take is not available on this device.');
      cache.current.set(take.id, data);
      display(take, data);
      return data;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open the recording.');
      return null;
    }
  };
  const save = async (take: Take) => {
    const data = cache.current.get(take.id);
    if (take.audio && data) await storeRecording(take.id, data);
  };
  const clear = () => {
    generation.current++;
    cache.current.clear();
    setSelected(null);
    setWaveform(null);
    void clearRecordings().catch(() =>
      notify('Could not remove saved recordings from this browser.'),
    );
  };
  useEffect(
    () => () => {
      generation.current++;
      const current = active.current;
      active.current = null;
      if (current) void current.session.finish(null, performance.now() / 1000).catch(() => {});
    },
    [],
  );
  return { selected, waveform, processing, begin, position, snapshot, finish, load, save, clear };
}
