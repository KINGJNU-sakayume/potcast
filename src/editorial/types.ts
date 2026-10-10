import type { SongTranslation } from '../translation/curated/types';

/**
 * ARC's hand-written notes. They are local, source-controlled data and stay
 * separate from Spotify models: pages look a note up and render it only when
 * one exists — no note is ever generated for an arbitrary Spotify entity.
 * Each note is one Markdown file in `src/editorial/notes/` (see loadNotes.ts).
 *
 * - Artist → Editorial Note
 * - Album  → Editorial Note
 * - Song   → Listening Note (+ curated translation, one note per song)
 */

export interface EditorialBody {
  /** Preview shown on the page: about 2–3 lines (a song cue is usually shorter). */
  short: string;
  /**
   * Long form for the note drawer, in the small Markdown subset NoteBody
   * renders: paragraphs, `##` / `###` headings, lists, quotes, emphasis, links.
   */
  full?: string;
  /** ISO dates (YYYY-MM-DD) the note was written and last revised. */
  written?: string;
  updated?: string;
  /** References the note relies on: interviews, liner notes, credits (URLs or citations). */
  sources?: string[];
}

export interface ArtistNote extends EditorialBody {
  key: string;
  /** Spotify artist IDs (open.spotify.com/artist/<ID>): the primary match. */
  artistIds: string[];
  /**
   * Every name Spotify may show for the artist. Spotify localises names by
   * account and market (e.g. "Kenshi Yonezu" / "米津玄師"), so the fallback
   * match accepts any of them.
   */
  names: string[];
  /** Origin / role line under the artist name, e.g. "Tokyo, Japan · singer / songwriter". */
  origin?: string;
  /** Periods of the career, oldest first; the Artist page marks them in the discography timeline. */
  eras?: ArtistEra[];
  /** Artist image URL (https), shown on the Archive; without it the Archive asks Spotify when connected. */
  image?: string;
  /**
   * The artist's own album sequence for the Album page's previous / next, in
   * order: release titles (every edition matches) or Spotify album IDs.
   * Releases left out (live albums, compilations filed as albums) are skipped.
   */
  discography?: string[];
}

/** A period of an artist's career, written in the note as `- 2012–2015 · 직접 노래하기 시작`. */
export interface ArtistEra {
  from: number;
  /** Last year of the era; null while it is ongoing (`2020– · …`). A single year has `to === from`. */
  to: number | null;
  title: string;
}

export interface AlbumNote extends EditorialBody {
  key: string;
  /** Key of the artist's entry in artists.ts; its names drive the fallback match. */
  artist: string;
  /** Spotify album IDs. One release often has several (editions, markets). */
  albumIds: string[];
  /** Titles as Spotify may show them, including localised or romanised forms. */
  titles: string[];
  releaseYear?: number;
  /** Cover image URL (https), shown on the Archive; without it the Archive asks Spotify when connected. */
  cover?: string;
  /**
   * Song note keys of the standard edition's tracklist, in order. An album
   * note is complete only when every track has its own song note (quality.ts).
   */
  tracks?: string[];
}

/**
 * The one note per song: the listening note (`short` cue and body) and, when
 * the song has one, its curated translation (brief, `## 번역에 대하여`, and the
 * paired `<key>.translation.json`). The loader accepts a note with either part
 * missing so the app never breaks; the quality floor (quality.ts) requires the
 * listening note, and a translation unless `lyricsLanguage` says none is needed.
 */
export interface SongNote extends Omit<EditorialBody, 'short'> {
  key: string;
  artist: string;
  /** Spotify track IDs: the album cut, the single, and other editions. */
  trackIds: string[];
  titles: string[];
  /** The listening cue on Now Playing; a translation-only note has none. */
  short?: string;
  /** Set on a song with no translation: its lyrics are Korean, or it has none. */
  lyricsLanguage?: SongLyricsLanguage;
  translation?: SongTranslation;
}

/** Why a song note has no curated translation: Korean lyrics, or an instrumental. */
export type SongLyricsLanguage = 'ko' | 'instrumental';

export const SONG_LYRICS_LANGUAGES: readonly SongLyricsLanguage[] = ['ko', 'instrumental'];

export type NoteKind = 'ARTIST' | 'ALBUM' | 'SONG';
