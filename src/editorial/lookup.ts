import { albumNotes } from './albums';
import { artistNotes } from './artists';
import { songNotes } from './songs';
import type { AlbumNote, ArtistNote, EditorialBody, SongNote } from './types';

/**
 * Note lookup. A Spotify ID listed on the entry always wins; otherwise the
 * artist's names plus the normalised title must match. Entities without an
 * entry get no note — never generated filler.
 */

export interface NoteSources {
  artists: readonly ArtistNote[];
  albums: readonly AlbumNote[];
  songs: readonly SongNote[];
}

const DEFAULT_SOURCES: NoteSources = { artists: artistNotes, albums: albumNotes, songs: songNotes };

/** Brackets Spotify and editors use around titles, e.g. "<ASSEMBLE24>" or "『strobo』". */
const TITLE_BRACKETS = /[<>＜＞〈〉《》「」『』【】"'“”‘’]/g;

/**
 * Case-, width- and bracket-insensitive form of a name or title. Edition
 * suffixes that do not change the recording ("(feat. …)", "- Remastered 2011")
 * are dropped so the note follows the song.
 */
export function normaliseTitle(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKC')
    .replace(/\s*[([](?:feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?$/i, '')
    .replace(TITLE_BRACKETS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasContent<T extends EditorialBody>(entry: T | undefined): T | null {
  return entry && entry.short.trim() ? entry : null;
}

/** A song note counts when it has a listening cue, a listening body or a curated translation. */
function songHasContent(entry: SongNote | undefined): SongNote | null {
  return entry && (entry.short?.trim() || entry.full?.trim() || entry.translation) ? entry : null;
}

function yearOf(date: string | null | undefined): number | undefined {
  const match = date ? /^(\d{4})/.exec(date) : null;
  return match ? Number(match[1]) : undefined;
}

function namesOf(artistKey: string, sources: NoteSources): string[] {
  return sources.artists.find((artist) => artist.key === artistKey)?.names.map(normaliseTitle) ?? [];
}

/** True when any of `artistNames` is one of `knownNames`, compared as normalised titles. */
export function namesMatch(knownNames: readonly string[], artistNames: readonly string[]): boolean {
  const known = knownNames.map(normaliseTitle);
  return artistNames.some((name) => known.includes(normaliseTitle(name)));
}

function artistMatches(artistKey: string, artistNames: readonly string[], sources: NoteSources): boolean {
  const known = namesOf(artistKey, sources);
  return artistNames.some((name) => known.includes(normaliseTitle(name)));
}

export interface ArtistQuery {
  id?: string | null;
  name?: string | null;
}

export function getArtistNote(query: ArtistQuery, sources: NoteSources = DEFAULT_SOURCES): ArtistNote | null {
  const byId = query.id ? sources.artists.find((entry) => entry.artistIds.includes(query.id!)) : undefined;
  if (byId) return hasContent(byId);
  const name = normaliseTitle(query.name);
  if (!name) return null;
  return hasContent(sources.artists.find((entry) => entry.names.some((n) => normaliseTitle(n) === name)));
}

export interface AlbumQuery {
  id?: string | null;
  name?: string | null;
  artistNames?: readonly string[];
  releaseDate?: string | null;
}

export function getAlbumNote(query: AlbumQuery, sources: NoteSources = DEFAULT_SOURCES): AlbumNote | null {
  const byId = query.id ? sources.albums.find((entry) => entry.albumIds.includes(query.id!)) : undefined;
  if (byId) return hasContent(byId);
  const title = normaliseTitle(query.name);
  if (!title || !query.artistNames?.length) return null;
  const year = yearOf(query.releaseDate);
  return hasContent(
    sources.albums.find(
      (entry) =>
        entry.titles.some((t) => normaliseTitle(t) === title) &&
        artistMatches(entry.artist, query.artistNames!, sources) &&
        (entry.releaseYear === undefined || year === undefined || entry.releaseYear === year),
    ),
  );
}

export interface SongQuery {
  id?: string | null;
  title?: string | null;
  artistNames?: readonly string[];
}

export interface SongMatch {
  note: SongNote;
  /** 'id': a listed Spotify track ID; 'name': title + artist name fallback (a curated translation then also checks the duration). */
  matchedBy: 'id' | 'name';
}

export function findSongNote(query: SongQuery, sources: NoteSources = DEFAULT_SOURCES): SongMatch | null {
  const byId = query.id ? sources.songs.find((entry) => entry.trackIds.includes(query.id!)) : undefined;
  if (byId) {
    const note = songHasContent(byId);
    return note ? { note, matchedBy: 'id' } : null;
  }
  const title = normaliseTitle(query.title);
  if (!title || !query.artistNames?.length) return null;
  const note = songHasContent(
    sources.songs.find(
      (entry) => entry.titles.some((t) => normaliseTitle(t) === title) && artistMatches(entry.artist, query.artistNames!, sources),
    ),
  );
  return note ? { note, matchedBy: 'name' } : null;
}

export function getSongNote(query: SongQuery, sources: NoteSources = DEFAULT_SOURCES): SongNote | null {
  return findSongNote(query, sources)?.note ?? null;
}
