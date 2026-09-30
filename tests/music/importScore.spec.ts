import { describe, expect, it } from 'vitest';
import { importScore } from '../../src/music/importScore';
const xml = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><work><work-title>Test melody</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;
describe('score import boundary', () => {
  it('parses MusicXML and deduplicates identical bytes', async () => {
    const first = await importScore(new File([xml], 'melody.musicxml'));
    const again = await importScore(new File([xml], 'renamed.xml'));
    expect(first.piece.title.replace(/\s/g, ' ')).toBe('Test melody');
    expect(first.piece.bars).toBe(1);
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
});
