# ARC Music v7.4 — design revision

Date: 2026-10-03

v7.4 changes only the type sizes. It is tuned for reading at desk distance on a 24" 1920×1080 monitor
(about 92 PPI, so 1px ≈ 0.28mm), where the 9–10.5px labels were hard to read. The small
text grows and the display type stays where it was, so the pages keep their proportions: the change adds only a few
percent of text area. Every earlier rule stands unless this file says otherwise.

## Changed

**Display type: unchanged.** Artist, album, track, Library and drawer titles, the current lyric, the section heads
and the next lyric lines keep their v7 fluid sizes.

**Colour**
- `--dim` goes from `#8f928c` to `#747771`, so the faint grey on paper rises from 2.7:1 to 3.9:1. It is still lighter
  than `--muted` (4.7:1), which keeps the order of ink → muted → dim.

**Floors**

| Role | Before | v7.4 |
| --- | --- | --- |
| Uppercase micro labels (breadcrumbs, top bar, `.label`, meta keys, head counts, buttons, filters, kickers, drawer head and foot, `Read full note →`) | 9–10.5px, .08–.15em | 11px, .09em |
| Kickers that carry Korean (note `##` sections, era markers, `Curated · 반말 · 해체`) | 10px, .13em | 12px, .06em |
| Sentences set small: playback state, album fineprint, elapsed / total time | 9.5–10.5px | 12px |
| Metadata (meta values, release meta, row meta, guests, durations, sources, search result kind) | 11–11.5px | 12.5px |
| Track and row numbers, year labels | 11px | 12px |

The micro labels lose some tracking as they grow, so they barely get wider.

**Reading text**

| Text | Before | v7.4 |
| --- | --- | --- |
| Translation under the current lyric | 15px / 1.55 | fluid 17–19px / 1.5 |
| Note drawer body | 14px / 1.9 | 16px / 1.85 |
| Note preview on a page | 12.5px | 14px |
| Track and index titles | 13.5px | 14.5px |
| Lyric pairs in the translation note, edition list | 12–13px | 14px |
| Artist origin, Library intro, empty rows | 13px | 14px |
| Archive previews | 12px | 13.5px |
| Drawer subtitle | 12px | 13px |

The translation row is the one reading line that follows the viewport. It reaches 19px on a 1920px-wide window
and never goes below 17px. At every width it stays smaller than the next lyric lines (18–25px).

## Unchanged

- Graphic marks: the logo's sub-mark, the avatar initial, the explicit badge and the text on placeholder covers.
- Layout, spacing, hairlines, the one accent and the responsive breakpoints.
