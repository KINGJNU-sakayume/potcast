# CODEX MASTER PROMPT — ARC Music v7

Read this entire file and the rest of the ARC v7 package before editing code.

## 1. Mission

Turn the ARC Music v7 mockup into a real personal Spotify-based music player while preserving its current visual language.

The current design is not a generic Spotify clone and not a design experiment. It is a restrained personal music archive in which album art, typography, track sequence, lyrics, and short editorial/listening notes form one coherent system.

The canonical visual reference is:

`reference/music_player_notes_v7_mockup.html`

Implement the production app from that reference; do not “improve” it into a different product.

## 2. Repository-first rule

Before writing code:

1. Inspect the repository from root to leaf.
2. Read package configuration, existing routing, state management, styling, tests, environment handling, GitHub Actions, and deployment setup.
3. Reuse good existing conventions and dependencies.
4. Do not rewrite the framework merely because another stack is easier.
5. Locate older ARC Catalogue/Specimen code or documents and prevent them from overriding this v7 specification.
6. Report the implementation plan briefly, then execute it.

If the repository is effectively empty, default to:

- React
- TypeScript
- Vite
- React Router only if real URL routes are useful; otherwise a clean app-level router is acceptable
- CSS Modules or a disciplined global CSS/token layer
- Vitest + Testing Library for focused tests
- no heavyweight UI component library

## 3. Non-negotiable visual decisions

### One visual system

There is only one Now Playing page. Do not implement Catalogue mode, Specimen mode, or a mode switcher.

### No global playback footer

There must be no persistent bottom playback bar on Artist or Album pages.

Playback transport and progress are visible only on the Now Playing page.

Playback state may continue while navigating away from Now Playing, but controls are not rendered as a global footer.

### Now Playing layout

Desktop composition must preserve the v7 placement:

LEFT (~42%)
- large square album cover
- “Now playing” label
- large track title
- artist + album links
- compact metadata row: track number, release, duration, language

RIGHT (~58%)
- Lyrics heading + album/track-count context
- current lyric as the dominant typographic element
- translation below current lyric when available/enabled
- next two lyric lines at reduced emphasis
- short Listening Note preview
- previous / play-pause / next + seek progress integrated at the bottom of this right column

Do not detach the transport from the page composition.

### Artist layout

- compact editorial dossier, not a huge hero
- portrait/artist image on the left
- artist name + origin/role close to the image
- short Editorial Note preview below identity information
- albums/releases below as restrained horizontal catalogue rows
- release rows may show cover, title, year/format, track count, duration, language, and an “Open album” action

### Album layout

Desktop composition must preserve the v7 placement:

LEFT (~42%)
- album cover
- album title
- artist
- release metadata
- short Editorial Note preview

RIGHT (~58%)
- “Track Sequence” heading
- complete track list
- track number / title / duration
- current-playing row state where applicable

Do not reintroduce a giant hero that pushes the track list below the fold.

### Notes

Use only these content categories:

- Artist → `Editorial Note`
- Album → `Editorial Note`
- Song → `Listening Note`

Preview rules:
- short, approximately 2–3 visual lines on Artist/Album
- Song preview should usually be even shorter
- no card background
- use typography + a thin divider only
- show `Read full note →`

Long-form content uses one reusable right-side drawer shared by all three contexts.

The drawer:
- slides from the right
- uses the warm paper surface
- includes context, title, subtitle, body
- closes via close button, backdrop, and Escape
- traps focus while open
- returns focus to the trigger after close
- respects reduced-motion preferences

### Remove obsolete decorative metadata

Do not add:
- Object Note
- Curatorial Note
- Editorial Note as multiple competing blocks
- exposed color palette chips
- “Motion / Display / Status” type design metadata
- exhibition labels that exist only to explain the UI

## 4. Typography and base design

Fonts:
- Latin: IBM Plex Sans
- Korean: Noto Sans KR
- Japanese: Noto Sans JP

Reference tokens from v7:
- background: warm off-white (`#f1eee6` family)
- paper: lighter warm surface (`#f8f5ee` family)
- ink: near-black green/charcoal (`#171917` family)
- secondary text: muted gray-green
- separators: low-opacity ink
- album/artist accent: restrained semantic accent only

Do not create:
- glassmorphism
- generic SaaS cards
- excessive border radii
- pill-button-heavy UI
- blue/purple AI gradients
- gratuitous shadows
- decorative animations

Typography should remain generous and readable. Do not shrink functional text below roughly 10–11px on desktop simply to avoid reflow. Prefer layout reflow.

## 5. Production Spotify integration

Use current official Spotify documentation and OpenAPI schema. Do not guess endpoint paths or fields.

For a browser SPA:
- use Authorization Code with PKCE
- never ship a client secret in frontend code
- use exact registered redirect URIs
- use HTTPS for production redirect URIs; `http://127.0.0.1` is acceptable for local development per Spotify guidance
- do not use the deprecated Implicit Grant

Spotify Web Playback SDK may be used to create the browser playback device.

Important: browser playback via Spotify's Web Playback SDK and player APIs requires an eligible Spotify Premium account. Handle ineligible/no-device states as designed application states rather than raw errors.

Keep Spotify transport logic out of presentation components.

Suggested boundaries:

```text
src/
  app/
  auth/
  spotify/
  playback/
  lyrics/
  translation/
  editorial/
  pages/
    now-playing/
    artist/
    album/
  components/
  styles/
```

Adapt this structure if the repository already has a strong architecture.

## 6. Playback model

One global source of truth must own:

- current track identity
- current album and artist
- playback position
- duration
- playing/paused
- active Spotify device
- volume (even if no volume control is shown in v7 yet)
- queue/context where available

The Now Playing progress indicator must derive from real playback state, not an independent mock timer.

Required visible transport in v7:
- previous
- play/pause
- next
- seek/progress
- current time
- total time

Do not add visible volume/repeat/shuffle/queue controls unless they are explicitly introduced in a later design revision. It is acceptable for the underlying architecture to support them without rendering them.

Navigating to Artist or Album must not stop playback.

## 7. Lyrics and translation

Spotify Web API should not be assumed to provide the synchronized lyrics needed by this UI. Use provider abstractions.

```ts
export interface TimedLyricLine {
  startMs: number;
  endMs?: number;
  text: string;
}

export interface TimedLyrics {
  language?: string;
  lines: TimedLyricLine[];
}

export interface LyricsProvider {
  getTimedLyrics(track: TrackIdentity): Promise<TimedLyrics | null>;
}

export interface TranslationProvider {
  translateLines(
    lines: TimedLyricLine[],
    sourceLanguage: string | undefined,
    targetLanguage: string,
  ): Promise<string[]>;
}
```

Rules:
- active lyric is computed from playback position
- show current line + translation + next two lines
- if timed lyrics are unavailable, show a deliberately designed empty state without breaking transport
- if translation is unavailable, omit translation cleanly
- provider failures never block playback
- include a local non-copyright mock provider for development/tests
- do not seed production code with copyrighted lyric text copied from songs

## 8. Editorial data

Editorial writing is local, optional, source-controlled data and must remain separate from Spotify API models.

Use typed overrides for:
- artists
- albums
- songs/listening notes

Seed the three mockup subjects:
- Vaundy / `strobo`
- Tyler, The Creator / `IGOR`
- tripleS / `<ASSEMBLE24>`

Preserve the v7 short and full note text as initial editorial content.

For entities with no local note:
- do not generate fake prose in the browser
- omit the note preview cleanly
- do not show `Read full note` if there is no full note

Prefer Spotify IDs as canonical keys after they are known. During development, a deterministic fallback matcher of normalized artist name + album title + release year is acceptable only as a migration aid.

## 9. Data behavior

Production artist and album pages use real Spotify metadata, not hard-coded track arrays.

The v7 mockup’s track arrays are design seeds only.

Album page:
- fetch complete album track sequence from the real data layer
- clicking a track starts/requests playback for that track/context and navigates to Now Playing
- current playing track remains visually identifiable if the user returns to the album page

Artist page:
- fetch the artist’s releases from the real data layer
- display a restrained useful subset/ordering consistent with the design
- local editorial overrides may choose featured releases, but do not require overrides for every artist

## 10. Routing/navigation

At minimum support stable navigation for:

```text
/now-playing
/artist/:artistId
/album/:albumId
```

If a static GitHub Pages deployment is used, ensure routing works under the repository base path and does not break on refresh. Hash routing is acceptable if that is the simplest robust solution for the existing deployment.

Breadcrumbs and artist/album text links should be semantic and keyboard accessible.

## 11. Responsive behavior

Primary target: desktop / wide landscape.

Desktop:
- preserve the ~42/58 composition
- Now Playing should feel like one composed spread
- avoid page-level scrolling where practical on a normal desktop viewport; if content or system font metrics make scrolling unavoidable, never clip lyrics or controls

Narrow desktop/tablet:
- reduce cover size before shrinking text below readability floor
- switch the major two-column compositions to one column around the v7 breakpoint region (~900px) if needed
- sticky object columns become static in single-column mode

Mobile is a graceful fallback, not the primary design target. Do not redesign the product into a generic mobile-first card feed.

## 12. Accessibility

Required:
- semantic buttons/links
- visible keyboard focus
- meaningful alt text for album/artist imagery
- seek control keyboard accessible
- drawer has dialog semantics and focus management
- hidden/inactive page content is not keyboard-focusable
- `aria-current`/selected state where appropriate
- `prefers-reduced-motion` respected
- sufficient contrast even when accent colors vary

## 13. Loading/error/empty states

Design states for:
- signed out / connect Spotify
- token expired / re-auth required
- SDK loading
- no active playback device
- Premium/playback unavailable
- no active track
- album art missing
- artist image missing
- lyrics unavailable
- translation unavailable
- editorial note absent
- Spotify API error / rate limit

Do not use raw `alert()` for normal application states.

## 14. Do not copy prototype-only behavior

The reference HTML intentionally simulates a player. Do not copy these production mistakes:

- independent `requestAnimationFrame` fake playback timer
- starting a selected track at an arbitrary 38% position
- hard-coded current artist/album indices
- placeholder monogram artist portrait as the primary production artist image
- direct DOM mutation architecture
- fake lyric lines pretending to be actual lyrics
- remote album image URLs hard-wired as the app’s data source

## 15. Tests

At minimum test pure/domain behavior for:
- playback time formatting
- active lyric line calculation
- next-two-line selection near the end of lyrics
- editorial override lookup
- note-preview visibility when content is missing/present
- route/entity synchronization where practical
- progress/seek math

Then run and fix:
- typecheck
- lint
- tests
- production build

## 16. Work sequence

Execute in this order:

1. repository audit
2. reconcile/supersede old ARC docs and code paths
3. app shell + v7 design tokens
4. typed domain models
5. Spotify auth/API client
6. centralized playback state + Web Playback SDK adapter
7. Now Playing v7 UI
8. timed lyric provider + lyric synchronization
9. Artist v7 UI
10. Album v7 UI
11. editorial/listening note data + reusable drawer
12. loading/error/accessibility states
13. responsive QA
14. tests/build/deployment fixes
15. final acceptance-checklist pass

Do not stop at a compile-only result. Manually inspect Now Playing, Artist, Album, and the note drawer at representative desktop widths.

## 17. Definition of done

Implementation is complete only when every item in `ACCEPTANCE_CHECKLIST.md` is satisfied and the repository README documents:

- local setup
- Spotify developer app setup
- environment variables
- exact redirect URI rules for local and deployed environments
- build/test commands
- deploy command/workflow
- known Spotify Premium/playback limitations
- how to add/edit Artist Editorial Notes
- how to add/edit Album Editorial Notes
- how to add/edit Song Listening Notes
- how to swap lyrics/translation providers
