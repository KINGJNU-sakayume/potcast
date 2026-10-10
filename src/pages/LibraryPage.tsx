import { useSyncExternalStore, type ReactNode } from 'react';
import { usePageTitle } from '../app/pageTitle';
import { useSession } from '../app/sessionContext';
import {
  useFollowedArtists,
  useLikedShuffle,
  useLikedTracks,
  usePlaylists,
  useRecentlyPlayed,
  useSavedAlbums,
} from '../catalogue/queries';
import { CoverImage, Portrait } from '../components/CoverImage';
import { CoverTile } from '../components/desktop/CoverTile';
import { TrackIndexRow } from '../components/IndexRow';
import { QuietRow } from '../components/StateView';
import { getAlbumNote, getArtistNote, getSongNote } from '../editorial/lookup';
import type { TrackIdentity } from '../domain/types';
import { formatRelativeTime, joinArtistNames, pluralise, releaseYear } from '../lib/format';
import { useEngine, usePlay } from '../playback/hooks';
import { useCurrentTrackMatcher } from '../playback/useCurrentTrack';
import { describeSpotifyError } from '../spotify/errors';

const RECENT_LIMIT = 6;

// Relative times refresh once a minute without re-rendering on every frame.
const minuteClock = {
  subscribe(listener: () => void) {
    const timer = setInterval(listener, 60_000);
    return () => clearInterval(timer);
  },
  getSnapshot: () => Math.floor(Date.now() / 60_000) * 60_000,
};

const hasSongNote = (track: TrackIdentity) =>
  getSongNote({ id: track.spotifyTrackId, title: track.title, artistNames: track.artists.map((a) => a.name) }) !== null;

function SectionHead({ id, title, count, actions }: { id: string; title: string; count?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sequence-head library-section-head">
      <h2 id={id}>{title}</h2>
      <div className="section-tools">
        {count !== undefined && count !== null && <span>{count}</span>}
        {actions}
      </div>
    </div>
  );
}

function ErrorRow({ error, retry }: { error: unknown; retry: () => void }) {
  const { title, body } = describeSpotifyError(error);
  return (
    <QuietRow role="alert">
      <b>{title}.</b> {body}{' '}
      <button type="button" className="note-more" onClick={retry}>
        Try again
      </button>
    </QuietRow>
  );
}

function MoreButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <div className="more-row">
      <button type="button" className="plain-action" onClick={onClick} disabled={busy}>
        {busy ? 'Loading…' : label}
      </button>
    </div>
  );
}

function LikedSongs() {
  const liked = useLikedTracks(10);
  const play = usePlay();
  const engine = useEngine();
  const shuffle = useLikedShuffle();
  const isCurrent = useCurrentTrackMatcher();
  const items = liked.data?.pages.flatMap((p) => p.items) ?? [];
  const total = liked.data?.pages[0]?.total;
  // Liked Songs has no public context URI; the loaded tracks play in order.
  const uris = items.map((track) => track.uri);

  // Shuffle draws from the whole library, not only the rows shown here.
  const shufflePlay = () => {
    engine.activateAudio();
    shuffle.mutate(total ?? items.length, {
      onSuccess: (tracks) => {
        if (tracks.length > 0) play({ uris: tracks.map((track) => track.uri) }, { openNowPlaying: true });
      },
    });
  };

  return (
    <section className="library-section" aria-labelledby="liked-title">
      <SectionHead
        id="liked-title"
        title="Liked songs"
        count={total !== undefined ? pluralise(total, 'song') : null}
        actions={
          items.length > 0 && (
            <>
              <button type="button" className="text-toggle" onClick={shufflePlay} disabled={shuffle.isPending}>
                {shuffle.isPending ? 'Shuffling…' : 'Shuffle'}
              </button>
              <button type="button" className="text-toggle" onClick={() => play({ uris }, { openNowPlaying: true })}>
                Play all
              </button>
            </>
          )
        }
      />
      {shuffle.isError && <ErrorRow error={shuffle.error} retry={shufflePlay} />}
      {liked.isPending ? (
        <QuietRow role="status">Loading liked songs…</QuietRow>
      ) : liked.isError ? (
        <ErrorRow error={liked.error} retry={() => void liked.refetch()} />
      ) : items.length === 0 ? (
        <QuietRow>Tracks you like — on Spotify or with Like in Now Playing — collect here.</QuietRow>
      ) : (
        <>
          <ol className="index-list">
            {items.map((track, index) => (
              <TrackIndexRow
                key={`${track.spotifyTrackId}-${index}`}
                track={track}
                position={index + 1}
                noted={hasSongNote(track)}
                current={isCurrent({ id: track.spotifyTrackId, uri: track.uri })}
                onPlay={() => play({ uris, offsetUri: track.uri }, { openNowPlaying: true })}
              />
            ))}
          </ol>
          {liked.hasNextPage && (
            <MoreButton onClick={() => void liked.fetchNextPage()} busy={liked.isFetchingNextPage} label="Show more songs" />
          )}
        </>
      )}
    </section>
  );
}

function FollowedArtists() {
  const artists = useFollowedArtists();
  const play = usePlay();
  const items = artists.data?.pages.flatMap((p) => p.items) ?? [];
  const total = artists.data?.pages[0]?.total;

  return (
    <section className="library-section" aria-labelledby="artists-title">
      <SectionHead id="artists-title" title="Artists" count={total ?? (items.length > 0 ? items.length : null)} />
      {artists.isPending ? (
        <QuietRow role="status">Loading artists…</QuietRow>
      ) : artists.isError ? (
        <ErrorRow error={artists.error} retry={() => void artists.refetch()} />
      ) : items.length === 0 ? (
        <QuietRow>Artists you follow on Spotify appear here.</QuietRow>
      ) : (
        <>
          <ul className="cover-tiles">
            {items.map((artist) => (
              <CoverTile
                key={artist.id}
                round
                art={<Portrait images={artist.images} name={artist.name} size={220} />}
                title={artist.name}
                to={`/artist/${artist.id}`}
                meta="Artist"
                noted={getArtistNote({ id: artist.id, name: artist.name }) !== null}
                onPlay={() => play({ contextUri: artist.uri }, { openNowPlaying: true })}
              />
            ))}
          </ul>
          {artists.hasNextPage && (
            <MoreButton onClick={() => void artists.fetchNextPage()} busy={artists.isFetchingNextPage} label="Show more artists" />
          )}
        </>
      )}
    </section>
  );
}

function SavedAlbums() {
  const albums = useSavedAlbums();
  const play = usePlay();
  const items = albums.data?.pages.flatMap((p) => p.items) ?? [];
  const total = albums.data?.pages[0]?.total;

  return (
    <section className="library-section" aria-labelledby="albums-title">
      <SectionHead id="albums-title" title="Liked albums" count={total !== undefined ? pluralise(total, 'album') : null} />
      {albums.isPending ? (
        <QuietRow role="status">Loading saved albums…</QuietRow>
      ) : albums.isError ? (
        <ErrorRow error={albums.error} retry={() => void albums.refetch()} />
      ) : items.length === 0 ? (
        <QuietRow>Albums you save on Spotify — or from an album page here — collect in this archive.</QuietRow>
      ) : (
        <>
          <ul className="cover-tiles">
            {items.map((album) => (
              <CoverTile
                key={album.id}
                art={<CoverImage images={album.images} size={220} alt="" title={album.name} paletteKey={album.id} />}
                title={album.name}
                to={`/album/${album.id}`}
                meta={[joinArtistNames(album.artists), releaseYear(album.releaseDate)].filter(Boolean).join(' · ')}
                noted={getAlbumNote({ id: album.id, name: album.name, artistNames: album.artists.map((a) => a.name), releaseDate: album.releaseDate }) !== null}
                onPlay={() => play({ contextUri: album.uri }, { openNowPlaying: true })}
              />
            ))}
          </ul>
          {albums.hasNextPage && (
            <MoreButton onClick={() => void albums.fetchNextPage()} busy={albums.isFetchingNextPage} label="Show more albums" />
          )}
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
    <section className="library-section" aria-labelledby="playlists-title">
      <SectionHead id="playlists-title" title="Playlists" count={total !== undefined ? total : null} />
      {playlists.isPending ? (
        <QuietRow role="status">Loading playlists…</QuietRow>
      ) : playlists.isError ? (
        <ErrorRow error={playlists.error} retry={() => void playlists.refetch()} />
      ) : items.length === 0 ? (
        <QuietRow>Playlists you create or follow on Spotify appear here.</QuietRow>
      ) : (
        <>
          <ul className="cover-tiles">
            {items.map((playlist) => (
              <CoverTile
                key={playlist.id}
                art={<CoverImage images={playlist.images} size={220} alt="" title={playlist.name} />}
                title={playlist.name}
                meta={['Playlist', playlist.itemCount !== null ? pluralise(playlist.itemCount, 'item') : null].filter(Boolean).join(' · ')}
                onPlay={() => play({ contextUri: playlist.uri }, { openNowPlaying: true })}
              />
            ))}
          </ul>
          {playlists.hasNextPage && (
            <MoreButton onClick={() => void playlists.fetchNextPage()} busy={playlists.isFetchingNextPage} label="Show more playlists" />
          )}
        </>
      )}
    </section>
  );
}

function RecentlyPlayed() {
  const recent = useRecentlyPlayed();
  const play = usePlay();
  const isCurrent = useCurrentTrackMatcher();
  const now = useSyncExternalStore(minuteClock.subscribe, minuteClock.getSnapshot);

  return (
    <section className="library-section" aria-labelledby="recent-title">
      <SectionHead id="recent-title" title="Recently played" />
      {recent.isPending ? (
        <QuietRow role="status">Loading your listening history…</QuietRow>
      ) : recent.isError ? (
        <ErrorRow error={recent.error} retry={() => void recent.refetch()} />
      ) : recent.data.length === 0 ? (
        <QuietRow>Tracks you play on any Spotify device will be listed here.</QuietRow>
      ) : (
        <ol className="index-list">
          {recent.data.slice(0, RECENT_LIMIT).map((item, index) => {
            const contextUri =
              item.context && (item.context.type === 'album' || item.context.type === 'playlist')
                ? item.context.uri
                : item.track.album.uri || undefined;
            return (
              <TrackIndexRow
                key={`${item.track.spotifyTrackId}-${item.playedAt}`}
                track={item.track}
                position={index + 1}
                noted={hasSongNote(item.track)}
                current={isCurrent({ id: item.track.spotifyTrackId, uri: item.track.uri })}
                aside={<time dateTime={item.playedAt}>{formatRelativeTime(item.playedAt, now)}</time>}
                onPlay={() =>
                  play(contextUri ? { contextUri, offsetUri: item.track.uri } : { uris: [item.track.uri] }, { openNowPlaying: true })
                }
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The listener's Spotify library on one screen (v7.5): liked songs and recent
 * plays as lists; liked albums, playlists and followed artists as big covers.
 * Two columns on a 16:9 window, three on 21:9 (desktop.css).
 */
export function LibraryPage() {
  const { mode } = useSession();
  usePageTitle('Library');

  return (
    <div className="view active">
      <div className="library-page">
        <div className="library-shell">
          <header className="library-head">
            <div className="label">{mode === 'preview' ? 'Preview archive' : 'Your Spotify library'}</div>
            <h1>Library</h1>
            {mode === 'preview' && (
              <p>
                A sample archive for exploring ARC without Spotify. Track lists and timings are sample data and lyric lines are
                original test lines; the Editorial and Listening Notes are the real local notes.
              </p>
            )}
          </header>
          <div className="library-columns">
            <div className="library-col library-col-lists">
              <LikedSongs />
              <RecentlyPlayed />
            </div>
            <div className="library-col library-col-covers">
              <SavedAlbums />
              <Playlists />
            </div>
            <div className="library-col library-col-artists">
              <FollowedArtists />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
