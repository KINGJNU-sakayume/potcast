/**
 * Fills `appleCover:` on album notes: Apple Music artwork at 1400px, for the Life Board hero tile (src/board).
 * The app itself never calls Apple; this script runs once and the URL is saved in the note.
 *
 *   npm run notes:apple                       lists what it found as a table (writes nothing)
 *   npm run notes:apple -- --write --only a,b writes only the notes you confirmed
 *
 * Lookup uses the keyless iTunes Search API (country=kr, then us). Each match must agree on the artist's name and the
 * album title (normalised); the release year is shown so you can confirm it. `artworkUrl100` has `100x100bb` replaced by
 * `1400x1400bb` (an undocumented convention), and every candidate is fetched to print the real pixel size. Notes that
 * already have an `appleCover` are skipped. Nothing is written for an album the script could not match.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter } from '../src/editorial/frontmatter';
import { namesMatch } from '../src/editorial/lookup';
import { artworkAt, baseTitle as base } from './art/apple';
import { imageSize } from './art/imageSize';
import { insertField } from './art/insertField';

const NOTES = join(import.meta.dirname, '../src/editorial/notes');
const ALLOWED = /^https:\/\/is[1-5]-ssl\.mzstatic\.com\/\S+$/;

interface Album { key: string; file: string; artistKey: string; artistNames: string[]; titles: string[]; year?: number; has: boolean }
interface Hit { artistName: string; collectionName: string; year: number | null; artworkUrl100: string }
interface Found { album: Album; hit: Hit; url: string; size: string }

function albums(): Album[] {
  const artists = new Map<string, string[]>();
  for (const name of readdirSync(join(NOTES, 'artists')).filter((n) => n.endsWith('.md'))) {
    const names = parseFrontmatter(readFileSync(join(NOTES, 'artists', name), 'utf8')).data.names;
    artists.set(name.replace(/\.md$/, ''), Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : []);
  }
  return readdirSync(join(NOTES, 'albums')).filter((n) => n.endsWith('.md')).sort().map((name) => {
    const file = join(NOTES, 'albums', name);
    const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
    const artistKey = String(data.artist);
    const titles = Array.isArray(data.titles) ? data.titles.filter((t): t is string => typeof t === 'string') : [];
    return { key: name.replace(/\.md$/, ''), file, artistKey, artistNames: artists.get(artistKey) ?? [], titles, year: typeof data.releaseYear === 'number' ? data.releaseYear : undefined, has: data.appleCover !== undefined };
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The Search API allows about 20 calls a minute: one call per 3.2 s, and a longer wait before retrying a 429. */
let lastCall = 0;
async function throttled(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    await sleep(Math.max(0, lastCall + 3200 - Date.now()));
    lastCall = Date.now();
    const response = await fetch(url);
    if (response.status !== 429 || attempt >= 4) return response;
    await sleep(30_000 * (attempt + 1));
  }
}

async function search(term: string, country: string): Promise<Hit[]> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, entity: 'album', country, limit: '15' })}`;
  const response = await throttled(url);
  if (!response.ok) throw new Error(`iTunes ${response.status} for ${term}`);
  const body = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return (body.results ?? []).flatMap((r) => typeof r.artistName === 'string' && typeof r.collectionName === 'string' && typeof r.artworkUrl100 === 'string'
    ? [{ artistName: r.artistName, collectionName: r.collectionName, year: typeof r.releaseDate === 'string' ? Number(r.releaseDate.slice(0, 4)) : null, artworkUrl100: r.artworkUrl100 }]
    : []);
}


/** Search often skips an album (Blonde, IGOR…) that the artist's own catalogue lists, so fall back to that. */
async function lookupAlbums(artist: string, country: string): Promise<Hit[]> {
  const found = await throttled(`https://itunes.apple.com/search?${new URLSearchParams({ term: artist, entity: 'musicArtist', country, limit: '3' })}`);
  const artists = found.ok ? ((await found.json()) as { results?: Array<{ artistId?: number }> }).results ?? [] : [];
  const id = artists[0]?.artistId;
  if (!id) return [];
  const response = await throttled(`https://itunes.apple.com/lookup?${new URLSearchParams({ id: String(id), entity: 'album', country, limit: '200' })}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return (body.results ?? []).flatMap((r) => typeof r.artistName === 'string' && typeof r.collectionName === 'string' && typeof r.artworkUrl100 === 'string'
    ? [{ artistName: r.artistName, collectionName: r.collectionName, year: typeof r.releaseDate === 'string' ? Number(r.releaseDate.slice(0, 4)) : null, artworkUrl100: r.artworkUrl100 }]
    : []);
}

const rank = (album: Album, hits: Hit[]) =>
  [...hits].sort((a, b) => Number(album.year !== undefined && b.year === album.year) - Number(album.year !== undefined && a.year === album.year) || (a.year ?? 9999) - (b.year ?? 9999))[0] ?? null;

async function find(album: Album): Promise<Hit | null> {
  const names = album.artistNames.length ? album.artistNames : [album.artistKey];
  for (const country of ['kr', 'us']) {
    const seen = new Set<string>();
    for (const title of album.titles.slice(0, 2)) {
      for (const artist of names.slice(0, 1)) {
        const hits = await search(`${artist} ${title}`.replace(/[<>]/g, ''), country);
        const wanted = new Set(album.titles.map(base));
        const good = hits.filter((h) => !seen.has(h.artworkUrl100) && namesMatch(names, [h.artistName]) && wanted.has(base(h.collectionName)));
        good.forEach((h) => seen.add(h.artworkUrl100));
        // Prefer the release year the note records; otherwise the earliest (the original, not a reissue).
        const pick = [...good].sort((a, b) => Number(album.year !== undefined && b.year === album.year) - Number(album.year !== undefined && a.year === album.year) || (a.year ?? 9999) - (b.year ?? 9999))[0];
        if (pick) return pick;
      }
    }
  }
  for (const country of ['us', 'kr']) {
    const wanted = new Set(album.titles.map(base));
    const pick = rank(album, (await lookupAlbums(names[0]!, country)).filter((h) => namesMatch(names, [h.artistName]) && wanted.has(base(h.collectionName))));
    if (pick) return pick;
  }
  return null;
}

async function measure(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) return `HTTP ${response.status}`;
  const size = imageSize(new Uint8Array(await response.arrayBuffer()));
  return size ? `${size.width}x${size.height}` : 'unknown';
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 && argv[onlyAt + 1] ? new Set(argv[onlyAt + 1]!.split(',').map((k) => k.trim())) : null;
  if (write && !only) throw new Error('--write needs --only <keys>: write only the albums you confirmed.');
  const found: Found[] = [];
  const missing: string[] = [];
  for (const album of albums()) {
    if (album.has || (only && !only.has(album.key))) continue;
    let hit: Hit | null = null;
    try { hit = await find(album); } catch (error) { missing.push(`${album.key} (${error instanceof Error ? error.message : String(error)})`); continue; }
    if (!hit) { missing.push(album.key); continue; }
    const url = artworkAt(hit.artworkUrl100, 1400) ?? '';
    if (!ALLOWED.test(url)) { missing.push(`${album.key} (unexpected artwork URL ${hit.artworkUrl100})`); continue; }
    found.push({ album, hit, url, size: await measure(url) });
  }
  console.log('key | note artist · title · year | Apple artist · album · year | pixels | url');
  for (const f of found) console.log(`${f.album.key} | ${f.album.artistKey} · ${f.album.titles[0]} · ${f.album.year ?? '?'} | ${f.hit.artistName} · ${f.hit.collectionName} · ${f.hit.year ?? '?'} | ${f.size} | ${f.url}`);
  if (missing.length) console.log(`\nnot found (keeps Spotify cover, then a letter): ${missing.join(', ')}`);
  if (!write) { console.log('\ndry run: nothing written. Re-run with --write --only <keys> for the ones you confirm.'); return; }
  for (const f of found) {
    writeFileSync(f.album.file, insertField(readFileSync(f.album.file, 'utf8'), 'appleCover', f.url, ['cover', 'releaseYear', 'titles', 'albumIds']));
    console.log(`set appleCover · ${relative(process.cwd(), f.album.file)}`);
  }
}

void main();
