import { describe, expect, it, vi } from 'vitest';
import type { TrackIdentity } from '../../domain/types';
import { BoundedCache } from '../../lib/boundedCache';
import { withLyricsCache } from '../lyricsCache';
import { LyricsProviderError, type TimedLyrics } from '../types';
import { LrclibLyricsProvider, cleanTrackTitle, recordToTimedLyrics } from './LrclibLyricsProvider';
import { MockLyricsProvider } from './MockLyricsProvider';
import { TEST_LINES_EN, buildTimedLines } from './testLines';

const track: TrackIdentity = {
  spotifyTrackId: 'trk1',
  uri: 'spotify:track:trk1',
  title: 'Song Title - Remastered 2011',
  artists: [{ id: 'a', name: 'Some Artist', uri: 'spotify:artist:a' }],
  album: { id: 'alb', name: 'Some Album', uri: 'spotify:album:alb', images: [] },
  durationMs: 187_400,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('LrclibLyricsProvider', () => {
  it('queries /api/get with the track signature and parses synced lyrics', async () => {
    const fetchMock = vi.fn(async () =>
      json({ id: 1, trackName: 'Song Title', artistName: 'Some Artist', duration: 187, instrumental: false, syncedLyrics: '[00:01.00]hello\n[00:03.00]world' }),
    );
    const provider = new LrclibLyricsProvider(fetchMock);
    const lyrics = await provider.getTimedLyrics(track);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/get');
    expect(parsed.searchParams.get('track_name')).toBe('Song Title - Remastered 2011');
    expect(parsed.searchParams.get('artist_name')).toBe('Some Artist');
    expect(parsed.searchParams.get('album_name')).toBe('Some Album');
    expect(parsed.searchParams.get('duration')).toBe('187');
    expect((init.headers as Record<string, string>)['Lrclib-Client']).toContain('ARC Music');
    expect(lyrics).toEqual({
      language: 'en',
      source: 'LRCLIB',
      timing: { lrclibId: 1, durationMs: 187_000 },
      lines: [
        { startMs: 1000, endMs: 3000, text: 'hello' },
        { startMs: 3000, text: 'world' },
      ],
    });
  });

  it('falls back to /api/search with a cleaned title and a duration check', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 404, name: 'TrackNotFound', message: 'Failed to find specified track' }, 404))
      .mockResolvedValueOnce(
        json([
          { id: 2, duration: 240, syncedLyrics: '[00:01.00]wrong length' },
          { id: 3, duration: 188, plainLyrics: 'unsynced only' },
          { id: 4, duration: 186, syncedLyrics: '[00:02.00]right one' },
        ]),
      );
    const lyrics = await new LrclibLyricsProvider(fetchMock).getTimedLyrics(track);
    const searchUrl = new URL(fetchMock.mock.calls[1]![0] as string);
    expect(searchUrl.pathname).toBe('/api/search');
    expect(searchUrl.searchParams.get('track_name')).toBe('Song Title');
    expect(lyrics?.lines[0]?.text).toBe('right one');
    expect(lyrics?.timing).toEqual({ lrclibId: 4, durationMs: 186_000 });
  });

  it('skips romanised / English-only uploads for a track whose metadata says Korean or Japanese', async () => {
    const krTrack: TrackIdentity = { ...track, title: 'Song', isrc: 'KRABC2400001' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 404, name: 'TrackNotFound', message: 'Failed to find specified track' }, 404))
      .mockResolvedValueOnce(
        json([
          { id: 2, duration: 187, syncedLyrics: '[00:01.00]romanised line one\n[00:02.00]romanised line two' },
          { id: 3, duration: 187, syncedLyrics: '[00:01.00]안녕 line one\n[00:02.00]두번째 줄' },
        ]),
      );
    const lyrics = await new LrclibLyricsProvider(fetchMock).getTimedLyrics(krTrack);
    expect(lyrics?.timing?.lrclibId).toBe(3);

    const onlyRomanised = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 404, name: 'TrackNotFound', message: 'x' }, 404))
      .mockResolvedValueOnce(json([{ id: 2, duration: 187, syncedLyrics: '[00:01.00]romanised line one' }]));
    expect(await new LrclibLyricsProvider(onlyRomanised).getTimedLyrics(krTrack)).toBeNull();

    const exactRomanised = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 5, duration: 187, syncedLyrics: '[00:01.00]romanised line one' }))
      .mockResolvedValueOnce(json([]));
    expect(await new LrclibLyricsProvider(exactRomanised).getTimedLyrics({ ...krTrack, isrc: undefined, title: '노래' })).toBeNull();
  });

  it('keeps English lyrics for a track with no Korean or Japanese hint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: 5, duration: 187, syncedLyrics: '[00:01.00]plain english line' }));
    expect((await new LrclibLyricsProvider(fetchMock).getTimedLyrics(track))?.timing?.lrclibId).toBe(5);
  });

  it('loads the pinned LRCLIB record directly when its length matches the track', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ id: 77, duration: 186, syncedLyrics: '[00:01.00]line one' }));
    const lyrics = await new LrclibLyricsProvider(fetchMock).getTimedLyrics(track, { lrclibId: 77 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0]![0] as string).pathname).toBe('/api/get/77');
    expect(lyrics).toMatchObject({ lines: [{ text: 'line one' }], timing: { lrclibId: 77, durationMs: 186_000 } });
  });

  it.each([
    ['another length (a different edit)', json({ id: 77, duration: 200, syncedLyrics: '[00:01.00]line one' })],
    ['no synced lyrics', json({ id: 77, duration: 187, plainLyrics: 'line one' })],
    ['a missing record', json({ code: 404 }, 404)],
  ])('falls back to the usual search when the pinned record has %s', async (_label, pinned) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pinned)
      .mockResolvedValueOnce(json({ id: 1, duration: 187, syncedLyrics: '[00:01.00]line two' }));
    const lyrics = await new LrclibLyricsProvider(fetchMock).getTimedLyrics(track, { lrclibId: 77 });
    expect(new URL(fetchMock.mock.calls[1]![0] as string).pathname).toBe('/api/get');
    expect(lyrics?.lines[0]?.text).toBe('line two');
  });

  it('returns null when nothing is found and throws retryable errors for outages', async () => {
    const notFound = vi.fn(async () => json({ code: 404 }, 404));
    await expect(new LrclibLyricsProvider(notFound).getTimedLyrics(track)).resolves.toBeNull();

    const outage = vi.fn(async () => json({ message: 'busy' }, 503));
    const error = await new LrclibLyricsProvider(outage).getTimedLyrics(track).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LyricsProviderError);
    expect((error as LyricsProviderError).retryable).toBe(true);
  });

  it('recognises instrumental records and plain-only records', () => {
    expect(recordToTimedLyrics({ id: 1, instrumental: true })).toEqual({
      lines: [],
      instrumental: true,
      source: 'LRCLIB',
      timing: { lrclibId: 1, durationMs: null },
    });
    expect(recordToTimedLyrics({ id: 1, plainLyrics: 'no timing' })).toBeNull();
  });

  it('cleans common Spotify title suffixes', () => {
    expect(cleanTrackTitle('Song (feat. Someone)')).toBe('Song');
    expect(cleanTrackTitle('Song - 2011 Remaster')).toBe('Song');
    expect(cleanTrackTitle('Song - Radio Edit')).toBe('Song');
    expect(cleanTrackTitle('GONE, GONE / THANK YOU')).toBe('GONE, GONE / THANK YOU');
  });
});

describe('MockLyricsProvider', () => {
  it('serves fixed lyrics per track and generic test lines only when asked', async () => {
    const fixed: TimedLyrics = { language: 'ja', lines: [{ startMs: 0, text: 'テスト' }] };
    const strict = new MockLyricsProvider({ byTrackId: { trk1: fixed } });
    await expect(strict.getTimedLyrics(track)).resolves.toMatchObject({
      source: 'Test lines',
      language: 'ja',
      timing: { lrclibId: null, durationMs: null },
    });
    await expect(strict.getTimedLyrics({ ...track, spotifyTrackId: 'other' })).resolves.toBeNull();

    const generic = await new MockLyricsProvider({ generic: true }).getTimedLyrics(track);
    expect(generic?.lines.length).toBeGreaterThan(10);
    expect(generic?.lines.every((line) => TEST_LINES_EN.includes(line.text))).toBe(true);
  });

  it('lays test lines within the track with occasional instrumental gaps', () => {
    const lines = buildTimedLines(TEST_LINES_EN, 190_000);
    expect(lines[0]!.startMs).toBeGreaterThan(0);
    expect(lines[lines.length - 1]!.endMs!).toBeLessThanOrEqual(190_000);
    expect(lines.some((line, i) => i < lines.length - 1 && line.endMs! < lines[i + 1]!.startMs)).toBe(true);
  });
});

describe('withLyricsCache', () => {
  it('caches results (including "not found") per provider and track', async () => {
    const inner = { id: 'x', label: 'X', getTimedLyrics: vi.fn(async () => null) };
    const cached = withLyricsCache(inner, new BoundedCache({ prefix: 'test.lyrics:', maxEntries: 10 }));
    await cached.getTimedLyrics(track);
    await cached.getTimedLyrics(track);
    expect(inner.getTimedLyrics).toHaveBeenCalledTimes(1);
  });

  it('keeps the LRCLIB record ID and duration in the stored result', async () => {
    const result: TimedLyrics = { lines: [{ startMs: 0, text: 'line one' }], timing: { lrclibId: 7, durationMs: 200_000 } };
    const inner = { id: 'z', label: 'Z', getTimedLyrics: vi.fn(async () => result) };
    await withLyricsCache(inner, new BoundedCache({ prefix: 'test.lyrics3:', maxEntries: 10 })).getTimedLyrics(track);
    // A fresh cache over the same storage reads the stored copy, timing included.
    const reread = withLyricsCache(inner, new BoundedCache({ prefix: 'test.lyrics3:', maxEntries: 10 }));
    await expect(reread.getTimedLyrics(track)).resolves.toEqual(result);
    expect(inner.getTimedLyrics).toHaveBeenCalledTimes(1);
  });

  it('caches a lookup pinned to a record apart from the plain one', async () => {
    const result: TimedLyrics = { lines: [{ startMs: 0, text: 'line one' }] };
    const inner = { id: 'p', label: 'P', getTimedLyrics: vi.fn(async () => result) };
    const cached = withLyricsCache(inner, new BoundedCache({ prefix: 'test.lyrics4:', maxEntries: 10 }));
    await cached.getTimedLyrics(track);
    await cached.getTimedLyrics(track, { lrclibId: 77 });
    await cached.getTimedLyrics(track, { lrclibId: 77 });
    expect(inner.getTimedLyrics).toHaveBeenCalledTimes(2);
    expect(inner.getTimedLyrics.mock.calls[1]).toEqual([track, { lrclibId: 77 }]);
  });

  it('never caches transient failures', async () => {
    const inner = {
      id: 'y',
      label: 'Y',
      getTimedLyrics: vi.fn().mockRejectedValueOnce(new LyricsProviderError('down', true)).mockResolvedValueOnce(null),
    };
    const cached = withLyricsCache(inner, new BoundedCache({ prefix: 'test.lyrics2:', maxEntries: 10 }));
    await expect(cached.getTimedLyrics(track)).rejects.toThrow('down');
    await expect(cached.getTimedLyrics(track)).resolves.toBeNull();
    expect(inner.getTimedLyrics).toHaveBeenCalledTimes(2);
  });
});
