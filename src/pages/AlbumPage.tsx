import { useMemo, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '../app/backHistory';
import { usePageTitle } from '../app/pageTitle';
import { usePageSurface } from '../app/surface';
import { useIsMobile } from '../app/useIsMobile';
import { useAlbum, useSavedState, useToggleSaved } from '../catalogue/queries';
import { ArtistLinks } from '../components/ArtistLinks';
import { CoverImage } from '../components/CoverImage';
import { DiscographyNav } from '../components/DiscographyNav';
import { NotePreview } from '../components/NotePreview';
import { PlayingMark } from '../components/PlayingMark';
import { StateView } from '../components/StateView';
import type { AlbumDetail, AlbumTrack } from '../domain/types';
import { getAlbumNote, getSongNote } from '../editorial/lookup';
import {
  albumTypeLabel,
  formatDuration,
  formatReleaseDate,
  formatRuntime,
  formatTrackNumber,
  joinArtistNames,
  pluralise,
  releaseYear,
} from '../lib/format';
import { pickImageUrl } from '../lib/images';
import { isSpotifyId } from '../lib/spotifyUri';
import { mapPaletteToTokens } from '../palette/mapPaletteToTokens';
import { useAlbumPalette } from '../palette/usePalette';
import { usePlay } from '../playback/hooks';
import { useCurrentTrackMatcher } from '../playback/useCurrentTrack';
import { describeSpotifyError, isSpotifyApiError } from '../spotify/errors';
import { detectLineLanguage } from '../translation/languageDetect';

function SaveAlbumButton({ uri }: { uri: string }) {
  const saved = useSavedState(uri);
  const toggle = useToggleSaved();
  const isSaved = saved.data === true;
  return (
    <button
      type="button"
      className="plain-action"
      aria-pressed={isSaved}
      disabled={saved.isPending || saved.isError || toggle.isPending}
      onClick={() => toggle.mutate({ uri, saved: !isSaved })}
    >
      {isSaved ? 'Saved to library' : 'Save album'}
    </button>
  );
}

function guestsOf(track: AlbumTrack, album: AlbumDetail) {
  const albumIds = new Set(album.artists.map((a) => a.id));
  return track.artists.filter((a) => !albumIds.has(a.id));
}

function TrackSequence({ album }: { album: AlbumDetail }) {
  const play = usePlay();
  const isCurrent = useCurrentTrackMatcher();
  const artistNames = album.artists.map((a) => a.name);

  const discs = new Map<number, AlbumTrack[]>();
  for (const track of album.tracks) discs.set(track.discNumber, [...(discs.get(track.discNumber) ?? []), track]);

  const row = (track: AlbumTrack) => {
    const current = isCurrent({ id: track.id, uri: track.uri, name: track.name, albumId: album.id });
    const guests = guestsOf(track, album);
    const noted = getSongNote({ id: track.id, title: track.name, artistNames: [...artistNames, ...track.artists.map((a) => a.name)] });
    return (
      <li key={track.id}>
        <button
          type="button"
          className={current ? 'track-item active' : 'track-item'}
          aria-current={current ? 'true' : undefined}
          disabled={!track.isPlayable}
          title={track.isPlayable ? undefined : 'Not available in your market'}
          onClick={() => play({ contextUri: album.uri, offsetUri: track.uri }, { openNowPlaying: true })}
        >
          <span className="num" aria-hidden="true">
            {current ? <PlayingMark playing={current.playing} /> : formatTrackNumber(track.trackNumber)}
          </span>
          <span className="track-text">
            <b lang={detectLineLanguage(track.name)}>{track.name}</b>
            {guests.length > 0 && <span className="track-guests">with {joinArtistNames(guests)}</span>}
          </span>
          <span className="track-aside">
            {noted && (
              <span className="track-note" title="Song note">
                Note
              </span>
            )}
            {track.explicit && (
              <span className="explicit" role="img" aria-label="Explicit" title="Explicit">
                E
              </span>
            )}
            <span>{formatDuration(track.durationMs)}</span>
          </span>
        </button>
      </li>
    );
  };

  if (discs.size <= 1) return <ol className="track-table">{album.tracks.map(row)}</ol>;
  return (
    <div className="track-table">
      {[...discs].map(([disc, tracks]) => (
        <section key={disc} aria-label={`Disc ${disc}`}>
          <h3 className="disc-label">Disc {disc}</h3>
          <ol>{tracks.map(row)}</ol>
        </section>
      ))}
    </div>
  );
}

/**
 * The v7 Album composition: the object column (cover, title, artist, release
 * metadata, Editorial Note) left; the complete Track Sequence right.
 */
export function AlbumPage() {
  const { albumId } = useParams();
  const album = useAlbum(albumId);
  const play = usePlay();
  const data = album.data;
  const palette = useAlbumPalette(albumId, data ? pickImageUrl(data.images, 64) : null);
  const accent = useMemo(() => mapPaletteToTokens(palette), [palette]);
  const mobile = useIsMobile();
  usePageTitle('Album', data?.name ?? null);
  // Desktop (v7.5): the page takes its own cover's colour. The phone keeps paper with the cover's accent.
  usePageSurface(isSpotifyId(albumId) ? { key: albumId, imageUrl: data ? pickImageUrl(data.images, 64) : null } : null);

  if (!isSpotifyId(albumId)) {
    return (
      <StateView label="Album" title="Album unavailable" actions={<Link className="plain-action" to="/library">Library</Link>}>
        <p>This isn’t a valid album address. Albums open from their Spotify ID.</p>
      </StateView>
    );
  }

  if (album.isPending) {
    return (
      <StateView label="Album" title="Loading album…">
        <p>Reading the complete track sequence.</p>
      </StateView>
    );
  }

  if (album.isError) {
    const { title, body } = describeSpotifyError(album.error);
    const notFound = isSpotifyApiError(album.error) && album.error.kind === 'not-found';
    return (
      <StateView
        label="Album"
        title={title}
        tone={notFound ? 'neutral' : 'alert'}
        actions={
          <>
            {!notFound && (
              <button type="button" className="plain-action" onClick={() => void album.refetch()}>
                Try again
              </button>
            )}
            <Link className="plain-action" to="/library">
              Library
            </Link>
          </>
        }
      >
        <p>{body}</p>
      </StateView>
    );
  }

  const loaded = album.data;
  const artistNames = loaded.artists.map((a) => a.name);
  const year = releaseYear(loaded.releaseDate);
  const trackCount = loaded.tracks.length || loaded.totalTracks;
  const note = getAlbumNote({ id: loaded.id, name: loaded.name, artistNames, releaseDate: loaded.releaseDate });
  const fineprint = [loaded.label, ...loaded.copyrights].filter(Boolean);
  const titleLang = detectLineLanguage(loaded.name);

  return (
    <div className="view active">
      <div className="album-page">
        <div className="album-shell" style={mobile ? (accent as CSSProperties) : undefined}>
          <section className="album-object" aria-label="Album details">
            {!mobile && <BackLink />}
            <div className="album-hero-cover">
              <CoverImage
                images={loaded.images}
                size={520}
                alt={`${loaded.name} album cover`}
                title={loaded.name}
                subtitle={joinArtistNames(loaded.artists)}
                paletteKey={loaded.id}
                shadow
                priority
              />
            </div>
            <div className="album-object-copy">
              <div className="label">{albumTypeLabel(loaded.albumType)}</div>
              <h1 lang={titleLang}>{loaded.name}</h1>
              <div className="artist">
                <ArtistLinks artists={loaded.artists} />
              </div>
              <div className="album-hero-meta">
                <div>
                  <b>Release</b>
                  <span>{formatReleaseDate(loaded.releaseDate, loaded.releaseDatePrecision) ?? '—'}</span>
                </div>
                <div>
                  <b>Format</b>
                  <span>{albumTypeLabel(loaded.albumType)}</span>
                </div>
                <div>
                  <b>Tracks</b>
                  <span>{trackCount ?? '—'}</span>
                </div>
                <div>
                  <b>Duration</b>
                  <span>{loaded.tracks.length > 0 ? formatRuntime(loaded.totalDurationMs) : '—'}</span>
                </div>
              </div>
              <NotePreview
                kind="ALBUM"
                note={note}
                title={loaded.name}
                titleLang={titleLang}
                subtitle={[joinArtistNames(loaded.artists), year, trackCount ? pluralise(trackCount, 'track') : null].filter(Boolean).join(' · ')}
              />
              <div className="object-actions">
                <button
                  type="button"
                  className="plain-action primary"
                  disabled={loaded.tracks.length === 0 && loaded.tracksComplete}
                  onClick={() => play({ contextUri: loaded.uri }, { openNowPlaying: true })}
                >
                  Play album
                </button>
                <SaveAlbumButton uri={loaded.uri} />
              </div>
              {fineprint.length > 0 && <p className="fineprint">{fineprint.join(' · ')}</p>}
            </div>
          </section>

          <section className="album-sequence" aria-labelledby="sequence-title">
            <div className="sequence-head">
              <h2 id="sequence-title">Track Sequence</h2>
              <span>{loaded.tracks.length > 0 ? `${pluralise(loaded.tracks.length, 'track')} · ${formatRuntime(loaded.totalDurationMs)}` : ''}</span>
            </div>
            {loaded.tracks.length > 0 ? (
              <TrackSequence album={loaded} />
            ) : (
              <div className="empty-row">
                {loaded.tracksComplete
                  ? 'Spotify lists no tracks for this release.'
                  : 'The preview archive has this release’s details but not its track sequence. Connect Spotify to load the complete album.'}
              </div>
            )}
            <DiscographyNav album={loaded} />
          </section>
        </div>
      </div>
    </div>
  );
}
