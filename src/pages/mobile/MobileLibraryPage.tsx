import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../../app/pageTitle';
import { useSession } from '../../app/sessionContext';
import { useShell } from '../../app/shellContext';
import {
  useFollowedArtists,
  useLikedShuffle,
  useLikedTracks,
  usePlaylists,
  useProfile,
  useRecentlyPlayed,
  useSavedAlbums,
} from '../../catalogue/queries';
import { CoverImage, Portrait } from '../../components/CoverImage';
import { MobileTrackRow } from '../../components/mobile/MobileTrackRow';
import { getAlbumNote } from '../../editorial/lookup';
import { formatRelativeTime, joinArtistNames, pluralise, releaseYear } from '../../lib/format';
import { useEngine, usePlay } from '../../playback/hooks';
import { useCurrentTrackMatcher } from '../../playback/useCurrentTrack';
import { describeSpotifyError } from '../../spotify/errors';
import { detectLineLanguage } from '../../translation/languageDetect';
import { MobileChips, MobileQuiet } from './MobileParts';

const SECTIONS = [
  { id: 'liked', label: 'Liked songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'recent', label: 'Recently played' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

// Relative times refresh once a minute without re-rendering on every frame.
const minuteClock = {
  subscribe(listener: () => void) {
    const timer = setInterval(listener, 60_000);
    return () => clearInterval(timer);
  },
  getSnapshot: () => Math.floor(Date.now() / 60_000) * 60_000,
};

function initials(name: string | null): string {
  if (!name) return 'ARC';
  const parts = name.split(/[\s,._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => Array.from(part)[0]!.toUpperCase()).join('') || 'ARC';
}

/** Loads the next page when the end of the list scrolls into view; the button stays as a fallback. */
function MoreRow({ hasMore, busy, onMore, label }: { hasMore: boolean; busy: boolean; onMore: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onMore);
  latest.current = onMore;
  useEffect(() => {
    const element = ref.current;
    if (!hasMore || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current();
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore]);
  if (!hasMore) return null;
  return (
    <div ref={ref} className="m-more">
      <button type="button" className="plain-action" disabled={busy} onClick={onMore}>
        {busy ? 'Loading…' : label}
      </button>
    </div>
  );
}

function SectionHead({ title, count, children }: { title: string; count?: ReactNode; children?: ReactNode }) {
  return (
    <div className="m-section-head">
      <h2>
        {title}
        {count !== undefined && count !== null && <span className="section-count">{count}</span>}
      </h2>
      {children && <span className="m-section-tools">{children}</span>}
    </div>
  );
}

function LikedSongs() {
  const liked = useLikedTracks(20);
  const play = usePlay();
  const engine = useEngine();
  const shuffle = useLikedShuffle();
  const isCurrent = useCurrentTrackMatcher();
  const items = liked.data?.pages.flatMap((p) => p.items) ?? [];
  const total = liked.data?.pages[0]?.total;
  // Liked Songs has no public context URI; the loaded tracks play in order.
  const uris = items.map((track) => track.uri);
  const shufflePlay = () => {
    engine.activateAudio();
    shuffle.mutate(total ?? items.length, {
      onSuccess: (tracks) => {
        if (tracks.length > 0) play({ uris: tracks.map((track) => track.uri) }, { openNowPlaying: true });
      },
    });
  };

  return (
    <section aria-label="Liked songs">
      <SectionHead title="Liked songs" count={total !== undefined ? pluralise(total, 'song') : undefined}>
        {items.length > 0 && (
          <>
            <button type="button" className="text-toggle" onClick={shufflePlay} disabled={shuffle.isPending}>
              {shuffle.isPending ? 'Shuffling…' : 'Shuffle'}
            </button>
            <button type="button" className="text-toggle" onClick={() => play({ uris }, { openNowPlaying: true })}>
              Play all
            </button>
          </>
        )}
      </SectionHead>
      {shuffle.isError && <MobileQuiet role="alert">{describeSpotifyError(shuffle.error).body}</MobileQuiet>}
      {liked.isPending ? (
        <MobileQuiet role="status">Loading liked songs…</MobileQuiet>
      ) : liked.isError ? (
        <MobileQuiet role="alert" retry={() => void liked.refetch()}>
          {describeSpotifyError(liked.error).body}
        </MobileQuiet>
      ) : items.length === 0 ? (
        <MobileQuiet>Tracks you like — on Spotify or with ♡ in Now Playing — collect here.</MobileQuiet>
      ) : (
        <>
          <ol className="m-list">
            {items.map((track, index) => (
              <MobileTrackRow
                key={`${track.spotifyTrackId}-${index}`}
                track={track}
                current={isCurrent({ id: track.spotifyTrackId, uri: track.uri })}
                onPlay={() => play({ uris, offsetUri: track.uri }, { openNowPlaying: true })}
              />
            ))}
          </ol>
          <MoreRow hasMore={Boolean(liked.hasNextPage)} busy={liked.isFetchingNextPage} onMore={() => void liked.fetchNextPage()} label="Show more songs" />
        </>
      )}
    </section>
  );
}

function Artists() {
  const artists = useFollowedArtists();
  const items = artists.data?.pages.flatMap((p) => p.items) ?? [];
  const total = artists.data?.pages[0]?.total;
  return (
    <section aria-label="Artists">
      <SectionHead title="Artists" count={total ?? undefined} />
      {artists.isPending ? (
        <MobileQuiet role="status">Loading artists…</MobileQuiet>
      ) : artists.isError ? (
        <MobileQuiet role="alert" retry={() => void artists.refetch()}>
          {describeSpotifyError(artists.error).body}
        </MobileQuiet>
      ) : items.length === 0 ? (
        <MobileQuiet>Artists you follow on Spotify appear here.</MobileQuiet>
      ) : (
        <>
          <ul className="m-grid">
            {items.map((artist) => (
              <li key={artist.id}>
                <Link className="m-tile" to={`/artist/${artist.id}`}>
                  <span className="m-tile-art round">
                    <Portrait images={artist.images} name={artist.name} size={180} />
                  </span>
                  <span className="m-tile-title" lang={detectLineLanguage(artist.name)}>
                    {artist.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <MoreRow hasMore={Boolean(artists.hasNextPage)} busy={artists.isFetchingNextPage} onMore={() => void artists.fetchNextPage()} label="Show more artists" />
        </>
      )}
    </section>
  );
}

function Albums() {
  const albums = useSavedAlbums();
  const items = albums.data?.pages.flatMap((p) => p.items) ?? [];
  const total = albums.data?.pages[0]?.total;
  return (
    <section aria-label="Albums">
      <SectionHead title="Albums" count={total !== undefined ? pluralise(total, 'album') : undefined} />
      {albums.isPending ? (
        <MobileQuiet role="status">Loading saved albums…</MobileQuiet>
      ) : albums.isError ? (
        <MobileQuiet role="alert" retry={() => void albums.refetch()}>
          {describeSpotifyError(albums.error).body}
        </MobileQuiet>
      ) : items.length === 0 ? (
        <MobileQuiet>Albums you save on Spotify — or from an album page here — collect in this archive.</MobileQuiet>
      ) : (
        <>
          <ul className="m-grid">
            {items.map((album) => {
              const noted = getAlbumNote({ id: album.id, name: album.name, artistNames: album.artists.map((a) => a.name), releaseDate: album.releaseDate });
              return (
                <li key={album.id}>
                  <Link className="m-tile" to={`/album/${album.id}`}>
                    <span className="m-tile-art">
                      <CoverImage images={album.images} size={180} alt="" title={album.name} subtitle={joinArtistNames(album.artists)} paletteKey={album.id} />
                    </span>
                    <span className="m-tile-title" lang={detectLineLanguage(album.name)}>
                      {album.name}
                    </span>
                    <span className="m-tile-meta">
                      {[joinArtistNames(album.artists), releaseYear(album.releaseDate)].filter(Boolean).join(' · ')}
                      {noted && <span className="track-note">Note</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <MoreRow hasMore={Boolean(albums.hasNextPage)} busy={albums.isFetchingNextPage} onMore={() => void albums.fetchNextPage()} label="Show more albums" />
        </>
      )}
    </section>
  );
}

function Playlists() {
  const playlists = usePlaylists();
  const play = usePlay();
  const items = playlists.data?.pages.flatMap((p) => p.items) ?? [];
  const total = playlists.data?.pages[0]?.total;
  return (
    <section aria-label="Playlists">
      <SectionHead title="Playlists" count={total ?? undefined} />
      {playlists.isPending ? (
        <MobileQuiet role="status">Loading playlists…</MobileQuiet>
      ) : playlists.isError ? (
        <MobileQuiet role="alert" retry={() => void playlists.refetch()}>
          {describeSpotifyError(playlists.error).body}
        </MobileQuiet>
      ) : items.length === 0 ? (
        <MobileQuiet>Playlists you create or follow on Spotify appear here.</MobileQuiet>
      ) : (
        <>
          <ul className="m-list">
            {items.map((playlist) => (
              <li key={playlist.id} className="m-row">
                <button type="button" className="m-row-hit" aria-label={`Play ${playlist.name}`} onClick={() => play({ contextUri: playlist.uri }, { openNowPlaying: true })}>
                  <CoverImage images={playlist.images} size={48} alt="" title={playlist.name} className="m-row-cover" />
                  <span className="m-row-text">
                    <span className="m-row-title" lang={detectLineLanguage(playlist.name)}>
                      {playlist.name}
                    </span>
                    <span className="m-row-meta">
                      {['Playlist', playlist.ownerName, playlist.itemCount !== null ? pluralise(playlist.itemCount, 'item') : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <MoreRow hasMore={Boolean(playlists.hasNextPage)} busy={playlists.isFetchingNextPage} onMore={() => void playlists.fetchNextPage()} label="Show more playlists" />
        </>
      )}
    </section>
  );
}

function Recent() {
  const recent = useRecentlyPlayed();
  const play = usePlay();
  const isCurrent = useCurrentTrackMatcher();
  const now = useSyncExternalStore(minuteClock.subscribe, minuteClock.getSnapshot);
  return (
    <section aria-label="Recently played">
      <SectionHead title="Recently played" />
      {recent.isPending ? (
        <MobileQuiet role="status">Loading your listening history…</MobileQuiet>
      ) : recent.isError ? (
        <MobileQuiet role="alert" retry={() => void recent.refetch()}>
          {describeSpotifyError(recent.error).body}
        </MobileQuiet>
      ) : recent.data.length === 0 ? (
        <MobileQuiet>Tracks you play on any Spotify device will be listed here.</MobileQuiet>
      ) : (
        <ol className="m-list">
          {recent.data.map((item) => {
            const contextUri =
              item.context && (item.context.type === 'album' || item.context.type === 'playlist') ? item.context.uri : item.track.album.uri || undefined;
            return (
              <MobileTrackRow
                key={`${item.track.spotifyTrackId}-${item.playedAt}`}
                track={item.track}
                current={isCurrent({ id: item.track.spotifyTrackId, uri: item.track.uri })}
                meta={
                  <>
                    {joinArtistNames(item.track.artists)} · <time dateTime={item.playedAt}>{formatRelativeTime(item.playedAt, now)}</time>
                  </>
                }
                onPlay={() => play(contextUri ? { contextUri, offsetUri: item.track.uri } : { uris: [item.track.uri] }, { openNowPlaying: true })}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The phone's Library: one section at a time behind a row of chips instead of
 * the desktop's long page. The chosen section lives in the address, so it
 * survives switching tabs and going back.
 */
export function MobileLibraryPage() {
  const { mode } = useSession();
  const shell = useShell();
  const [params, setParams] = useSearchParams();
  const section = (SECTIONS.find((s) => s.id === params.get('section'))?.id ?? 'liked') as Section;
  const profile = useProfile();
  usePageTitle('Library');
  const name = profile.data?.displayName ?? null;

  return (
    <div className="m-page">
      <header className="m-page-head">
        <div>
          <div className="label">{mode === 'preview' ? 'Preview archive' : 'Your Spotify library'}</div>
          <h1>Library</h1>
        </div>
        <button type="button" className="m-avatar" aria-label="Settings" aria-haspopup="dialog" onClick={shell.toggleSettings}>
          <span aria-hidden="true">{initials(name)}</span>
        </button>
      </header>
      <MobileChips
        label="Library section"
        options={SECTIONS}
        value={section}
        onChange={(id) => setParams(id === 'liked' ? {} : { section: id }, { replace: true })}
      />
      <div className="m-page-body">
        {section === 'liked' && <LikedSongs />}
        {section === 'artists' && <Artists />}
        {section === 'albums' && <Albums />}
        {section === 'playlists' && <Playlists />}
        {section === 'recent' && <Recent />}
      </div>
    </div>
  );
}
