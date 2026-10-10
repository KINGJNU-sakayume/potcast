import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FOCUS_SEARCH_EVENT } from '../../app/MobileShell';
import { usePageTitle } from '../../app/pageTitle';
import { ALL_SEARCH_TYPES, useCatalogueSearch, useCatalogueSearchPages } from '../../catalogue/queries';
import { CoverImage, Portrait } from '../../components/CoverImage';
import { MobileTrackRow, usePlayTrack } from '../../components/mobile/MobileTrackRow';
import { countResults, DEBOUNCE_MS, FILTERS, mergePages, PER_TYPE_IN_ALL, type Filter } from '../../components/SearchOverlay';
import { artistNotes } from '../../editorial/artists';
import { getAlbumNote, getArtistNote } from '../../editorial/lookup';
import { albumTypeLabel, joinArtistNames, releaseYear } from '../../lib/format';
import { usePlay } from '../../playback/hooks';
import { useCurrentTrackMatcher } from '../../playback/useCurrentTrack';
import { describeSpotifyError } from '../../spotify/errors';
import { detectLineLanguage } from '../../translation/languageDetect';
import { MobileChips, MobileQuiet } from './MobileParts';

function ObjectLink({ to, art, title, meta, noted }: { to: string; art: ReactNode; title: string; meta: string; noted?: boolean }) {
  return (
    <li className="m-row">
      <Link className="m-row-hit" to={to}>
        {art}
        <span className="m-row-text">
          <span className="m-row-title" lang={detectLineLanguage(title)}>
            {title}
          </span>
          <span className="m-row-meta">{meta}</span>
        </span>
      </Link>
      <span className="m-row-aside">{noted && <span className="track-note">Note</span>}</span>
    </li>
  );
}

/**
 * The phone's Search tab: the catalogue search of the desktop overlay as a
 * page. The query and type live in the address, so results are still there
 * after visiting an artist or another tab.
 */
export function MobileSearchPage() {
  usePageTitle('Search');
  const [params, setParams] = useSearchParams();
  const query = params.get('q')?.trim() ?? '';
  const filter = (FILTERS.find((f) => f.id === params.get('type'))?.id ?? 'all') as Filter;
  const [draft, setDraft] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const play = usePlay();
  const playTrack = usePlayTrack();
  const isCurrent = useCurrentTrackMatcher();

  const update = (next: { q?: string; type?: Filter }) => {
    const q = next.q ?? query;
    const type = next.type ?? filter;
    const search: Record<string, string> = {};
    if (q) search.q = q;
    if (type !== 'all') search.type = type;
    setParams(search, { replace: true });
  };

  useEffect(() => {
    const value = draft.trim();
    if (value === query) return;
    const timer = setTimeout(() => update({ q: value }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` reads the current params; re-running on it would loop.
  }, [draft]);

  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  const combined = useCatalogueSearch(query, ALL_SEARCH_TYPES, 0, 10);
  const paged = useCatalogueSearchPages(filter !== 'all' ? query : '', filter === 'all' ? 'track' : filter);
  const active = filter === 'all' ? combined : paged;
  const results = filter === 'all' ? combined.data : mergePages(paged.data?.pages, filter);
  const total = countResults(results);
  const cap = <T,>(items: T[]) => (filter === 'all' ? items.slice(0, PER_TYPE_IN_ALL) : items);

  const groupHead = (type: Filter, label: string, count: number) =>
    filter === 'all' && (
      <div className="m-section-head">
        <h2>{label}</h2>
        {count > PER_TYPE_IN_ALL && (
          <button type="button" className="note-more" onClick={() => update({ type })}>
            See all
          </button>
        )}
      </div>
    );

  const sections: ReactNode[] = [];
  if (results?.tracks?.items.length) {
    sections.push(
      <section key="tracks" aria-label="Tracks">
        {groupHead('track', 'Tracks', results.tracks.items.length)}
        <ol className="m-list">
          {cap(results.tracks.items).map((track, index) => (
            <MobileTrackRow
              key={`t-${track.uri}-${index}`}
              track={track}
              current={isCurrent({ id: track.spotifyTrackId, uri: track.uri })}
              onPlay={() => playTrack(track)}
            />
          ))}
        </ol>
      </section>,
    );
  }
  if (results?.artists?.items.length) {
    sections.push(
      <section key="artists" aria-label="Artists">
        {groupHead('artist', 'Artists', results.artists.items.length)}
        <ul className="m-list">
          {cap(results.artists.items).map((artist) => (
            <ObjectLink
              key={`r-${artist.id}`}
              to={`/artist/${artist.id}`}
              art={
                <span className="m-row-cover round">
                  <Portrait images={artist.images} name={artist.name} size={48} />
                </span>
              }
              title={artist.name}
              meta="Artist"
              noted={getArtistNote({ id: artist.id, name: artist.name }) !== null}
            />
          ))}
        </ul>
      </section>,
    );
  }
  if (results?.albums?.items.length) {
    sections.push(
      <section key="albums" aria-label="Albums">
        {groupHead('album', 'Albums', results.albums.items.length)}
        <ul className="m-list">
          {cap(results.albums.items).map((album) => (
            <ObjectLink
              key={`a-${album.id}`}
              to={`/album/${album.id}`}
              art={<CoverImage images={album.images} size={48} alt="" title={album.name} paletteKey={album.id} className="m-row-cover" />}
              title={album.name}
              meta={[albumTypeLabel(album.albumType), joinArtistNames(album.artists), releaseYear(album.releaseDate)].filter(Boolean).join(' · ')}
              noted={getAlbumNote({ id: album.id, name: album.name, artistNames: album.artists.map((a) => a.name), releaseDate: album.releaseDate }) !== null}
            />
          ))}
        </ul>
      </section>,
    );
  }
  if (results?.playlists?.items.length) {
    sections.push(
      <section key="playlists" aria-label="Playlists">
        {groupHead('playlist', 'Playlists', results.playlists.items.length)}
        <ul className="m-list">
          {cap(results.playlists.items).map((playlist) => (
            <li key={`p-${playlist.id}`} className="m-row">
              <button type="button" className="m-row-hit" aria-label={`Play ${playlist.name}`} onClick={() => play({ contextUri: playlist.uri }, { openNowPlaying: true })}>
                <CoverImage images={playlist.images} size={48} alt="" title={playlist.name} className="m-row-cover" />
                <span className="m-row-text">
                  <span className="m-row-title" lang={detectLineLanguage(playlist.name)}>
                    {playlist.name}
                  </span>
                  <span className="m-row-meta">{['Playlist', playlist.ownerName].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>,
    );
  }

  let status: ReactNode = null;
  if (query && active.isFetching && !results) status = <MobileQuiet role="status">Searching Spotify…</MobileQuiet>;
  else if (query && active.isError && !results) status = <MobileQuiet role="alert">{describeSpotifyError(active.error).body}</MobileQuiet>;
  else if (query && results && total === 0) status = <MobileQuiet role="status">No results for “{query}”.</MobileQuiet>;

  const noted = artistNotes.filter((note) => note.artistIds.length > 0);

  return (
    <div className="m-page">
      <header className="m-page-head">
        <div>
          <div className="label">Spotify catalogue</div>
          <h1>Search</h1>
        </div>
      </header>
      <div className="m-search">
        <label className="m-search-field">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="m15 15 5 5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tracks, artists, albums"
            aria-label="Search Spotify"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {draft && (
            <button
              type="button"
              className="m-search-clear"
              aria-label="Clear search"
              onClick={() => {
                setDraft('');
                update({ q: '' });
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </label>
        <MobileChips label="Result type" options={FILTERS} value={filter} onChange={(type) => update({ type })} />
      </div>
      <div className="m-page-body">
        {!query ? (
          <>
            <div className="m-section-head">
              <h2>Artists with notes</h2>
            </div>
            <div className="m-noted-artists">
              {noted.map((note) => (
                <Link key={note.key} to={`/artist/${note.artistIds[0]}`} lang={detectLineLanguage(note.names[0]!)}>
                  {note.names[0]}
                </Link>
              ))}
            </div>
            <MobileQuiet>Search tracks, artists, albums and playlists. Results with a Listening or Editorial note are marked NOTE.</MobileQuiet>
          </>
        ) : (
          <>
            {status}
            {sections}
            {filter !== 'all' && paged.hasNextPage && (
              <div className="m-more">
                <button type="button" className="plain-action" onClick={() => void paged.fetchNextPage()} disabled={paged.isFetchingNextPage}>
                  {paged.isFetchingNextPage ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
