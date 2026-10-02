export type GymView = 'exercises' | 'routines' | 'progress';
export type ExerciseInstrument = 'guitar' | 'bass';
export type ScaleDirection = 'ascending' | 'descending' | 'up-down' | 'down-up';
export type PitchPattern = 'straight' | 'thirds' | 'fourths' | 'groups-three' | 'groups-four';
export type ExerciseRhythm =
  | 'original'
  | 'quarters'
  | 'eighths'
  | 'sixteenths'
  | 'triplets'
  | 'dotted'
  | 'swing'
  | 'syncopated';
export type ExerciseArticulation =
  'even' | 'staccato' | 'legato' | 'downbeat' | 'offbeat' | 'alternate';
export type ExerciseSource =
  | {
      kind: 'scale';
      scaleId: string;
      key: number;
      octaves: 0.5 | 1 | 2 | 3;
      direction: ScaleDirection;
      pattern: PitchPattern;
    }
  | { kind: 'notes'; notes: string; key: number }
  | {
      kind: 'score';
      snapshotId: string;
      track: number;
      startBar: number;
      endBar: number;
      key: number;
    };
export interface Exercise {
  id: string;
  title: string;
  description: string;
  instrument: ExerciseInstrument;
  source: ExerciseSource;
  defaults: { tempo: number; rhythm: ExerciseRhythm; articulation: ExerciseArticulation };
  revision: number;
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;
  favorite?: boolean;
}
export interface WorkoutTransform {
  startBpm: number;
  endBpm: number;
  bpmStep: number;
  keyOrder: 'fixed' | 'fifths' | 'fourths' | 'chromatic';
  keyCount: number;
  repetitions: number;
  rhythm: ExerciseRhythm | 'exercise';
  articulation: ExerciseArticulation | 'exercise';
  restSeconds: number;
  target: number;
  requirePass: boolean;
}
export interface RoutineBlock {
  id: string;
  exerciseId: string;
  transform: WorkoutTransform;
}
export interface RoutineOuterLoop {
  tempo?: Pick<WorkoutTransform, 'startBpm' | 'endBpm' | 'bpmStep'>;
  keys?: Pick<WorkoutTransform, 'keyOrder' | 'keyCount'>;
}
export interface GymRoutine {
  id: string;
  title: string;
  description: string;
  blocks: RoutineBlock[];
  outerLoop?: RoutineOuterLoop;
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;
}
export interface GymSet {
  id: string;
  blockId: string;
  exercise: Exercise;
  tempo: number;
  keyOffset: number;
  rhythm: ExerciseRhythm;
  articulation: ExerciseArticulation;
  repetition: number;
  restSeconds: number;
  target: number;
  requirePass: boolean;
  routinePass?: { number: number; total: number };
}
export interface GymTakeContext {
  runId?: string;
  set: GymSet;
}
export interface GymAttempt {
  earnedXp?: number;
  earnedBadges?: string[];
  id: string;
  runId?: string;
  setId: string;
  exerciseId: string;
  title: string;
  revision: number;
  profile: string;
  scaleId?: string;
  key: number;
  tempo: number;
  rhythm: ExerciseRhythm;
  articulation: ExerciseArticulation;
  createdAt: string;
  seconds: number;
  notes: number | null;
  timing: number | null;
  score: number | null;
  coverage: number;
  timingCoverage?: number;
  interrupted: boolean;
}
export interface GymActivity {
  setId?: string;
  completed?: boolean;
  id: string;
  exerciseId: string;
  runId?: string;
  createdAt: string;
  seconds: number;
  kind: 'record' | 'along';
}
export interface GymRun {
  id: string;
  routineId?: string;
  title: string;
  queue: GymSet[];
  index: number;
  status: 'active' | 'paused' | 'completed';
  startedAt: string;
  completedAt?: string;
  restUntil: number;
  completedSets: string[];
  skippedSets: string[];
}
export interface CompletedGymRun {
  id: string;
  routineId?: string;
  title: string;
  completedAt: string;
  sets: number;
  completed: number;
  skipped: number;
}
export interface GymData {
  schema: 1;
  earnedBadges: Record<string, string>;
  exercises: Exercise[];
  routines: GymRoutine[];
  attempts: GymAttempt[];
  activities: GymActivity[];
  completedRuns: CompletedGymRun[];
  run: GymRun | null;
  dailyGoalMinutes: number;
}
export const emptyGym = (): GymData => ({
  schema: 1,
  earnedBadges: {},
  exercises: [],
  routines: [],
  attempts: [],
  activities: [],
  completedRuns: [],
  run: null,
  dailyGoalMinutes: 15,
});
export const defaultTransform = (tempo = 80): WorkoutTransform => ({
  startBpm: tempo,
  endBpm: tempo,
  bpmStep: 4,
  keyOrder: 'fixed',
  keyCount: 1,
  repetitions: 1,
  rhythm: 'exercise',
  articulation: 'exercise',
  restSeconds: 5,
  target: 95,
  requirePass: false,
});
export const rhythmLabels: Record<ExerciseRhythm, string> = {
  original: 'Written rhythm',
  quarters: 'Quarter notes',
  eighths: 'Eighth notes',
  sixteenths: 'Sixteenth notes',
  triplets: 'Eighth-note triplets',
  dotted: 'Dotted pairs',
  swing: 'Swung pairs',
  syncopated: 'Syncopation',
};
export const articulationLabels: Record<ExerciseArticulation, string> = {
  even: 'Even',
  staccato: 'Staccato',
  legato: 'Legato',
  downbeat: 'Accent strong beats',
  offbeat: 'Accent offbeats',
  alternate: 'Alternate picking',
};
export const patternLabels: Record<PitchPattern, string> = {
  straight: 'Stepwise',
  thirds: 'In thirds',
  fourths: 'In fourths',
  'groups-three': 'Groups of three',
  'groups-four': 'Groups of four',
};
