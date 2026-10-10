# Quick handoff to Codex

Paste this as the first instruction in the Codex task after placing this package in the repository:

```text
Read the ARC v7 implementation package completely before changing code, starting with:
- 00_READ_FIRST.md
- CODEX_MASTER_PROMPT.md
- DESIGN_SPEC_V7.md
- FUNCTIONAL_ARCHITECTURE.md
- EDITORIAL_AND_DATA_SPEC.md
- ACCEPTANCE_CHECKLIST.md
- reference/music_player_notes_v7_mockup.html

Treat these as the canonical product/design requirements. They supersede earlier ARC Catalogue and Specimen Book instructions where they conflict.

First audit the existing repository and summarize the current stack, routing, state, Spotify/auth code, styling, CI, and deployment. Then implement ARC Music v7 in milestone-sized changes without redesigning it.

Critical constraints:
- one Now Playing design only
- no Catalogue/Specimen modes
- no persistent bottom playback bar
- Now Playing controls/progress appear only on Now Playing
- preserve the v7 album-led 42/58 Player and Album compositions
- keep Artist compact
- keep short Editorial/Listening Note previews plus one shared right drawer
- no object/curatorial/palette/design-lab metadata
- real Spotify metadata and playback state in production
- no hard-coded copyrighted lyrics
- do not declare completion until ACCEPTANCE_CHECKLIST.md passes
```
