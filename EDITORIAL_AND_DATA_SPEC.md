# ARC Music v7 — Editorial and seed-data specification

## Principle

Spotify/public music metadata and hand-written ARC commentary are different data domains.

Spotify owns facts such as:
- IDs
- names
- artwork
- release dates
- duration
- track sequence

ARC local editorial data owns:
- Artist Editorial Note
- Album Editorial Note
- Song Listening Note
- optional curated/featured release choices

Never inject long editorial prose into Spotify transport models.

## Storage (v7.2)

- Notes are Markdown files: `src/editorial/notes/{artists,albums,songs}/<key>.md`. The file name is the key; the
  frontmatter holds the match fields (Spotify IDs, names / titles, release year), the `short` preview and optional
  `written` / `updated` / `sources`; the body is the long-form note. Loaded by `src/editorial/loadNotes.ts`.
- Album notes are critic-style reviews without scores. The writing rules are in
  `.claude/skills/write-note/SKILL.md`.
- One song, one note. A song note (`notes/songs/<key>.md`) is the Listening Note and, when the song has one, its
  curated lyric translation: a `translation:` block in the frontmatter (the brief), a reserved `## 번역에 대하여`
  section at the end of the body (the reasoning) and `notes/songs/<key>.translation.json` (timed segments). The
  translation inherits the note's matching fields. See "Lyrics copyright/data rule" below.
- Completeness: an album note lists its standard tracklist as song note keys (`tracks:`), and every track has a song
  note with a listening note; a song in another language than Korean also has its translation (a song that needs
  none says `lyricsLanguage: ko | instrumental`). The loader accepts incomplete notes so the app never breaks; the
  quality floor in `src/editorial/quality.ts` (lengths, paragraphs, sources, tracklist, translation, banned phrases)
  fails `npm run check` for any note not listed in its `PENDING_REVIEW` set. `npm run notes:audit` prints the same
  audit while writing.

The type sketches below are the original v7 plan; the current types are in `src/editorial/types.ts` and
`src/translation/curated/types.ts`.

## Types

```ts
type EditorialBody = {
  short: string;
  full?: string;
};

type ArtistEditorial = EditorialBody & {
  artistId: string;
  featuredAlbumIds?: string[];
};

type AlbumEditorial = EditorialBody & {
  albumId: string;
};

type SongListeningNote = EditorialBody & {
  trackId: string;
};
```

During initial migration, if Spotify IDs are not yet known, keep an explicit temporary match key:

```ts
type LegacyEditorialMatch = {
  artistName: string;
  albumTitle?: string;
  trackTitle?: string;
  releaseYear?: number;
};
```

Resolve these to stable Spotify IDs as soon as real metadata is available.

## Preview rules

Artist/Album:
- roughly 1 compact paragraph
- visually 2–3 lines at common desktop widths

Song:
- usually 1–2 lines
- a “listening cue”, not a full review

Full drawer:
- may contain multiple paragraphs
- preserve deliberate paragraph breaks
- no markdown-heavy presentation inside the drawer unless later designed

## Seed editorial content

Use the existing v7 reference HTML as the exact initial source for the current Korean short/full notes for:

Artists:
- Vaundy
- Tyler, The Creator
- tripleS

Albums:
- Vaundy — `strobo` (2020)
- Tyler, The Creator — `IGOR` (2019)
- tripleS — `<ASSEMBLE24>` (2024)

Songs with custom Listening Notes:
- `怪獣の花唄`
- `EARFQUAKE`
- `Girls Never Die`

Copy these notes from `reference/music_player_notes_v7_mockup.html` into typed source files during implementation. Do not paraphrase or regenerate them unless the user explicitly requests new writing.

For other songs in the first implementation:
- prefer no Listening Note over auto-generated filler
- do not keep the mockup's generic fallback sentence as production content unless the user specifically wants automatic placeholder notes

## Seed track sequences

The mockup contains real-world track titles for layout testing. Production must fetch actual metadata from Spotify rather than treating these arrays as canonical.

### Vaundy — `strobo`

1. Audio 001
2. 灯火
3. 東京フラッシュ
4. 怪獣の花唄
5. life hack
6. 不可幸力
7. soramimi
8. Audio 002
9. napori
10. 僕は今日も
11. Bye by me

### Tyler, The Creator — `IGOR`

1. IGOR'S THEME
2. EARFQUAKE
3. I THINK
4. EXACTLY WHAT YOU RUN FROM YOU END UP CHASING
5. RUNNING OUT OF TIME
6. NEW MAGIC WAND
7. A BOY IS A GUN*
8. PUPPET
9. WHAT'S GOOD
10. GONE, GONE / THANK YOU
11. I DON'T LOVE YOU ANYMORE
12. ARE WE STILL FRIENDS?

### tripleS — `<ASSEMBLE24>`

1. S
2. Girls Never Die
3. Heart Raider
4. Midnight Flower
5. White Soul Sneakers
6. Chiyu
7. 24
8. Beyond the Beyond
9. Non Scale
10. Dimension

Again: use Spotify's returned duration, track numbering, IDs, availability, artwork, and release metadata in production.

## Lyrics copyright/data rule

The v7 mockup contains non-copyright placeholder lyric text such as “Lyric preview” / “가사 프리뷰”.

Do not replace this by hard-coding copyrighted song lyrics into the repository.

Production lyrics must come through an appropriately licensed/authorized provider or another user-approved source. Until then, keep the mock provider explicitly synthetic.

### Curated translations (v7.5: time segments in the song note)

The repository owner decided to keep hand-made Korean translations of lyrics in this public repository (inside the song
notes, `src/editorial/notes/songs/`), accepting that a translation is a derivative of the original lyrics. To limit what
is stored:

- the original lyrics are **never** stored — not in translation files, notes, tests, fixtures, comments, docs or commit
  messages. Original text and line timing come from LRCLIB at runtime only;
- `<key>.translation.json` holds only `schemaVersion: 2`, `timing: { lrclibId, durationMs }` (the LRCLIB record the
  times were taken from) and `segments: [{ startMs, endMs, translation }]`. The parser rejects unknown keys and, in
  particular, `text` / `original` / `source` / `lyrics`; segments must be sorted, non-overlapping, non-empty and end
  by `durationMs + 3 s`;
- the brief and the `## 번역에 대하여` section may quote at most a few words of the original as evidence.

Matching and placement at runtime:

- the note is found as any song note (track ID, then title + artist name). A name match brings the translation only when
  Spotify's track length is within 3 s of `timing.durationMs`;
- for a song whose note matches (same rule), the app loads lyrics directly from the `timing.lrclibId` record, provided
  its length is within 3 s of the playing track; otherwise it searches LRCLIB as usual;
- the loaded LRCLIB lyrics must be the `timing.lrclibId` record, or another record within 3 s of its length; otherwise
  the translation is not applied (machine translation, development warning);
- line i's window is [start_i, start_{i+1}) (the last runs to the end of the track). A segment shows under the line
  whose window holds its `startMs` (snapped to the next line when that starts within 400 ms), stays — marked as a
  continuation — while later lines inside the segment play, and is joined with other segments that start in the same
  line. Only lines no segment covers go to the machine provider;
- a malformed file skips that song's translation with a development warning; the tests load every file strictly and fail.

Tests use dummy lines ("line one") and the synthetic preview test lines as fixtures, never real lyrics. The earlier
hash-keyed files (`src/translations/`, v7.2) were converted with `npm run notes:migrate` and removed.
