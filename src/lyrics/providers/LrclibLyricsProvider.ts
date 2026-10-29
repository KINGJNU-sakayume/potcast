import type { TrackIdentity } from '../../domain/types';
import {
  MIN_ORIGINAL_SCRIPT_SHARE,
  detectLyricsLanguage,
  expectedLyricsLanguage,
  lyricsMatchLanguage,
  mayBeRomanised,
  originalScriptShare,
} from '../../translation/languageDetect';
import { parseLrc } from '../lrc';
import { LyricsProviderError, type LyricsProvider, type LyricsRequestOptions, type TimedLyrics } from '../types';

/**
 * LRCLIB (https://lrclib.net) — a free, keyless, CORS-enabled synced lyrics
 * database. Contract taken from its open-source server:
 *   GET /api/get?track_name&artist_name&album_name&duration   → record | 404 TrackNotFound
 *   GET /api/get/{id}                                          → record | 404
 *   GET /api/search?track_name&artist_name | ?q                → record[]
 *   record: { id, trackName, artistName, albumName, duration (s), instrumental,
 *             plainLyrics, syncedLyrics (LRC) }
 * Sends only track metadata (title, artist, album, duration) to lrclib.net.
 */

export const LRCLIB_BASE_URL = 'https://lrclib.net/api';
const CLIENT_ID = 'ARC Music (https://github.com/KINGJNU-sakayume/player2)';
const DURATION_TOLERANCE_S = 3;

export interface LrclibRecord {
  id: number;
  trackName?: string | null;
  artistName?: string | null;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Removes version suffixes Spotify appends ("- Remastered 2011", "(feat. X)") that LRCLIB rarely stores. */
export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*[([](?:feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:.*remaster.*|.*version|.*edit|live.*|mono|stereo|bonus track)$/i, '')
    .trim();
}

export function recordToTimedLyrics(record: LrclibRecord, source = 'LRCLIB'): TimedLyrics | null {
  const timing = {
    lrclibId: Number.isInteger(record.id) ? record.id : null,
    durationMs: typeof record.duration === 'number' && record.duration > 0 ? Math.round(record.duration * 1000) : null,
  };
  if (record.instrumental) return { lines: [], instrumental: true, source, timing };
  if (!record.syncedLyrics) return null;
  const lines = parseLrc(record.syncedLyrics);
  if (lines.length === 0) return null;
  return { lines, language: detectLyricsLanguage(lines.map((line) => line.text)), source, timing };
}

/** A record whose lyrics are not in the track's expected language (romanised / English-only upload) is not the song's lyrics. */
function inExpectedLanguage(lyrics: TimedLyrics | null, expected: string | undefined): lyrics is TimedLyrics {
  return lyrics !== null && (lyrics.instrumental === true || lyricsMatchLanguage(lyrics.lines.map((line) => line.text), expected));
}

/** Latin-only lyrics that may be a romanised upload: worth looking for an original-script upload of the same song. */
function mayBeRomanisedUpload(lyrics: TimedLyrics): boolean {
  return lyrics.instrumental !== true && mayBeRomanised(lyrics.lines.map((line) => line.text));
}

/**
 * The upload to show among same-length candidates. Those not in the expected language are dropped. The rest are ranked by
 * how much of them is in Korean / Japanese script (an upload that is mostly original script beats a romanised or
 * bilingual one); without a language hint only uploads above MIN_ORIGINAL_SCRIPT_SHARE count, so English songs
 * keep LRCLIB's order. Equal ranks keep that order.
 */
function pickLyrics(candidates: TimedLyrics[], expected: string | undefined): TimedLyrics | null {
  const ranked = candidates
    .filter((lyrics) => inExpectedLanguage(lyrics, expected))
    .map((lyrics, index) => {
      const share = originalScriptShare(lyrics.lines.map((line) => line.text), expected);
      return { lyrics, index, score: expected !== undefined || share >= MIN_ORIGINAL_SCRIPT_SHARE ? share : 0 };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0]?.lyrics ?? null;
}

export class LrclibLyricsProvider implements LyricsProvider {
  readonly id = 'lrclib';
  readonly label = 'LRCLIB';

  constructor(
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly baseUrl: string = LRCLIB_BASE_URL,
  ) {}

  async getTimedLyrics(track: TrackIdentity, options: LyricsRequestOptions = {}): Promise<TimedLyrics | null> {
    if (options.lrclibId) {
      const pinned = await this.byId(options.lrclibId, track, options);
      if (pinned) return pinned;
    }
    const artist = track.artists[0]?.name;
    if (!artist || !track.title) return null;
    const durationS = Math.round(track.durationMs / 1000);
    const expected = expectedLyricsLanguage(track);

    const exact = await this.get({ track_name: track.title, artist_name: artist, album_name: track.album.name, durationS }, options);
    // With a known language an exact hit in it is final. Without a hint, an exact hit that may be a romanised upload
    // of a Korean / Japanese song (Latin-only metadata says nothing) is kept only as the fallback below.
    if (inExpectedLanguage(exact, expected) && (expected !== undefined || !mayBeRomanisedUpload(exact))) return exact;

    const cleaned = cleanTrackTitle(track.title);
    let fallback: TimedLyrics | null = expected === undefined ? exact : null;
    for (const params of [{ track_name: cleaned, artist_name: artist }, { q: `${cleaned} ${artist}` }]) {
      const found = pickLyrics(this.usableCandidates(await this.search(params, options), durationS), expected);
      if (!found) continue;
      if (expected !== undefined || !mayBeRomanisedUpload(found)) return found;
      fallback ??= found;
    }
    return fallback;
  }

  /** Candidates with synced lyrics (or instrumental) whose length matches the track, synced ones first. */
  private usableCandidates(records: LrclibRecord[], durationS: number): TimedLyrics[] {
    return records
      .filter((record) => record.syncedLyrics || record.instrumental)
      .filter((record) => typeof record.duration !== 'number' || Math.abs(record.duration - durationS) <= DURATION_TOLERANCE_S)
      .sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)))
      .map((record) => recordToTimedLyrics(record, this.label))
      .filter((lyrics): lyrics is TimedLyrics => lyrics !== null);
  }

  /**
   * The record a curated translation was timed on. Used only when it has synced
   * lyrics and the playing track is the same length (±3 s): another edit of the
   * song falls back to the usual search.
   */
  private async byId(id: number, track: TrackIdentity, options: LyricsRequestOptions): Promise<TimedLyrics | null> {
    const response = await this.request(`/get/${id}`, options);
    if (response.status === 404) return null;
    const record = (await response.json()) as LrclibRecord;
    const durationS = track.durationMs / 1000;
    if (!record.syncedLyrics || typeof record.duration !== 'number' || Math.abs(record.duration - durationS) > DURATION_TOLERANCE_S) return null;
    return recordToTimedLyrics(record, this.label);
  }

  private async get(
    params: { track_name: string; artist_name: string; album_name: string; durationS: number },
    options: LyricsRequestOptions,
  ): Promise<TimedLyrics | null> {
    const query = new URLSearchParams({ track_name: params.track_name, artist_name: params.artist_name });
    if (params.album_name) query.set('album_name', params.album_name);
    if (params.durationS >= 1 && params.durationS <= 3600) query.set('duration', String(params.durationS));
    const response = await this.request(`/get?${query.toString()}`, options);
    if (response.status === 404) return null;
    const record = (await response.json()) as LrclibRecord;
    return recordToTimedLyrics(record, this.label);
  }

  private async search(
    params: { track_name: string; artist_name: string } | { q: string },
    options: LyricsRequestOptions,
  ): Promise<LrclibRecord[]> {
    const query = new URLSearchParams(params);
    const response = await this.request(`/search?${query.toString()}`, options);
    if (response.status === 404) return [];
    const records = (await response.json()) as unknown;
    return Array.isArray(records) ? (records as LrclibRecord[]) : [];
  }

  private async request(path: string, options: LyricsRequestOptions): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { 'Lrclib-Client': CLIENT_ID },
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new LyricsProviderError('LRCLIB is unreachable.', true);
    }
    if (response.ok || response.status === 404) return response;
    if (response.status === 400) {
      // Validation error for this track's metadata: treat as "no lyrics".
      return new Response(null, { status: 404 });
    }
    throw new LyricsProviderError(`LRCLIB responded ${response.status}.`, response.status >= 500 || response.status === 429);
  }
}
