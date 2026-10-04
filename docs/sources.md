# Finding and generating music

The Library's **Discover** and **Generate** sections search catalogues and ask
an AI model to write a practice piece. **Import** handles local score files. All three
return to the searchable library table after a successful addition, with an explicit
**Open in player** action. Search results and generation drafts stay available while
switching library sections. Both run through the app's own server routes under
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
conflict. Until it exists Discover lists PDMX as not installed and the other sources
still work. `om` already has it.

## AI generation

**Generate** sends the player's description, instrument and level through
OpenRouter, defaulting to Claude Sonnet 5.5 (`anthropic/claude-sonnet-5.5`). Developer
accounts (and plain local development) see a model picker with OpenRouter's live text
model catalogue; an exact `provider/model` ID can also be entered. The choice is saved
per account and dev build in this browser. Regular users use the default.
The instrumentation field names every requested part, sound, tuning and role (for
example, lead guitar, rhythm guitar, bass, piano and drums). Each part becomes a
separate track; guitar/bass stay the primary practice instrument. With no arrangement
requested, generation writes a solo part.

The server parses the alphaTex reply with alphaTab before returning it; a rejected
draft goes back with the parser's messages up to twice. Requests are capped at 40 per
day per server process. The selected model is used for every repair attempt.

It is off until the server has `OPEN_ROUTER_API_KEY` (the standard spelling
`OPENROUTER_API_KEY` is also accepted). Add it to the production checkout's `.env`
and restart the service when deploying. A dev workspace does not read `.env`;
export the key in the shell before `npm run workspace -- start` or `restart`.
Never use a `VITE_` prefix for credentials. Requests go through the server;
the browser never receives the key. Model lists are cached for an hour.
The prompt and its alphaTex reference are in `src/server/alphaTexGuide.ts`; a test
parses the reference example so it cannot drift from the notation engine.

## Edit a score and keep versions

In the score view, **Edit with AI** opens a collapsible chat panel beside the music.
Describe a change to the current piece, including changes to instrumentation. Enter
submits the request; Shift+Enter inserts a new line. The draft clears immediately
and is restored if the request fails. The version selector beside the song title
opens any saved version, even with chat closed. The
browser exports the displayed score as alphaTex and sends it with the instruction
and up to six earlier instructions from that version's ancestry. Requests are limited
to 200,000 notation characters and share the generation quota and parser repair loop.
The developer model choice also applies to score edits.

A successful edit saves a new, independent score file in browser storage. The
original is retained as version 1; built-in studies, jams and exercises get a saved
Guitar Pro snapshot for their editable copy. Imported originals retain their exact
source bytes and attribution. Every revision records its parent, instruction, model
and creation time. Use **Version** or **Open version** in the panel to return to an
earlier score. Editing that version adds another version; it does not erase later
ones. The Library shows the newest version in one row. Removing that row removes
all saved versions in its family, with confirmation. Takes retain their version's
piece ID, so they stay associated with the notation played at the time.

A failed generation or storage write leaves the current score unchanged. Selecting
another piece while an edit is being generated prevents the late result from taking
over. Version history is local to this account/build/browser and is not cloud sync.
AI rewriting can change notation or fingerings beyond the requested edit; compare
versions and review the result.

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
goes to this server and on to OpenRouter and its selected model provider. For a score edit, the displayed score and recent edit instructions also go to that
provider. The server retains generation inputs and completed notation in private job files for recovery. Library versions, recordings and progress remain in browser storage.


## Long generation requests

The browser sends `Prefer: respond-async` to `POST /api/generate` and receives a job ID immediately. It polls `GET /api/generation/jobs/:id` until the notation is ready or the server reports a generation error. This keeps model calls and notation-repair attempts from holding one HTTP request open across proxy timeouts. Synchronous callers remain supported. The browser stores a receipt before submitting, and sends its UUID as `Idempotency-Key`. The server atomically saves the request before accepting it and saves the result independently of browser polling. Reopening the app resumes the same job and imports the result into the library without repeating the model call. Edits keep their prompt in chat and save even after navigating to another piece.

Job files use permissions 0600 in `${PRACTICE_ROOM_DATA}/generations`, or `${XDG_DATA_HOME:-~/.local/share}/practice-room/generations` by default. Completed jobs remain until manually removed and survive API reloads and server restarts. A process restart during an unfinished model call does not resume that call; after ten minutes it is reported as interrupted and the retained prompt can be submitted again. This is generation recovery, not library synchronization between browsers.

Job responses are private and uncached. Server logs record the job ID, model, whether it was an edit, completion status, elapsed time and sanitized errors; they do not record prompts, score content or credentials. The browser distinguishes authentication redirects and gateway HTTP failures from AI errors.


Library rows show the score's opening key signature for imports and generated pieces. Existing `Imported` placeholders are repaired from saved notation on reload. Inline name and description edits are stored as family-wide overrides without rewriting source notation. Enter or the checkmark saves; Escape cancels. Old generation failures remain in chat without global recovery notifications. OpenRouter response-body timeouts are reported explicitly as three-minute timeouts.
