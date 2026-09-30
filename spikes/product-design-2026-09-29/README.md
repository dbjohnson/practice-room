# Music practice app: three product directions

Design exploration prepared September 29, 2026. Audience: guitar and bass first.

Start with `00-design-comparison.pdf`, then review the three standalone design books:

- `01-phrase.pdf`: a score-centered rehearsal workbench.
- `02-trail.pdf`: a guided practice journey built from the user's own music.
- `03-pocket.pdf`: a backing band and rehearsal room with performance coaching.

Each book contains storyboards, original vector interface mockups, system architecture,
audio and evaluation plans, implementation phases, acceptance gates, and linked sources.
Mockup scores, progress charts, measurements, and usability targets are illustrative,
not results from testing a finished application. Notation in mockups is schematic and
does not reproduce the supplied compositions.

The existing application is unchanged. Python under `source/` only generates review
documents. It is not a prototype or application implementation.

## Evidence

The three supplied Guitar Pro files were found in the main checkout at
`/Users/bryan/code/tempo-trainer/guitarpro/`, outside this worktree. Local import analysis
used alphaTab 1.8.4 in a temporary directory. No musical files or audio were uploaded.
Successful parsing does not establish faithful rendering, playback, or assessment.
See `research/file-analysis.json` for the observed metadata and limits.

## Regenerate

With Python 3, ReportLab, Pillow, and PyMuPDF available:

```sh
python3 spikes/product-design-2026-09-29/source/generate.py
python3 spikes/product-design-2026-09-29/source/validate.py
```

The generator uses local macOS Arial and Georgia fonts. All diagrams and mockups are
drawn as vector PDF elements, with selectable text and clickable source links.
