/**
 * Shows how the app picks lyrics for one track, to find out why a romanised upload (or none) is shown:
 * the language it expects from the metadata, every LRCLIB request it sends, every record it gets back
 * (ID, names, length, detected language, share of Hangul / kana lines, whether it may be romanised) and which one wins.
 * Prints no lyric text.
 *
 *   npm run lyrics:probe -- --title "NEON" --artist "A20 LITE" --duration 3:12 [--album "…"] [--isrc KRXXX2400001]
 *       --duration is the Spotify track length (m:ss or seconds); the app only accepts records within 3 s of it.
 *       Add --isrc to see what the ISRC country changes (KR / JP set the expected language).
 */
import { LRCLIB_BASE_URL, LrclibLyricsProvider, recordToTimedLyrics, type LrclibRecord } from '../src/lyrics/providers/LrclibLyricsProvider';
import { expectedLyricsLanguage, mayBeRomanised, originalScriptShare } from '../src/translation/languageDetect';
import type { TrackIdentity } from '../src/domain/types';

function args(): Map<string, string> {
  const map = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    if (!flag.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[(i += 1)]! : 'true';
    map.set(flag.slice(2), value);
  }
  return map;
}

function seconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  return parts.length === 2 ? parts[0]! * 60 + parts[1]! : parts[0];
}

interface Exchange {
  request: string;
  status: number;
  records: LrclibRecord[];
}

function describe(record: LrclibRecord): string {
  const lyrics = recordToTimedLyrics(record);
  const names = `${record.trackName ?? '?'} — ${record.artistName ?? '?'} / ${record.albumName ?? '?'}`;
  const length = typeof record.duration === 'number' ? `${record.duration} s` : '? s';
  if (record.instrumental) return `${names} (${length}) instrumental`;
  if (!lyrics) return `${names} (${length}) ${record.plainLyrics ? 'plain lyrics only, no sync (the app skips it)' : 'no lyrics'}`;
  const texts = lyrics.lines.map((line) => line.text);
  const share = Math.round(originalScriptShare(texts) * 100);
  return `${names} (${length}) language ${lyrics.language ?? '?'}, Hangul/kana lines ${share}%, ${lyrics.lines.length} lines${mayBeRomanised(texts) ? ', may be romanised' : ''}`;
}

async function main(): Promise<void> {
  const options = args();
  const title = options.get('title');
  const artist = options.get('artist');
  const durationS = seconds(options.get('duration'));
  if (!title || !artist || !durationS) throw new Error('Pass --title, --artist and --duration (m:ss or seconds); optionally --album and --isrc.');

  const track: TrackIdentity = {
    spotifyTrackId: 'probe',
    uri: 'spotify:track:probe',
    title,
    artists: [{ id: 'probe', name: artist, uri: 'spotify:artist:probe' }],
    album: { id: 'probe', name: options.get('album') ?? '', uri: 'spotify:album:probe', images: [] },
    durationMs: durationS * 1000,
    isrc: options.get('isrc'),
  };

  const exchanges: Exchange[] = [];
  const loggingFetch: typeof fetch = async (input, init) => {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      throw new Error(
        `lrclib.net is unreachable (${error instanceof Error ? (error.cause as Error | undefined)?.message ?? error.message : error}). ` +
          'Behind a proxy, run with NODE_USE_ENV_PROXY=1; in a sandbox, lrclib.net must be an allowed host.',
      );
    }
    const url = new URL(String(input));
    let records: LrclibRecord[] = [];
    try {
      const body = (await response.clone().json()) as unknown;
      if (Array.isArray(body)) records = body as LrclibRecord[];
      else if (body && typeof body === 'object' && 'id' in body) records = [body as LrclibRecord];
    } catch {
      // A 404 body or a non-JSON error: nothing to list.
    }
    exchanges.push({ request: `${url.pathname.replace(/^\/api/, '')}${url.search}`, status: response.status, records });
    return response;
  };

  console.log(`Track: ${title} — ${artist}${track.album.name ? ` / ${track.album.name}` : ''} (${durationS} s)${track.isrc ? `, ISRC ${track.isrc}` : ''}`);
  const expected = expectedLyricsLanguage(track);
  console.log(`Expected lyrics language: ${expected ?? 'none — Latin-only metadata and no KR / JP ISRC, so the app judges by the uploads themselves'}`);
  console.log('');

  const result = await new LrclibLyricsProvider(loggingFetch, LRCLIB_BASE_URL).getTimedLyrics(track);

  for (const exchange of exchanges) {
    console.log(`GET ${exchange.request} → ${exchange.status}`);
    for (const record of exchange.records) console.log(`  ${result?.timing?.lrclibId === record.id ? '▶' : ' '} #${record.id}  ${describe(record)}`);
  }
  console.log('');
  if (!result) {
    console.log('Result: no lyrics (the app shows "not found" and caches that for 3 days).');
  } else if (result.instrumental) {
    console.log(`Result: instrumental (#${result.timing?.lrclibId ?? '?'}).`);
  } else {
    console.log(`Result: #${result.timing?.lrclibId ?? '?'}, language ${result.language ?? '?'}, ${result.lines.length} lines.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
