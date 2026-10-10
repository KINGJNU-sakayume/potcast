import { describe, expect, it, vi } from 'vitest';
import type { CatalogueSource } from '../catalogue/CatalogueSource';
import type { AlbumSummary, ReleaseGroup } from '../domain/types';
import { adjacentReleases, curatedSequence, sectionsByYear, sortChronologically } from './chronology';
import { releaseDateKey } from './dates';
import { editionKey, groupEditions } from './editions';
import { loadDiscography } from './loadDiscography';

let nextId = 0;
function release(name: string, releaseDate: string | null, overrides: Partial<AlbumSummary> = {}): AlbumSummary {
  nextId += 1;
  const id = overrides.id ?? `release${String(nextId).padStart(4, '0')}`;
  return {
    id,
    uri: `spotify:album:${id}`,
    name,
    artists: [{ id: 'artist', name: 'Artist', uri: 'spotify:artist:artist' }],
    images: [],
    albumType: 'album',
    releaseDate,
    releaseDatePrecision: releaseDate && releaseDate.length === 4 ? 'year' : 'day',
    totalTracks: 10,
    ...overrides,
  };
}

describe('editionKey', () => {
  it.each([
    ['Parachutes', 'parachutes'],
    ['Parachutes (Remastered 2020)', 'parachutes'],
    ['Parachutes (Remastered 2020) [Deluxe Edition]', 'parachutes'],
    ["Viva La Vida (Prospekt's March Edition)", 'viva la vida'],
    ['STRAY SHEEP - Special Edition', 'stray sheep'],
    ['1989 (Bonus Track Version)', '1989'],
    ['ＳＴＲＡＹ ＳＨＥＥＰ（初回限定盤）', 'stray sheep'],
  ])('%s → %s', (title, key) => {
    expect(editionKey(title)).toBe(key);
  });

  it('keeps titles whose brackets are part of the name', () => {
    expect(editionKey('Weezer (Blue Album)')).toBe('weezer (blue album)');
    expect(editionKey("Red (Taylor's Version)")).toBe('red (taylors version)');
    expect(editionKey('Live at Wembley (Live)')).toBe('live at wembley (live)');
  });
});

describe('groupEditions', () => {
  it('folds editions under the original and drops repeated IDs', () => {
    const original = release('Parachutes', '2000-07-10');
    const remaster = release('Parachutes (Remastered 2020)', '2020-01-01');
    const other = release('A Rush of Blood to the Head', '2002-08-26');
    const groups = groupEditions([remaster, other, original, original]);
    expect(groups).toHaveLength(2);
    const parachutes = groups.find((g) => g.primary.id === original.id)!;
    expect(parachutes.editions.map((e) => e.id)).toEqual([remaster.id]);
  });

  it('prefers the unsuffixed title, then more tracks, when editions share a date', () => {
    const deluxe = release('STRAY SHEEP (Deluxe Edition)', '2020-08-05', { totalTracks: 20 });
    const standard = release('STRAY SHEEP', '2020-08-05', { totalTracks: 15 });
    expect(groupEditions([deluxe, standard])[0]!.primary.id).toBe(standard.id);
    const a = release('Album', '2020', { totalTracks: 9 });
    const b = release('Album', '2020', { totalTracks: 12 });
    expect(groupEditions([a, b])[0]!.primary.id).toBe(b.id);
  });
});

describe('chronology', () => {
  it('orders dates of mixed precision, unknown dates last', () => {
    expect(['2020-08-05', '2020', null, '2019-12', '2020-08'].sort((a, b) => releaseDateKey(a).localeCompare(releaseDateKey(b)))).toEqual([
      '2019-12',
      '2020',
      '2020-08',
      '2020-08-05',
      null,
    ]);
  });

  it('sorts oldest or newest first and groups consecutive releases by year', () => {
    const groups = groupEditions([release('C', '2024-08-21'), release('A', '2018-03-14'), release('B', '2018-10-31'), release('X', null)]);
    const asc = sortChronologically(groups);
    expect(asc.map((g) => g.primary.name)).toEqual(['A', 'B', 'C', 'X']);
    expect(sectionsByYear(asc).map((s) => [s.year, s.groups.length])).toEqual([
      [2018, 2],
      [2024, 1],
      [null, 1],
    ]);
    expect(sortChronologically(groups, 'desc').map((g) => g.primary.name)).toEqual(['X', 'C', 'B', 'A']);
  });

  it('finds the previous and next release, also from an edition', () => {
    const first = release('First', '2012');
    const second = release('Second', '2015');
    const secondDeluxe = release('Second (Deluxe Edition)', '2016');
    const third = release('Third', '2020');
    const chronology = sortChronologically(groupEditions([third, secondDeluxe, first, second]));
    expect(adjacentReleases(chronology, secondDeluxe.id)).toMatchObject({
      position: 2,
      total: 3,
      previous: { primary: { id: first.id } },
      next: { primary: { id: third.id } },
    });
    expect(adjacentReleases(chronology, first.id)).toMatchObject({ position: 1, previous: null });
    expect(adjacentReleases(chronology, third.id)).toMatchObject({ position: 3, next: null });
    expect(adjacentReleases(chronology, 'elsewhere')).toBeNull();
  });
});

describe('curatedSequence', () => {
  it('follows the list, matching titles across editions and IDs, and skips the rest', () => {
    const dropout = release('The College Dropout', '2004-02-10');
    const registration = release('Late Registration', '2005-08-30');
    const orchestration = release('Late Orchestration', '2006-04-17');
    const graduation = release('Graduation', '2007-09-11');
    const graduationDeluxe = release('Graduation (Deluxe Edition)', '2017-01-01');
    const groups = groupEditions([orchestration, graduationDeluxe, registration, dropout, graduation]);
    const sequence = curatedSequence(groups, ['the college dropout', registration.id, 'Graduation', 'Not On Spotify', 'Late Registration']);
    expect(sequence.map((g) => g.primary.id)).toEqual([dropout.id, registration.id, graduation.id]);
    expect(adjacentReleases(sequence, registration.id)).toMatchObject({ position: 2, total: 3, next: { primary: { id: graduation.id } } });
    expect(adjacentReleases(sequence, graduationDeluxe.id)).toMatchObject({ position: 3, previous: { primary: { id: registration.id } } });
    expect(adjacentReleases(sequence, orchestration.id)).toBeNull();
  });
});

describe('loadDiscography', () => {
  function fakeCatalogue(all: AlbumSummary[], pageSize = 10) {
    const getArtistReleases = vi.fn(async (_artistId: string, _groups: readonly ReleaseGroup[], page: { offset: number; limit: number }) => {
      const items = all.slice(page.offset, page.offset + Math.min(page.limit, pageSize));
      return { items, offset: page.offset, limit: pageSize, total: all.length, hasMore: page.offset + items.length < all.length };
    });
    return { catalogue: { getArtistReleases } as unknown as CatalogueSource, getArtistReleases };
  }

  it('walks every page of one release group', async () => {
    const all = Array.from({ length: 23 }, (_, i) => release(`Single ${i}`, `20${String(i).padStart(2, '0')}`));
    const { catalogue, getArtistReleases } = fakeCatalogue(all);
    const result = await loadDiscography(catalogue, 'artist', 'single');
    expect(result).toMatchObject({ total: 23, complete: true });
    expect(result.releases).toHaveLength(23);
    expect(getArtistReleases).toHaveBeenCalledTimes(3);
    expect(getArtistReleases.mock.calls.map((call) => [call[1], call[2].offset])).toEqual([
      [['single'], 0],
      [['single'], 10],
      [['single'], 20],
    ]);
  });

  it('stops at the page cap and reports an incomplete list', async () => {
    const all = Array.from({ length: 400 }, (_, i) => release(`Appearance ${i}`, '2020'));
    const { catalogue } = fakeCatalogue(all);
    const result = await loadDiscography(catalogue, 'artist', 'appears_on');
    expect(result).toMatchObject({ total: 400, complete: false });
    expect(result.releases).toHaveLength(300);
  });
});
