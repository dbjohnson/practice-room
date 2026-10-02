import { model } from '@coderline/alphatab';

const originals = new WeakMap<
  model.Score,
  {
    bars: { bar: model.MasterBar; feel: model.TripletFeel }[];
    beats: { beat: model.Beat; start: number; duration: number }[];
  }
>();

/** 0 = even eighths, 50 = triplet swing (2:1), 100 = dotted swing (3:1). */
export function swingTick(tick: number, amount: number): number {
  const strength = Number.isFinite(amount) ? Math.max(0, Math.min(100, amount)) : 0;
  const ratio = 1 + strength / 50;
  const split = (960 * ratio) / (ratio + 1);
  const quarter = Math.floor(tick / 960) * 960;
  const within = tick - quarter;
  return Math.round(
    quarter +
      (within <= 480 ? (within * split) / 480 : split + ((within - 480) * (960 - split)) / 480),
  );
}

export function writtenSwing(score: model.Score): number {
  const feel = originals.get(score)?.bars[0]?.feel ?? score.masterBars[0]?.tripletFeel;
  return feel === model.TripletFeel.Triplet8th
    ? 50
    : feel === model.TripletFeel.Dotted8th
      ? 100
      : 0;
}

/** Change playback positions before MIDI generation so its cursor/assessment cache agrees. */
export function applySwing(score: model.Score, amount: number | null) {
  let original = originals.get(score);
  if (!original) {
    original = {
      bars: score.masterBars.map((bar) => ({ bar, feel: bar.tripletFeel })),
      beats: score.tracks.flatMap((track) =>
        track.staves.flatMap((staff) =>
          staff.bars.flatMap((bar) =>
            bar.voices.flatMap((voice) =>
              voice.beats.map((beat) => ({
                beat,
                start: beat.playbackStart,
                duration: beat.playbackDuration,
              })),
            ),
          ),
        ),
      ),
    };
    originals.set(score, original);
  }
  for (const { bar, feel } of original.bars)
    bar.tripletFeel = amount === null ? feel : model.TripletFeel.NoTripletFeel;
  for (const { beat, start, duration } of original.beats) {
    // Written tuplets and grace ornaments retain their explicit timing.
    if (amount === null || beat.hasTuplet || beat.graceType !== model.GraceType.None) {
      beat.playbackStart = start;
      beat.playbackDuration = duration;
    } else {
      beat.playbackStart = swingTick(start, amount);
      beat.playbackDuration = swingTick(start + duration, amount) - beat.playbackStart;
    }
  }
}
