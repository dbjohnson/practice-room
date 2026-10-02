import { midi, model, Settings } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { secondsBetween } from '../../src/music/scoreTimeline';
import { takeFixture } from '../app/takeFixture';

describe('passage timing', () => {
  it('measures a steady score in either direction', () => {
    const { player, startTick, endTick } = takeFixture();
    // One 4/4 bar at the study's written 72 BPM.
    expect(secondsBetween(player.tickCache, startTick, endTick)).toBeCloseTo((4 * 60) / 72, 6);
    expect(secondsBetween(player.tickCache, endTick, startTick)).toBeCloseTo(-(4 * 60) / 72, 6);
    expect(secondsBetween(player.tickCache, startTick, startTick)).toBe(0);
  });
  it('follows a written tempo change inside the passage', () => {
    const score = new model.Score();
    const track = new model.Track();
    score.addTrack(track);
    const staff = new model.Staff();
    track.addStaff(staff);
    [60, 120].forEach((tempo) => {
      const master = new model.MasterBar();
      master.tempoAutomations.push(model.Automation.buildTempoAutomation(false, 0, tempo, 2));
      score.addMasterBar(master);
      const bar = new model.Bar();
      staff.addBar(bar);
      const voice = new model.Voice();
      bar.addVoice(voice);
      for (let i = 0; i < 4; i++) {
        const beat = new model.Beat();
        beat.duration = model.Duration.Quarter;
        voice.addBeat(beat);
      }
    });
    score.finish(new Settings());
    const generator = new midi.MidiFileGenerator(
      score,
      null,
      new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()),
    );
    generator.generate();
    // Four beats at 60 BPM, then two of the four at 120 BPM.
    expect(secondsBetween(generator.tickLookup, 0, 960 * 6)).toBeCloseTo(4 + 1, 6);
    expect(secondsBetween(generator.tickLookup, 960 * 3, 960 * 5)).toBeCloseTo(1 + 0.5, 6);
  });
});
