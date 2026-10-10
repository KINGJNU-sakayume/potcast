# ARC Music v7 — Functional architecture

## Scope for the first production implementation

Primary routes/surfaces:

- Now Playing
- Artist
- Album
- shared Editorial/Listening Note drawer

Do not add Home/Search/Library screens in the first pass unless they already exist in the repository and can be preserved without altering the v7 visual scope.

## Spotify integration

Use current Spotify official documentation and OpenAPI schema at implementation time.

Current implementation constraints verified on 2026-09-27:

- Single-page/browser apps should use Authorization Code with PKCE.
- Do not expose a client secret in the browser.
- Production redirect URIs should use HTTPS; `http://127.0.0.1` is permitted for local development under Spotify's redirect-URI guidance.
- Web Playback SDK creates a Spotify Connect browser device and supports streaming/control for eligible Spotify Premium users.
- Player Web API endpoints include playback state, seek, next/previous, transfer playback, and queue operations; only implement controls represented by the v7 UI unless expanded later.

Do not hard-code assumptions from this document if Spotify has since changed the API. Re-check official docs while coding.

### Modules

```text
auth/
  pkce.ts
  tokenStore.ts
  authClient.ts

spotify/
  client.ts
  types.ts
  mappers.ts
  scopes.ts

playback/
  playbackSdk.ts
  playbackStore.ts
  selectors.ts
  positionClock.ts

lyrics/
  types.ts
  LyricsProvider.ts
  lyricSync.ts
  providers/MockLyricsProvider.ts

translation/
  TranslationProvider.ts
  providers/...

editorial/
  types.ts
  artists.ts
  albums.ts
  songs.ts
  lookup.ts
```

Names may change to fit the repository.

## Domain models

Keep Spotify transport response types separate from presentation/domain types.

Suggested normalized model:

```ts
type ArtistIdentity = {
  id: string;
  name: string;
  imageUrl?: string;
  genres?: string[];
};

type AlbumIdentity = {
  id: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
  imageUrl?: string;
  releaseDate?: string;
  albumType?: string;
  totalTracks?: number;
};

type TrackIdentity = {
  id: string;
  uri: string;
  title: string;
  artists: ArtistIdentity[];
  album: AlbumIdentity;
  trackNumber?: number;
  discNumber?: number;
  durationMs: number;
  language?: string;
};

type PlayerSnapshot = {
  track: TrackIdentity | null;
  positionMs: number;
  durationMs: number;
  paused: boolean;
  deviceId?: string;
  volume?: number;
  contextUri?: string;
};
```

## Playback store rules

There is one playback source of truth.

UI components must not create their own timers that disagree with Spotify state.

A lightweight interpolation clock may animate progress between SDK snapshots, but it must:
- start from the latest authoritative playback position
- stop/adjust on pause, seek, track change, device transfer, visibility/reconnect events
- periodically reconcile with authoritative state

## Visible player controls

v7 visibly includes only:
- previous
- play/pause
- next
- seek/progress

The API/service layer may expose more capabilities for future revisions, but do not render extra controls without a design change.

## Lyrics synchronization

For sorted timed lines, active line is the last line whose `startMs <= positionMs`, subject to `endMs` when present.

Return:
- current line
- next line or null
- second next line or null

Never repeat the last lyric line into missing “next” slots.

The lyric panel must remain structurally stable when lines are absent.

## Translation

Translation is secondary to original lyrics.

- target language may default to Korean in this personal app
- provider is replaceable
- cache by track + lyric version + language pair when practical
- failure hides translation cleanly
- lyrics for a song with a curated translation are pinned to the LRCLIB record the translation was timed on
  (`pinnedLrclibId` → `LyricsRequestOptions.lrclibId` → `/api/get/<id>`, used when its length is within 3 s of the
  track; cached under its own key); other tracks and other edits search LRCLIB as before
- a curated translation (in the song note) comes first: `getCuratedTranslation` finds the note (track ID, or name +
  Spotify length within 3 s), `lyricsMatchTiming` checks the loaded lyrics' `timing` (LRCLIB record ID and duration,
  carried by the provider and the lyrics cache) against the translation's `timing`, and `alignSegments` places the
  time segments on the loaded lines (`src/translation/curated/`). Only uncovered lines reach the machine provider
- a segment over several lines is shown under its first line and kept while the others play; the Now Playing
  current-line translation keeps one element per segment, so it does not re-appear on each line
- Translation On / Off applies to curated and machine translation alike

## Editorial drawer state

Drawer state is UI state, not playback state.

Suggested model:

```ts
type NoteContext =
  | { kind: 'artist'; artistId: string }
  | { kind: 'album'; albumId: string }
  | { kind: 'song'; trackId: string };
```

Only one note drawer is mounted globally in the app shell. A song has one note, the Listening note
(`src/components/SongNote.tsx`): the listening body, then *번역에 대하여* (speaker → addressee, relationship and speech
level; pronoun and term tables; the reasoning), then sources and dates. There is no separate translation note, mark or
link anywhere else. On Now Playing the Listening note opens in the page, not in the drawer: a column on the right of the
same layer (`.player-stage` grid, `NoteColumn`); the lyrics then take the whole width left of it and the album object
drops to the bottom-left corner. The album and lyrics pieces are items of one grid with shared rows (`.player-shell`:
head / cover·lyrics / copy·note / meta·controls), so the cover starts on the Lyrics rule, the Now playing block and
the Listening note preview share a height, and the meta rule continues the transport rule. No backdrop or focus trap, Escape and
the close button close it and return focus, a new track closes it, and at single-column widths it stacks below. Both
render `NoteContent`. The translated lines are never repeated in the note.

Opening/closing it must not affect playback.

## Navigation semantics

- clicking artist name → Artist page
- clicking album name → Album page
- clicking album track → request/start that track in album context, then navigate to Now Playing
- navigating away from Now Playing leaves playback running
- Player rail button returns to current active track

## Data fetching and caching

Use a query/cache layer if the repository already has one. Otherwise keep a small explicit repository/service layer.

Cache/memoize:
- artist detail
- artist releases
- album detail / track list
- editorial lookup
- timed lyrics
- translations

Do not re-fetch full album data on every progress update.

## States

Every async surface needs deliberate states.

### Spotify auth
- connect required
- connecting
- auth failed
- re-auth required

### Playback
- SDK loading
- no device
- browser device ready
- no active track
- playback unavailable/ineligible

### Content
- artist loading/error
- album loading/error
- missing image

### Lyrics
- loading
- unavailable
- provider failure

### Notes
- no local editorial override → omit preview/drawer action
- song note with a translation but no listening cue → Now Playing shows only the link to the translation note

## GitHub Pages / static hosting

If deployed to GitHub Pages:
- preserve repository `base` configuration
- ensure route refreshes work; hash routing is acceptable
- production Spotify redirect URI must exactly match a registered HTTPS URL
- document the final redirect URI in README

## Security

Never commit:
- Spotify client secret
- provider private API keys
- access/refresh tokens

For a pure SPA, only public-safe configuration may use `VITE_` variables.

A provider that requires a private secret must run behind an existing backend/serverless boundary; do not expose it to the browser.
