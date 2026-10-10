# ARC Music v7.1 — design revision

Date: 2026-09-28

v7 anticipated that controls beyond previous / play-pause / next / seek could be "explicitly introduced in a later
design revision". This is that revision. It brings the playback, library, search, lyrics and translation features of
the ARC Catalogue player (player1) into ARC Music while keeping every v7 composition and rule. Where this file and the
v7 package disagree, this file wins; everywhere else v7 stands.

## Added

**Now Playing**
- One quiet line beneath the v7 transport, in the same micro type: Shuffle, Like, Queue, playback device, volume.
  It sits inside the listening column; it is not a bar and not a footer.
- A one-line status beneath it: where playback is happening, or a problem with a way forward.
- In the lyrics header, under the album / track-count context: lyrics source and **Translation On / Off**.

**Library** (`#/library`, rail) — liked songs (Shuffle / Play all), followed artists, liked albums, playlists,
recently played. Lists use the Track Sequence row language (hairlines, number, title, quiet right column) and the
Artist page's horizontal release rows; no card grid.

**Search** — the v7 overlay keeps its form and gains type filters, playlists, paging and keyboard movement.

**Queue** — shown in the one shared right-hand drawer (the note drawer's surface), labelled *Playback / Queue*.

**Artist / Album** — *Play artist*, *Play album*, *Save album*, *Open in Spotify* as plain actions placed after the
note preview, so cover → title → artist → metadata → note stays grouped as in v7. Releases and tracks that have a
local note carry a small accent *Note* mark.

**Accent** — `--main` follows the playing album's cover (contrast-checked; ink for greyscale covers; the v7 red when
unknown). The Album page uses its own cover's accent. Surfaces, text and separators never change.

**Top bar** — right side: a small link to the playing track when not on Now Playing (text only, no controls),
Search, and the connection state.

## Unchanged

- One Now Playing design; no Catalogue / Specimen mode; no global playback footer or mini player.
- Transport (previous / play-pause / next / seek) only on Now Playing.
- 42 / 58 Player and Album compositions; compact Artist dossier.
- Notes: Artist / Album *Editorial Note*, Song *Listening Note*, short preview + one shared drawer, no filler for
  entities without a note.
- Typography, warm paper tokens, hairlines, low-radius geometry, restrained motion, reduced-motion support.
