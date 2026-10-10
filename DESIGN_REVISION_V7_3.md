# ARC Music v7.3 — design revision

Date: 2026-10-02

v7.3 is the second step toward a player for digging through discographies. The Artist page reads as a chronology,
every album page leads to the next record, and the archive's own writing gets an index. Every v7 / v7.1 / v7.2 rule
stands unless this file says otherwise.

## Added

**Artist — Discography timeline** (replaces the *Albums* list and *Show more releases*)
- Head: `Discography` with the count of the open group. On the right, the release-group filters in the search
  overlay's filter style (Albums / Singles & EPs / Compilations / Appears on) and an order toggle (`Oldest first`
  by default, `Newest first`). Both are kept in the URL (`?group=single&order=desc`) so Back returns to the same view.
- Each group loads completely before it is shown, so the order is the real chronology rather than Spotify's page order.
- Releases are grouped by year. Each year section is an 88px year column in micro type beside its releases, separated
  by a hairline. Studio albums keep the v7 horizontal release row with its 180px cover; the other groups use the
  compact object row (56px cover).
- Editions (deluxe, remaster, anniversary, regional, bonus-track) are folded under the original. A quiet
  `+2 editions` toggle opens a hairline list of the other editions (title · date · tracks).
- Eras: when the artist's note lists `eras`, the timeline marks where each begins. The marker is an ink rule, the
  years in the accent and the era's name in 10px uppercase. It never becomes a heading or a card.

**Album — Discography steps**
- Under the Track Sequence: a `Discography` head (`01 / 02 · Albums · Artist`) over an ink rule, then two halves.
  The left half is `← Previous · year` with the previous title, the right half `Next → · year` with the next title.
  At the ends, a quiet `The first release` / `The latest release`.
- `[` / `]` open the previous / next release (ignored while typing or while a dialog is open).
- Hidden for an artist's only release and for releases that are not in the main artist's own groups.

**Archive** (`#/archive`, rail item between Library and Search)
- A Library-style head (`Archive`, with totals) and one section per artist. The artist's name, origin and counts sit
  in a left column; on the right is a hairline index. That index holds the artist note, then album notes by release
  year, listening notes and curated translations. Each row shows a one-line preview, `Read` (opens the shared note
  drawer) and, for songs, `Play`.
- No Spotify request; the page is built from the local notes and translations.

## Unchanged

- No progress tracking of what has been listened to.
- No card grids; covers stay square and restrained; one accent; hairlines; reduced motion respected.
