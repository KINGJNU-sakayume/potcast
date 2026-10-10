import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '../app/backHistory';
import { usePageTitle } from '../app/pageTitle';
import { useShell } from '../app/shellContext';
import { usePageSurface } from '../app/surface';
import { useIsMobile } from '../app/useIsMobile';
import { useAlbum } from '../catalogue/queries';
import { ArtistLinks } from '../components/ArtistLinks';
import { CoverImage } from '../components/CoverImage';
import { NextIcon, PlayIcon, PreviousIcon } from '../components/icons';
import { PlaybackNotice } from '../components/player/PlaybackNotice';
import { PlayingMark } from '../components/PlayingMark';
import { StateView } from '../components/StateView';
import { getAlbumNote } from '../editorial/lookup';
import { songNotes } from '../editorial/songs';
import { readBookmark } from '../episode/bookmark';
import { useEpisodeRunner } from '../episode/episodeContext';
import { useEpisodeState } from '../episode/EpisodeProvider';
import { getEpisodeScript } from '../episode/episodes';
import { coverage } from '../episode/narration/plan';
import { useNarrationManifest } from '../episode/narration/useNarration';
import { albumEpisodeTracks, episodeMusicMs, episodeRelease, episodeTalkMs, resolveEpisode } from '../episode/resolve';
import type { EpisodeState } from '../episode/runner';
import { captionText, splitUtterances } from '../episode/speechText';
import { hasSungLines, sungLine, sungLinesBetween } from '../episode/sungLine';
import { EpisodeError, type Cue, type Episode, type MusicCue, type SpokenLine } from '../episode/types';
import { formatDuration, formatRuntime, joinArtistNames } from '../lib/format';
import { pickImageUrl } from '../lib/images';
import { isSpotifyId } from '../lib/spotifyUri';
import { usePlaybackPosition } from '../playback/hooks';
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

/** The longest stretch whose lines are listed for reading along. */
const MAX_LISTED_LINES = 8;

/* ── Now: the line being said, or the music being played ───────────────── */

/**
 * A stretch of music the listener plays themselves: what to play and how much
 * of it, a link that opens it in Spotify, and the button that tells the
 * episode it has been heard.
 */
function NowManual({ cue, translate, onHeard }: { cue: MusicCue; translate: boolean; onHeard: () => void }) {
  const first = cue.tracks[0]!;
  const cueText = listeningCue(cue);
  const lines = translate && cue.tracks.length === 1 && cue.untilMs !== null ? sungLinesBetween(first, cue.fromMs ?? cue.fallbackFromMs, cue.untilMs) : [];
  return (
    <>
      <div className="ep-now-kicker">
        <span className="ep-speaker">Your turn</span>
        <span>Play this in Spotify</span>
      </div>
      <p className="ep-now-line is-title" lang={detectLineLanguage(first.title)}>
        {cue.tracks.map((track) => track.title).join(' → ')}
      </p>
      <p className="ep-now-stretch">{stretchLabel(cue)}</p>
      {cueText && (
        <p className="ep-now-next" lang="ko">
          {cueText}
        </p>
      )}
      {lines.length > 0 && lines.length <= MAX_LISTED_LINES && (
        <ul className="ep-now-lines" lang="ko" aria-label="The lines of this stretch, translated">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      <div className="object-actions ep-now-actions">
        <button type="button" className="plain-action primary" onClick={onHeard}>
          Heard it · go on
        </button>
        {cue.tracks.map((track) => (
          <a key={track.id} className="plain-action" href={`https://open.spotify.com/track/${track.id}`} target="_blank" rel="noreferrer">
            {cue.tracks.length > 1 ? `Open ${track.title} in Spotify` : 'Open in Spotify'}
          </a>
        ))}
      </div>
    </>
  );
}

function NowMusic({ cue, trackIndex, playing, translate }: { cue: MusicCue; trackIndex: number; playing: boolean; translate: boolean }) {
  const position = usePlaybackPosition();
  const index = Math.min(trackIndex, cue.tracks.length - 1);
  const track = cue.tracks[index]!;
  const isLast = index === cue.tracks.length - 1;
  const from = index === 0 ? (cue.fromMs ?? cue.fallbackFromMs) : 0;
  const until = isLast ? (cue.untilMs ?? track.durationMs) : track.durationMs;
  const fraction = until > from ? Math.min(1, Math.max(0, (position - from) / (until - from))) : 0;
  const cueText = listeningCue(cue, index);
  // The line being sung, in the song note's translation: the episode's own subtitles for the music.
  const lyric = translate ? sungLine(track, position) : null;
  return (
    <>
      <div className="ep-now-kicker">
        <PlayingMark playing={playing} />
        <span>
          {from > 0 || (isLast && cue.untilMs !== null) ? 'Listening to a part' : 'Listening'}
          {cue.tracks.length > 1 ? ` · ${index + 1} of ${cue.tracks.length}` : ''}
        </span>
      </div>
      <p className="ep-now-line is-title" lang={detectLineLanguage(track.title)}>
        {track.title}
      </p>
      {cueText && (
        <p className="ep-now-next" lang="ko">
          {cueText}
        </p>
      )}
      {/* Always there while a translated song plays, so the panel does not jump between lines. */}
      {translate && hasSungLines(track) && (
        <p className="ep-now-lyric" lang="ko" aria-live="off" data-empty={lyric ? undefined : ''}>
          {lyric ?? '\u00a0'}
        </p>
      )}
      <div className="ep-now-progress" aria-hidden="true">
        <span>{formatDuration(Math.max(from, Math.min(position, until)))}</span>
        <div className="ep-now-bar">
          <div style={{ width: `${(fraction * 100).toFixed(2)}%` }} />
        </div>
        <span>{formatDuration(until)}</span>
      </div>
    </>
  );
}

function NowSpoken({ episode, cue, state }: { episode: Episode; cue: Exclude<Cue, MusicCue>; state: EpisodeState }) {
  const line: SpokenLine | undefined = cue.lines[Math.min(state.lineIndex, cue.lines.length - 1)];
  // What is shown leaves out the sounds only a recorded voice makes (<laugh>).
  const utterances = useMemo(() => (line ? splitUtterances(line.text).map(captionText) : []), [line]);
  if (!line) return null;
  const index = Math.min(state.utteranceIndex, utterances.length - 1);
  const nextLine = cue.lines[state.lineIndex + 1]?.text;
  const following = utterances[index + 1] ?? (nextLine ? captionText(nextLine) : undefined);
  return (
    <>
      <div className="ep-now-kicker">
        <span className="ep-speaker">{hostName(episode, line.host)}</span>
        {cue.type === 'over' && <span>over {cue.track.title}</span>}
      </div>
      {/* Keyed so each utterance comes in afresh, as a lyric line does. */}
      <p key={`${state.cueIndex}:${state.lineIndex}:${index}`} className="ep-now-line" lang="ko" aria-live="off">
        {utterances[index]}
      </p>
      {following && (
        <p className="ep-now-next" lang="ko">
          {following}
        </p>
      )}
    </>
  );
}

function NowPanel({
  episode,
  state,
  active,
  translate,
  onHeard,
}: {
  episode: Episode;
  state: EpisodeState;
  active: boolean;
  translate: boolean;
  onHeard: () => void;
}) {
  let content: ReactNode;
  const cue = active ? episode.cues[state.cueIndex] : undefined;
  if (!active) {
    content = (
      <>
        <div className="ep-now-kicker">
          <span>{episode.hosts.map((host) => host.name).join(' · ')}</span>
        </div>
        <p className="ep-now-line is-idle" lang="ko">
          {episode.short ?? episode.title}
        </p>
      </>
    );
  } else if (state.status === 'ended' || !cue) {
    content = (
      <>
        <div className="ep-now-kicker">
          <span>The end</span>
        </div>
        <p className="ep-now-line is-idle">That was the whole episode.</p>
        <p className="ep-now-next">Play again starts it from the top; any line in the script starts it from there.</p>
      </>
    );
  } else if (cue.type === 'music' && state.manual) {
    content = <NowManual cue={cue} translate={translate} onHeard={onHeard} />;
  } else if (cue.type === 'music') {
    content = <NowMusic cue={cue} trackIndex={state.trackIndex} playing={state.status === 'playing'} translate={translate} />;
  } else {
    content = <NowSpoken episode={episode} cue={cue} state={state} />;
  }
  return (
    <section className="ep-now" aria-label="Now in the episode" data-status={active ? state.status : 'idle'}>
      {content}
    </section>
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

  // Keeps the line being said in view where the script scrolls by itself (the desktop). On the phone the
  // page is the scroller, and moving it would pull the listener away from whatever they are reading.
  useEffect(() => {
    const list = listRef.current;
    if (!currentKey || !list || list.scrollHeight <= list.clientHeight + 1) return;
    const row = list.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || typeof list.scrollTo !== 'function') return;
    const frame = list.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    // Comfortably visible already: leave the scroll alone.
    if (at.top >= frame.top + frame.height * 0.08 && at.bottom <= frame.top + frame.height * 0.72) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ top: list.scrollTop + (at.top - frame.top) - frame.height * 0.22, behavior: reduced ? 'auto' : 'smooth' });
  }, [currentKey]);

  const chapterAt = new Map(episode.chapters.map((chapter) => [chapter.cueIndex, chapter.title]));

  return (
    <div ref={listRef} className="ep-script" role="group" aria-label="Script">
      {episode.cues.map((cue, cueIndex) => {
        const heading = chapterAt.get(cueIndex);
        const past = active && cueIndex < state.cueIndex;
        return (
          <div key={cueIndex} className="ep-cue" data-type={cue.type} data-past={past || undefined}>
            {heading && (
              <h3 className="ep-chapter" lang="ko">
                {heading}
              </h3>
            )}
            {cue.type === 'music' ? (
              <button
                type="button"
                className="ep-row ep-row-music"
                aria-current={currentKey === `${cueIndex}:0` ? 'true' : undefined}
                onClick={() => onJump(cueIndex, 0)}
              >
                <span className="ep-row-lead" aria-hidden="true">
                  {currentKey === `${cueIndex}:0` ? <PlayingMark playing={state.status === 'playing'} /> : <PlayIcon paused />}
                </span>
                <span className="ep-row-text">
                  <b lang={detectLineLanguage(cue.tracks[0]!.title)}>{cue.tracks.map((track) => track.title).join(' → ')}</b>
                  {listeningCue(cue) && <span lang="ko">{listeningCue(cue)}</span>}
                </span>
                <span className="ep-row-aside">{rangeLabel(cue)}</span>
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

/* ── Page ──────────────────────────────────────────────────────────────── */

const NOTICE_TEXT = {
  interrupted: 'Playback was changed outside the episode, so it stepped back. Continue picks it up where it stopped.',
  'no-playback': 'The music did not start. Check the device, then continue — or play the music yourself, and the episode waits for you.',
} as const;

/**
 * An album's episode: the hosts' script on the right — the line being said in
 * large type above it, as Now Playing shows a lyric — and the album it walks
 * through on the left, in the cover's colour. The episode itself belongs to the
 * session (EpisodeProvider): it keeps running when this page is left.
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
  const data = album.data;
  usePageTitle('Episode', data?.name ?? null);
  usePageSurface(isSpotifyId(albumId) ? { key: albumId, imageUrl: data ? pickImageUrl(data.images, 64) : null } : null);

  const note = data ? getAlbumNote({ id: data.id, name: data.name, artistNames: data.artists.map((a) => a.name), releaseDate: data.releaseDate }) : null;
  const script = getEpisodeScript(note?.key);
  const resolved = useMemo(() => {
    if (!data || !script) return null;
    try {
      return { episode: resolveEpisode(script, albumEpisodeTracks(data), songNotes, episodeRelease(data)), problems: null };
    } catch (error) {
      if (error instanceof EpisodeError) return { episode: null, problems: error.problems };
      throw error;
    }
  }, [data, script]);

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
  if (album.isPending) {
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
  if (!resolved.episode) {
    return (
      <StateView label="Episode" title="This episode doesn’t fit this release" tone="alert" actions={albumLink}>
        <p>The script names tracks or positions this edition of {data.name} doesn’t have:</p>
        <ul className="notice-hints">
          {resolved.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </StateView>
    );
  }

  // Once this episode is in the runner, its own copy is the one on screen.
  const active = state.episode !== null && state.episode.key === resolved.episode.key && state.episode.release?.id === data.id;
  const episode = active ? state.episode! : resolved.episode;
  const playing = active && state.status === 'playing';
  const ended = active && state.status === 'ended';
  const chapter = active && !ended ? chapterOf(episode, state.cueIndex) : null;
  const recordedMs = (key: string) => narration?.clips[key];
  const minutes = formatRuntime(episodeMusicMs(episode) + episodeTalkMs(episode, preferences.episodeRate, recordedMs));
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
  const titleLang = detectLineLanguage(data.name);

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

  // Who plays the music. A change in the middle of a stretch of music takes that stretch up again in the new way.
  const ownMusic = preferences.episodeMusic === 'manual';
  const setMusic = (music: 'auto' | 'manual') => {
    setPreferences({ episodeMusic: music });
    if (active && state.status === 'playing' && episode.cues[state.cueIndex]?.type === 'music') runner.jump(state.cueIndex);
  };
  const playItMyself = () => {
    setPreferences({ episodeMusic: 'manual' });
    runner.resume();
  };

  return (
    <div className="view active">
      <div className="ep">
        <div className="ep-grid">
          <section className="ep-object" aria-label="Episode details">
            {!mobile && <BackLink />}
            <div className="ep-cover">
              <CoverImage
                images={data.images}
                size={420}
                alt={`${data.name} album cover`}
                title={data.name}
                subtitle={joinArtistNames(data.artists)}
                paletteKey={data.id}
                priority
              />
            </div>
            <div className="ep-object-copy">
              <div className="label">Episode</div>
              <h1 lang={titleLang}>{data.name}</h1>
              <div className="artist">
                <ArtistLinks artists={data.artists} />
              </div>
              <div className="album-hero-meta">
                <div>
                  <b>Hosts</b>
                  <span lang="ko">{episode.hosts.map((host) => host.name).join(' · ')}</span>
                </div>
                <div>
                  <b>Runs</b>
                  <span>about {minutes}</span>
                </div>
                <div>
                  <b>Voice</b>
                  <span>{voiceLabel}</span>
                </div>
              </div>
              {recorded.recorded < recorded.total && state.spareNarration === 'captions' && (
                <p className="ep-hint">
                  {recorded.recorded > 0 ? 'Some lines have no recording yet, and this' : 'This'} browser has no Korean voice to speak with, so{' '}
                  {recorded.recorded > 0 ? 'those lines' : 'the hosts’ lines'} are shown for as long as they would take to say. Microsoft Edge comes with
                  natural-sounding Korean voices.
                </p>
              )}
              <div className="object-actions">
                <button type="button" className="plain-action primary" onClick={playOrPause}>
                  {mainLabel}
                </button>
                {active && (
                  <button type="button" className="plain-action" onClick={() => runner.stop()}>
                    End episode
                  </button>
                )}
                {bookmark && (
                  <button type="button" className="plain-action" onClick={() => runner.start(episode)}>
                    From the top
                  </button>
                )}
                <Link className="plain-action" to={`/album/${data.id}`}>
                  Album
                </Link>
              </div>
              {recorded.recorded > 0 && <p className="fineprint">The hosts’ voices are machine-generated ({engineName}).</p>}
              {episode.warnings.map((warning) => (
                <p key={warning} className="fineprint">
                  {warning}
                </p>
              ))}
            </div>
          </section>

          <section className="ep-read" aria-labelledby="episode-title">
            <div className="sequence-head">
              <h2 id="episode-title" lang="ko">
                {episode.title}
              </h2>
              <span lang="ko">
                {chapter
                  ? `${chapter.number} / ${episode.chapters.length} · ${chapter.title}`
                  : leftAt
                    ? `Left at ${leftAt.number} / ${episode.chapters.length} · ${leftAt.title}`
                    : `${episode.chapters.length} chapters · about ${minutes}`}
              </span>
            </div>

            <NowPanel episode={episode} state={state} active={active} translate={preferences.translationEnabled} onHeard={() => runner.proceed()} />

            {active && state.notice && (
              <p className="playback-state alert ep-notice" role="alert">
                {NOTICE_TEXT[state.notice]}
                {state.notice === 'no-playback' && !ownMusic && (
                  <button type="button" className="note-more" onClick={playItMyself}>
                    Play the music myself
                  </button>
                )}
              </p>
            )}
            <PlaybackNotice />

            <div className="ep-controls">
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
              <div className="ep-options">
                <button
                  type="button"
                  className="text-toggle"
                  aria-pressed={ownMusic}
                  title="The episode can play the music in this app’s player, or show what to play and wait while you play it in Spotify yourself"
                  onClick={() => setMusic(ownMusic ? 'auto' : 'manual')}
                >
                  Music: <b>{ownMusic ? 'I play it myself' : 'played for me'}</b>
                </button>
                {!ownMusic && (
                  <button
                    type="button"
                    className="text-toggle"
                    aria-pressed={preferences.episodeTalkOver === 'duck'}
                    title="What the music does while a host talks over it"
                    onClick={() => setPreferences({ episodeTalkOver: preferences.episodeTalkOver === 'duck' ? 'pause' : 'duck' })}
                  >
                    Talk over music: <b>{preferences.episodeTalkOver === 'duck' ? 'music turned down' : 'music stops'}</b>
                  </button>
                )}
                <button type="button" className="text-toggle" onClick={shell.toggleSettings}>
                  Voices and pace
                </button>
              </div>
            </div>

            <ScriptList episode={episode} state={state} active={active} onJump={jump} />
          </section>
        </div>
      </div>
    </div>
  );
}
