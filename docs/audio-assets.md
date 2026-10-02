# Audio assets

Practice Room uses a recorded band in the same alphaTab sequencer as the score,
metronome and count-in. Generated studies and jams also get instrument-specific
phrasing. Imported scores retain their own MIDI expression and arrangements.

| Part               | Recordings                                                                                         | Selection                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Metronome/count-in | Kount's Memory Bank, Woody Block                                                                   | One short woodblock, original pitch/level                                           |
| Drums              | Owner's Kount's Memory Bank Drum Pack                                                              | Limbo kick, Wfl snare/crossstick, Rosedale hats, Swing ride, 60s crash, Jungle toms |
| Bass               | [Karoryfer Black and Blue Basses](https://shop.karoryfer.com/pages/free-black-and-blue-basses)     | Fingered black hollowbody; four recorded velocity layers                            |
| Guitar             | [Karoryfer Black and Green Guitars](https://shop.karoryfer.com/pages/free-black-and-green-guitars) | Green hollowbody; three recorded velocity layers                                    |
| Piano              | [Salamander Grand Piano, Alexander Holm](https://github.com/sfzinstruments/SalamanderGrandPiano)   | Three recorded velocity layers across the keyboard                                  |

The melodic recordings are sampled every minor third. Each recorded note covers
nearby pitches rather than stretching a single recording across an instrument.
The selected source instruments have more features than this subset: this is not
a complete port of their SFZ articulation, pedal, resonance or round-robin logic.
Bass sample names use a transposed octave convention; the mapping uses their
measured sounding pitches.

## Assets and preparation

`src/audio/assets/band/` contains 209 mono 44.1 kHz Ogg Vorbis recordings, about
11 MB in total. `band-manifest.json` records pinned source URLs (or paths under
the owner's `samples/` directory), SHA-256 checksums, pitch/velocity regions and
exact preparation parameters. The recordings have leading silence trimmed,
peak levels aligned, and a 40 ms ending fade. Guitar/bass decay is capped at five
seconds and piano decay at seven seconds. Soft/hard layers retain their different
timbres; MIDI velocity controls their final level.

`src/audio/assets/woody-block.wav` is mono 48 kHz, 16-bit PCM, about 167 ms and
16 KB. It preserves the source's pitch, level and decay. The original is:

`samples/Kount's Memory Bank Drum Pack /ONE SHOTS/Percs/Woody Block.wav`

To rebuild selected Ogg assets, install FFmpeg and run:

```sh
npm run audio:import -- /path/to/samples
# Optional filename prefix, useful when editing one instrument:
npm run audio:import -- /path/to/samples piano-60
```

The importer verifies the original checksum before converting. It fetches the
pinned public recordings and reads Kount originals from the supplied directory.
To recreate the woodblock:

```sh
ffmpeg -i "samples/Kount's Memory Bank Drum Pack /ONE SHOTS/Percs/Woody Block.wav" \
  -ac 1 -ar 48000 -c:a pcm_s16le -map_metadata -1 src/audio/assets/woody-block.wav
```

Normal checkouts and builds need neither FFmpeg, network access nor the full
sample library. `npm run audio:build` creates the ignored
`public/soundfont/practice-room.sf3` bank from the checked-in assets and alphaTab's
SONiVOX bank. Vite prepares it before scanning public assets, for both development
and production. Restart the managed workspace after changing audio assets.

The browser fetches a small sample manifest and preset template, then downloads
only the samples needed by the active score's sounding MIDI pitches and velocity
layers, including generated drum variations. Muted parts are included so mixer
changes work immediately; unrelated instruments and unused layers are omitted.
A small woodblock is included for count-in and toggling the click while playing.
The full bank is still generated for verification, but the player does not fetch it.
The starter scale needs six samples and about 0.49 MB including the manifest;
Evening study needs 45 samples and about 2.39 MB, compared with the 12.4 MB bank.

Notation paints before sample loading begins. At most four selected samples load
at once. The native offline decoder expands supported Vorbis samples once;
unsupported codecs use alphaTab's portable decoder for those selected samples.
Concurrent requests share work, and a versioned browser cache retains decoded
samples across reloads. Score replacement cancels queued work and ignores stale
completion without interrupting another consumer's shared download. Layout and
section changes retain the loaded player. This does not open a microphone or audio
output. Memory use follows the samples encountered, rather than expanding the
entire bank at startup; low-memory devices still need physical-device validation.

In development, the page, synth worker and notation worker import the same
alphaTab engine. A Vite middleware serves a minified, gzip-compressed module,
retaining its license header and exports. This reduces each transfer from 2.35 MB
to about 286 KB. The hosted gateway currently sets `private, no-store`, so separate
worker transfers still occur; the app does not change gateway caching or routing.
Production already bundles and minimizes its engine.

The SoundFont builder replaces program 0 (grand piano), 27 (clean electric guitar),
33 (fingered bass), and the selected percussion notes in bank 128/program 0.
Uncovered programs and pitches retain SONiVOX fallback zones. The woodblock uses
percussion key 33, alphaTab's existing click/count-in voice. Compressed sample
headers use SF3 byte offsets; inherited PCM headers retain their SF2 offsets.

## Performance

Generated performances use seeded, repeatable velocity changes and note lengths:
strong/weak hat strokes, ghost snares, alternating recorded drum hits, subtle
snare placement, bass articulation, and individually voiced piano chords. Hats
share a choke group; cymbals can decay after note-off. Playback-only drum keys
90–94 select alternate recordings without changing the written GM notes.

The arrangement uses nearby piano inversions, feel-specific comping and drums,
small fills, and bass approaches to the next chord. Guitar pitches/rhythms remain
the study's targets, with position-aware fingering and shaped note lengths.
Guitar and bass attacks remain on the exact generated MIDI ticks. Expression
runs after alphaTab constructs the score's timing lookup, preserving practice
feedback, tempo, passage and loop boundaries. The metronome stays on the existing
audio clock; its volume and count-in controls still work. Its button remains
available while recording and flashes on each beat, including when the click is
muted. Continuous exercise loops use a separate native looping click buffer with
the backing buffer's exact frame count and start time. Toggling it changes a gain
without restarting either source, rerendering the backing, or shifting the wrap.
The initial count-in remains outside the loop.

This remains sampled playback. Strings currently have one recorded attack per
pitch/velocity layer, and there is no modeled legato, fret noise or sustain pedal.
These are useful future improvements after listening feedback on this baseline.

## Mix balance and effects

The replacement bank is calibrated using rendered phrases, with FFmpeg EBU R128
measurements as a cross-check. Peak-matching individual samples had left the
reference guitar about 13 LU louder than the drums. Generated scores now use the
same MIDI volume for each part, avoiding alphaTab's cubic volume curve amplifying
the old track-level differences. The bank applies 6.5 dB attenuation to guitar,
5 dB to bass/piano and none to drums. At the default faders, the four stems of the
A ii–V–I reference groove at 120 BPM measure about -35 to -33 LUFS across
shuffle/straight/bossa, with drums slightly forward. This is instrument
calibration, not continuous automatic gain control; imported score dynamics and
authored MIDI volume remain in effect.

**Reset levels** restores the default instrument faders. Compression and reverb
have independent 0–100% amount sliders: zero bypasses the effect and 100% is a
strong effect. Defaults are 30% compression and 40% reverb. The percentage is an
amount control, not a literal wet/dry percentage.

Compression sweeps its threshold from -24 to -44 dB and ratio from 1:1 to 12:1,
with a 6 dB soft knee, 20 ms attack and 180 ms release. It links the stereo
channels and applies no makeup gain, so stronger settings reduce loud passages
without boosting quiet parts or consuming the band's headroom. Reverb increases
both the wet level and nominal decay, from a small 0.35-second room to a
four-second space. Damped delays, stereo diffusion and bass filtering soften
the reflections. Some dry level is traded for ambience as the amount rises;
the immediate dry attack remains present even at maximum.

Amount and feedback changes glide over approximately 20 ms, preserving existing
tails when adjusting either slider. Bypassing clears only the selected effect;
pause and seek clear all processing state. Processing preserves the original
sample count and attack position, and wraps alphaTab's public PCM output only.
Instrument input and assessment capture are unaffected.

## Swing amount

Swing is a separate timing control: 0% plays even eighths, 50% gives a 2:1
triplet feel, and 100% gives a 3:1 dotted feel. The original written feel is used
until the slider is changed; **Restore written feel** reinstates it exactly.
Each song starts with its own written timing. Explicit tuplets and grace notes
retain their timing, while ordinary offbeats and their note lengths move together.
Quarter-note clicks, tempo and bar/loop lengths remain fixed.

Slider changes are coalesced over 180 ms, then MIDI and alphaTab's cursor/target
cache are regenerated together. A playing passage briefly reloads and resumes
from its position without a new count-in. The control is locked during a take.
This does not change the saved score's source file or the jam's authored recipe.

## Licenses and attribution

The Karoryfer recordings are CC0 1.0. Salamander Grand Piano is by Alexander Holm,
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); the changes above are
adaptations of those recordings. Full licenses and attribution are checked in
under `src/audio/assets/licenses/` and copied to `soundfont/credits/` beside the
served bank. The bank's embedded comment identifies the sources.

The SONiVOX portion retains its Apache-2.0 license and bundled notice. The Kount
recordings come from the owner's sample pack and retain that pack's license;
they are not covered by SONiVOX's Apache license or the melodic samples' Creative
Commons licenses. The full personal library stays local.
