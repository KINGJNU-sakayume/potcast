import { describe, expect, it } from 'vitest';
import { albumNotes } from '../editorial/albums';
import { songNotes } from '../editorial/songs';
import { createPreviewCatalogueSource } from '../preview/previewSource';
import { EPISODE_FILES, getEpisodeScript, loadEpisodeScripts } from './episodes';
import { albumEpisodeTracks, episodeMusicMs, episodeRelease, episodeTalkMs, resolveEpisode } from './resolve';
import { estimateSpeechMs, MAX_UTTERANCE_CHARS, splitUtterances } from './speechText';
import type { EpisodeTrack } from './types';

/** A song note as a track, with the length its lyric times were taken on (or a long one when it has none). */
function noteTrack(key: string): EpisodeTrack {
  const note = songNotes.find((song) => song.key === key)!;
  return { key, id: `note-${key}`, uri: `spotify:track:${key}`, title: note.titles[0]!, durationMs: note.translation?.timeline.timing.durationMs ?? 600_000 };
}

describe('the episode scripts in the archive', () => {
  const scripts = loadEpisodeScripts(EPISODE_FILES, { strict: true });

  it('exist and are named after their album note', () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script.key, `${script.key}: the file is named after its album`).toBe(script.album);
      expect(albumNotes.some((note) => note.key === script.album), `${script.key}: no album note "${script.album}"`).toBe(true);
    }
    expect(new Set(scripts.map((script) => script.album)).size).toBe(scripts.length);
  });

  it.each(scripts.map((script) => [script.key, script] as const))('%s plays against its album note\'s tracks', (_key, script) => {
    const album = albumNotes.find((note) => note.key === script.album)!;
    const tracks = (album.tracks ?? []).map(noteTrack);
    const episode = resolveEpisode(script, tracks, songNotes);
    expect(episode.warnings).toEqual([]);
    expect(episode.cues.length).toBe(script.cues.length);

    // Every chapter starts on a cue, in order, and the episode opens and closes with the hosts.
    const starts = episode.chapters.map((chapter) => chapter.cueIndex);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBe(0);
    expect(episode.cues[0]!.type).toBe('talk');
    expect(episode.cues.at(-1)!.type).toBe('talk');

    // Each track of the album is heard whole at least once.
    const whole = new Set(
      episode.cues.flatMap((cue, index) => {
        if (cue.type !== 'music') return [];
        // A track counts as whole when a stretch starts it at the top and it then runs to its end, talk-overs included.
        let ended = cue.untilMs === null;
        for (let i = index + 1; !ended && i < episode.cues.length; i += 1) {
          const next = episode.cues[i]!;
          if (next.type === 'talk') continue;
          if (next.type === 'over') continue;
          if (next.fromMs !== null) break;
          ended = next.untilMs === null;
        }
        return cue.fromMs === 0 && ended ? cue.tracks.map((track) => track.key) : [];
      }),
    );
    expect([...whole].sort()).toEqual([...(album.tracks ?? [])].sort());

    // A talk-over has to fit in what is left of the track it sits on, with room to spare for a slower voice.
    for (const cue of episode.cues) {
      if (cue.type !== 'over') continue;
      const talkMs = cue.lines.reduce((sum, line) => sum + splitUtterances(line.text).reduce((ms, utterance) => ms + estimateSpeechMs(utterance) + 200, 250), 0);
      expect(cue.fromMs + talkMs * 1.4, `the talk over "${cue.track.title}" at ${cue.fromMs} ms outlasts the track`).toBeLessThan(cue.track.durationMs);
    }
    expect(episodeMusicMs(episode)).toBeGreaterThan(0);
    expect(episodeTalkMs(episode)).toBeGreaterThan(60_000);
  });

  it.each(scripts.map((script) => [script.key, script] as const))('%s is written to be spoken', (_key, script) => {
    const hostIds = new Set(script.hosts.map((host) => host.id));
    for (const cue of script.cues) {
      if (cue.type === 'music') continue;
      for (const line of cue.lines) {
        expect(hostIds.has(line.host)).toBe(true);
        // A turn is a few sentences, not a paragraph of a review read aloud.
        expect(line.text.length, `line ${cue.sourceLine}: "${line.text.slice(0, 30)}…" is too long for one turn`).toBeLessThanOrEqual(260);
        for (const utterance of splitUtterances(line.text)) {
          expect(utterance.length, `line ${cue.sourceLine}: "${utterance}" cannot be cut into short utterances`).toBeLessThanOrEqual(MAX_UTTERANCE_CHARS);
        }
        // Spoken Korean ends its sentences politely (해요체 / 합쇼체), not in the notes' written "-다".
        expect(line.text, `line ${cue.sourceLine}: ends like a written note`).not.toMatch(/[^니까]다\.$/);
      }
    }
  });
});

describe('the preview archive', () => {
  it('can perform the IGOR episode on its sample album', async () => {
    const album = await createPreviewCatalogueSource().getAlbum('5zi7WsKlIiUXv09tbGLKsE');
    const script = getEpisodeScript('igor');
    expect(script).not.toBeNull();
    const episode = resolveEpisode(script!, albumEpisodeTracks(album), songNotes, episodeRelease(album));
    expect(episode.release).toMatchObject({ id: album.id, name: 'IGOR' });
    expect(episode.cues.filter((cue) => cue.type === 'music').length).toBeGreaterThan(12);
    expect(episode.warnings).toEqual([]);
  });

  it('finds no episode for an album without one', () => {
    expect(getEpisodeScript('stray-sheep')).toBeNull();
    expect(getEpisodeScript(null)).toBeNull();
  });
});
