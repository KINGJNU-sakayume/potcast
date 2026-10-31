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
/**
 * When busy, LRCLIB turns requests away with 503 and `retry-after: 1`, often for one request and not the next. Such a
 * request is tried again here within a second or two, instead of failing the whole lookup into the slow retries of
 * useTimedLyrics (2 s and up, each starting over from the first request).
 */
const BUSY_RETRIES = 3;
const BUSY_WAIT_MS = 800;
const MAX_BUSY_WAIT_MS = 2000;

/** Resolves after `ms`; rejects with the signal's AbortError as soon as it aborts. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('The lyrics lookup was cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const isOutage = (error: unknown): error is LyricsProviderError => error instanceof LyricsProviderError && error.retryable;

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

/** Share of the track the timed lines must reach for an upload to count as the whole song, not a stub of a few lines. */
const MIN_COVERAGE = 0.4;

/** Whether the last line starts far enough into the track for these lyrics to be the whole song. */
function coversTrack(lyrics: TimedLyrics, trackDurationMs: number): boolean {
  if (lyrics.instrumental === true || trackDurationMs <= 0) return true;
  const lastStartMs = lyrics.lines.reduce((latest, line) => Math.max(latest, line.startMs), 0);
  return lastStartMs >= trackDurationMs * MIN_COVERAGE;
}

/**
 * The upload to show among same-length candidates. Those not in the expected language are dropped. The rest are ranked
 * by whether they cover the track (a three-line stub of the hook loses to the whole song), then by how much of them is
 * in Korean / Japanese script (an upload that is mostly original script beats a romanised or bilingual one; without a
 * language hint only uploads above MIN_ORIGINAL_SCRIPT_SHARE count, so English songs keep LRCLIB's order), then by not
 * looking romanised. Equal ranks keep LRCLIB's order.
 */
function pickLyrics(candidates: TimedLyrics[], expected: string | undefined, trackDurationMs: number): TimedLyrics | null {
  const ranked = candidates
    .filter((lyrics) => inExpectedLanguage(lyrics, expected))
    .map((lyrics, index) => {
      const share = originalScriptShare(lyrics.lines.map((line) => line.text), expected);
      return {
        lyrics,
        index,
        whole: coversTrack(lyrics, trackDurationMs),
        score: expected !== undefined || share >= MIN_ORIGINAL_SCRIPT_SHARE ? share : 0,
        romanised: mayBeRomanisedUpload(lyrics),
      };
    })
    .sort((a, b) => Number(b.whole) - Number(a.whole) || b.score - a.score || Number(a.romanised) - Number(b.romanised) || a.index - b.index);
  return ranked[0]?.lyrics ?? null;
}

export class LrclibLyricsProvider implements LyricsProvider {
  readonly id = 'lrclib';
  readonly label = 'LRCLIB';

  constructor(
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly baseUrl: string = LRCLIB_BASE_URL,
    private readonly busyWaitMs: number = BUSY_WAIT_MS,
  ) {}

  async getTimedLyrics(track: TrackIdentity, options: LyricsRequestOptions = {}): Promise<TimedLyrics | null> {
    if (options.lrclibId) {
      const pinned = await this.pinned(options.lrclibId, track, options);
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
    let outage: LyricsProviderError | null = null;
    for (const params of [{ track_name: cleaned, artist_name: artist }, { q: `${cleaned} ${artist}` }]) {
      let records: LrclibRecord[];
      try {
        records = await this.search(params, options);
      } catch (error) {
        // One search turned away by an outage does not stop the other from being tried.
        if (!isOutage(error)) {
          if (fallback && !(error instanceof DOMException)) return fallback;
          throw error;
        }
        outage = error;
        continue;
      }
      const found = pickLyrics(this.usableCandidates(records, durationS), expected, track.durationMs);
      if (!found) continue;
      if (expected !== undefined || !mayBeRomanisedUpload(found)) return found;
      fallback ??= found;
    }
    // The lookup that already found lyrics is not lost because a later, optional search hit an outage;
    // with nothing found, the outage is reported so the lookup is retried rather than cached as "no lyrics".
    if (!fallback && outage) throw outage;
    return fallback;
  }

  /**
   * The pinned record, or null when it is missing or does not fit the track (the usual search follows). `/get/{id}` is
   * what a busy LRCLIB turns away first, so the same record is looked for among the other lookups at the same time and
   * whichever finds it first wins. Throws the outage only when neither found it and `/get/{id}` could not answer.
   */
  private pinned(id: number, track: TrackIdentity, options: LyricsRequestOptions): Promise<TimedLyrics | null> {
    return new Promise((resolve, reject) => {
      let pending = 2;
      let direct: { error: unknown } | null = null;
      const settle = (found: TimedLyrics | null) => {
        if (found) resolve(found);
        else if ((pending -= 1) === 0) {
          if (direct) reject(direct.error);
          else resolve(null);
        }
      };
      this.byId(id, track, options).then(settle, (error: unknown) => {
        direct = { error };
        settle(null);
      });
      this.pinnedElsewhere(id, track, options).then(settle, () => settle(null));
    });
  }

  /** The pinned record, looked for among the signature match and the name search. */
  private async pinnedElsewhere(id: number, track: TrackIdentity, options: LyricsRequestOptions): Promise<TimedLyrics | null> {
    const artist = track.artists[0]?.name;
    if (!artist || !track.title) return null;
    const durationS = Math.round(track.durationMs / 1000);
    const exact = await this.get({ track_name: track.title, artist_name: artist, album_name: track.album.name, durationS }, options).catch(() => null);
    if (exact?.timing?.lrclibId === id) return exact;
    const record = (await this.search({ track_name: cleanTrackTitle(track.title), artist_name: artist }, options)).find((candidate) => candidate.id === id);
    return record ? this.pinnedRecord(record, track) : null;
  }

  /** The pinned record's lyrics, when it has synced lyrics and the playing track is the same length. */
  private pinnedRecord(record: LrclibRecord, track: TrackIdentity): TimedLyrics | null {
    const durationS = track.durationMs / 1000;
    if (!record.syncedLyrics || typeof record.duration !== 'number' || Math.abs(record.duration - durationS) > DURATION_TOLERANCE_S) return null;
    return recordToTimedLyrics(record, this.label);
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
    return this.pinnedRecord((await response.json()) as LrclibRecord, track);
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
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestOnce(path, options);
      } catch (error) {
        if (!isOutage(error) || attempt >= BUSY_RETRIES) throw error;
        const asked = error.retryAfterS !== undefined && this.busyWaitMs > 0 ? error.retryAfterS * 1000 : this.busyWaitMs;
        await wait(Math.min(MAX_BUSY_WAIT_MS, asked), options.signal);
      }
    }
  }

  private async requestOnce(path: string, options: LyricsRequestOptions): Promise<Response> {
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
    const retryAfterS = Number(response.headers.get('retry-after'));
    throw new LyricsProviderError(
      `LRCLIB responded ${response.status}.`,
      response.status >= 500 || response.status === 429,
      Number.isFinite(retryAfterS) && retryAfterS > 0 ? retryAfterS : undefined,
    );
  }
}
