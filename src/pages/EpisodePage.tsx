import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from '../app/pageTitle';
import { useShell } from '../app/shellContext';
import { usePageSurface } from '../app/surface';
import { useIsMobile } from '../app/useIsMobile';
import { useAlbum, useTracks } from '../catalogue/queries';
import { ArtistLinks } from '../components/ArtistLinks';
import { CoverImage } from '../components/CoverImage';
import { NextIcon, PlayIcon, PreviousIcon } from '../components/icons';
import { DevicePicker } from '../components/player/DevicePicker';
import { LyricsBlock } from '../components/player/LyricsBlock';
import { PlaybackNotice } from '../components/player/PlaybackNotice';
import { Volume } from '../components/player/TransportExtras';
import { PlayingMark } from '../components/PlayingMark';
import { StateView } from '../components/StateView';
import type { AlbumDetail } from '../domain/types';
import { getAlbumNote } from '../editorial/lookup';
import { songNotes } from '../editorial/songs';
import { readBookmark } from '../episode/bookmark';
import { useEpisodeRunner } from '../episode/episodeContext';
import { useEpisodeState } from '../episode/EpisodeProvider';
import { getEpisodeScript } from '../episode/episodes';
import { coverage } from '../episode/narration/plan';
import { useNarrationManifest } from '../episode/narration/useNarration';
import { albumEpisodeTracks, episodeRelease, outsideFound, resolveEpisode, unplayable } from '../episode/resolve';
import { sameTrack, type EpisodeState } from '../episode/runner';
import { captionText, splitUtterances } from '../episode/speechText';
import { sungLinesBetween } from '../episode/sungLine';
import { cueAt, episodeTimeline, speechAt, type EpisodeTimeline } from '../episode/timeline';
import { EpisodeError, type Cue, type Episode, type EpisodeTrack, type MusicCue, type SpokenLine } from '../episode/types';
import { formatDuration, formatRuntime, joinArtistNames } from '../lib/format';
import { pickImageUrl } from '../lib/images';
import { isSpotifyId } from '../lib/spotifyUri';
import { useTimedLyrics } from '../lyrics/useTimedLyrics';
import { useEngine, usePlaybackPosition, usePlayerSelector, usePlayerSnapshot } from '../playback/hooks';
import { usePreferences } from '../preferences/preferences';
import { describeSpotifyError } from '../spotify/errors';
import { detectLineLanguage } from '../translation/languageDetect';

const CUE_OF_SONG = new Map(songNotes.map((note) => [note.key, note.short]));

function hostName(episode: Episode, id: string): string {
  return episode.hosts.find((host) => host.id === id)?.name ?? id;
}

/** "0:47–1:11", "from 2:25", "to 0:30", or the track's length when it plays whole. */
function rangeLabel(cue: MusicCue): string {
  const last = cue.tracks[cue.tracks.length - 1]!;
  const from = cue.fromMs ?? cue.fallbackFromMs;
  if (cue.tracks.length > 1) return formatDuration(cue.tracks.reduce((sum, track) => sum + track.durationMs, 0) - from - (cue.untilMs === null ? 0 : last.durationMs - cue.untilMs));
  if (from <= 0 && cue.untilMs === null) return formatDuration(last.durationMs);
  if (cue.untilMs === null) return `from ${formatDuration(from)}`;
  if (from <= 0) return `to ${formatDuration(cue.untilMs)}`;
  return `${formatDuration(from)}–${formatDuration(cue.untilMs)}`;
}

/** What to listen for in a stretch of music: the script's own words, else the song note's cue. */
function listeningCue(cue: MusicCue, trackIndex = 0): string | undefined {
  return cue.caption ?? CUE_OF_SONG.get(cue.tracks[Math.min(trackIndex, cue.tracks.length - 1)]!.key);
}

function chapterOf(episode: Episode, cueIndex: number): { title: string; number: number } | null {
  for (let i = episode.chapters.length - 1; i >= 0; i -= 1) {
    const chapter = episode.chapters[i]!;
    if (chapter.cueIndex <= cueIndex) return { title: chapter.title, number: i + 1 };
  }
  return null;
}

/** "The whole track", "From the start to 0:25", "From 0:46 to 1:11", "Carry on from 0:25 to the end". */
function stretchLabel(cue: MusicCue): string {
  const last = cue.tracks[cue.tracks.length - 1]!;
  const from = cue.fromMs ?? cue.fallbackFromMs;
  const end = cue.untilMs === null ? 'the end' : formatDuration(cue.untilMs);
  if (cue.tracks.length > 1) return `One after the other${cue.untilMs === null ? '' : `, the last one to ${end}`}`;
  if (from <= 0 && cue.untilMs === null) return `The whole track · ${formatDuration(last.durationMs)}`;
  if (cue.fromMs === null) return `Carry on from ${formatDuration(from)} to ${end}`;
  return `From ${from <= 0 ? 'the start' : formatDuration(from)} to ${end}`;
}

/** "King Crimson · 1969" */
function outsideCredit(track: EpisodeTrack): string {
  const outside = track.outside!;
  return outside.year ? `${outside.artist} · ${outside.year}` : outside.artist;
}

/** The longest stretch whose lines are listed for reading along. */
const MAX_LISTED_LINES = 8;

/* ── What the screen is about ──────────────────────────────────────────── */

/**
 * The track the cover, the title and the seek bar stand for: the one playing,
 * or — while the hosts talk with the music stopped — the one they are leading
 * up to. `stretch` is the part of it the episode plays, when that is known.
 */
interface Subject {
  track: EpisodeTrack | null;
  stretch: MusicCue | null;
  /** Not on yet: the hosts are talking their way to it. */
  ahead: boolean;
}

const NO_SUBJECT: Subject = { track: null, stretch: null, ahead: false };

function subjectOf(episode: Episode, state: EpisodeState, active: boolean): Subject {
  if (!active || state.status === 'ended') return NO_SUBJECT;
  const cue = episode.cues[state.cueIndex];
  if (!cue) return NO_SUBJECT;
  if (cue.type === 'music') return { track: cue.tracks[Math.min(state.trackIndex, cue.tracks.length - 1)]!, stretch: cue, ahead: false };
  if (cue.type === 'over') return { track: cue.track, stretch: null, ahead: false };
  for (let i = state.cueIndex + 1; i < episode.cues.length; i += 1) {
    const next = episode.cues[i]!;
    if (next.type === 'talk') continue;
    // Music Spotify cannot play here is gone past without a sound.
    if (next.type === 'over' ? unplayable(next.track) : next.tracks.some(unplayable)) continue;
    return next.type === 'over' ? { track: next.track, stretch: null, ahead: true } : { track: next.tracks[0]!, stretch: next, ahead: true };
  }
  // The closing words: what was heard last stays up.
  for (let i = state.cueIndex - 1; i >= 0; i -= 1) {
    const before = episode.cues[i]!;
    if (before.type === 'over') return { track: before.track, stretch: null, ahead: false };
    if (before.type === 'music' && !before.tracks.some(unplayable)) return { track: before.tracks[before.tracks.length - 1]!, stretch: null, ahead: false };
  }
  return NO_SUBJECT;
}

/* ── The cover, and the hosts' line in front of it ─────────────────────── */

/**
 * What the host is saying while the music plays on underneath: a slab across
 * the foot of the cover, inside its edges, so the lyrics keep the right-hand
 * column. While the music is stopped for the talk, the line is the lyrics'
 * place's own (TalkPanel) and the cover stays clear.
 */
function Caption({ episode, cue, state }: { episode: Episode; cue: Exclude<Cue, MusicCue>; state: EpisodeState }) {
  const line: SpokenLine | undefined = cue.lines[Math.min(state.lineIndex, cue.lines.length - 1)];
  // What is shown leaves out the sounds only a recorded voice makes (<laugh>).
  const utterances = useMemo(() => (line ? splitUtterances(line.text).map(captionText) : []), [line]);
  if (!line) return null;
  const index = Math.min(state.utteranceIndex, utterances.length - 1);
  return (
    <div className="ep-caption" data-over={cue.type === 'over' ? '' : undefined} role="group" aria-label="The hosts">
      <div className="ep-caption-who">
        <span className="ep-speaker">{hostName(episode, line.host)}</span>
        {cue.type === 'over' && <span>over the music</span>}
      </div>
      {/* Keyed so each utterance comes in afresh, as a lyric line does. */}
      <p key={`${state.cueIndex}:${state.lineIndex}:${index}`} className="ep-caption-line" lang="ko" aria-live="off">
        {utterances[index]}
      </p>
    </div>
  );
}

/**
 * The cover of what is sounding. A track from outside the album takes the
 * whole square, as any playing track would; where the album is, and where the
 * episode goes next, is said in words under the title (OutsideReturn), not by
 * a sliver of the album's cover peeking out behind.
 */
function Cover({ album, track, children }: { album: AlbumDetail; track: EpisodeTrack | null; children?: ReactNode }) {
  const artists = joinArtistNames(album.artists);
  const albumCover = (
    <CoverImage images={album.images} size={640} alt={`${album.name} album cover`} title={album.name} subtitle={artists} paletteKey={album.id} priority />
  );
  const outside = track?.outside;
  return (
    <div className="np-cover ep-cover" data-outside={outside ? '' : undefined}>
      <div className="ep-cover-front">
        {outside && track ? (
          <CoverImage
            key={track.id}
            images={outside.images}
            size={640}
            alt={`${track.title} cover`}
            title={track.title}
            subtitle={outside.artist}
            paletteKey={outside.albumId}
            priority
          />
        ) : (
          albumCover
        )}
      </div>
      {children}
    </div>
  );
}

/* ── The right-hand panel, when it is not the lyrics ───────────────────── */

function PanelHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="listening-head">
      <h2 id="episode-panel-label">{title}</h2>
      {children && <span className="translation-tools">{children}</span>}
    </div>
  );
}

/** Before the episode has been started: what it is, and the ways in. */
function IntroPanel({
  episode,
  facts,
  hint,
  fineprint,
  children,
}: {
  episode: Episode;
  facts: string[];
  hint: string | null;
  fineprint: string[];
  children: ReactNode;
}) {
  return (
    <section className="lyrics-panel ep-panel" aria-labelledby="episode-panel-label">
      <p className="ep-kicker" lang="ko">
        {episode.hosts.map((host) => host.name).join(' · ')}
      </p>
      <p className="current-lyric ep-title" lang="ko" data-hang={episode.title.startsWith('『') || undefined}>
        {episode.title}
      </p>
      {episode.short && (
        <p className="current-trans ep-short" lang="ko">
          {episode.short}
        </p>
      )}
      {/* The way in comes first: on the phone it has to be on the first screen. */}
      <div className="object-actions ep-actions">{children}</div>
      <p className="ep-facts">
        {facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </p>
      {hint && <p className="ep-hint">{hint}</p>}
      {fineprint.map((line) => (
        <p key={line} className="fineprint">
          {line}
        </p>
      ))}
    </section>
  );
}

/**
 * The hosts are talking with the music stopped, so what they say is what is
 * on: it takes the lyrics' place, read the way lyrics are — the line before,
 * the line being said (the sentence being spoken in full ink), the line after.
 * Under it, small, the music they are leading up to.
 */
function TalkPanel({
  episode,
  cue,
  state,
  upcoming,
  upTrack,
  ahead,
}: {
  episode: Episode;
  cue: Exclude<Cue, MusicCue>;
  state: EpisodeState;
  upcoming: MusicCue | null;
  upTrack: EpisodeTrack | null;
  ahead: boolean;
}) {
  const at = Math.min(state.lineIndex, cue.lines.length - 1);
  const line: SpokenLine | undefined = cue.lines[at];
  const utterances = useMemo(() => (line ? splitUtterances(line.text).map(captionText) : []), [line]);
  if (!line) return null;
  const said = Math.min(state.utteranceIndex, utterances.length - 1);
  const before = at > 0 ? cue.lines[at - 1] : undefined;
  const after = cue.lines[at + 1];
  const title = upcoming && upcoming.tracks.length > 1 ? upcoming.tracks.map((item) => item.title).join(' → ') : upTrack?.title;
  // For a track from outside the album, why it is here says more before it plays than what to listen for in it.
  const cueText = upTrack?.outside?.why ?? (upcoming ? listeningCue(upcoming) : undefined);
  return (
    <section className="lyrics-panel ep-panel ep-talk" aria-labelledby="episode-panel-label">
      {before && (
        <p className="ep-talk-around ep-talk-before" lang="ko">
          <span className="ep-speaker">{hostName(episode, before.host)}</span>
          {captionText(before.text)}
        </p>
      )}
      <div className="ep-talk-now" role="group" aria-label="The hosts">
        <span className="ep-speaker">{hostName(episode, line.host)}</span>
        <p key={`${state.cueIndex}:${at}`} className="ep-talk-line" lang="ko" aria-live="off">
          {utterances.map((text, index) => (
            <span key={index} data-at={index < said ? 'said' : index === said ? 'now' : 'ahead'}>
              {text}{' '}
            </span>
          ))}
        </p>
      </div>
      {after && (
        <p className="ep-talk-around ep-talk-after" lang="ko">
          <span className="ep-speaker">{hostName(episode, after.host)}</span>
          {captionText(after.text)}
        </p>
      )}
      {upTrack && title && (
        <div className="ep-upnext">
          <span className="ep-upnext-kicker">
            {ahead ? 'Up next' : 'Just heard'}
            {upTrack.outside && <em>Outside the album</em>}
          </span>
          <span className="ep-upnext-text">
            <b lang={detectLineLanguage(title)}>
              {title}
              {upTrack.outside && <i> — {outsideCredit(upTrack)}</i>}
            </b>
            {cueText && <span lang="ko">{cueText}</span>}
          </span>
          {upcoming && <span className="ep-upnext-range">{stretchLabel(upcoming)}</span>}
        </div>
      )}
    </section>
  );
}

/** The hosts are talking with the music stopped: the lyrics' place says what they are leading up to. */
function RestPanel({ kicker, title, stretch, cue }: { kicker: string; title: string; stretch?: string; cue?: string }) {
  return (
    <section className="lyrics-panel ep-panel" aria-labelledby="episode-panel-label">
      <p className="ep-kicker">{kicker}</p>
      <p className="current-lyric is-state ep-rest-title" lang={detectLineLanguage(title)}>
        {title}
      </p>
      {stretch && <p className="current-trans ep-stretch">{stretch}</p>}
      {cue && (
        <p className="next-line ep-rest-cue" lang="ko">
          {cue}
        </p>
      )}
    </section>
  );
}

/**
 * A stretch of music the listener plays themselves: what to play and how much
 * of it, a link that opens it in Spotify, and the button that tells the
 * episode it has been heard.
 */
function ManualPanel({ cue, translate, onHeard }: { cue: MusicCue; translate: boolean; onHeard: () => void }) {
  const first = cue.tracks[0]!;
  const cueText = listeningCue(cue);
  const lines = translate && cue.tracks.length === 1 && cue.untilMs !== null ? sungLinesBetween(first, cue.fromMs ?? cue.fallbackFromMs, cue.untilMs) : [];
  return (
    <section className="lyrics-panel ep-panel" aria-labelledby="episode-panel-label">
      <p className="ep-kicker">Play this in Spotify</p>
      <p className="current-lyric ep-rest-title" lang={detectLineLanguage(first.title)}>
        {cue.tracks.map((track) => track.title).join(' → ')}
      </p>
      <p className="current-trans ep-stretch">
        {first.outside ? `${outsideCredit(first)} · ` : ''}
        {stretchLabel(cue)}
      </p>
      {cueText && (
        <p className="next-line ep-rest-cue" lang="ko">
          {cueText}
        </p>
      )}
      {lines.length > 0 && lines.length <= MAX_LISTED_LINES && (
        <ul className="ep-lines" lang="ko" aria-label="The lines of this stretch, translated">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      <div className="object-actions ep-actions">
        <button type="button" className="plain-action primary" onClick={onHeard}>
          Heard it · go on
        </button>
        {cue.tracks.map((track) => (
          <a key={track.id} className="plain-action" href={`https://open.spotify.com/track/${track.id}`} target="_blank" rel="noreferrer">
            {cue.tracks.length > 1 ? `Open ${track.title} in Spotify` : 'Open in Spotify'}
          </a>
        ))}
      </div>
    </section>
  );
}

/**
 * Where a track from outside the album sits in the episode: the stretch of it
 * that is played, and the stretch of the album's own track it is heard
 * against right after.
 */
function pairOf(episode: Episode, state: EpisodeState, track: EpisodeTrack): { own: MusicCue | null; against: MusicCue | null } {
  // The stretch of this track: the cue being played, the one a talk-over sits on, or the one the hosts are leading up to.
  let at = -1;
  const current = episode.cues[state.cueIndex];
  if (current?.type === 'music' && current.tracks.includes(track)) at = state.cueIndex;
  for (let i = state.cueIndex - 1; at < 0 && i >= 0 && current?.type === 'over'; i -= 1) {
    const cue = episode.cues[i]!;
    if (cue.type === 'music' && cue.tracks.includes(track)) at = i;
  }
  for (let i = state.cueIndex + 1; at < 0 && i < episode.cues.length; i += 1) {
    const cue = episode.cues[i]!;
    if (cue.type === 'music' && cue.tracks.includes(track)) at = i;
  }
  const own = at >= 0 ? (episode.cues[at] as MusicCue) : null;
  // What it is heard against: the next stretch of one of the album's own tracks.
  let against: MusicCue | null = null;
  for (let i = Math.max(at, state.cueIndex) + 1; !against && i < episode.cues.length; i += 1) {
    const cue = episode.cues[i]!;
    if (cue.type === 'music' && !cue.tracks[0]!.outside) against = cue;
  }
  return { own, against };
}

/**
 * A track from outside the album. The title and the artist are already under
 * the cover, so the panel leads with why it is here, then walks the pairing in
 * order: the original, then the place in the album it is heard in.
 */
function OutsidePanel({ episode, state, track, sounding }: { episode: Episode; state: EpisodeState; track: EpisodeTrack; sounding: boolean }) {
  const { own, against } = pairOf(episode, state, track);
  const why = track.outside!.why;
  return (
    <section className="lyrics-panel ep-panel ep-outside" aria-labelledby="episode-panel-label">
      <p className="current-lyric is-state ep-why" lang={why ? 'ko' : detectLineLanguage(track.title)}>
        {why ?? track.title}
      </p>
      <ol className="ep-pair" aria-label="What is played, and what it is heard against">
        {own && (
          <li aria-current={sounding ? 'true' : undefined}>
            <span className="ep-pair-mark" aria-hidden="true" />
            <span className="ep-pair-text">
              <span className="ep-pair-role">{sounding ? 'Playing · the original' : 'First · the original'}</span>
              <b lang={detectLineLanguage(track.title)}>
                {track.title}
                <i> — {outsideCredit(track)}</i>
              </b>
              {own.caption && <span lang="ko">{own.caption}</span>}
            </span>
            <span className="ep-pair-range">{rangeLabel(own)}</span>
          </li>
        )}
        {against && (
          <li>
            <span className="ep-pair-mark" aria-hidden="true" />
            <span className="ep-pair-text">
              <span className="ep-pair-role">Then · in the album</span>
              <b lang={detectLineLanguage(against.tracks[0]!.title)}>{against.tracks.map((item) => item.title).join(' → ')}</b>
              {listeningCue(against) && <span lang="ko">{listeningCue(against)}</span>}
            </span>
            <span className="ep-pair-range">{rangeLabel(against)}</span>
          </li>
        )}
      </ol>
    </section>
  );
}

/** Under the title of a track from outside the album: the album it is played for, and where the episode goes back to. */
function OutsideReturn({ album, against }: { album: AlbumDetail; against: MusicCue | null }) {
  return (
    <p className="ep-return">
      <span className="ep-return-cover" aria-hidden="true">
        <CoverImage images={album.images} size={64} alt="" title={album.name} paletteKey={album.id} />
      </span>
      <span>
        Not on <span lang={detectLineLanguage(album.name)}>{album.name}</span>
        {against && (
          <>
            {' · back to '}
            <b lang={detectLineLanguage(against.tracks[0]!.title)}>{against.tracks[0]!.title}</b> next
          </>
        )}
      </span>
    </p>
  );
}

/* ── The script ────────────────────────────────────────────────────────── */

function ScriptList({
  episode,
  state,
  active,
  onJump,
}: {
  episode: Episode;
  state: EpisodeState;
  active: boolean;
  onJump: (cueIndex: number, lineIndex: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const currentKey = active && state.status !== 'ended' ? `${state.cueIndex}:${episode.cues[state.cueIndex]?.type === 'music' ? 0 : state.lineIndex}` : null;

  // Keeps the line being said in view where the script scrolls by itself (the desktop, where the panel around
  // the list is the scroller). On the phone the page is the scroller, and moving it would pull the listener
  // away from whatever they are reading. The first time the script opens it jumps straight to the line.
  const opened = useRef(false);
  useEffect(() => {
    const list = listRef.current;
    const scroller = list?.parentElement;
    if (!currentKey || !list || !scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return;
    const row = list.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || typeof scroller.scrollTo !== 'function') return;
    const frame = scroller.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    const first = !opened.current;
    opened.current = true;
    // Comfortably visible already: leave the scroll alone.
    if (at.top >= frame.top + frame.height * 0.08 && at.bottom <= frame.top + frame.height * 0.72) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: scroller.scrollTop + (at.top - frame.top) - frame.height * 0.22, behavior: reduced || first ? 'auto' : 'smooth' });
  }, [currentKey]);

  const chapterAt = new Map(episode.chapters.map((chapter, index) => [chapter.cueIndex, { title: chapter.title, number: index + 1 }]));

  return (
    <div ref={listRef} className="ep-script" role="group" aria-label="Script">
      {episode.cues.map((cue, cueIndex) => {
        const heading = chapterAt.get(cueIndex);
        const past = active && cueIndex < state.cueIndex;
        const first = cue.type === 'music' ? cue.tracks[0]! : null;
        const missing = cue.type === 'music' && cue.tracks.some(unplayable);
        return (
          <div key={cueIndex} className="ep-cue" data-type={cue.type} data-past={past || undefined}>
            {heading && (
              <h3 className="ep-chapter" lang="ko">
                <span className="ep-chapter-no">{heading.number}</span>
                {heading.title}
              </h3>
            )}
            {cue.type === 'music' ? (
              <button
                type="button"
                className="ep-row ep-row-music"
                data-missing={missing || undefined}
                data-outside={first!.outside ? '' : undefined}
                aria-current={currentKey === `${cueIndex}:0` ? 'true' : undefined}
                onClick={() => onJump(cueIndex, 0)}
              >
                <span className="ep-row-lead" aria-hidden="true">
                  {currentKey === `${cueIndex}:0` ? <PlayingMark playing={state.status === 'playing'} /> : <PlayIcon paused />}
                </span>
                <span className="ep-row-text">
                  <b lang={detectLineLanguage(first!.title)}>
                    {cue.tracks.map((track) => track.title).join(' → ')}
                    {first!.outside && <i> — {outsideCredit(first!)}</i>}
                  </b>
                  {listeningCue(cue) && <span lang="ko">{listeningCue(cue)}</span>}
                </span>
                <span className="ep-row-aside">{missing ? 'not on Spotify here' : rangeLabel(cue)}</span>
              </button>
            ) : (
              cue.lines.map((line, lineIndex) => (
                <button
                  key={lineIndex}
                  type="button"
                  className="ep-row ep-row-line"
                  aria-current={currentKey === `${cueIndex}:${lineIndex}` ? 'true' : undefined}
                  onClick={() => onJump(cueIndex, lineIndex)}
                >
                  <span className="ep-row-lead ep-speaker">{hostName(episode, line.host)}</span>
                  <span className="ep-row-text" lang="ko">
                    {captionText(line.text)}
                  </span>
                  {cue.type === 'over' && lineIndex === 0 && <span className="ep-row-aside">over the music</span>}
                </button>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Where the episode is: the album's tracks, and the episode's clock ── */

/** A moment the episode plays a track of the album, by its number on the record. */
interface AlbumMark {
  no: number;
  start: number;
  cueIndex: number;
}

/** The album's tracks in record order, and when the episode plays each of them. */
function albumMarks(episode: Episode, timeline: EpisodeTimeline, album: AlbumDetail): AlbumMark[] {
  const numbers = new Map(album.tracks.map((track, index) => [track.id, index + 1]));
  const marks: AlbumMark[] = [];
  episode.cues.forEach((cue, cueIndex) => {
    const { start, dur } = timeline.cues[cueIndex]!;
    const tracks = cue.type === 'music' ? cue.tracks : cue.type === 'over' ? [cue.track] : [];
    // In a cue of several tracks, each after the one before it: the first plays what the others leave of the cue.
    const rest = cue.type === 'music' ? cue.tracks.slice(1, -1).reduce((sum, track) => sum + track.durationMs, 0) + (cue.untilMs ?? cue.tracks[cue.tracks.length - 1]!.durationMs) : 0;
    let at = start;
    tracks.forEach((track, index) => {
      const no = track.outside ? undefined : numbers.get(track.id);
      if (no) marks.push({ no, start: at, cueIndex });
      at += index === 0 ? Math.max(0, dur - (tracks.length > 1 ? rest : 0)) : track.durationMs;
    });
  });
  return marks;
}

/** The stretch of a track the episode is playing, and where in it the music is. */
interface Sounding {
  track: EpisodeTrack;
  fromMs: number;
  untilMs: number;
  atMs: number;
  /** The hosts are talking over it. */
  under: boolean;
}

function soundingOf(subject: Subject, state: EpisodeState, cue: Cue | undefined, position: number, live: boolean): Sounding | null {
  const { track, stretch } = subject;
  if (!track || subject.ahead || !cue || cue.type === 'talk') return null;
  const duration = Math.max(1, track.durationMs);
  // The stretch belongs to this track when it is the only one, or the first or last of several.
  const index = stretch ? Math.min(state.trackIndex, stretch.tracks.length - 1) : 0;
  const isLast = !stretch || index === stretch.tracks.length - 1;
  const fromMs = stretch && index === 0 ? (stretch.fromMs ?? stretch.fallbackFromMs) : 0;
  const untilMs = stretch && isLast && stretch.untilMs !== null ? stretch.untilMs : duration;
  const atMs = live ? Math.min(duration, Math.max(0, position)) : fromMs;
  return { track, fromMs, untilMs, atMs, under: cue.type === 'over' };
}

/** How far into a music cue the music is, from where the player stands in its track. */
function intoMusic(cue: MusicCue, dur: number, trackIndex: number, position: number): number {
  const last = cue.tracks.length - 1;
  const index = Math.min(trackIndex, last);
  const until = cue.untilMs ?? cue.tracks[last]!.durationMs;
  if (index === last) return dur - (until - position);
  const middle = (to: number) => cue.tracks.slice(1, to).reduce((sum, track) => sum + track.durationMs, 0);
  const first = dur - middle(last) - until;
  if (index === 0) return position - (cue.tracks[0]!.durationMs - first);
  return first + middle(index) + position;
}

const pct = (ms: number, of: number) => `${((Math.min(of, Math.max(0, ms)) / Math.max(1, of)) * 100).toFixed(3)}%`;

/** One track's stretch as a line: the stretch played heavier, the rest a hairline, a dot where the music is. */
function TrackLine({ sounding }: { sounding: Sounding }) {
  const { track, fromMs, untilMs, atMs, under } = sounding;
  const duration = Math.max(1, track.durationMs);
  const whole = fromMs <= 1500 && untilMs >= duration - 1500;
  return (
    <span className={under ? 'ep-line-track under' : 'ep-line-track'} aria-hidden="true">
      <span className="ep-line-base" />
      {whole || under ? (
        <span className="ep-line-past" style={{ width: pct(atMs, duration) }} />
      ) : (
        <span className="ep-line-stretch" style={{ left: pct(fromMs, duration), width: pct(untilMs - fromMs, duration) }}>
          <span style={{ width: pct(atMs - fromMs, untilMs - fromMs) }} />
        </span>
      )}
      <span className="ep-line-dot" style={{ left: pct(atMs, duration) }} />
    </span>
  );
}

/**
 * Where the episode is, in two lines of text, dots and rules. Above, the
 * album's track numbers: the track the hosts are on is named, the one playing
 * opens into a line of its own, and while they talk between two tracks a dot
 * stands between the numbers. Below, the whole episode on one hairline, the
 * time into it and its length, and the script.
 */
function EpisodePosition({
  episode,
  album,
  timeline,
  state,
  active,
  subject,
  live,
  bookmark,
  scriptOpen,
  onToggleScript,
  onSeek,
}: {
  episode: Episode;
  album: AlbumDetail;
  timeline: EpisodeTimeline;
  state: EpisodeState;
  active: boolean;
  subject: Subject;
  live: boolean;
  bookmark: { cueIndex: number; lineIndex: number } | null;
  scriptOpen: boolean;
  onToggleScript: () => void;
  onSeek: (cueIndex: number) => void;
}) {
  const position = usePlaybackPosition();
  const ended = active && state.status === 'ended';
  const cue = active && !ended ? episode.cues[state.cueIndex] : undefined;
  const talking = cue !== undefined && cue.type !== 'music';
  const marks = useMemo(() => albumMarks(episode, timeline, album), [episode, timeline, album]);

  // Between one utterance and the next the clock runs on by itself, up to where the next one starts.
  const speechKey = active ? `${state.cueIndex}:${state.lineIndex}:${state.utteranceIndex}` : '';
  const spokenSince = useRef({ key: '', at: 0 });
  if (spokenSince.current.key !== speechKey) spokenSince.current = { key: speechKey, at: Date.now() };
  const [, tick] = useState(0);
  useEffect(() => {
    if (!talking || state.status !== 'playing') return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [talking, state.status]);

  let elapsed: number;
  if (ended) elapsed = timeline.totalMs;
  else if (!active) elapsed = bookmark ? speechAt(timeline, bookmark.cueIndex, bookmark.lineIndex, 0) : 0;
  else if (cue?.type === 'music') {
    const { start, dur } = timeline.cues[state.cueIndex]!;
    elapsed = start + (live ? Math.min(dur, Math.max(0, intoMusic(cue, dur, state.trackIndex, position))) : 0);
  } else {
    const at = speechAt(timeline, state.cueIndex, state.lineIndex, state.utteranceIndex);
    const line = timeline.speech[state.cueIndex]?.[state.lineIndex];
    const { start, dur } = timeline.cues[state.cueIndex]!;
    const next = start + (line?.[state.utteranceIndex + 1] ?? timeline.speech[state.cueIndex]?.[state.lineIndex + 1]?.[0] ?? dur);
    elapsed = state.status === 'playing' ? Math.min(next, at + (Date.now() - spokenSince.current.at)) : at;
  }

  const sounding = active && !ended ? soundingOf(subject, state, cue, position, live) : null;
  const playingNo = sounding && !sounding.track.outside ? (marks.find((mark) => mark.cueIndex === state.cueIndex && album.tracks[mark.no - 1]?.id === sounding.track.id)?.no ?? null) : null;
  const before = marks.filter((mark) => mark.start < elapsed && mark.no !== playingNo);
  const prevNo = active && !ended ? (before.length ? before[before.length - 1]!.no : null) : null;
  const nextNo = active && !ended ? (marks.find((mark) => mark.start > elapsed)?.no ?? null) : null;
  // The track the hosts are on: the one playing, else the next one their chapter plays.
  let topic: number | null = playingNo;
  if (topic === null && active && !ended && state.cueIndex < episode.cues.length) {
    const chapterIndex = episode.chapters.findLastIndex((chapter) => chapter.cueIndex <= state.cueIndex);
    const from = episode.chapters[chapterIndex]?.cueIndex ?? 0;
    const to = episode.chapters[chapterIndex + 1]?.cueIndex ?? episode.cues.length;
    const own = [...new Set(marks.filter((mark) => mark.cueIndex >= from && mark.cueIndex < to).map((mark) => mark.no))];
    topic = own.find((no) => no > (prevNo ?? 0)) ?? own[own.length - 1] ?? null;
  }
  const between = active && cue?.type === 'talk' && prevNo !== null && nextNo !== null && prevNo !== nextNo ? prevNo : null;
  const heard = (no: number) => ended || (no !== playingNo && marks.some((mark) => mark.no === no && mark.start < elapsed));
  const total = timeline.totalMs;

  const seekTo = (ms: number) => onSeek(cueAt(timeline, Math.min(total - 1, Math.max(0, ms))));

  return (
    <div className="ep-position">
      <div className="ep-rail">
        <span className="ep-rail-edge" data-on={active && talking && prevNo === null ? '' : undefined}>
          여는 말
        </span>
        <ol className="ep-rail-tracks" aria-label="The album’s tracks">
          {album.tracks.map((track, index) => {
            const no = index + 1;
            const open = no === playingNo && sounding !== null;
            const named = !open && no === topic;
            return (
              <li
                key={track.id}
                className="ep-rail-track"
                data-heard={heard(no) ? '' : undefined}
                data-open={open ? '' : undefined}
                data-named={named ? '' : undefined}
                aria-current={open || named ? 'true' : undefined}
              >
                <span className="ep-rail-no">{no}</span>
                {(open || named) && (
                  <span className="ep-rail-title" lang={detectLineLanguage(track.name)}>
                    {track.name}
                  </span>
                )}
                {open && sounding && (
                  <>
                    <TrackLine sounding={sounding} />
                    <span className="ep-rail-time">{formatDuration(sounding.atMs)}</span>
                  </>
                )}
                {between === no && <span className="ep-rail-between" aria-label="The hosts are talking here" />}
              </li>
            );
          })}
        </ol>
        <span className="ep-rail-edge end" data-on={active && talking && nextNo === null && prevNo !== null ? '' : undefined}>
          닫는 말
        </span>
      </div>
      {sounding?.track.outside && (
        <div className="ep-rail-outside">
          <span className="ep-rail-title">{sounding.track.title}</span>
          <TrackLine sounding={sounding} />
          <span className="ep-rail-time">{formatDuration(sounding.atMs)}</span>
        </div>
      )}
      <div className="ep-clock">
        <span className="ep-clock-time">{formatDuration(elapsed)}</span>
        <div
          className="ep-clock-line"
          role="slider"
          tabIndex={0}
          aria-label="Episode position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total / 1000)}
          aria-valuenow={Math.round(elapsed / 1000)}
          aria-valuetext={`${formatDuration(elapsed)} of ${formatDuration(total)}`}
          onPointerDown={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            seekTo(((event.clientX - box.left) / box.width) * total);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            seekTo(elapsed + (event.key === 'ArrowRight' ? 30_000 : -30_000));
          }}
        >
          <span className="ep-line-base" />
          <span className="ep-line-past" style={{ width: pct(elapsed, total) }} />
          <span className="ep-line-dot" style={{ left: pct(elapsed, total) }} />
        </div>
        <span className="ep-clock-time total">{formatDuration(total)}</span>
        <button type="button" className="note-more" aria-expanded={scriptOpen} onClick={onToggleScript}>
          {scriptOpen ? 'Close the script' : 'Script'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

const NOTICE_TEXT = {
  interrupted: 'Playback was changed outside the episode, so it stepped back. Continue picks it up where it stopped.',
  'no-playback': 'The music did not start. Check the device, then continue — or play the music yourself, and the episode waits for you.',
} as const;

/**
 * An album's episode, on the Now Playing layout: the cover with the title
 * under it on the left; on the right the lyrics of what is playing, a line
 * for the episode where the Listening note's would be, the seek bar and the
 * transport. The one thing added is the hosts' line, on a slab in front of
 * the cover while they speak. The script opens in the lyrics' place when it
 * is asked for. The episode itself belongs to the session (EpisodeProvider):
 * it keeps running when this page is left.
 */
export function EpisodePage() {
  const { albumId } = useParams();
  const album = useAlbum(albumId);
  const runner = useEpisodeRunner();
  const state = useEpisodeState();
  const shell = useShell();
  const mobile = useIsMobile();
  const [preferences, setPreferences] = usePreferences();
  const narration = useNarrationManifest();
  const engine = useEngine();
  const playerTrack = usePlayerSnapshot().track;
  const [scriptOpen, setScriptOpen] = useState(false);
  // Whether this browser is (or is trying to be) the player: when the music will not start, the app on the computer can be.
  const browserPlays = usePlayerSelector((s) => s.sdk.kind !== 'disabled') && engine.kind === 'spotify' && !mobile;
  const data = album.data;
  usePageTitle('Episode', data?.name ?? null);
  usePageSurface(isSpotifyId(albumId) ? { key: albumId, imageUrl: data ? pickImageUrl(data.images, 64) : null } : null);

  const note = data ? getAlbumNote({ id: data.id, name: data.name, artistNames: data.artists.map((a) => a.name), releaseDate: data.releaseDate }) : null;
  const script = getEpisodeScript(note?.key);
  // The script's tracks from outside the album: their covers, and whether Spotify plays them here.
  const outsideIds = useMemo(() => script?.outside.map((track) => track.id) ?? [], [script]);
  const lookups = useTracks(outsideIds);
  const resolved = useMemo(() => {
    if (!data || !script || !lookups.settled) return null;
    try {
      return { episode: resolveEpisode(script, albumEpisodeTracks(data), songNotes, episodeRelease(data), outsideFound(script, lookups.tracks)), problems: null };
    } catch (error) {
      if (error instanceof EpisodeError) return { episode: null, problems: error.problems };
      throw error;
    }
  }, [data, script, lookups]);

  // Once this episode is in the runner, its own copy is the one on screen.
  const active = Boolean(resolved?.episode && data) && state.episode !== null && state.episode.key === resolved!.episode!.key && state.episode.release?.id === data!.id;
  const episode = active ? state.episode! : (resolved?.episode ?? null);
  const subject = episode ? subjectOf(episode, state, active) : NO_SUBJECT;
  const cue = episode && active && state.status !== 'ended' ? episode.cues[state.cueIndex] : undefined;
  // Music is meant to be sounding from the session's player (rather than stopped for a talk, or the listener's to play).
  const sounding = Boolean(cue && cue.type !== 'talk' && !state.manual);
  const onAir = sounding && subject.track !== null && sameTrack(subject.track, playerTrack);
  const showLyrics = onAir && !subject.track!.outside && !scriptOpen;
  // The episode on one clock: where each part starts, and how long the whole runs at this pace.
  const timeline = useMemo(() => (episode ? episodeTimeline(episode, preferences.episodeRate, (key) => narration?.clips[key]) : null), [episode, preferences.episodeRate, narration]);
  const lyricsState = useTimedLyrics(showLyrics ? playerTrack : null);

  // Who plays the music is chosen in the settings. A change in the middle of a stretch of music takes that stretch up again in the new way.
  const musicChoice = useRef(preferences.episodeMusic);
  useEffect(() => {
    if (musicChoice.current === preferences.episodeMusic) return;
    musicChoice.current = preferences.episodeMusic;
    const now = runner.getState();
    if (now.episode && now.status === 'playing' && now.episode.cues[now.cueIndex]?.type === 'music') runner.jump(now.cueIndex);
  }, [preferences.episodeMusic, runner]);

  const albumLink = (
    <Link className="plain-action" to={isSpotifyId(albumId) ? `/album/${albumId}` : '/library'}>
      {isSpotifyId(albumId) ? 'Open the album' : 'Library'}
    </Link>
  );

  if (!isSpotifyId(albumId)) {
    return (
      <StateView label="Episode" title="Episode unavailable" actions={albumLink}>
        <p>This isn’t a valid album address. Episodes open from an album’s page.</p>
      </StateView>
    );
  }
  if (album.isPending || (data && script && !lookups.settled)) {
    return (
      <StateView label="Episode" title="Loading the episode…">
        <p>Reading the album’s tracks.</p>
      </StateView>
    );
  }
  if (album.isError || !data) {
    const { title, body } = describeSpotifyError(album.error);
    return (
      <StateView label="Episode" title={title} tone="alert" actions={albumLink}>
        <p>{body}</p>
      </StateView>
    );
  }
  if (!script || !resolved) {
    return (
      <StateView label="Episode" title="No episode yet" actions={albumLink}>
        <p>Nobody has written an episode for {data.name}. An episode is a script in the archive, next to the album’s note.</p>
      </StateView>
    );
  }
  if (!resolved.episode || !episode) {
    return (
      <StateView label="Episode" title="This episode doesn’t fit this release" tone="alert" actions={albumLink}>
        <p>The script names tracks or positions this edition of {data.name} doesn’t have:</p>
        <ul className="notice-hints">
          {(resolved.problems ?? []).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </StateView>
    );
  }

  const playing = active && state.status === 'playing';
  const ended = active && state.status === 'ended';
  const chapter = active && !ended ? chapterOf(episode, state.cueIndex) : null;
  const recordedMs = (key: string) => narration?.clips[key];
  const minutes = formatRuntime(timeline!.totalMs);
  // How many of the hosts' lines the site has recordings of; the rest fall to the browser's voice.
  const recorded = coverage(episode, (key) => recordedMs(key) !== undefined);
  const engineName = narration?.engine.name ?? 'Recorded';
  const browserVoice = state.spareNarration === 'captions' ? 'Captions only' : 'This browser’s Korean voice';
  const voiceLabel =
    recorded.recorded === 0
      ? browserVoice
      : recorded.recorded === recorded.total
        ? `Recorded · ${engineName}`
        : `Recorded in part · ${recorded.recorded} of ${recorded.total} lines`;
  const voiceHint =
    recorded.recorded < recorded.total && state.spareNarration === 'captions'
      ? `${recorded.recorded > 0 ? 'Some lines have no recording yet, and this' : 'This'} browser has no Korean voice to speak with, so ${
          recorded.recorded > 0 ? 'those lines' : 'the hosts’ lines'
        } are shown for as long as they would take to say. Microsoft Edge comes with natural-sounding Korean voices.`
      : null;
  const missing = episode.cues.flatMap((item) => (item.type === 'music' ? item.tracks.filter(unplayable) : []));
  const fineprint = [
    ...(recorded.recorded > 0 ? [`The hosts’ voices are machine-generated (${engineName}).`] : []),
    ...[...new Set(missing)].map((track) => `Spotify does not have “${track.title}” (${track.outside!.artist}) where you are: the episode goes past it.`),
    ...episode.warnings,
  ];

  // Where an earlier visit left this episode: Play carries on from there, and the top is one more button away.
  const bookmark = active ? null : readBookmark(episode);
  const leftAt = bookmark ? chapterOf(episode, bookmark.cueIndex) : null;

  const playOrPause = () => {
    if (!active) runner.start(episode, bookmark?.cueIndex ?? 0, bookmark?.lineIndex ?? 0);
    else runner.toggle();
  };
  const jump = (cueIndex: number, lineIndex: number) => {
    if (active) runner.jump(cueIndex, lineIndex);
    else runner.start(episode, cueIndex, lineIndex);
  };
  const mainLabel = !active ? (bookmark ? 'Continue' : 'Play episode') : playing ? 'Pause' : ended ? 'Play again' : 'Continue';

  const ownMusic = preferences.episodeMusic === 'manual';
  const playItMyself = () => {
    setPreferences({ episodeMusic: 'manual' });
    runner.resume();
  };
  const playThroughApp = () => void engine.setBrowserPlayback(false).then(() => runner.resume());

  const track = subject.track;
  // The cover and the title under it name what is sounding. While the hosts lead up to a track it is not on
  // yet: the album stands there, and the track is named as what is next, in the lyrics' place.
  const shown = subject.ahead ? null : track;
  const title = shown?.title ?? data.name;
  const upcoming = subject.stretch && cue?.type !== 'music' ? subject.stretch : null;
  const musicCue = cue?.type === 'music' ? cue : null;
  let panel: 'script' | 'intro' | 'ended' | 'talk' | 'manual' | 'outside' | 'lyrics' | 'rest';
  if (scriptOpen) panel = 'script';
  else if (!active) panel = 'intro';
  else if (ended || !cue) panel = 'ended';
  else if (cue.type === 'talk') panel = 'talk';
  else if (cue.type === 'music' && state.manual) panel = 'manual';
  else if (track?.outside) panel = 'outside';
  else if (showLyrics) panel = 'lyrics';
  else panel = 'rest';

  const overview = leftAt
    ? `Left at ${leftAt.number} / ${episode.chapters.length} · ${leftAt.title}`
    : `${episode.chapters.length} chapters · about ${minutes}`;

  return (
    <div className="view active">
      <div className="np ep-stage" data-panel={panel}>
        <div className="np-main">
          <div className="np-grid" role="region" aria-label="Now in the episode" data-status={active ? state.status : 'idle'}>
            <section className="np-object" aria-label="What the episode is on">
              <figure className="np-art">
                <Cover album={data} track={shown}>
                  {cue && cue.type === 'over' && <Caption episode={episode} cue={cue} state={state} />}
                </Cover>
                <figcaption className="np-caption">
                  <h1 lang={detectLineLanguage(title)} title={title}>
                    {title}
                  </h1>
                  <div className="artist-line">
                    {shown?.outside ? (
                      <span>{outsideCredit(shown)}</span>
                    ) : (
                      <>
                        <ArtistLinks artists={data.artists} />
                        <span className="sep" aria-hidden="true">
                          {' · '}
                        </span>
                        <Link className="linkish" to={`/album/${data.id}`} lang={detectLineLanguage(data.name)}>
                          {shown ? data.name : 'Album'}
                        </Link>
                      </>
                    )}
                  </div>
                  {shown?.outside && <OutsideReturn album={data} against={pairOf(episode, state, shown).against} />}
                </figcaption>
              </figure>
            </section>

            {panel === 'lyrics' && playerTrack && <LyricsBlock key={playerTrack.spotifyTrackId} track={playerTrack} lyricsState={lyricsState} />}

            {panel === 'script' && (
              <>
                <PanelHead title="Script">
                  <span lang="ko">{chapter ? `${chapter.number} / ${episode.chapters.length} · ${chapter.title}` : overview}</span>
                </PanelHead>
                <section className="ep-script-panel" aria-labelledby="episode-panel-label">
                  <ScriptList episode={episode} state={state} active={active} onJump={jump} />
                </section>
              </>
            )}

            {panel === 'intro' && (
              <>
                <PanelHead title="Episode">
                  <span lang="ko">{overview}</span>
                </PanelHead>
                <IntroPanel episode={episode} facts={[`About ${minutes}`, voiceLabel]} hint={voiceHint} fineprint={fineprint}>
                  <button type="button" className="plain-action primary" onClick={playOrPause}>
                    {mainLabel}
                  </button>
                  {bookmark && (
                    <button type="button" className="plain-action" onClick={() => runner.start(episode)}>
                      From the top
                    </button>
                  )}
                  <button type="button" className="plain-action" onClick={() => setScriptOpen(true)}>
                    Read the script
                  </button>
                </IntroPanel>
              </>
            )}

            {panel === 'ended' && (
              <>
                <PanelHead title="Episode" />
                <RestPanel kicker="The end" title="That was the whole episode." cue="Play again starts it from the top; any line in the script starts it from there." />
              </>
            )}

            {panel === 'talk' && cue && cue.type === 'talk' && (
              <>
                <PanelHead title="The hosts" />
                <TalkPanel episode={episode} cue={cue} state={state} upcoming={upcoming} upTrack={track} ahead={subject.ahead} />
              </>
            )}

            {panel === 'manual' && musicCue && (
              <>
                <PanelHead title="Your turn" />
                <ManualPanel cue={musicCue} translate={preferences.translationEnabled} onHeard={() => runner.proceed()} />
              </>
            )}

            {panel === 'outside' && track && (
              <>
                <PanelHead title="Outside the album">
                  <span>{subject.ahead ? 'Up next' : sounding ? (cue?.type === 'over' ? 'Playing under the talk' : 'Playing') : 'Just heard'}</span>
                </PanelHead>
                <OutsidePanel episode={episode} state={state} track={track} sounding={sounding} />
              </>
            )}

            {panel === 'rest' && (
              <>
                <PanelHead title="Lyrics" />
                {track ? (
                  <RestPanel
                    kicker={sounding ? 'Starting' : subject.ahead ? 'Up next' : 'Just heard'}
                    title={upcoming && upcoming.tracks.length > 1 ? upcoming.tracks.map((item) => item.title).join(' → ') : track.title}
                    stretch={upcoming ? stretchLabel(upcoming) : musicCue ? stretchLabel(musicCue) : undefined}
                    cue={upcoming ? listeningCue(upcoming) : musicCue ? listeningCue(musicCue, state.trackIndex) : undefined}
                  />
                ) : (
                  <RestPanel kicker={chapter ? `${chapter.number} / ${episode.chapters.length}` : 'Episode'} title={chapter?.title ?? episode.title} />
                )}
              </>
            )}

            <div className="player-controls">
              <EpisodePosition
                episode={episode}
                album={data}
                timeline={timeline!}
                state={state}
                active={active}
                subject={subject}
                live={onAir || (track !== null && !subject.ahead && sameTrack(track, playerTrack))}
                bookmark={bookmark}
                scriptOpen={scriptOpen}
                onToggleScript={() => setScriptOpen((open) => !open)}
                onSeek={(cueIndex) => jump(cueIndex, 0)}
              />
              <div className="transport-row">
                <div className={mobile ? 'm-transport compact' : 'transport'}>
                  <button type="button" className={mobile ? 'm-ctl ink' : 'ctl'} title="Back" aria-label="Previous part" disabled={!active} onClick={() => runner.previous()}>
                    <PreviousIcon />
                  </button>
                  <button type="button" className={mobile ? 'm-play' : 'play'} title={mainLabel} aria-label={mainLabel} onClick={playOrPause}>
                    <PlayIcon paused={!playing} />
                  </button>
                  <button
                    type="button"
                    className={mobile ? 'm-ctl ink' : 'ctl'}
                    title="Skip"
                    aria-label="Next part"
                    disabled={!active || state.cueIndex >= episode.cues.length - 1}
                    onClick={() => runner.next()}
                  >
                    <NextIcon />
                  </button>
                </div>
                <div className="transport-extras ep-extras">
                  {active && (
                    <button type="button" className="text-toggle" onClick={() => runner.stop()}>
                      End episode
                    </button>
                  )}
                  <button type="button" className="text-toggle" title="Voices, pace, and who plays the music" onClick={shell.toggleSettings}>
                    Voices and pace
                  </button>
                  {!mobile && !ownMusic && (
                    <>
                      <DevicePicker />
                      <Volume />
                    </>
                  )}
                </div>
              </div>
              {active && state.notice && (
                <p className="playback-state alert ep-notice" role="alert">
                  {NOTICE_TEXT[state.notice]}
                  {state.notice === 'no-playback' && !ownMusic && browserPlays && (
                    <button
                      type="button"
                      className="note-more"
                      title="Stop playing in this browser: the Spotify app on this computer plays, and this page starts and stops it"
                      onClick={playThroughApp}
                    >
                      Play through the Spotify app
                    </button>
                  )}
                  {state.notice === 'no-playback' && !ownMusic && (
                    <button type="button" className="note-more" onClick={playItMyself}>
                      Play the music myself
                    </button>
                  )}
                </p>
              )}
              <PlaybackNotice />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
