# ARC Music v7 — Codex implementation package

Date: 2026-09-27

This package is the canonical implementation brief for the current ARC Music design.

## Source-of-truth order

When instructions conflict, use this priority:

0. `DESIGN_REVISION_V7_1.md` (adds the catalogue player's features inside the v7 design; wins where it applies)
1. `CODEX_MASTER_PROMPT.md`
2. `DESIGN_SPEC_V7.md`
3. `FUNCTIONAL_ARCHITECTURE.md`
4. `EDITORIAL_AND_DATA_SPEC.md`
5. `ACCEPTANCE_CHECKLIST.md`
6. `reference/music_player_notes_v7_mockup.html`
7. Existing repository documentation that does not conflict with the files above

The reference HTML is a visual and interaction reference. It is not production architecture and its simulated timer, hard-coded DOM mutation, placeholder artist portrait, and mock lyric text must not be copied as production logic.

## Explicitly superseded ideas

Older ARC documents may refer to a “Catalogue player” or a “Specimen Book” version. Those player variants are obsolete for this implementation.

Do not restore:

- Catalogue / Specimen mode tabs
- Specimen-book folios, plates, page-spread decorations, color specimen bars, object-data panels
- a global/footer playback bar
- object note / curatorial note / palette commentary / design-lab metadata
- a separate Catalogue Now Playing layout

The current product has one Now Playing design: the album-led layout defined in v7.

## Current product identity

ARC Music is a personal music archive/player with three primary surfaces:

- Now Playing
- Artist
- Album

All three share one restrained editorial system. Short contextual writing is allowed, but it is deliberately progressive-disclosure content:

- Artist: **Editorial Note**
- Album: **Editorial Note**
- Song/Now Playing: **Listening Note**

Only a short preview is visible in the page. Long text opens in one reusable right-side note drawer.

## How to use this package

Place the contents of this folder in the target repository, preferably under `docs/arc-v7/`, while preserving the reference HTML.

Then give Codex this instruction:

> Read `docs/arc-v7/00_READ_FIRST.md` and every document it names before changing code. Treat ARC v7 as the canonical product/design specification. Audit the existing repository first, then implement the work in milestone-sized changes. Do not revive superseded Catalogue or Specimen UI.

If the repository is effectively empty, the default stack is React + TypeScript + Vite with a small disciplined CSS/token layer and no heavyweight UI kit.
