# ARC Music v7.2 — design revision

Date: 2026-10-02

v7.2 makes ARC a player for digging through discographies: notes can be long-form reviews, and lyrics can carry a
translation written for the song's context. It keeps every v7 / v7.1 composition. Where this file and the earlier
packages disagree, this file wins; everywhere else v7.1 stands.

## Added

**Long-form notes in the shared drawer**
- The v7 spec kept the drawer free of "markdown-heavy presentation unless later designed". This is that design.
- Note text supports a small Markdown subset: paragraphs, `##` / `###` sections, lists, quotes, emphasis, links.
- `##` sections read as quiet kickers: 10px uppercase, a soft hairline above, ink colour. They never compete with the
  drawer title. The first section drops its hairline (the ink rule is already above it).
- Lists use a 7px hairline dash instead of a bullet. Quotes carry a 1px accent rule on the left.
- The foot keeps *Personal Music Archive / Notes* and adds, when known, *Written* / *Revised* dates and a numbered
  source list in sentence case.
- Album notes are written as critic-style reviews, without scores. The page preview (`short`) is unchanged: 2–3
  lines, no Markdown.

**Curated lyric translation**
- When the archive has a curated translation for the playing song, the lyrics header shows
  `Curated · 반말 · 해체` (the speech level kept throughout) in the accent colour, and a `Translation note →` link in
  the same micro type as `Read full note →`.
- The translation row under the current lyric is unchanged. Only its source changes.
- `Translation note →` opens the shared drawer (*Translation note / Song*). It shows the brief: speaker and
  addressee, the speech level and the reasoning behind it, pronouns and recurring terms. Below that is a 대역
  section listing every original line with its translation, separated by soft hairlines. Lines filled by machine
  translation carry a quiet `· machine`. The section kicker shows the coverage (`31 / 33 lines curated`).
- On narrow screens the header items wrap onto separate right-aligned lines.

## Unchanged

- One shared right-hand drawer for notes, translation notes and the queue.
- Translation On / Off governs curated and machine translation alike.
- No note or translation is ever generated for an entity without one.
