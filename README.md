# ARC Music v7 — Spotify web player

ARC Music is a restrained personal music archive: the v7 Now Playing, Artist and Album compositions, each page in the
colour of its own image (or the warm paper), and short hand-written **notes** — the Editorial Note for artists and
albums and the Listening Note for songs — that open in one right-hand column. Spotify provides authentication,
metadata, search and playback.

The playback, library, search, lyrics and translation features of the ARC Catalogue player
([player1](https://github.com/KINGJNU-sakayume/player1)) have been brought over, re-set in the v7 design language
(see [`DESIGN_REVISION_V7_1.md`](DESIGN_REVISION_V7_1.md)). v7.2 ([`DESIGN_REVISION_V7_2.md`](DESIGN_REVISION_V7_2.md))
is built for digging through discographies. Album notes can be long critic-style reviews. Lyrics can carry a curated
translation whose Korean speech level (존댓말 / 반말) is fixed from the song's context before any line is translated.
v7.3 ([`DESIGN_REVISION_V7_3.md`](DESIGN_REVISION_V7_3.md)) adds the discography timeline, previous / next release
navigation and the Archive index. v7.4 ([`DESIGN_REVISION_V7_4.md`](DESIGN_REVISION_V7_4.md)) raises the small type and
the lyric translation line for a 24" desktop monitor. v7.5 ([`DESIGN_REVISION_V7_5.md`](DESIGN_REVISION_V7_5.md))
rebuilds the desktop around player1's Now Playing for a 24" 16:9 and a 34" 21:9 monitor: no top bar, a colour per
page, one right-hand column for notes, queue and settings, Focus Mode, and lyrics with the line just sung. There is
still no global playback footer, no Catalogue or Specimen mode, and transport controls appear only on Now Playing.

| Surface | What it does |
| --- | --- |
| **Now Playing** | In the playing album's colour. A big cover with the title and artist · album beneath it; beside it the synced lyrics — the line just sung, the current line with its translation, the next two lines — a one-line Listening note, the seek bar and one transport line (shuffle · previous · play · next · like · queue · device · volume · Focus Mode). *Read full note →* opens the note in the right-hand column: on 16:9 the lyrics then run across and the album drops to the corner; on 21:9 the cover stays. Only problems show beneath the transport. |
| **Focus Mode** | `F` or the transport button: full screen, cover, lyrics and progress. `Esc` leaves. |
| **Artist** | In the colour of the artist's photograph. Portrait, name, origin line and Editorial Note; below it, the **Discography** as a chronology in two or three columns. Albums, Singles & EPs, Compilations and Appears on each load in full, oldest first (or newest first). Releases are grouped by year, with deluxe / remaster / regional editions folded under the original (*+2 editions*), the note's career eras marked in the timeline, and noted releases marked. *Play artist*, *Open in Spotify*. |
| **Album** | In the cover's colour. Cover, title, artist, release / format / tracks / duration and Editorial Note left; the complete Track Sequence right, with the playing track, guests, explicit marks, discs and a *Note* mark on songs with a song note. *Play album*, *Save album*. Under the sequence, the release's place in the discography (`03 / 12 · Albums`) with the previous and next release — `[` / `]` step through. An artist note's `discography:` list sets that album order (e.g. to skip a live album). |
| **Archive** | The index of the archive's own writing: every artist with a note on the left; the chosen artist's note and portrait, album notes with covers, and one Listening note per song (with the song's translation note inside it) under its album in tracklist order on the right, each opening its note or playing the track. Artwork is the note's `image` / `cover` URL (`npm run notes:art` fills them), else Spotify's when connected, else the archive plates. |
| **Library** | One screen: liked songs (*Shuffle* draws from the whole library, *Play all*) and recently played as lists; liked albums, playlists and followed artists as big covers. |
| **Search** | The overlay (`/`): tracks, artists, albums and playlists side by side, type filters with paging, `↓` / `↑` through results. |
| **Queue · Settings** | The real Spotify queue, and the account, device, lyrics and keyboard, in the same right-hand column as the notes. |

**Contents** — [Setup](#setup) · [Environment variables](#environment-variables) · [Notes](#notes-editorial-and-listening) ·
[Lyrics and translation](#lyrics-and-translation) · [Preview mode](#preview-mode) · [Phone](#phone-and-home-screen-app) · [Commands](#commands) ·
[Deployment](#github-pages-deployment) · [Architecture](#architecture) · [Limitations](#known-limitations) ·
[Troubleshooting](#troubleshooting)

## Setup

Prerequisites: Node.js 22, a Spotify account (**Premium is required for browser playback and playback control**), a
Spotify Developer application, and a desktop browser with Web Crypto and protected-media (DRM) support.

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) with the **Web API**
   and **Web Playback SDK**.
2. Register the exact redirect URI for every environment. Matching is exact (protocol, host, port, path, trailing
   slash). The redirect URI is the app **root**; routes live in the URL hash.
   - Development: `http://127.0.0.1:5173/`
   - Production: `https://kingjnu-sakayume.github.io/player2/`

   Spotify does not accept `localhost` in place of `127.0.0.1`.
3. Copy the public Client ID. A client secret is neither needed nor safe in this SPA.
4. While the app is in Development Mode, add every listener under **User Management**.

```bash
npm ci
cp .env.example .env.local   # set VITE_SPOTIFY_CLIENT_ID
npm run dev                  # http://127.0.0.1:5173/
```

No Spotify app yet? Choose **Preview without Spotify** (or open `http://127.0.0.1:5173/?preview`).

### Scopes

Declared with the feature that needs each one in [`src/spotify/scopes.ts`](src/spotify/scopes.ts):
`streaming`, `user-read-email`, `user-read-private` (Web Playback SDK); `user-read-playback-state`,
`user-modify-playback-state`, `user-read-currently-playing` (playback, devices, queue); `user-read-recently-played`,
`user-library-read`, `user-follow-read`, `playlist-read-private`, `playlist-read-collaborative` (Library);
`user-library-modify` (Like, Save album). A session authorized before a scope was added keeps working; a quiet line
under the top bar offers **Reconnect Spotify** for the missing features.

### Session

Authorization Code with PKCE (S256 challenge, `state` check, single-use code). Tokens live in `localStorage`
(`arc.spotify.session.v1`) so a reload keeps you signed in; they refresh 60 s before expiry and once after any `401`,
never concurrently (also across tabs). A revoked refresh token shows **Reconnect Spotify**. **Settings → Disconnect**
clears the stored session. Coming from the first v7 build, connect once more: its stored token is discarded and the
library features ask for the new scopes.

## Environment variables

Every `VITE_*` value is public browser code — never put a secret in one.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SPOTIFY_CLIENT_ID` | — | Spotify app Client ID. Without it the connect screen shows the setup steps and the preview. |
| `VITE_SPOTIFY_REDIRECT_URI` | origin + base path | Must equal a registered redirect URI. |
| `VITE_LYRICS_PROVIDER` | `lrclib` | `lrclib`, `mock` or `none`. |
| `VITE_TRANSLATION_PROVIDER` | `browser` | `browser`, `http`, `mock` or `none`. |
| `VITE_TRANSLATION_ENDPOINT` | — | URL of your own translation function (required by `http`). |
| `VITE_TRANSLATION_TARGET` | `ko` | Language lyrics are translated into. |
| `VITE_ENABLE_PREVIEW` | `true` | `false` hides **Preview without Spotify**. |

## Notes (Editorial and Listening)

Notes are ARC's own writing, one Markdown file per note, kept apart from Spotify data:

| Directory | Note | Shown on |
| --- | --- | --- |
| [`src/editorial/notes/artists/`](src/editorial/notes/artists/) | Artist **Editorial Note** (+ origin line) | Artist |
| [`src/editorial/notes/albums/`](src/editorial/notes/albums/) | Album **Editorial Note**, written as a critic-style review | Album |
| [`src/editorial/notes/songs/`](src/editorial/notes/songs/) | Song **Listening Note**, plus the song's [curated translation](#curated-translations) — one note per song | Now Playing, lyrics header |

Seeded notes: the v7 reference subjects — Vaundy / `strobo` / 怪獣の花唄, Tyler, The Creator / `IGOR` / EARFQUAKE,
tripleS / `<ASSEMBLE24>` / Girls Never Die — and three example artists with representative releases:

- **Kenshi Yonezu** — `STRAY SHEEP`, `LOST CORNER`; Lemon, 感電, KICK BACK
- **tripleS** — `<ASSEMBLE24>`, `ASSEMBLE`; Girls Never Die, Rising
- **Coldplay** — `Parachutes`, `A Rush of Blood to the Head`, `Viva la Vida or Death and All His Friends`; Yellow,
  The Scientist, Viva la Vida

The file name is the key. The frontmatter holds the match fields and a `short` preview (2–3 lines; a song cue is
shorter). The body is the long-form note for the right-hand column. It can use paragraphs, `##` sections, lists, quotes, emphasis
and links. Optional `written` / `updated` dates and `sources` appear at the foot of the note. To have Claude
write one, ask for it (*"STRAY SHEEP 리뷰 써줘"*); the procedure and style rules are in
[`.claude/skills/write-note/SKILL.md`](.claude/skills/write-note/SKILL.md). An album request covers the artist note,
the review, a listening note for every track (`tracks:` in the album note) and translations of the songs not in
Korean. [`src/editorial/quality.ts`](src/editorial/quality.ts) holds the quality floor that `npm run check` enforces
(notes written before it are listed in `PENDING_REVIEW` until rewritten); `npm run notes:audit -- <artist-key>`
prints it per note. Matching, in
[`src/editorial/lookup.ts`](src/editorial/lookup.ts):

1. **Spotify IDs first** — `artistIds`, `albumIds`, `trackIds` (the 22-character part of an `open.spotify.com` link).
   One release usually has several IDs (album cut and single, editions, markets): list the ones you know.
2. **Names as the fallback** — the artist's `names` plus the album or song `titles`, compared case-, width- and
   bracket-insensitively (`<ASSEMBLE24>` = `ASSEMBLE24`). Spotify localises names, so list every form it may show:
   `['Kenshi Yonezu', '米津玄師']`, `['怪獣の花唄', 'Kaiju no Hanauta']`. Albums also check `releaseYear` when both
   years are known.

```markdown
<!-- src/editorial/notes/songs/lemon.md -->
---
artist: kenshi-yonezu
trackIds: [7Cd17G3oNQ34OWUwS8ZxfR, 04TshWXkhV1qkqHzf31Hn6]
titles: [Lemon]
written: 2026-10-02
short: >
  …
---

…

## …
```

`artist` is the file name of the artist's note. Anything without a file gets no note — never generated filler.
A song note may also carry the song's curated translation: a `translation:` block in the frontmatter, a reserved
`## 번역에 대하여` section at the end of the body and a `<key>.translation.json` next to it
([Curated translations](#curated-translations)). A song with only a translation has a translation-only note (no
`short`, no listening body). `npm run test:run` checks that every file parses, every entry is complete, every album /
song points at an existing artist, and the three parts of each translation come together.

## Lyrics and translation

Spotify's Web API has no lyrics, so both come from replaceable providers and neither ever blocks playback.

- **Lyrics** — [LRCLIB](https://lrclib.net) (`lrclib`): keyless and CORS-enabled; matches title, artist, album and
  duration (or loads the record a song's curated translation was timed on), falls back to a search, and caches results in `localStorage` (30 days; 3 days for "not found"). It sends
  that track metadata to lrclib.net. `mock` gives original test lines; `none` turns lyrics off.
- **Translation** — `browser` uses Chrome's on-device Translator API (no key; a missing model downloads after one
  click in the lyrics header). `http` posts to your own function, which keeps any DeepL / Papago / Google key
  server-side:

  ```text
  POST {VITE_TRANSLATION_ENDPOINT}   { "lines": ["…"], "sourceLanguage": "ja" | null, "targetLanguage": "ko" }
  200                                { "translations": ["…"] }   // same length and order; "" for none
  ```

  Each line's language is detected separately, so only lines not already in the target language are translated.
  **Translation On / Off** sits in the lyrics header and in Settings.

### Curated translations

Machine translation works line by line, so it cannot know who is speaking to whom, and the Korean speech level drifts
from line to line. A **curated translation** decides that first. Its *brief* names the speaker, the addressee, their
relationship, and the speech level kept throughout (하십시오체 / 해요체 / 해체 / 해라체). The whole song is then
translated against the brief, a sentence at a time. It lives with the song's note — one song, one note — and is written
in a Claude session ([`.claude/skills/translate-lyrics/SKILL.md`](.claude/skills/translate-lyrics/SKILL.md)):

| Where | What |
| --- | --- |
| `notes/songs/<key>.md` frontmatter, `translation:` | languages, `register`, speaker → addressee, relationship, situation, pronouns, glossary, dates |
| `notes/songs/<key>.md` body, `## 번역에 대하여` | why this voice, in prose (after the listening note); sources go in the note's `sources` |
| `notes/songs/<key>.translation.json` | `{ "schemaVersion": 2, "timing": { "lrclibId", "durationMs" }, "segments": [{ "startMs", "endMs", "translation" }] }` |

```bash
npm run lyrics:lines -- --title "Lemon" --artist "Kenshi Yonezu" --duration 4:15   # timing + "# startMs endMs text" (terminal only)
npm run lyrics:lines -- --check lemon                                              # segments against the LRCLIB record
```

The repository holds times and translations, never the original lyrics. Segments are time ranges in one LRCLIB record;
at runtime the original lines come from LRCLIB and each segment is placed by time: under the line whose window holds
its start (snapped to the next line within 400 ms), kept — dimmed, not repeated — while later lines of the same
sentence play, and joined with the next segment when LRCLIB puts two sentences on one line. For such a song the app
loads its lyrics straight from that record (`/api/get/<lrclibId>`) instead of searching, so the lyrics and the
translation share one timing; when the playing track is another edit (length off by more than 3 s) it searches as
usual. The translation applies only when the loaded lyrics are that record or one of the same length (±3 s); a note
matched by name rather than track ID also needs Spotify's length within 3 s. Otherwise, and for lines no segment covers, the machine provider translates (a curated
translation also works with `VITE_TRANSLATION_PROVIDER=none`). The lyrics show a curated translation like any other,
with no separate mark or link: everything about it is in the song's **Listening note**, whose *번역에 대하여* section
(who speaks to whom, the speech level, pronoun and term tables, the reasoning) follows the listening text.
**Translation On / Off** covers curated translations too. A broken translation file is skipped
for that song with a development console warning; `npm run test:run` fails on it. The tool talks to lrclib.net; when
that host is unreachable, `--file` reads a local LRC file kept outside the repository.

The earlier hash-keyed files (`src/translations/`) were converted by `npm run notes:migrate` and removed.

To add a provider, implement `LyricsProvider` ([`src/lyrics/types.ts`](src/lyrics/types.ts)) or
`TranslationProvider` ([`src/translation/TranslationProvider.ts`](src/translation/TranslationProvider.ts)) and
register it in `createLyricsProvider.ts` / `createTranslationProvider.ts` and `src/app/config.ts`. A provider that
needs a secret must sit behind your own backend. No copyrighted lyrics are stored in this repository.

## Preview mode

**Preview without Spotify** (`/?preview`) runs every surface on a sample archive with a simulated clock and no audio:
Kenshi Yonezu, tripleS, Coldplay, Vaundy and Tyler, The Creator with their noted albums. Artist, album and noted-track
IDs are real Spotify IDs, so the preview shows the real notes; track lists and timings are sample data and every lyric
line is an original test line. It never calls Spotify, LRCLIB or a translation service.

## Phone and Home Screen app

On a phone (a window up to 760px wide, or a touch screen turned sideways) ARC switches to its phone shell; the desktop
layout above is unchanged. It is tuned for an iPhone 15 Pro, in Safari and as a Home Screen app.

- **Four bottom tabs** — Now Playing · Library · Search · Archive. Artist and album pages open inside the current tab
  with a back button; tapping the current tab returns it to its first page. Away from Now Playing, a mini player sits
  above the tabs.
- **Now Playing** takes the playing album's colour (player1's stage theme, [`src/palette/stageTheme.ts`](src/palette/stageTheme.ts)):
  where it plays, the cover, title and ♡, artist · album, the current lyric with its translation, the one-line
  Listening note, the seek bar and the transport. Tapping the lyric opens the **lyrics view** — the phone's Focus Mode:
  the line just sung, the current line with its translation and the next two, with *Translation* and *Screen: Stays on*
  (Screen Wake Lock); sideways it puts the cover beside the lyrics.
- **Bottom sheets** replace the desktop's right-hand column and popovers: notes, the queue, devices (with the active device's volume),
  settings and a track menu (⋯). Drag the grip down, tap outside or press `Esc` to close.
- **A remote, not a player.** Spotify's Web Playback SDK does not run in phone browsers, so on a phone ARC controls the
  Spotify app or another device; *Open Spotify app* in the device sheet wakes the app so the phone joins the list.
- **Home Screen app.** In Safari, Share → *Add to Home Screen*. ARC then opens full screen with
  [`public/manifest.webmanifest`](public/manifest.webmanifest); [`public/sw.js`](public/sw.js) keeps the app shell, so
  it starts offline and Archive and every note stay readable. Spotify, its login, the SDK and LRCLIB always go to the
  network. The service worker is registered in production builds only. The icon is player1's record mark; iOS keeps
  an icon it has already added, so remove ARC from the Home Screen and add it again to see a new one.

## Keyboard

`/` opens search (`↓` / `↑` move, `Enter` opens or plays, `Esc` steps back). On an album, `[` / `]` open the previous / next release in the artist's discography. `Space` plays / pauses when focus is not
on a control. `F` toggles Focus Mode on the desktop. Seek and volume take arrow keys, Page Up / Down, Home and End.
The right-hand column (a note, the queue or settings) closes on `Esc` and returns focus to what opened it.
`prefers-reduced-motion` removes motion.

## Commands

```bash
npm run dev        # http://127.0.0.1:5173/
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run check      # all of the above — run before pushing
npm run lyrics:lines -- …   # curated-translation tool (see Curated translations)
npm run notes:audit -- …    # notes against the quality floor (all, an artist key, or songs/<key>)
npm run notes:migrate -- --dry-run   # one-time: hash-keyed translations → song notes (already run)
npm run preview    # serve dist/ on http://127.0.0.1:4173/
```

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` runs `npm run check`, builds with the repository base path and deploys `dist/`
on every push to `main`. Set **Settings → Pages → Source: GitHub Actions** and these repository **Actions variables**:

- `VITE_SPOTIFY_CLIENT_ID`
- `VITE_SPOTIFY_REDIRECT_URI=https://kingjnu-sakayume.github.io/player2/`
- optionally `VITE_LYRICS_PROVIDER`, `VITE_TRANSLATION_PROVIDER`, `VITE_TRANSLATION_ENDPOINT`,
  `VITE_TRANSLATION_TARGET`, `VITE_ENABLE_PREVIEW`

## Architecture

React 18 + TypeScript + Vite, TanStack Query for Spotify data, React Router (`HashRouter`), one global CSS token
layer ([`src/styles/`](src/styles/)) — no UI kit.

```text
src/
  app/          config, services, session (Spotify or preview), shell (rail, top bar, overlays), connect + OAuth callback
  auth/         Authorization Code + PKCE, token store, cross-tab refresh
  spotify/      typed Web API client (401 refresh, 429 backoff), endpoints, mappers, error taxonomy, scopes
  playback/     the single PlayerStore, Web Playback SDK adapter, Spotify engine, playback clock
  catalogue/    CatalogueSource (Spotify or preview) and query hooks
  editorial/    Editorial and song notes (Markdown in notes/, + songs/*.translation.json), frontmatter loader and lookup
  lyrics/       LyricsProvider, LRC parser, lyric sync, cache, LRCLIB and mock providers
  translation/  TranslationProvider, language detection, browser / http / mock providers, curated translations
                (brief + segment parsing, matching, time alignment)
  palette/      cover colour extraction and the contrast-safe accent
  preview/      sample archive, preview source and simulated engine
  components/   covers, notes + the right-hand column (desktop/) and sheets, search, queue, settings, transport
  pages/        Now Playing, Artist, Album, Library
```

**One source of truth for playback.** Web Playback SDK events (this browser) or `GET /me/player` polling (another
Spotify Connect device) feed one store with track, position anchor, duration, pause, shuffle, device, volume and
context. The position is never counted by a timer: progress and the lyric cursor derive it from the latest anchor,
so lyrics follow seeks, pauses, device switches and track changes. Commands update the store optimistically and
reconcile with Spotify's next report. The engine handles SDK reconnects, token refresh, Premium / account errors,
autoplay blocking, "no active device", transfer between devices, and browsers that cannot decrypt Spotify audio.

**Colour.** [`src/palette/`](src/palette/) extracts an image's dominant colour once, caches it, and adjusts it until it
reaches 3:1 (marks) and 4.5:1 (text) on the warm page — the v7 `--main` accent. Greyscale covers get the ink accent. On
the desktop each page may declare its image ([`src/app/surface.tsx`](src/app/surface.tsx)): Now Playing the playing
album, Album its cover, Artist the photograph. Its palette becomes player1's stage theme
([`stageTheme.ts`](src/palette/stageTheme.ts)) over the whole shell. Pages without one (Library, Archive) keep the
paper and the playing album's accent.

## Known limitations

- **Premium and browsers.** Browser playback and all playback control need Premium and a desktop browser with DRM
  (Widevine). When the browser cannot decrypt the audio, the engine stops the silent skipping and Now Playing explains
  the fix; otherwise ARC controls another Spotify device as a remote.
- **Development Mode.** Allow-listed users only. Search returns 10 results per type per page. Spotify serves an artist's
  releases 10 at a time, so the discography walks every page of the open group (one request per 10 releases, cached
  for 30 minutes, capped at 300). An artist with many singles takes a moment the first time. Followers and genres may
  be missing and are never required.
- **Queue** is read-only (the Web API cannot reorder it). Episodes, ads and local files show the idle state.
- **Playlists** play as a context; there is no playlist page.
- **Autoplay.** The first play in a session may need one click or key press.
- **Lyrics** coverage and timing on LRCLIB vary; translation is machine translation (desktop Chrome for `browser`).
- **Cover colour** falls back to the v7 red when a cover cannot be read; a page whose image cannot be read (or an artist
  without a photograph, as in the preview) stays on the paper.

## Troubleshooting

- **State mismatch / missing verifier:** start Connect Spotify again in the same tab; do not reuse an old callback URL.
- **`INVALID_CLIENT` / redirect mismatch:** register the root URI above exactly and use the same value in
  `VITE_SPOTIFY_REDIRECT_URI`.
- **Playback forbidden:** check Premium and that the account is allow-listed in Development Mode.
- **Device not ready:** keep the tab open, allow protected content, then **Settings → Use browser device** or pick a
  device from the device menu on Now Playing.
- **Tracks skip without playing:** update Widevine (`chrome://components`), allow protected content, disable blocking
  extensions for the site — or open the Spotify app, choose it in the device menu and use ARC as a remote.
- **429:** wait for the displayed interval; the client already backs off.
