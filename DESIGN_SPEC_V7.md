# ARC Music v7 — Design specification

This document describes the visual contract represented by `reference/music_player_notes_v7_mockup.html`.

## Global shell

Desktop shell:

- fixed left rail: approximately 68px
- top bar: approximately 68px
- content stage fills the remainder
- no persistent bottom player/footer
- warm paper-like neutral base
- thin separators
- low-radius or square geometry
- album/artist accent appears sparingly as an active marker or subtle glow

Navigation rail:
- ARC Music logo at top
- Now Playing
- Artist
- Album
- settings affordance at bottom
- compact user marker may remain if real account/profile data is available

Top bar:
- breadcrumbs left
- `Personal Music Archive` mark centered on desktop
- quiet context text right

Do not add a Catalogue/Specimen mode toggle.

## Type system

Fonts:

```css
--font-en: "IBM Plex Sans", sans-serif;
--font-ko: "Noto Sans KR", sans-serif;
--font-ja: "Noto Sans JP", sans-serif;
```

Reference hierarchy:

- navigation/breadcrumb/micro labels: ~10–11px
- body metadata: ~11.5–13px
- drawer body: ~14px with generous line-height
- artist/album/track primary title: fluid ~42–104px depending on context
- current lyric: fluid ~36–64px
- next lyric: ~18–25px

Large display type should use slightly tight tracking and strong but not ultra-bold weight.

## Now Playing

Container:
- max width around 1450px
- centered
- desktop grid: `42% / 58%`
- gap around 64px

### Left: object column

Keep together:
1. square album cover
2. `Now playing` label
3. track title
4. artist · album links
5. compact metadata row

The cover is visually important but does not need to dominate the viewport. Reference maximum is about 520px and also constrained by viewport height/width.

Metadata fields:
- Track (`04 / 11` style)
- Release
- Duration
- Language

### Right: listening column

Top:
- `Lyrics`
- quiet album/track-count context aligned right
- black/ink divider

Lyrics:
- current original line is the primary text
- translation is smaller/muted immediately below
- next two original lines follow at progressively reduced emphasis

Listening Note preview appears after lyrics.

Transport sits at the bottom of this right column:
- previous
- play/pause in filled circular control
- next
- horizontal progress/seek
- current time / total time

No other visible playback bar exists elsewhere in the app.

## Artist

Container max width around 1380px.

Hero/profile composition:
- left image column ~280–390px
- right identity column
- gap ~54px
- aligned around the visual center rather than huge top/bottom whitespace

Right identity:
- `Artist profile` small label
- large artist name
- origin / role line
- short Editorial Note preview

Below a thin divider:
- `Albums`
- horizontal release rows

Release row:
- restrained square cover (~180px on wide desktop)
- year / format label
- title
- track count / total duration / language metadata
- simple `Open album` action aligned right

Do not render a grid of oversized shopping-card tiles.

## Album

Container:
- max width around 1450px
- desktop grid: `42% / 58%`
- gap around 64px

### Left

- square album cover
- `Album` label
- album title
- artist link
- release metadata
- Editorial Note preview

Metadata:
- Release
- Format
- Tracks
- Duration

This column may be sticky on wide screens.

### Right

- `Track Sequence` heading
- track count aligned right
- complete track table

Track rows:
- track number
- title
- duration
- thin separators
- subtle accent-tinted hover/active state
- small horizontal shift/padding on hover is acceptable

Do not move the sequence below an oversized hero.

## Notes preview

Shared visual pattern:

- top divider
- small uppercase kicker
- context token (`ARTIST`, `ALBUM`, `SONG`) aligned right in the current accent
- short paragraph
- `Read full note →`

No filled card/background.

If the entity has no note, omit the entire preview instead of displaying a blank shell.

## Note drawer

Reference width: max ~470px, capped at ~92vw.

Visual structure:
- warm paper background
- left separator
- restrained shadow
- fixed to right edge, full height
- header with `Archive note` + close
- body: context, large title, subtitle, ink rule, long-form copy, quiet footer

The drawer is a reusable component. Artist/Album/Song must not each implement separate drawer designs.

## Motion

Use motion sparingly:
- page/view transitions: subtle opacity + small y movement
- drawer: right slide
- backdrop: opacity
- hover: small padding shift or underline

No springy motion, parallax, continuous decorative animation, or “AI showcase” effects.

Respect `prefers-reduced-motion` by reducing/removing transitions.

## Responsive

At roughly 900px and below:
- two-column Player/Album become one column
- Artist hero becomes one column
- sticky object columns become static
- cover width caps around ~430px
- rail may narrow to ~56px
- centered top mark may disappear

At roughly 1180px and below:
- reduce horizontal padding/gaps first
- do not aggressively shrink typography

## Visual anti-goals

Reject changes that make the app look like:
- Spotify clone
- Apple Music clone
- generic dashboard
- ecommerce album grid
- glassmorphic AI product
- museum/specimen-book design exercise

The intended mood is a calm, contemporary personal archive with album-led editorial composition.
