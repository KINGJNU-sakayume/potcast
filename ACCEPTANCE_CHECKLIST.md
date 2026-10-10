# ARC Music v7 — Acceptance checklist

Codex must verify every applicable item before declaring the implementation complete.

## Scope

- [ ] Only one Now Playing design exists
- [ ] No Catalogue/Specimen mode toggle exists
- [ ] No Specimen Book route/component survives in the production UI
- [ ] No global bottom playback bar exists
- [ ] Playback controls are visible only on Now Playing
- [ ] Object Note / Curatorial Note / palette commentary / design-lab metadata are absent

## Global visual system

- [ ] IBM Plex Sans / Noto Sans KR / Noto Sans JP hierarchy is preserved
- [ ] Warm off-white/paper base is preserved
- [ ] Accent color use is restrained
- [ ] Small functional text is readable
- [ ] No generic card-heavy redesign
- [ ] No excessive rounded/pill UI
- [ ] No glassmorphism or AI-gradient styling

## Now Playing

- [ ] Desktop composition is approximately 42% object / 58% listening
- [ ] Album cover is square, large, and grouped with title/artist/album
- [ ] Track metadata includes track number, release, duration, language when available
- [ ] Lyrics heading/context follows v7 placement
- [ ] Current lyric is dominant
- [ ] Translation is directly below current lyric when available
- [ ] Next two lyric lines show reduced emphasis
- [ ] Missing next lines are blank/omitted, never duplicated from the last line
- [ ] Listening Note preview is compact
- [ ] `Read full note →` opens the shared drawer when a note exists
- [ ] Previous/play-next controls work against real playback state
- [ ] Seek/progress works and is keyboard accessible
- [ ] Current/total time reflect real track state
- [ ] No fake independent playback timer remains

## Artist

- [ ] Real artist image is used when available
- [ ] Artist identity and image remain spatially close
- [ ] Artist Editorial Note preview is compact
- [ ] Full note uses the shared drawer
- [ ] Albums/releases render as restrained horizontal rows
- [ ] Album cover/title/year/format/track count/duration/language are presented cleanly where available
- [ ] `Open album` navigates correctly
- [ ] Artists without local editorial notes render cleanly without filler prose

## Album

- [ ] Desktop composition is approximately 42% object / 58% track sequence
- [ ] Cover/title/artist/metadata/note remain grouped left
- [ ] Complete track sequence is right and visible early
- [ ] Track rows show number/title/duration
- [ ] Active/current track is identifiable
- [ ] Clicking a track starts/requests playback and opens Now Playing
- [ ] Album Editorial Note preview is compact
- [ ] Albums without local notes render cleanly without an empty note block

## Note drawer

- [ ] One reusable drawer handles Artist/Album/Song notes
- [ ] Context/title/subtitle/full copy render correctly
- [ ] Close button works
- [ ] Backdrop click works
- [ ] Escape works
- [ ] Focus is trapped while open
- [ ] Focus returns to trigger on close
- [ ] Dialog semantics are present
- [ ] Reduced-motion preference is respected

## Spotify/auth/playback

- [ ] Current official Spotify docs/OpenAPI were consulted
- [ ] SPA authorization uses PKCE
- [ ] No client secret exists in frontend code or committed files
- [ ] Production redirect URI is HTTPS and exactly documented/registered
- [ ] Playback SDK/device initialization has designed states
- [ ] Premium/ineligible playback limitation is handled gracefully
- [ ] Playback survives route changes
- [ ] Player components do not contain scattered raw Spotify `fetch` logic

## Lyrics/translation

- [ ] Lyrics provider interface exists
- [ ] Mock provider uses non-copyright synthetic lines
- [ ] Translation provider is replaceable
- [ ] Active lyric derives from playback position
- [ ] Lyrics failure does not block playback
- [ ] Translation failure does not block original lyrics
- [ ] No copyrighted song lyrics are hard-coded merely for seeding

## Editorial data

- [ ] Editorial types/data are separate from Spotify transport models
- [ ] Vaundy artist note seeded from v7
- [ ] Tyler, The Creator artist note seeded from v7
- [ ] tripleS artist note seeded from v7
- [ ] `strobo` album note seeded from v7
- [ ] `IGOR` album note seeded from v7
- [ ] `<ASSEMBLE24>` album note seeded from v7
- [ ] `怪獣の花唄` listening note seeded from v7
- [ ] `EARFQUAKE` listening note seeded from v7
- [ ] `Girls Never Die` listening note seeded from v7
- [ ] Missing-note entities do not show generated filler

## Accessibility/responsive

- [ ] Visible focus styles
- [ ] Semantic links/buttons
- [ ] Meaningful image alt text
- [ ] Inactive views/routes are not focusable
- [ ] ~1180px layout manually inspected
- [ ] ~900px/single-column transition manually inspected
- [ ] Standard wide desktop manually inspected
- [ ] No clipping of lyric text or transport

## Quality

- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Production build passes
- [ ] Existing CI still passes
- [ ] Existing deployment workflow is preserved or deliberately updated
- [ ] README documents setup, env vars, Spotify redirect URIs, limitations, notes editing, and lyrics-provider replacement
