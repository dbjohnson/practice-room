# Finding and generating music

The Library's **Find music** dialog searches several catalogues at once and can ask
Claude to write a practice piece. Both run through the app's own server routes under
`/api`, so the browser never talks to a catalogue directly.

## Sources

| Source          | What it holds                                  | Format                    | Licence shown                                                                                |
| --------------- | ---------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| PDMX            | 77,321 MuseScore uploads, indexed on the server | MusicXML, opens as written | Public domain or CC0 **as the uploader declared it**. Nobody verified it; some are covers.    |
| Mutopia Project | Classical and traditional editions             | MIDI, notated on import   | Public domain or Creative Commons per piece, checked by Mutopia's maintainers.               |
| BitMidi         | Community MIDI uploads of popular songs        | MIDI, notated on import   | None stated. Treat as personal practice material.                                            |
| Songsterr       | Guitar, bass and drum tabs                     | Link only                 | Opens on songsterr.com. See below.                                                           |

Only results the source's own maintainers vouch for carry the "open licence" mark; today
that is Mutopia. A piece added from a source keeps its source, licence text and link in
the library (`Piece.origin`).

**Songsterr is search and link only.** Its terms and `ai.txt` reserve download, looping
and slow-down for its paid plan and ask tools not to provide equivalents, so its note
data is never loaded into the player. Do not add a loader for it without permission.

BitMidi's and Songsterr's search endpoints are undocumented and may change. Mutopia has
no API; its HTML result page is parsed. Each failure is reported per source and does not
block the others. Searches are cached for ten minutes.

## PDMX setup (once per server)

PDMX is a bulk dataset ([Zenodo record 15571083](https://zenodo.org/records/15571083),
CC BY 4.0). It lives outside the repository, in
`~/.local/share/practice-room/sources/pdmx` (override the parent with
`PRACTICE_ROOM_DATA`), so production and every dev worktree share one copy. It needs
about 2.6 GB.

```sh
mkdir -p ~/.local/share/practice-room/sources/pdmx && cd "$_"
curl -fLO 'https://zenodo.org/records/15571083/files/PDMX.csv?download=1' && mv 'PDMX.csv?download=1' PDMX.csv
curl -fL -o mxl.tar.gz 'https://zenodo.org/records/15571083/files/mxl.tar.gz?download=1'
tar xzf mxl.tar.gz && rm mxl.tar.gz
cd - && npm run sources:pdmx     # builds index.sqlite in about ten seconds
```

The index keeps scores that are valid, de-duplicated and free of a recorded licence
conflict. Until it exists the dialog lists PDMX as not installed and the other sources
still work. `om` already has it.

## AI generation

"Write one for me" sends the player's description, instrument and level to Claude
(`claude-opus-5-5`), which replies in alphaTex. The server parses the reply with
alphaTab before returning it; a rejected draft goes back with the parser's messages up
to twice. Requests are capped at 40 per day per server process.

It is off until the server has Anthropic credentials. Add `ANTHROPIC_API_KEY` to the
production checkout's `.env` and restart the service. A dev workspace does not read
`.env`; export the key in the shell before `npm run workspace -- start` to try it there.
The prompt and its alphaTex reference are in `src/server/alphaTexGuide.ts`; a test
parses the reference example so it cannot drift from the notation engine.

## MIDI import

alphaTab does not read MIDI, so `src/music/midi/` notates it: notes are rounded to
sixteenths or eighth-note triplets per beat (finer grids only when notes sit exactly on
them), each part becomes one voice, and guitar and bass parts get suggested fingerings.
The original MIDI bytes are stored and re-notated on each open, so converter
improvements apply to pieces already in the library. Played-in, unquantized MIDI will
look rough. Drag-and-drop accepts `.mid` files too.

## Adding a source

Implement `SourceProvider` (`src/server/sources/provider.ts`) and add it to the list in
`src/server/api.ts`. Build upstream URLs only from validated ids, state the licence as
the source states it, and return `format: 'link'` when its terms do not allow loading.
ABC sources such as The Session need an ABC reader first.

## What leaves the browser

Search text goes to this server and on to the catalogues above. A generation request
goes to this server and on to Anthropic. Scores, recordings and progress still stay in
the browser.
