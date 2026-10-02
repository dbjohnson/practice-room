import type { Exercise, GymSet, GymTakeContext } from './gym';
export type Page = 'practice' | 'library' | 'jam' | 'progress' | 'instrument' | 'gym';
export type View = 'both' | 'score' | 'tab';
export type Feel = 'shuffle' | 'straight' | 'bossa';
export type PracticeMode = 'listen' | 'along' | 'assess';

export interface Chord {
  name: string;
  root: number;
  intervals: number[];
  bars: number;
}
export interface JamRecipe {
  key: string;
  minor: boolean;
  progression: 'ii-V-I' | 'I-IV-V' | '12-bar blues';
  feel: Feel;
  bpm: number;
  chords: Chord[];
  seed: number;
}
export interface Piece {
  id: string;
  title: string;
  subtitle: string;
  source: 'study' | 'import' | 'jam' | 'exercise';
  exercise?: Exercise;
  gymSet?: GymSet;
  bpm: number;
  bars: number;
  key: string;
  tags: string[];
  color: string;
  recipe?: JamRecipe;
  filename?: string;
}
export interface LoopRange {
  start: number;
  end: number;
}
export interface TrackInfo {
  index: number;
  name: string;
  percussion: boolean;
  tuning: number[];
}
export interface ExpectedNote {
  tick: number;
  midi: number;
  bar: number;
  beatId: number;
  eligible: boolean;
  /** Seconds from the start of the passage at the practice tempo. */
  time?: number;
}
export interface Observation {
  time: number;
  midi: number | null;
  confidence: number;
  rms: number;
  /** Attack evidence is independent of whether its pitch could be identified. */
  timingReliable?: boolean;
}
export interface NoteResult {
  bar: number;
  midi: number;
  heard: number | null;
  status: 'matched' | 'pitch' | 'missed' | 'unclear';
  delta: number | null;
  timingStatus?: 'matched' | 'missed' | 'unclear';
  octave?: boolean;
}
export interface Take {
  pass?: number;
  id: string;
  createdAt: string;
  pieceId: string;
  pieceTitle: string;
  trackName: string;
  tempo: number;
  range: LoopRange;
  origin: 'microphone' | 'midi' | 'example';
  notes: NoteResult[];
  pitchAccuracy: number | null;
  timingMs: number | null;
  timingScore?: number | null;
  timingCoverage?: number;
  overallScore?: number | null;
  coverage: number;
  duration: number;
  calibrated: boolean;
  latencyMs?: number;
  /**
   * Whether the removed delay was measured with a cable or reported by the browser.
   * 'calibrated' marks older takes that used a play-along timing calibration.
   */
  latencySource?: 'measured' | 'reported' | 'calibrated';
  /** Median signed distance from the beat: negative is ahead, positive behind. */
  placementMs?: number | null;
  /** Median distance from the player's own average placement. */
  spreadMs?: number | null;
  transpose?: number;
  gym?: GymTakeContext;
  interrupted?: boolean;
  rubric: 'mono-v1' | 'mono-v2' | 'mono-v3' | 'midi-v1';
  audio?: { duration: number; track: number; swing: number | null };
}
export interface InputStatus {
  state: 'off' | 'connecting' | 'ready' | 'error';
  peakDb: number;
  clipped: boolean;
  tunerMidi: number | null;
  deviceId: string;
  deviceLabel: string;
  channelCount: number;
  channel: number;
  /** Input delay reported by the browser for this connection, in milliseconds. */
  latencyMs: number;
  midi: number | null;
  confidence: number;
  error: string | null;
}
export interface PlayerStatus {
  ready: boolean;
  instrumentsReady?: boolean;
  playing: boolean;
  rendering: boolean;
  bar: number;
  tick: number;
  totalTicks: number;
  /** Monotonic performance-clock timestamp of the most recent metronome beat. */
  beatAt?: number;
  tracks: TrackInfo[];
  error: string | null;
}
