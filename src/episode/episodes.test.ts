import { describe, expect, it } from 'vitest';
import { albumNotes } from '../editorial/albums';
import { songNotes } from '../editorial/songs';
import { createPreviewCatalogueSource } from '../preview/previewSource';
import { EPISODE_FILES, getEpisodeScript, loadEpisodeScripts } from './episodes';
import { applySay } from './narration/clip';
import { episodeClips, readAsWritten } from './narration/plan';
import { albumEpisodeTracks, episodeMusicMs, episodeRelease, episodeTalkMs, resolveEpisode } from './resolve';
import { captionText, estimateSpeechMs, MAX_UTTERANCE_CHARS, splitUtterances } from './speechText';
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

    // Each track the episode walks through — the whole album unless it says otherwise — is heard whole at least once.
    const covered = script.covers ?? album.tracks ?? [];
    for (const key of covered) expect(album.tracks ?? [], `${script.key}: "covers" names "${key}", which is not on the album`).toContain(key);
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
        // Tracks from outside the album are played in part, or not: they are not what the episode is about.
        return cue.fromMs === 0 && ended ? cue.tracks.filter((track) => !track.outside).map((track) => track.key) : [];
      }),
    );
    expect([...whole].sort()).toEqual([...covered].sort());

    // A stretch of a track from outside the album is a quotation, not a second programme.
    for (const cue of episode.cues) {
      if (cue.type !== 'music' || !cue.tracks.some((track) => track.outside)) continue;
      expect(cue.tracks, 'a track from outside the album is played by itself').toHaveLength(1);
      const playedMs = (cue.untilMs ?? cue.tracks[0]!.durationMs) - (cue.fromMs ?? cue.fallbackFromMs);
      expect(playedMs, `"${cue.tracks[0]!.title}" is played for too long`).toBeLessThanOrEqual(60_000);
    }

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

  it.each(scripts.map((script) => [script.key, script] as const))('%s is written to be recorded', (_key, script) => {
    for (const cue of script.cues) {
      if (cue.type === 'music') continue;
      for (const line of cue.lines) {
        for (const utterance of splitUtterances(line.text)) {
          // Each utterance is recorded by itself. One that stops in the middle of a clause is said as if the sentence
          // ended there: a long sentence needs a comma near its middle, or to be two sentences.
          expect(captionText(utterance), `line ${cue.sourceLine}: "${utterance}" is cut in the middle of a clause`).toMatch(/[.!?…,]$/);
        }
      }
    }
    // A Korean voice reads Hangul reliably, and English titles and numerals less so: each gets a reading under `say:`.
    const asWritten = [...new Set(episodeClips(script).flatMap((clip) => readAsWritten(clip.text)))];
    expect(asWritten, `${script.key}: add a "say:" line for each of these`).toEqual([]);
    // Every reading is used; one that no longer matches anything is a typo or a leftover.
    const spoken = script.cues.flatMap((cue) => (cue.type === 'music' ? [] : cue.lines.map((line) => line.text))).join('\n');
    for (const rule of script.say) expect(applySay(spoken, [rule]), `${script.key}: the reading for "${rule.from}" matches no line`).not.toBe(spoken);
  });
});

describe('the preview archive', () => {
  it('performs Definitely Maybe in standard-edition order with valid replay bounds', async () => {
    const album = await createPreviewCatalogueSource().getAlbum('0fLVm67GzAJpbqX8GUL7G6');
    const script = getEpisodeScript('definitely-maybe');
    expect(script).not.toBeNull();
    const tracks = albumEpisodeTracks(album);
    expect(tracks.map((track) => track.key)).toEqual(albumNotes.find((note) => note.key === 'definitely-maybe')!.tracks);
    expect(tracks).toHaveLength(11);
    const episode = resolveEpisode(script!, tracks, songNotes, episodeRelease(album));
    expect(episode.warnings).toEqual([]);
    for (const cue of episode.cues) {
      if (cue.type !== 'music') continue;
      const length = cue.tracks.reduce((sum, track) => sum + track.durationMs, 0);
      expect(cue.fromMs ?? cue.fallbackFromMs).toBeLessThan(length);
      if (cue.untilMs !== null) expect(cue.untilMs).toBeLessThanOrEqual(length);
    }
  });

  it('can perform the IGOR episode on its sample album', async () => {
    const album = await createPreviewCatalogueSource().getAlbum('5zi7WsKlIiUXv09tbGLKsE');
    const script = getEpisodeScript('igor');
    expect(script).not.toBeNull();
    const episode = resolveEpisode(script!, albumEpisodeTracks(album), songNotes, episodeRelease(album));
    expect(episode.release).toMatchObject({ id: album.id, name: 'IGOR' });
    expect(episode.cues.filter((cue) => cue.type === 'music').length).toBeGreaterThan(12);
    expect(episode.warnings).toEqual([]);
  });

  it('resolves the whole Flower Boy episode against the preview release and its real track durations', async () => {
    const album = await createPreviewCatalogueSource().getAlbum('2nkto6YNI4rUYTLqEwWJ3o');
    const script = getEpisodeScript('flower-boy');
    expect(script).not.toBeNull();
    const tracks = albumEpisodeTracks(album);
    expect(tracks).toHaveLength(14);
    const episode = resolveEpisode(script!, tracks, songNotes, episodeRelease(album));
    expect(episode.warnings).toEqual([]);
    // Preview uses real durations: replay bounds must also be valid on the actual edition.
    for (const cue of episode.cues) {
      if (cue.type !== 'music') continue;
      const length = cue.tracks.reduce((sum, track) => sum + track.durationMs, 0);
      expect(cue.fromMs ?? cue.fallbackFromMs).toBeLessThan(length);
      if (cue.untilMs !== null) expect(cue.untilMs).toBeLessThanOrEqual(length);
    }
  });

  it('finds no episode for an album without one', () => {
    expect(getEpisodeScript('stray-sheep')).toBeNull();
    expect(getEpisodeScript(null)).toBeNull();
  });
});
