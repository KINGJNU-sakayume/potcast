# ARC Music v7.5 — design revision

Date: 2026-10-06

v7.5 rebuilds the desktop around player1's Now Playing. Each page takes the colour of its own image. The top bar is
gone, and notes, the queue and settings open in one right-hand column. The desktop is tuned for two monitors: a 24"
1920×1080 and a 34" 21:9 (Samsung S34J55x, 3440×1440 at 100% Windows scaling, so about 3440×1310 inside a maximised
Chrome), used both full width and as a half-screen window (1720×1310). The phone shell (760px and narrower) is
unchanged, apart from the lyrics view gaining the line just sung. Every earlier rule stands unless this file says
otherwise. The prototype used to settle these decisions is
[ARC Desktop Redesign](https://claude.ai/artifact/BRFxCehcsNSnLtCAnSBXWs).

## Decisions

1. **Colour per page.** A page takes the colour of its own image, through player1's stage theme
   ([`src/palette/stageTheme.ts`](src/palette/stageTheme.ts)):
   - Now Playing: the playing album.
   - Album: that album's cover.
   - Artist: the artist's photograph.
   - Library, Archive and Search: the warm paper, with the playing album's accent.
2. **No top bar.**
   - The breadcrumb becomes "‹ the page you came from" at the top of Artist and Album.
   - Search moves to the rail and `/`.
   - The Spotify status line moves to Settings.
3. **Notes start closed**, on 21:9 too. Every note opens in the right-hand column.
4. **The Library is one screen**: two columns on 16:9, three on 21:9.
5. **100% scaling** is the reference for the 34" monitor.
6. **Lyrics show** the line just sung, the current line with its translation, and the next two lines. This applies to
   desktop Now Playing, Focus Mode and the phone's lyrics view, but not to the phone's one-line lyric peek.

## Shell

- **Rail.** player1's icon-over-label column, 88px wide (96px from 1200px tall). Its items are Now playing ·
  Library · Archive · Search · Artist · Album, then Queue · Settings · the account. Away from Now Playing, the playing
  cover, its progress and a playing mark sit above Queue and lead back to Now Playing. There is still no global
  playback footer.
- **Logo.** player1's record mark ([`src/components/Logo.tsx`](src/components/Logo.tsx)) replaces the "ARC / music"
  box. It is drawn in `--ink` and `--bg`, so it takes each page's colour and turns light on a dark album stage. The
  favicon and the Home Screen icons use the same mark.
- **Signed out.** The Connect and authorization screens keep the rail and the logo, without a top bar.
- **Right-hand column.** It holds one thing at a time: a note, the queue or settings.
  - It sits beside the page and pushes it aside, so it is a complementary region, not a dialog.
  - Opening it moves focus to its close button, closing it returns focus to whatever opened it, and `Esc` closes it.
  - Width: 530px; 580px from 1200px tall; 680px from 2400px wide; 400px at 1180px and below.
- **‹ Back.** The desktop follows its own history and remembers each page's name. Now Playing, Library and Archive
  are named by their section; an artist or an album by its title.
- **Focus Mode.** Now new on the desktop, entered with `F` or the transport button. It asks for full screen, and leaves
  on `Esc` or when full screen ends. It shows the cover, the lyrics and the seek bar.
- **Search** stays the one modal overlay. It grows on 21:9 and its result groups sit side by side.

## Size

- 1920×1080 keeps the v7.4 sizes.
- Big things — covers, titles, page headings, lyrics — follow `min(width, height)`. A 21:9 window is therefore sized
  by its height:

| On 3440×1310 | 1920×1080 | 3440×1310 |
| --- | --- | --- |
| Current lyric | 64px | 78px |
| Title | 78px | 94px |
| Now Playing cover | ~675px | ~975px |

- From 1200px tall (a 1440p monitor at 100%), small type grows by 10%: labels go from 11 to 12px and note bodies from
  16 to 17.6px. A 34" 1440p pixel is about 16% smaller than a 24" 1080p one.
- From 2400px wide, the 21:9 layouts below switch on. Below 1100px, the page stacks in one column and the right-hand
  column overlays it.

## Pages

| Page | 16:9 · 1920×1080 | 21:9 · 3440×1310 | Half window · 1720×1310 |
| --- | --- | --- | --- |
| Now Playing | Two columns: on the left the cover, title and artist · album; on the right the lyrics, a one-line Listening note, the seek bar and the transport line. Opening the full note runs the lyrics across, and the album drops to a card in the bottom-left corner | Cover ~975px, and the lyric column is capped at 1640px. Opening the full note adds a third column; the cover stays ~940px | Two columns, cover ~650px. The note opens as on 16:9 |
| Focus Mode | Cover, lyrics and progress | Centred, with the album colour either side | As 16:9 |
| Album | Cover colour. On the left, kept in view: the cover, title, artist, release meta, note preview and actions. On the right: the track sequence and the previous / next release | The same two columns, centred (at most 2300px), with a bigger cover | As 16:9 |
| Artist | Photograph colour. Above: the portrait, name, origin, note preview and actions. Below: the discography timeline in two or three columns (by its own width), with era markers across the full width | The introduction is kept in view on the left; the timeline runs on the right | As 16:9 |
| Library | Liked songs and Recently played on the left. On the right: Liked albums and Playlists as big covers, then Artists | Three columns: lists · covers · artists | Two columns |
| Archive | The artists with notes on the left. On the right, the chosen artist (`?artist=`): the artist note with a portrait, album-note cards with covers, and the Listening notes under their albums in tracklist order. Notes open in the right-hand column. Notes are local; artwork is the note's `image` / `cover` URL, else Spotify's when connected, else the archive plates | The same two panes | As 16:9 |

### Now Playing

- **Transport line.** Shuffle · previous · play · next on the left; like · queue · device · volume · Focus Mode on the
  right.
- **Status line.** Only problems reach it. For "no active device", *Choose device* opens the device list.
  - "Playing on …", "Play in this browser", the SDK line and the preview line are gone from Now Playing.
  - Settings shows where playback happens.
- **Removed.** The Track / Release / Duration / Language block.

## Code

- **Colour.** `src/app/surface.tsx` provides `usePageSurface({ key, imageUrl })`. Pages declare their image with it.
  - The desktop shell reads the image's palette (`useAlbumPaletteState`, which holds the last colour while the next one
    is read) and sets the stage tokens on `.app.desktop`, under player2's own names.
  - `@property` registrations let the colours fade from page to page.
- **Styles.** `src/styles/desktop.css` holds every desktop rule, scoped to `.desktop`.
- **New pieces.**
  - `src/app/backHistory.tsx`: back history and `BackLink`.
  - `src/components/desktop/SidePanel.tsx`: the right-hand column.
  - `src/components/desktop/CoverTile.tsx`: the Library's covers.
- **Shared with the phone.** `QueueContent` and `SettingsBody` are taken out of the phone's sheets, which render
  exactly as before.
- **Lyrics.** `useLyricView` gains `previous` and `previousIndex`. The previous line renders as
  `p.previous-lyric`, with a hidden "Previous line:" for screen readers.
