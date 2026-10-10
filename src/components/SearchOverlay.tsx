import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALL_SEARCH_TYPES,
  searchPageFor,
  useCatalogueSearch,
  useCatalogueSearchPages,
} from '../catalogue/queries';
import type { Page, SearchResults, SearchType } from '../domain/types';
import { getAlbumNote, getArtistNote, getSongNote } from '../editorial/lookup';
import { joinArtistNames, releaseYear } from '../lib/format';
import { usePlay } from '../playback/hooks';
import { describeSpotifyError } from '../spotify/errors';
import { detectLineLanguage } from '../translation/languageDetect';

export type Filter = 'all' | SearchType;

export const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'track', label: 'Tracks' },
  { id: 'artist', label: 'Artists' },
  { id: 'album', label: 'Albums' },
  { id: 'playlist', label: 'Playlists' },
];

export const DEBOUNCE_MS = 280;
export const PER_TYPE_IN_ALL = 4;
const RESULT = '[data-result]';
const FOCUSABLE = 'button:not([disabled]), input';

export function combine<T>(parts: Array<Page<T> | null>): Page<T> | null {
  const present = parts.filter((part): part is Page<T> => part !== null);
  const last = present[present.length - 1];
  if (!last) return null;
  const items = present.flatMap((part) => part.items);
  return { items, offset: 0, limit: items.length, total: last.total, hasMore: last.hasMore };
}

/** Flattens the pages of a single-type infinite search into one result set. */
export function mergePages(pages: SearchResults[] | undefined, type: SearchType): SearchResults {
  const all = pages ?? [];
  return {
    tracks: type === 'track' ? combine(all.map((p) => p.tracks)) : null,
    artists: type === 'artist' ? combine(all.map((p) => p.artists)) : null,
    albums: type === 'album' ? combine(all.map((p) => p.albums)) : null,
    playlists: type === 'playlist' ? combine(all.map((p) => p.playlists)) : null,
  };
}

export function countResults(results: SearchResults | undefined): number {
  if (!results) return 0;
  return (
    (results.tracks?.items.length ?? 0) +
    (results.artists?.items.length ?? 0) +
    (results.albums?.items.length ?? 0) +
    (results.playlists?.items.length ?? 0)
  );
}

function Result({ title, detail, noted, onSelect }: { title: string; detail: string; noted?: boolean; onSelect: () => void }) {
  return (
    <button type="button" data-result onClick={onSelect}>
      <b lang={detectLineLanguage(title)}>{title}</b>
      <span>
        {noted && <em className="track-note">Note</em>}
        {detail}
      </span>
    </button>
  );
}

/**
 * The compact v7 search overlay, extended with the catalogue player's search:
 * tracks, artists, albums and playlists, type filters with paging, keyboard
 * movement through results, and superseded requests aborted.
 */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const play = usePlay();
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  const combined = useCatalogueSearch(open ? query : '', ALL_SEARCH_TYPES, 0, 10);
  const paged = useCatalogueSearchPages(open && filter !== 'all' ? query : '', filter === 'all' ? 'track' : filter);
  const active = filter === 'all' ? combined : paged;
  const results = filter === 'all' ? combined.data : mergePages(paged.data?.pages, filter);
  const total = countResults(results);

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  const cap = <T,>(items: T[]) => (filter === 'all' ? items.slice(0, PER_TYPE_IN_ALL) : items);

  const focusResult = (direction: 1 | -1 | 'first') => {
    const items = Array.from(resultsRef.current?.querySelectorAll<HTMLElement>(RESULT) ?? []);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const target = direction === 'first' ? 0 : direction === 1 ? Math.min(items.length - 1, index + 1) : index - 1;
    if (target < 0) inputRef.current?.focus();
    else items[target]?.focus();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
      else onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const inResults = resultsRef.current?.contains(document.activeElement);
      if (event.key === 'ArrowDown' && document.activeElement === inputRef.current) focusResult('first');
      else if (inResults) focusResult(event.key === 'ArrowDown' ? 1 : -1);
      else return;
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const sections: ReactNode[] = [];
  if (results?.tracks?.items.length) {
    sections.push(
      <div key="tracks" className="search-group" role="group" aria-label="Tracks">
        {filter === 'all' && <div className="label">Tracks</div>}
        {cap(results.tracks.items).map((track, index) => (
          <Result
            key={`t-${track.uri}-${index}`}
            title={track.title}
            detail={`Track · ${joinArtistNames(track.artists)}`}
            noted={getSongNote({ id: track.spotifyTrackId, title: track.title, artistNames: track.artists.map((a) => a.name) }) !== null}
            onSelect={() => {
              onClose();
              play(track.album.uri ? { contextUri: track.album.uri, offsetUri: track.uri } : { uris: [track.uri] }, { openNowPlaying: true });
            }}
          />
        ))}
      </div>,
    );
  }
  if (results?.artists?.items.length) {
    sections.push(
      <div key="artists" className="search-group" role="group" aria-label="Artists">
        {filter === 'all' && <div className="label">Artists</div>}
        {cap(results.artists.items).map((artist) => (
          <Result
            key={`r-${artist.id}`}
            title={artist.name}
            detail="Artist"
            noted={getArtistNote({ id: artist.id, name: artist.name }) !== null}
            onSelect={() => go(`/artist/${artist.id}`)}
          />
        ))}
      </div>,
    );
  }
  if (results?.albums?.items.length) {
    sections.push(
      <div key="albums" className="search-group" role="group" aria-label="Albums">
        {filter === 'all' && <div className="label">Albums</div>}
        {cap(results.albums.items).map((album) => (
          <Result
            key={`a-${album.id}`}
            title={album.name}
            detail={[album.albumType === 'album' ? 'Album' : album.albumType === 'single' ? 'Single' : 'Compilation', joinArtistNames(album.artists), releaseYear(album.releaseDate)].filter(Boolean).join(' · ')}
            noted={getAlbumNote({ id: album.id, name: album.name, artistNames: album.artists.map((a) => a.name), releaseDate: album.releaseDate }) !== null}
            onSelect={() => go(`/album/${album.id}`)}
          />
        ))}
      </div>,
    );
  }
  if (results?.playlists?.items.length) {
    sections.push(
      <div key="playlists" className="search-group" role="group" aria-label="Playlists">
        {filter === 'all' && <div className="label">Playlists</div>}
        {cap(results.playlists.items).map((playlist) => (
          <Result
            key={`p-${playlist.id}`}
            title={playlist.name}
            detail={['Playlist', playlist.ownerName].filter(Boolean).join(' · ')}
            onSelect={() => {
              onClose();
              play({ contextUri: playlist.uri }, { openNowPlaying: true });
            }}
          />
        ))}
      </div>,
    );
  }

  const typeLabel = FILTERS.find((f) => f.id === filter)?.label.toLowerCase() ?? 'results';
  const available = filter === 'all' || !results ? null : searchPageFor(results, filter)?.total ?? null;
  let status = 'Search Spotify for tracks, artists, albums and playlists.';
  if (query && active.isFetching && !results) status = 'Searching Spotify…';
  else if (query && active.isError && !results) status = describeSpotifyError(active.error).body;
  else if (query && results && total === 0) status = `No results for “${query}”.`;
  else if (query && results) {
    status =
      filter === 'all'
        ? `Top results for “${query}”`
        : `${total}${available !== null && available > total ? ` of ${available}` : ''} ${typeLabel} for “${query}”`;
  }

  return (
    <div
      className="search-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section ref={dialogRef} className="search-dialog" role="dialog" aria-modal="true" aria-label="Search Spotify" onKeyDown={onDialogKeyDown}>
        <header>
          <span>Spotify search</span>
          <button type="button" onClick={onClose} aria-label="Close search">
            ×
          </button>
        </header>
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Track, artist, album or playlist"
          aria-label="Search Spotify"
          aria-describedby="search-status"
          autoComplete="off"
          spellCheck={false}
          aria-keyshortcuts="/"
        />
        <div className="search-filters" role="group" aria-label="Result type">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <p id="search-status" className="search-status" role="status" aria-live="polite">
          {status}
        </p>
        <div ref={resultsRef} className="search-results">
          {sections}
          {filter !== 'all' && paged.hasNextPage && (
            <div className="more-row">
              <button type="button" className="plain-action" onClick={() => void paged.fetchNextPage()} disabled={paged.isFetchingNextPage}>
                {paged.isFetchingNextPage ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </div>
        {!query && (
          <p className="search-keys">
            <kbd>/</kbd> search · <kbd>↓</kbd> <kbd>↑</kbd> move · <kbd>Enter</kbd> open or play · <kbd>Esc</kbd> back
          </p>
        )}
      </section>
    </div>
  );
}
