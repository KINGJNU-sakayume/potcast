# Codex instructions for potcast

This repository is the source of truth. Scope requested changes narrowly. For note, translation, and album-episode content, the canonical editorial specifications are the existing Claude skills, not duplicated prose in this file:
- `.claude/skills/write-note/SKILL.md` for artist/album/song notes and research
- `.claude/skills/translate-lyrics/SKILL.md` for curated lyric translation
- `.claude/skills/write-episode/SKILL.md` for the spoken script and playback cues
- `.claude/skills/make-podcast/SKILL.md` for the end-to-end album-podcast workflow

Codex-facing skills at `.agents/skills/*/SKILL.md` are lightweight entry points that defer to those canonical files. Read only the relevant sections and source files for the requested task, not the entire repository. Do not silently weaken any research, provenance, script-format, duration, or testing criteria to save tokens.

## Role routing for album workflows

When custom subagents are supported and delegation is useful, use the project roles from `.codex/agents/`:
- `id-scout` (Luna Low): research and verify Spotify IDs; no edits
- `song-writer` (Sol Medium): one assigned song note at a time
- `lyrics-translator` (Sol Medium): one assigned song translation at a time
- `note-checker` (Luna Low): run checks and report failures; no editorial edits
- Main agent (Sol Medium project default): artist/album reviews, episode script, integration and orchestration

For `make-podcast`, inspect the current note inventory and `npm run notes:audit -- <artist-key>` first. Do not rewrite passing notes or existing translations without a specific need. Research and enrich missing or insufficient material before writing the episode. Divide independent song files among agents only when the benefits exceed repeated setup/context cost; do not make multiple agents edit the same file. Use the existing editorial notes as the sole source of episode facts, according to `write-episode`.

When custom subagents are unavailable (including in Codex clients that do not load project agent TOML), the main agent follows the same task routing and canonical skills directly; do not claim delegation occurred.

After changes, run the relevant targeted audits and, when possible, `npm run check`. Distinguish passing tests from tests not run. Do not modify application UI, playback behavior, or existing translations unless explicitly requested.
