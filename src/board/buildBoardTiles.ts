/**
 * Life Board tiles (manifest v1, board docs/TILES.md) built from potcast's own records.
 *
 * Pure: the same input gives the same output, with no network, storage, clock or randomness (the clock is the `now`
 * argument). The sha256 used to skip duplicate uploads is taken without `generated_at`, so it must not vary.
 * potcast keeps no "now playing" state; `now` is the album with the latest listen record, and every number is one the
 * app really counts (tracks recorded as listened, listen events, finished digs).
 */
import { progressFor, reviewStatesFor } from '../digging/progress';
import type { ArtistDigProject, DigData, DigRelease, ListenEvent } from '../digging/types';

export const BOARD_APP = 'potcast';
export const BOARD_HREF = 'https://kingjnu-sakayume.github.io/potcast/';
/** Same values as board js/config.js (copied 2026-11-07); an image on any other origin is replaced by a letter there. */
export const BOARD_IMAGE_ORIGINS: readonly string[] = [
  'https://kingjnu-sakayume.github.io', 'https://image.aladin.co.kr', 'https://upload.wikimedia.org', 'https://i.scdn.co',
  'https://is1-ssl.mzstatic.com', 'https://is2-ssl.mzstatic.com', 'https://is3-ssl.mzstatic.com', 'https://is4-ssl.mzstatic.com', 'https://is5-ssl.mzstatic.com',
  'https://image.tmdb.org', 'https://t1.daumcdn.net', 'https://search1.kakaocdn.net',
];
export const BOARD_LINK_ORIGINS: readonly string[] = ['https://kingjnu-sakayume.github.io'];

/** Longest text the board accepts (board js/schema.js); counted with JavaScript `.length`. */
const MAX = { mono: 2, name: 30, pill: 20, rowValue: 24, text: 80, long: 160 } as const;
const STRIP_MAX = 12;
const HERO_ROWS = 4;
const LIST_ROWS = 12;
const TRACK_DAYS = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type BoardSize = '1x1' | '2x1' | '2x2' | '4x1' | '4x2';
export interface BoardCover { src?: string; alt?: string; mono?: string }
export interface BoardProgress { value: number; max: number; text?: string }
export interface BoardRow { title: string; value?: string; sub?: string; cover?: BoardCover; progress?: BoardProgress; muted?: boolean }
export interface BoardTile {
  id: string; name: string; tone: 'hero' | 'strip' | 'type'; form?: 'list' | 'line'; sizes: BoardSize[]; size: BoardSize;
  default: boolean; href: string; accent?: { h: number; s: number }; data: Record<string, unknown>;
}
export interface BoardManifest { version: 1; app: typeof BOARD_APP; generated_at: string; tiles: BoardTile[] }

/** What the notes know about an album's artwork, flattened so this module does not read the notes itself. */
export interface BoardCoverSource { albumIds: readonly string[]; appleCover?: string; cover?: string }
export interface BoardInput {
  data: DigData;
  covers: readonly BoardCoverSource[];
  /** Accent colour (hue 0–360, saturation 0–1) the app already took from an album's cover, by Spotify album id. */
  accents?: Readonly<Record<string, { h: number; s: number }>>;
}

/** Cuts to `max` UTF-16 units without leaving half of a surrogate pair; undefined for text that is empty or blank. */
export function clip(value: string | null | undefined, max: number): string | undefined {
  const text = (value ?? '').replace(/[ \t]+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  return (last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut).trimEnd() + '…';
}
const compact = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/** `11/5` in Korea time (the owner's day), from the record's own timestamp. */
export function shortDate(iso: string): string {
  const d = new Date(Date.parse(iso) + KST_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const mono = (text: string): BoardCover => ({ mono: [...text.trim()][0] ?? '·' });
const originOf = (url: string) => { try { const u = new URL(url); return u.protocol === 'https:' ? u.origin : null; } catch { return null; } };
const allowed = (url: string | undefined): url is string => !!url && url.length <= 600 && BOARD_IMAGE_ORIGINS.includes(originOf(url) ?? '');
/** Apple artwork URLs end in `<w>x<h>bb.jpg`; the note stores the 1400px one and a strip asks for 300px. */
const appleAt = (url: string, px: number) => url.replace(/\/\d+x\d+bb(\.\w+)$/, `/${px}x${px}bb$1`);

const byTimeDesc = (a: ListenEvent, b: ListenEvent) => b.listenedAt.localeCompare(a.listenedAt) || b.id.localeCompare(a.id);

type Use = 'hero' | 'strip';
function coverFor(release: DigRelease, covers: BoardInput['covers'], use: Use): BoardCover {
  const note = covers.find((c) => c.albumIds.includes(release.id));
  const candidates: Array<string | undefined> = [];
  if (note?.appleCover) candidates.push(appleAt(note.appleCover, use === 'hero' ? 1400 : 300));
  candidates.push(note?.cover);
  // Smallest Spotify image that is at least 300px (a hero takes the largest: nothing sharper is available).
  const sized = [...release.images].filter((i) => i.url).sort((a, b) => (a.width ?? 0) - (b.width ?? 0) || a.url.localeCompare(b.url));
  candidates.push((use === 'hero' ? sized[sized.length - 1] : sized.find((i) => (i.width ?? 0) >= 300) ?? sized[sized.length - 1])?.url);
  const src = candidates.find(allowed);
  const letter = mono(release.name);
  return src ? { src, alt: '', mono: letter.mono } : letter;
}

const albumTitle = (release: DigRelease): string => clip(release.name, MAX.text) ?? '제목 없음';
const artistOf = (release: DigRelease, project?: ArtistDigProject) => release.artists[0]?.name ?? project?.name;

/** Digging rows: unfinished first, then the artist heard most recently, then by name. */
function diggingRows(data: DigData, lastHeard: Map<string, string>): BoardRow[] {
  const counts = new Map<string, number>();
  for (const e of data.events) counts.set(e.artistId, (counts.get(e.artistId) ?? 0) + 1);
  const entries = data.projects.flatMap((project) => {
    const p = progressFor(project, data);
    return p.total > 0 ? [{ project, p }] : [];
  });
  entries.sort((a, b) => Number(a.p.allListened) - Number(b.p.allListened)
    || (lastHeard.get(b.project.id) ?? '').localeCompare(lastHeard.get(a.project.id) ?? '')
    || a.project.name.localeCompare(b.project.name) || a.project.id.localeCompare(b.project.id));
  return entries.map(({ project, p }) => {
    const heard = counts.get(project.id) ?? 0;
    const last = lastHeard.get(project.id);
    const done = p.known && p.totalAlbums > 0 ? `${p.completedAlbums} / ${p.totalAlbums}장 완료` : `${p.listened}곡 들음`;
    return compact({
      title: clip(project.name, MAX.text) ?? '아티스트',
      value: clip(done, MAX.rowValue),
      sub: clip(`${p.listened} / ${p.total}곡 들음${heard ? ` · 기록 ${heard}번` : ''}${last ? ` · 마지막 ${shortDate(last)}` : ''}`, MAX.text),
      progress: { value: Math.min(p.listened, p.total), max: p.total, text: clip(`${p.listened} / ${p.total}곡`, MAX.text) },
      muted: p.allListened ? true : undefined,
    });
  });
}

/** The potcast tiles for the records in `input`, as of `now`. An app with no records gives no tiles. */
export function buildBoardTiles(input: BoardInput, now: Date): BoardManifest {
  const { data, covers } = input;
  const accents = input.accents ?? {};
  const tiles: BoardTile[] = [];
  const events = [...data.events].sort(byTimeDesc);
  const releases = new Map(data.releases.map((r) => [r.id, r]));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const lastHeard = new Map<string, string>();
  for (const e of events) if (!lastHeard.has(e.artistId)) lastHeard.set(e.artistId, e.listenedAt);

  // now: the album with the latest listen record.
  const latest = events.find((e) => releases.has(e.albumId));
  if (latest) {
    const release = releases.get(latest.albumId)!;
    const states = reviewStatesFor(data);
    const total = release.totalTracks ?? (release.tracksComplete ? release.trackIds.length : 0);
    const listened = release.trackIds.filter((id) => states.get(id) === 'listened').length;
    const count = events.filter((e) => e.albumId === release.id).length;
    const artist = artistOf(release, projects.get(latest.artistId));
    const panel = diggingRows(data, lastHeard).slice(0, HERO_ROWS);
    tiles.push(compact({
      id: 'now', name: 'potcast · 지금 듣는 앨범', tone: 'hero' as const, sizes: ['1x1', '2x1', '2x2', '4x1', '4x2'] as BoardSize[], size: '4x2' as BoardSize,
      default: true, href: BOARD_HREF, accent: accents[release.id],
      data: compact({
        label: 'potcast · 지금 듣는 앨범',
        title: albumTitle(release),
        // A hero's `sub` is capped at 80 (not 160 as on a sleeve): the artist (cut to 36) on one line, the dates on the next.
        sub: [clip(artist, 36), `${shortDate(latest.listenedAt)} 마지막 기록 · 기록 ${count}번`].filter(Boolean).join('\n'),
        progress: total > 0 ? { value: Math.min(listened, total), max: total, text: clip(`${listened} / ${total}곡 들음`, MAX.text) } : undefined,
        cover: coverFor(release, covers, 'hero'),
        list: panel.length ? panel : undefined,
        listLabel: panel.length ? '디깅 중' : undefined,
      }),
    }));
  }

  // recent: distinct albums by latest record.
  const seen = new Set<string>();
  const items: Array<{ title: string; cover: BoardCover }> = [];
  for (const e of events) {
    const release = releases.get(e.albumId);
    if (!release || seen.has(release.id)) continue;
    seen.add(release.id);
    items.push({ title: albumTitle(release), cover: coverFor(release, covers, 'strip') });
    if (items.length === STRIP_MAX) break;
  }
  if (items.length) {
    tiles.push(compact({
      id: 'recent', name: 'potcast · 최근 들은 앨범', tone: 'strip' as const, sizes: ['2x1', '4x1'] as BoardSize[], size: '4x1' as BoardSize,
      default: true, href: BOARD_HREF, accent: latest ? accents[latest.albumId] : undefined,
      data: { label: 'potcast · 최근 들은 앨범', square: true, items },
    }));
  }

  // digging: artists being dug, unfinished first.
  const rows = diggingRows(data, lastHeard).slice(0, LIST_ROWS);
  if (rows.length) {
    tiles.push({
      id: 'digging', name: 'potcast · 디깅 큐', tone: 'type', form: 'list', sizes: ['2x1', '2x2'], size: '2x2', default: false, href: BOARD_HREF,
      data: { label: 'potcast · 디깅 큐', rows },
    });
  }

  // track: the track recorded most often in the last 30 days (needs at least two records).
  const since = now.getTime() - TRACK_DAYS * 24 * 60 * 60 * 1000;
  const perTrack = new Map<string, ListenEvent[]>();
  for (const e of events) {
    const at = Date.parse(e.listenedAt);
    if (at >= since && at <= now.getTime()) perTrack.set(e.trackId, [...(perTrack.get(e.trackId) ?? []), e]);
  }
  const top = [...perTrack.entries()].filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || b[1][0]!.listenedAt.localeCompare(a[1][0]!.listenedAt) || a[0].localeCompare(b[0]))[0];
  const topTrack = top && data.tracks.find((t) => t.id === top[0]);
  if (top && topTrack) {
    const artist = topTrack.artists[0]?.name;
    tiles.push({
      id: 'track', name: 'potcast · 지금 꽂힌 곡', tone: 'type', form: 'line', sizes: ['2x1', '4x1'], size: '2x1', default: false, href: BOARD_HREF,
      data: compact({
        label: 'potcast · 지금 꽂힌 곡',
        title: clip(topTrack.name, MAX.long) ?? '제목 없음',
        sub: clip(`${artist ? `${artist} · ` : ''}${top[1].length}번 기록 · 마지막 ${shortDate(top[1][0]!.listenedAt)}`, MAX.text),
        pill: '최근 30일',
      }),
    });
  }

  // finished: the latest dig finished as "listened".
  const done = [...data.completions].filter((c) => c.kind === 'listened')
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id.localeCompare(a.id))[0];
  const doneProject = done && projects.get(done.artistId);
  if (done && doneProject) {
    tiles.push({
      id: 'finished', name: 'potcast · 최근 끝낸 디깅', tone: 'type', form: 'line', sizes: ['2x1', '4x1'], size: '2x1', default: false, href: BOARD_HREF,
      data: compact({
        label: 'potcast · 최근 끝낸 디깅',
        title: clip(doneProject.name, MAX.long) ?? '아티스트',
        sub: clip(`${shortDate(done.completedAt)}에 끝냄 · ${done.releaseIds.length}장 · ${done.trackIds.length}곡`, MAX.text),
        pill: '다 들음',
      }),
    });
  }

  return { version: 1, app: BOARD_APP, generated_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), tiles };
}
