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
import { StateView } from '../components/StateView';
import { getAlbumNote } from '../editorial/lookup';
import { AlbumListening } from '../digging/AlbumListening';
import { TrackSequence } from '../digging/TrackSequence';
import { useRememberAlbum } from '../digging/hooks';
import { useDigging } from '../digging/context';
import { catalogueOffline, offlineAlbum } from '../digging/offline';
import { useEpisodeState } from '../episode/EpisodeProvider';
import { getEpisodeScript } from '../episode/episodes';
import {
  albumTypeLabel,
  formatAlbumRelease,
  formatRuntime,
  joinArtistNames,
  pluralise,
  releaseYear,
} from '../lib/format';
import { pickImageUrl } from '../lib/images';
import { isSpotifyId } from '../lib/spotifyUri';
import { mapPaletteToTokens } from '../palette/mapPaletteToTokens';
import { useAlbumPalette } from '../palette/usePalette';
import { usePlay } from '../playback/hooks';
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

/**
 * The v7 Album composition: the object column (cover, title, artist, release
 * metadata, Editorial Note) left; the complete Track Sequence right.
 */
export function AlbumPage() {
  const { albumId } = useParams();
  const album = useAlbum(albumId);
  const play = usePlay();
  const records = useDigging();
  const data = album.data ?? (catalogueOffline(album.error) ? offlineAlbum(albumId, records.data) : undefined);
  const recordingError = useRememberAlbum(album.data);
  const palette = useAlbumPalette(albumId, data ? pickImageUrl(data.images, 64) : null);
  const accent = useMemo(() => mapPaletteToTokens(palette), [palette]);
  const mobile = useIsMobile();
  const runningEpisode = useEpisodeState().episode;
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

  if (album.isPending && !data) {
    return (
      <StateView label="Album" title="Loading album…">
        <p>Reading the complete track sequence.</p>
      </StateView>
    );
  }

  if (album.isError && !data) {
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

  const loaded = data!;
  const artistNames = loaded.artists.map((a) => a.name);
  const year = releaseYear(loaded.releaseDate);
  const trackCount = loaded.tracks.length || loaded.totalTracks;
  const note = getAlbumNote({ id: loaded.id, name: loaded.name, artistNames, releaseDate: loaded.releaseDate });
  const fineprint = [loaded.label, ...loaded.copyrights].filter(Boolean);
  const episode = getEpisodeScript(note?.key);
  const episodeRunning = episode !== null && runningEpisode?.key === episode.key && runningEpisode.release?.id === loaded.id;
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
              <div className="object-actions">
                {episode && (
                  <Link className="plain-action primary" to={`/episode/${loaded.id}`} title={episode.title}>
                    {episodeRunning ? 'Back to the episode' : 'Listen with the hosts'}
                  </Link>
                )}
                <button
                  type="button"
                  className={episode ? 'plain-action' : 'plain-action primary'}
                  disabled={loaded.tracks.length === 0 && loaded.tracksComplete}
                  onClick={() => play({ contextUri: loaded.uri }, { openNowPlaying: true })}
                >
                  Play album
                </button>
                <SaveAlbumButton uri={loaded.uri} />
              </div>
              <div className="album-hero-meta">
                <div>
                  <b>Release</b>
                  <span>{formatAlbumRelease(loaded.releaseDate, loaded.releaseDatePrecision, note) ?? '—'}</span>
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
              <AlbumListening album={loaded} />
              {recordingError && <p className="dig-help" role="alert">{recordingError}</p>}
            </div>
          </section>

          <section className="album-sequence" aria-labelledby="sequence-title">
            {!album.data && <p className="dig-help" role="status">오프라인 저장 목록 · 개인 기록을 편집할 수 있습니다.</p>}
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
            {fineprint.length > 0 && (
              <p className="fineprint">
                <span className="fineprint-label">Label · ©</span> {fineprint.join(' · ')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
