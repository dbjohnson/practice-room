import { describe, expect, it } from 'vitest';
import { importBytes, importScore } from '../../src/music/importScore';
import { midiFile, name, note, tempo } from './midi/midiFixture';
const xml = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><work><work-title>Test melody</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
describe('score import boundary', () => {
  it('parses MusicXML and deduplicates identical bytes', async () => {
    const first = await importScore(new File([xml], 'melody.musicxml'));
    const again = await importScore(new File([xml], 'renamed.xml'));
    expect(first.piece.title.replace(/\s/g, ' ')).toBe('Test melody');
    expect(first.piece.bars).toBe(1);
    expect(first.piece.key).toBe('C major');
    expect(first.score.tracks).toHaveLength(1);
    expect(first.piece.id).toBe(again.piece.id);
    expect(first.bytes.byteLength).toBeGreaterThan(0);
  });
  it('rejects unsupported, corrupt, and oversized files with actionable messages', async () => {
    await expect(importScore(new File(['audio'], 'audio.mp3'))).rejects.toThrow(
      'Choose a Guitar Pro',
    );
    await expect(importScore(new File(['invalid'], 'bad.gp'))).rejects.toThrow('could not be read');
    await expect(
      importScore(new File([new Uint8Array(21 * 1024 * 1024)], 'huge.gp')),
    ).rejects.toThrow('20 MB');
  });
  it('imports MIDI with a notation warning and explains unreadable MIDI', async () => {
    const bytes = midiFile([[name('Line'), tempo(96)], note(0, 480, 45)]);
    const result = await importScore(new File([bytes], 'line.mid'));
    expect(result.piece).toMatchObject({
      title: 'Line',
      bpm: 96,
      bars: 1,
      tags: ['MID', '1 parts'],
    });
    expect(result.warnings.join(' ')).toContain('Notated from MIDI');
    await expect(importScore(new File([midiFile([[tempo(90)]])], 'empty.mid'))).rejects.toThrow(
      'does not contain any notes',
    );
  });
  it('records where a found or generated piece came from', async () => {
    const origin = {
      source: 'mutopia',
      name: 'Mutopia Project',
      id: 'a/b.mid',
      licence: 'Public Domain',
      url: 'https://example.test',
    };
    const found = await importBytes('x.mid', midiFile([note(0, 480, 60)]).buffer as ArrayBuffer, {
      ...origin,
      title: 'Etude',
      artist: 'Sor',
    });
    expect(found.piece).toMatchObject({ title: 'Etude', subtitle: 'Sor', origin });
    const tex = new TextEncoder().encode('\\title "Riff"\n:4 0.6 3.6 5.6 3.6 |')
      .buffer as ArrayBuffer;
    const written = await importBytes('piece.alphatex', tex, { ...origin, source: 'generated' });
    expect(written.piece).toMatchObject({ title: 'Riff', bars: 1, tags: ['AI', '1 parts'] });
  });
});

it('uses the generated score key signature for the library key', async () => {
  const bytes = new TextEncoder().encode(
    '\\title "Minor blues"\n\\ks eminor :4 0.6 3.6 5.6 3.6 |',
  ).buffer;
  expect((await importBytes('piece.alphatex', bytes)).piece.key).toBe('E minor');
});
