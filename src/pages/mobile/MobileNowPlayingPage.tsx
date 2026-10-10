import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../../app/pageTitle';
import { useSession } from '../../app/sessionContext';
import { useShell } from '../../app/shellContext';
import { useAlbum, useSavedState, useToggleSaved } from '../../catalogue/queries';
import { ArtistLinks } from '../../components/ArtistLinks';
import { CoverImage } from '../../components/CoverImage';
import {
  ChevronDownIcon,
  DeviceIcon,
  ExpandIcon,
  HeartIcon,
  NextIcon,
  PlayIcon,
  PreviousIcon,
  QueueIcon,
  ShuffleIcon,
} from '../../components/icons';
import { DeviceSheet, SPOTIFY_APP_URL } from '../../components/mobile/DeviceSheet';
import { useNote } from '../../components/NoteContext';
import { PreviousLine, TranslationStatus } from '../../components/player/LyricsBlock';
import { Slider } from '../../components/Slider';
import { songNotePayload } from '../../components/SongNote';
import type { TrackIdentity } from '../../domain/types';
import { getSongNote } from '../../editorial/lookup';
import { formatDuration, formatDurationForSpeech, formatTrackNumber, joinArtistNames } from '../../lib/format';
import { useWakeLock } from '../../lib/useWakeLock';
import { useLyricView } from '../../lyrics/useLyricView';
import { useTimedLyrics, type LyricsState } from '../../lyrics/useTimedLyrics';
import { useEngine, usePlaybackPosition, usePlayerSelector, usePlayerSnapshot, useProgressProperty } from '../../playback/hooks';
import { detectLineLanguage } from '../../translation/languageDetect';

/**
 * The phone's Now Playing, in the playing album's colour: where it plays, the
 * cover, title and ♡, artist · album, the current lyric with its translation,
 * the one-line Listening note, the seek bar and the transport. Tapping the
 * lyric opens the lyrics view (the phone's Focus Mode).
 */
export function MobileNowPlayingPage() {
  const snapshot = usePlayerSnapshot();
  const hydrated = usePlayerSelector((s) => s.hydrated);
  const track = snapshot.track;
  const lyricsState = useTimedLyrics(track);
  usePageTitle('Now Playing', track?.title ?? null);
  const [devicesOpen, setDevicesOpen] = useState(false);

  let body;
  if (!hydrated) body = <NowPlayingState title="Reading playback…" />;
  else if (!track) body = <NothingPlaying onDevices={() => setDevicesOpen(true)} />;
  else body = <Playing track={track} lyricsState={lyricsState} onDevices={() => setDevicesOpen(true)} />;

  return (
    <div className="m-np m-stage">
      {body}
      <DeviceSheet open={devicesOpen} onClose={() => setDevicesOpen(false)} />
    </div>
  );
}

function Playing({ track, lyricsState, onDevices }: { track: TrackIdentity; lyricsState: LyricsState; onDevices: () => void }) {
  const snapshot = usePlayerSnapshot();
  const album = useAlbum(track.album.id || undefined);
  const { openNote } = useNote();
  const view = useLyricView(track, lyricsState);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const peekRef = useRef<HTMLButtonElement>(null);

  const albumName = album.data?.name ?? track.album.name;
  const artists = joinArtistNames(track.artists) || 'Unknown artist';
  const albumTrack = album.data?.tracks.find((item) => item.id === track.spotifyTrackId || item.uri === track.uri);
  const titleLang = (lyricsState.status === 'ready' ? lyricsState.lyrics.language : undefined) ?? detectLineLanguage(track.title);
  const songNote = getSongNote({ id: track.spotifyTrackId, title: track.title, artistNames: track.artists.map((a) => a.name) });
  const from = snapshot.context?.name ?? albumName;

  return (
    <div className="m-np-grid">
      <div className="m-np-top">
        <span className="label m-np-from">
          Playing from <b lang={detectLineLanguage(from)}>{from}</b>
        </span>
        <DeviceChip onClick={onDevices} />
      </div>
      <div className="m-np-cover">
        <CoverImage images={track.album.images} size={420} alt={`${albumName} album cover`} title={albumName} subtitle={artists} paletteKey={track.album.id} priority />
      </div>
      <div className="m-np-title">
        <div className="m-np-title-text">
          <h1 lang={titleLang}>{track.title}</h1>
          <div className="m-np-artist">
            <ArtistLinks artists={track.artists} />
            {track.album.id && (
              <>
                <span aria-hidden="true"> · </span>
                <Link className="linkish" to={`/album/${track.album.id}`} lang={detectLineLanguage(albumName)}>
                  {albumName}
                </Link>
              </>
            )}
          </div>
        </div>
        <LikeButton track={track} />
      </div>
      <button ref={peekRef} type="button" className="m-peek" aria-label="Open lyrics" aria-haspopup="dialog" onClick={() => setLyricsOpen(true)}>
        <LyricPeek view={view} lyricsState={lyricsState} />
        <span className="m-peek-open" aria-hidden="true">
          <ExpandIcon />
        </span>
      </button>
      {songNote && (songNote.short?.trim() || songNote.full?.trim() || songNote.translation) && (
        <button
          type="button"
          className="m-note-line"
          aria-haspopup="dialog"
          onClick={() =>
            openNote(
              songNotePayload(songNote, {
                title: track.title,
                titleLang,
                subtitle: `${artists} · ${albumName}${albumTrack ? ` · Track ${formatTrackNumber(albumTrack.trackNumber)}` : ''}`,
              }),
            )
          }
        >
          <span className="kicker">Listening note</span>
          <span className="text" lang="ko">
            {songNote.short?.trim() || 'Read the full note'}
          </span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}
      <MobileNotice onDevices={onDevices} />
      <Progress />
      <Transport />
      {lyricsOpen && (
        <LyricsMode
          track={track}
          albumName={albumName}
          view={view}
          lyricsState={lyricsState}
          onClose={() => {
            setLyricsOpen(false);
            peekRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}

type LyricView = ReturnType<typeof useLyricView>;

/** Lyrics states that have no line to show. */
function lyricState(lyricsState: LyricsState): string | null {
  switch (lyricsState.status) {
    case 'loading':
      return 'Finding synchronized lyrics…';
    case 'disabled':
      return 'Lyrics are turned off';
    case 'unavailable':
      return lyricsState.reason === 'error' ? 'Lyrics provider unavailable' : 'Synchronized lyrics unavailable';
    case 'instrumental':
      return 'Instrumental';
    case 'idle':
      return 'Lyrics';
    default:
      return null;
  }
}

function LyricPeek({ view, lyricsState }: { view: LyricView; lyricsState: LyricsState }) {
  const state = lyricState(lyricsState);
  if (state) return <span className="m-peek-line is-state">{state}</span>;
  const next = view.upcoming[0];
  return (
    <>
      {view.current ? (
        <span key={`line-${view.activeIndex}`} className="m-peek-line" lang={view.lineLanguages[view.activeIndex]}>
          {view.current.text}
        </span>
      ) : (
        <span key={`gap-${view.nextIndex}`} className="m-peek-line is-gap" aria-hidden="true">
          ···
        </span>
      )}
      {view.translated ? (
        <span className="m-peek-sub" lang={view.translationTarget}>
          {view.translated}
        </span>
      ) : next ? (
        <span className="m-peek-sub" lang={view.lineLanguages[view.nextIndex]}>
          {next.text}
        </span>
      ) : null}
    </>
  );
}

/** The phone's Focus Mode: lyrics over everything, with the seek bar and transport. Drag the header down to close. */
function LyricsMode({
  track,
  albumName,
  view,
  lyricsState,
  onClose,
}: {
  track: TrackIdentity;
  albumName: string;
  view: LyricView;
  lyricsState: LyricsState;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [keepAwake, setKeepAwake] = useState(false);
  const wakeLockSupported = useWakeLock(keepAwake);
  const [drag, setDrag] = useState<{ start: number; offset: number } | null>(null);
  const state = lyricState(lyricsState);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const artists = joinArtistNames(track.artists);
  return (
    <div
      className="m-lyrics m-stage"
      role="dialog"
      aria-modal="true"
      aria-label={`Lyrics · ${track.title}`}
      style={drag ? { transform: `translateY(${drag.offset}px)`, transition: 'none' } : undefined}
    >
      <div className="m-lyrics-art">
        <CoverImage images={track.album.images} size={420} alt="" title={albumName} paletteKey={track.album.id} />
      </div>
      <div
        className="m-lyrics-head"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setDrag({ start: event.clientY, offset: 0 });
        }}
        onPointerMove={(event) => drag && setDrag({ start: drag.start, offset: Math.max(0, event.clientY - drag.start) })}
        onPointerUp={() => {
          if (drag && drag.offset > 110) onClose();
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <CoverImage images={track.album.images} size={44} alt="" title={albumName} paletteKey={track.album.id} className="m-lyrics-thumb" />
        <span className="m-lyrics-title">
          <b lang={detectLineLanguage(track.title)}>{track.title}</b>
          <span>
            {artists} · {albumName}
          </span>
        </span>
        <button ref={closeRef} type="button" className="m-ctl ink" aria-label="Close lyrics" onClick={onClose}>
          <ChevronDownIcon />
        </button>
      </div>
      <div className="m-lyrics-tools">
        <h2>Lyrics</h2>
        <span className="m-lyrics-toggles">
          {view.canTranslate && view.preferences.translationEnabled && view.lines && view.translation.status !== 'ready' && (
            <TranslationStatus state={view.translation} target={view.translationTarget} prepare={view.prepare} />
          )}
          {view.canTranslate && (
            <button
              type="button"
              className="text-toggle"
              aria-pressed={view.preferences.translationEnabled}
              onClick={() => view.setPreferences({ translationEnabled: !view.preferences.translationEnabled })}
            >
              Translation <b>{view.preferences.translationEnabled ? 'On' : 'Off'}</b>
            </button>
          )}
          {wakeLockSupported && (
            <button type="button" className="text-toggle" aria-pressed={keepAwake} onClick={() => setKeepAwake(!keepAwake)}>
              Screen <b>{keepAwake ? 'Stays on' : 'Auto'}</b>
            </button>
          )}
        </span>
      </div>
      <section className="m-lyrics-body" aria-label="Lyrics">
        {state ? (
          <p className="current-lyric is-state">{state}</p>
        ) : (
          <>
            <PreviousLine key={`prev-${view.previousIndex}`} line={view.previous} index={view.previousIndex} lang={view.lineLanguages[view.previousIndex]} />
            {view.current ? (
              <p key={`line-${view.activeIndex}`} className="current-lyric" lang={view.lineLanguages[view.activeIndex]}>
                {view.current.text}
              </p>
            ) : (
              <p key={`gap-${view.nextIndex}`} className="current-lyric is-gap" aria-hidden="true">
                ···
              </p>
            )}
            {view.translated && (
              <p
                key={view.segment !== null ? `seg-${view.segment}` : `tr-${view.activeIndex}`}
                className={view.continued ? 'current-trans is-continued' : 'current-trans'}
                lang={view.translationTarget}
              >
                {view.translated}
              </p>
            )}
            <ol className="next-lines" aria-label="Next lines">
              {view.upcoming.map((line, offset) => (
                <li key={`next-${view.nextIndex + offset}`} className={offset === 0 ? 'next-line' : 'next-line second'} lang={view.lineLanguages[view.nextIndex + offset]}>
                  {line.text}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      <div className="m-lyrics-foot">
        <Progress />
        <Transport compact />
      </div>
    </div>
  );
}

function DeviceChip({ onClick }: { onClick: () => void }) {
  const device = usePlayerSelector((s) => s.snapshot.device);
  const name = device ? (device.isThisBrowser ? 'This browser' : device.name) : 'No device';
  return (
    <button
      type="button"
      className={device ? 'm-device-chip' : 'm-device-chip none'}
      aria-haspopup="dialog"
      aria-label={device ? `Playing on ${device.name}. Choose a device` : 'No active device. Choose a device'}
      onClick={onClick}
    >
      <DeviceIcon />
      <span>{name}</span>
    </button>
  );
}

function LikeButton({ track }: { track: TrackIdentity }) {
  const saved = useSavedState(track.uri);
  const toggle = useToggleSaved();
  const isSaved = saved.data === true;
  return (
    <button
      type="button"
      className="m-ctl m-like"
      aria-pressed={isSaved}
      aria-label={isSaved ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      disabled={saved.isPending || saved.isError || toggle.isPending}
      onClick={() => toggle.mutate({ uri: track.uri, saved: !isSaved })}
    >
      <HeartIcon filled={isSaved} />
    </button>
  );
}

function Progress() {
  const snapshot = usePlayerSnapshot();
  const position = usePlaybackPosition();
  const engine = useEngine();
  const sliderRef = useRef<HTMLDivElement>(null);
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  useProgressProperty(sliderRef);
  const duration = snapshot.durationMs;
  const seekDisabled = !snapshot.track || duration <= 0 || snapshot.disallows.seeking;
  return (
    <div className="m-progress">
      <Slider
        ref={sliderRef}
        live
        label="Seek"
        value={duration > 0 ? position / duration : 0}
        disabled={seekDisabled}
        step={duration > 0 ? Math.min(1, 5000 / duration) : 0.05}
        bigStep={duration > 0 ? Math.min(1, 30000 / duration) : 0.2}
        scale={duration / 1000}
        valueText={(fraction) => `${formatDurationForSpeech(fraction * duration)} of ${formatDurationForSpeech(duration)}`}
        onPreview={(fraction) => setPreviewMs(fraction === null ? null : fraction * duration)}
        onCommit={(fraction) => void engine.seek(Math.min(fraction * duration, Math.max(0, duration - 750)))}
      />
      <div className="m-times" aria-hidden="true">
        <span>{formatDuration(previewMs ?? position)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}

function Transport({ compact = false }: { compact?: boolean }) {
  const snapshot = usePlayerSnapshot();
  const engine = useEngine();
  const shell = useShell();
  const hasTrack = Boolean(snapshot.track);
  const paused = snapshot.paused;
  return (
    <div className={compact ? 'm-transport compact' : 'm-transport'}>
      {!compact && (
        <button
          type="button"
          className="m-ctl toggle"
          aria-label="Shuffle"
          aria-pressed={snapshot.shuffle}
          disabled={!hasTrack || snapshot.disallows.togglingShuffle}
          onClick={() => void engine.setShuffle(!snapshot.shuffle)}
        >
          <ShuffleIcon />
        </button>
      )}
      <button type="button" className="m-ctl ink" aria-label="Previous track" disabled={!hasTrack || snapshot.disallows.skippingPrev} onClick={() => void engine.previous()}>
        <PreviousIcon />
      </button>
      <button
        type="button"
        className="m-play"
        aria-label={paused ? 'Play' : 'Pause'}
        disabled={!hasTrack || (paused ? snapshot.disallows.resuming : snapshot.disallows.pausing)}
        onClick={() => {
          engine.activateAudio();
          void engine.togglePlay();
        }}
      >
        <PlayIcon paused={paused} />
      </button>
      <button type="button" className="m-ctl ink" aria-label="Next track" disabled={!hasTrack || snapshot.disallows.skippingNext} onClick={() => void engine.next()}>
        <NextIcon />
      </button>
      {!compact && (
        <button type="button" className="m-ctl" aria-label="Queue" aria-haspopup="dialog" onClick={shell.openQueue}>
          <QueueIcon />
        </button>
      )}
    </div>
  );
}

/** Only problems reach the phone's Now Playing — never "Playing on …" chatter. */
function MobileNotice({ onDevices }: { onDevices: () => void }) {
  const engine = useEngine();
  const { store } = useSession();
  const issue = usePlayerSelector((s) => s.issue);
  if (!issue) return null;
  const alert = issue.kind !== 'autoplay-blocked';
  return (
    <div className="m-notice" role={alert ? 'alert' : 'status'}>
      <span>{issue.message}</span>
      {(issue.kind === 'autoplay-blocked' || issue.kind === 'playback-failed') && (
        <button
          type="button"
          className="notice-action"
          onClick={() => {
            engine.activateAudio();
            void engine.resume();
          }}
        >
          {issue.kind === 'autoplay-blocked' ? 'Start audio' : 'Try again'}
        </button>
      )}
      {issue.kind === 'no-active-device' && (
        <>
          <a className="notice-action" href={SPOTIFY_APP_URL}>
            Open Spotify
          </a>
          <button type="button" className="notice-action" onClick={onDevices}>
            Choose device
          </button>
        </>
      )}
      <button type="button" className="notice-action" onClick={() => store.dispatch({ type: 'issue/clear' })}>
        Dismiss
      </button>
    </div>
  );
}

function NowPlayingState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="m-np-empty">
      <div className="label">Now playing</div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

function NothingPlaying({ onDevices }: { onDevices: () => void }) {
  const engine = useEngine();
  const { mode } = useSession();
  return (
    <NowPlayingState title="No active track">
      <p>
        {mode === 'preview'
          ? 'Start a track from Library, Search or Archive.'
          : 'Start music in the Spotify app or on another device, or pick something from Library. ARC follows the real playback session.'}
      </p>
      <div className="m-actions">
        {mode === 'spotify' && (
          <a className="plain-action primary" href={SPOTIFY_APP_URL}>
            Open Spotify
          </a>
        )}
        <button type="button" className="plain-action" onClick={onDevices}>
          Choose device
        </button>
        <Link className="plain-action" to="/library">
          Library
        </Link>
        <button type="button" className="plain-action" onClick={() => void engine.resync()}>
          Check again
        </button>
      </div>
    </NowPlayingState>
  );
}
