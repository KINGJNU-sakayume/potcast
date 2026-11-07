import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyDigData, type DigData } from '../digging/types';
import { BOARD_IMAGE_ORIGINS, BOARD_LINK_ORIGINS, buildBoardTiles, clip, shortDate, type BoardManifest } from './buildBoardTiles';
import { SAMPLE_NOW, sampleCovers, sampleData } from './fixtures';
import { validateManifest } from './testdata/schema.js';

const policy = { imageOrigins: BOARD_IMAGE_ORIGINS, linkOrigins: BOARD_LINK_ORIGINS };
const ACCENTS = { ['a'.repeat(22)]: { h: 24, s: 0.62 } };
const build = (data: DigData = sampleData(), now = SAMPLE_NOW) => buildBoardTiles({ data, covers: sampleCovers, accents: ACCENTS }, now);

/** `ok` stays true when a tile is bad; what matters is no errors and every tile surviving. */
function expectValid(manifest: BoardManifest) {
  const result = validateManifest(manifest, policy);
  expect(result.errors).toEqual([]);
  expect(result.tiles).toHaveLength(manifest.tiles.length);
  return result;
}
const tile = (m: BoardManifest, id: string) => m.tiles.find((t) => t.id === id)!;

describe('board manifest v1', () => {
  it('passes the board schema with the board policy: no errors, no tile dropped', () => {
    const manifest = build();
    expect(manifest.tiles.map((t) => t.id)).toEqual(['now', 'recent', 'digging', 'track', 'finished']);
    expectValid(manifest);
  });

  it('is what board/sample.json holds (run `npm run board:sample` after changing the builder)', () => {
    const sample = JSON.parse(readFileSync(join(process.cwd(), 'board', 'sample.json'), 'utf8')) as BoardManifest;
    expect(sample).toEqual(JSON.parse(JSON.stringify(buildBoardTiles({ data: sampleData(), covers: sampleCovers, accents: ACCENTS }, SAMPLE_NOW))));
    expectValid(sample);
  });

  it('gives no tiles when there are no records', () => {
    const manifest = build(emptyDigData());
    expect(manifest.tiles).toEqual([]);
    expect(manifest).toMatchObject({ version: 1, app: 'potcast', generated_at: '2026-11-07T03:00:00Z' });
    expectValid(manifest);
  });

  it('keeps the ids fixed and each size inside sizes, with one hero only', () => {
    const manifest = build();
    for (const t of manifest.tiles) expect(t.sizes).toContain(t.size);
    expect(tile(manifest, 'now')).toMatchObject({ tone: 'hero', sizes: ['1x1', '2x1', '2x2', '4x1', '4x2'], size: '4x2', default: true });
    expect(tile(manifest, 'recent')).toMatchObject({ tone: 'strip', sizes: ['2x1', '4x1'], size: '4x1', default: true });
    expect(tile(manifest, 'digging')).toMatchObject({ tone: 'type', form: 'list', sizes: ['2x1', '2x2'], size: '2x2', default: false });
    expect(tile(manifest, 'track')).toMatchObject({ form: 'line', sizes: ['2x1', '4x1'], size: '2x1', default: false });
    expect(tile(manifest, 'finished')).toMatchObject({ form: 'line', sizes: ['2x1', '4x1'], size: '2x1', default: false });
    expect(manifest.tiles.filter((t) => t.tone === 'hero')).toHaveLength(1);
    expect(manifest.tiles.every((t) => t.href === 'https://kingjnu-sakayume.github.io/potcast/')).toBe(true);
  });

  it('shows the latest listened album with counted progress only', () => {
    const now = tile(build(), 'now').data as { title: string; progress: { value: number; max: number; text: string }; sub: string };
    expect(now.title).toBe('Second Imaginary');
    expect(now.progress).toEqual({ value: 3, max: 4, text: '3 / 4곡 들음' });
    expect(now.sub).toContain('11/5');
    expect(JSON.stringify(now)).not.toMatch(/어제|오늘|일 전/);
  });

  it('is deterministic: the same records in any order give the same list', () => {
    const data = sampleData();
    const shuffled: DigData = { ...data, events: [...data.events].reverse(), projects: [...data.projects].reverse(), tracks: [...data.tracks].reverse() };
    expect(build(shuffled)).toEqual(build(data));
    expect(JSON.stringify(build(data))).toBe(JSON.stringify(build(data)));
  });

  it('uses 1400px Apple artwork for the hero, 300px for the strip, then the note cover, then a letter', () => {
    const data = sampleData();
    const [a, b] = data.releases;
    const heroOf = (manifest: BoardManifest) => (tile(manifest, 'now').data as { cover: { src?: string; mono?: string } }).cover;
    const stripItems = (manifest: BoardManifest) => (tile(manifest, 'recent').data as { items: Array<{ title: string; cover: { src?: string; mono?: string } }> }).items;
    // Latest listen is album b (note cover only); make a the latest to see its Apple artwork.
    const aLast: DigData = { ...data, events: [...data.events, { ...data.events[0]!, id: 'late', albumId: a!.id, trackId: a!.trackIds[0]!, listenedAt: '2026-11-06T10:00:00Z' }] };
    const manifest = build(aLast);
    expect(heroOf(manifest).src).toMatch(/\/1400x1400bb\.jpg$/);
    expect(stripItems(manifest).find((i) => i.title === a!.name)!.cover.src).toMatch(/\/300x300bb\.jpg$/);
    expect(stripItems(manifest).find((i) => i.title === b!.name)!.cover.src).toBe('https://i.scdn.co/image/ab67616d00001e02bbbbbbbbbbbbbbbbbbbbbbbb');
    // Album c has no note: its own Spotify image (300px for the strip).
    expect(stripItems(manifest).find((i) => i.title === 'Made Up Hours')!.cover.src).toMatch(/ab67616d00001e02/);
    // Album d..: no image anywhere, so a letter and no src.
    const noArt: DigData = { ...data, events: [{ ...data.events[0]!, albumId: data.releases[3]!.id, trackId: data.releases[3]!.trackIds[0]!, listenedAt: '2026-11-06T10:00:00Z' }] };
    const cover = heroOf(build(noArt));
    expect(cover).toEqual({ mono: 'P' });
    expectValid(build(noArt));
  });

  it('replaces artwork on an origin the board does not allow with a letter', () => {
    const data = sampleData();
    data.releases[3] = { ...data.releases[3]!, images: [{ url: 'https://example.com/a.jpg', width: 640, height: 640 }, { url: 'http://i.scdn.co/insecure.jpg', width: 300, height: 300 }] };
    const noArt: DigData = { ...data, events: [{ ...data.events[0]!, albumId: data.releases[3]!.id, trackId: data.releases[3]!.trackIds[0]!, listenedAt: '2026-11-06T10:00:00Z' }] };
    expect((tile(build(noArt), 'now').data as { cover: object }).cover).toEqual({ mono: 'P' });
  });

  it('adds the accent only when the app already knows the cover colour', () => {
    const data = sampleData();
    const [a] = data.releases;
    const withA: DigData = { ...data, events: [...data.events, { ...data.events[0]!, id: 'late', albumId: a!.id, trackId: a!.trackIds[0]!, listenedAt: '2026-11-06T10:00:00Z' }] };
    expect(tile(build(withA), 'now').accent).toEqual({ h: 24, s: 0.62 });
    expect(tile(build(), 'now').accent).toBeUndefined();
  });

  it('cuts long text to the board limits and still validates', () => {
    const long = 'あ'.repeat(300);
    const data = sampleData();
    data.releases = data.releases.map((r) => ({ ...r, name: long }));
    data.projects = data.projects.map((p) => ({ ...p, name: long }));
    data.tracks = data.tracks.map((t) => ({ ...t, name: long, artists: t.artists.map((x) => ({ ...x, name: long })) }));
    data.releases = data.releases.map((r) => ({ ...r, artists: r.artists.map((x) => ({ ...x, name: long })) }));
    const manifest = build(data);
    expectValid(manifest);
    expect((tile(manifest, 'now').data as { title: string }).title.length).toBeLessThanOrEqual(80);
    expect((tile(manifest, 'track').data as { title: string }).title.length).toBeLessThanOrEqual(160);
  });

  it('drops empty and blank text instead of sending it', () => {
    expect(clip('   ', 10)).toBeUndefined();
    expect(clip('', 10)).toBeUndefined();
    expect(clip(undefined, 10)).toBeUndefined();
    expect(clip('abc', 10)).toBe('abc');
    expect(clip('😀😀😀😀', 4)!.length).toBeLessThanOrEqual(4);
    const data = sampleData();
    data.releases = data.releases.map((r) => ({ ...r, name: '  ', artists: [] }));
    data.projects = data.projects.map((p) => ({ ...p, name: ' ' }));
    const manifest = build(data);
    expectValid(manifest);
    // Every string in the list has content; only an image's `alt` may be empty (decorative cover).
    const blanks: string[] = [];
    const walk = (value: unknown, key: string) => {
      if (typeof value === 'string') { if (!value.trim() && key !== 'alt') blanks.push(key); }
      else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k));
    };
    walk(manifest, 'manifest');
    expect(blanks).toEqual([]);
    expect((tile(manifest, 'now').data as { sub: string }).sub).not.toMatch(/^\n/);
  });

  it('writes dates, never relative words, in Korea time', () => {
    expect(shortDate('2026-11-05T14:00:00Z')).toBe('11/5');
    expect(shortDate('2026-11-05T16:00:00Z')).toBe('11/6');
    expect(JSON.stringify(build())).not.toMatch(/어제|오늘|그제|\d+일 전/);
  });

  it('shows the track tile only for a track recorded at least twice in the last 30 days', () => {
    const top = tile(build(), 'track').data as { title: string; sub: string; pill: string };
    expect(top.title).toBe('First Song');
    expect(top.sub).toContain('3번 기록');
    expect(top.pill).toBe('최근 30일');
    // Two months later nothing is inside the window.
    expect(build(sampleData(), new Date('2027-01-15T00:00:00Z')).tiles.some((t) => t.id === 'track')).toBe(false);
    expectValid(build(sampleData(), new Date('2027-01-15T00:00:00Z')));
  });

  it('leaves out the progress bar when the track total is unknown', () => {
    const data = sampleData();
    data.releases = data.releases.map((r) => ({ ...r, totalTracks: null, tracksComplete: false }));
    const manifest = build(data);
    expect((tile(manifest, 'now').data as { progress?: unknown }).progress).toBeUndefined();
    expectValid(manifest);
  });

  it('keeps at most 12 strip items and 4 hero rows', () => {
    const data = sampleData();
    const base = data.releases[0]!;
    for (let i = 0; i < 20; i++) {
      const id = `x${String(i).padStart(2, '0')}`.padEnd(22, 'x');
      data.releases.push({ ...base, id, name: `Extra ${i}`, trackIds: [] });
      data.events.push({ ...data.events[0]!, id: `ex${i}`, albumId: id, listenedAt: `2026-11-06T${String(i).padStart(2, '0')}:00:00Z` });
    }
    const manifest = build(data);
    expect((tile(manifest, 'recent').data as { items: unknown[] }).items).toHaveLength(12);
    expect((tile(manifest, 'now').data as { list: unknown[] }).list.length).toBeLessThanOrEqual(4);
    expectValid(manifest);
  });

  it('serialises under 64 KiB', () => {
    expect(new TextEncoder().encode(JSON.stringify(build())).length).toBeLessThan(64 * 1024);
  });
});
