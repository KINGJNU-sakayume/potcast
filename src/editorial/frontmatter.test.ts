import { describe, expect, it } from 'vitest';
import { FrontmatterError, fileKey, parseFrontmatter } from './frontmatter';
import { loadAlbumNotes, loadArtistNotes, parseEra } from './loadNotes';

describe('parseFrontmatter', () => {
  it('reads scalars, numbers, quoted strings and lists', () => {
    const { data, body } = parseFrontmatter(
      [
        '---',
        '# a comment',
        'artist: kenshi-yonezu',
        'origin: Tokyo, Japan · singer / songwriter',
        'releaseYear: 2020',
        'titles: [感電, "Tyler, The Creator", \'It\'\'s\', Prospekt\'s March]',
        'quoted: "a \\"b\\""',
        'sources:',
        '  - https://example.com/interview',
        '  - "Liner notes, 2020"',
        'short: >',
        '  first line',
        '  second line',
        '---',
        '',
        'Body paragraph.',
        '',
        '## Heading',
      ].join('\n'),
    );
    expect(data).toEqual({
      artist: 'kenshi-yonezu',
      origin: 'Tokyo, Japan · singer / songwriter',
      releaseYear: 2020,
      titles: ['感電', 'Tyler, The Creator', "It's", "Prospekt's March"],
      quoted: 'a "b"',
      sources: ['https://example.com/interview', 'Liner notes, 2020'],
      short: 'first line second line',
    });
    expect(body).toBe('Body paragraph.\n\n## Heading');
  });

  it('reads a nested block with folded text and a list of maps', () => {
    const { data } = parseFrontmatter(
      [
        '---',
        'titles: [Test]',
        'translation:',
        '  register: haeche',
        '  situation: >',
        '    first part',
        '    second part',
        '  pronouns:',
        '    - source: you',
        '      target: 너',
        '      note: "a: quoted note"',
        '    - source: me',
        '      target: 나',
        '  written: 2026-10-02',
        'sources:',
        '  - Liner notes: 2020',
        '---',
      ].join('\n'),
    );
    expect(data).toEqual({
      titles: ['Test'],
      translation: {
        register: 'haeche',
        situation: 'first part second part',
        pronouns: [
          { source: 'you', target: '너', note: 'a: quoted note' },
          { source: 'me', target: '나' },
        ],
        written: '2026-10-02',
      },
      // Top-level lists stay text.
      sources: ['Liner notes: 2020'],
    });
  });

  it('accepts Windows line endings and an empty body', () => {
    expect(parseFrontmatter('---\r\nshort: x\r\n---\r\n')).toEqual({ data: { short: 'x' }, body: '' });
  });

  it.each([
    ['no opening fence', 'short: x\n---\n'],
    ['no closing fence', '---\nshort: x\n'],
    ['a line that is not a key', '---\nshort x\n---\n'],
    ['a duplicate key', '---\nshort: x\nshort: y\n---\n'],
    ['an unclosed quote in a list', '---\ntitles: ["a, b]\n---\n'],
    ['a block list item without a dash', '---\nsources:\n  https://example.com\n---\n'],
    ['a nested line at the wrong indentation', '---\ntranslation:\n  register: haeche\n    speaker: x\n---\n'],
    ['a duplicate nested key', '---\ntranslation:\n  register: a\n  register: b\n---\n'],
    ['a list mixing text and maps', '---\ntranslation:\n  pronouns:\n    - you\n    - source: me\n      target: 나\n---\n'],
  ])('rejects %s', (_label, source) => {
    expect(() => parseFrontmatter(source)).toThrow(FrontmatterError);
  });
});

describe('note loading', () => {
  it('uses the file name as the key and the body as the full note', () => {
    const [note] = loadAlbumNotes({
      './notes/albums/test-album.md':
        '---\nartist: test\ntitles: [Test]\nreleaseYear: 2001\nwritten: 2026-10-02\nsources: [https://example.com]\nshort: Preview.\n---\n\nFull.\n',
    });
    expect(note).toEqual({
      key: 'test-album',
      artist: 'test',
      albumIds: [],
      titles: ['Test'],
      releaseYear: 2001,
      short: 'Preview.',
      full: 'Full.',
      written: '2026-10-02',
      updated: undefined,
      sources: ['https://example.com'],
    });
    expect(fileKey('./notes/songs/kick-back.md')).toBe('kick-back');
  });

  it('names the file when a required field is missing or a date is malformed', () => {
    expect(() => loadAlbumNotes({ './notes/albums/broken.md': '---\nartist: test\nshort: x\n---\n' })).toThrow(/broken\.md.*titles/);
    expect(() =>
      loadAlbumNotes({ './notes/albums/dated.md': '---\nartist: test\ntitles: [T]\nwritten: 2 Oct 2026\nshort: x\n---\n' }),
    ).toThrow(/dated\.md.*YYYY-MM-DD/);
  });
});

describe('artist eras', () => {
  it.each([
    ['2012–2015 · 직접 노래하기 시작', { from: 2012, to: 2015, title: '직접 노래하기 시작' }],
    ['2018– · ‘Lemon’ 이후', { from: 2018, to: null, title: '‘Lemon’ 이후' }],
    ['2009 : 하치', { from: 2009, to: 2009, title: '하치' }],
    ['2000-2005 | Early', { from: 2000, to: 2005, title: 'Early' }],
  ])('parses "%s"', (line, era) => {
    expect(parseEra(line, 'artist.md')).toEqual(era);
  });

  it.each(['Early years', '2015–2012 · backwards', '2012–2015'])('rejects "%s"', (line) => {
    expect(() => parseEra(line, 'artist.md')).toThrow(/artist\.md/);
  });

  it('loads eras oldest first', () => {
    const [artist] = loadArtistNotes({
      './notes/artists/a.md': '---\nartistIds: [x]\nnames: [A]\neras:\n  - 2018– · later\n  - 2012–2017 · earlier\nshort: s\n---\n',
    });
    expect(artist?.eras?.map((era) => era.title)).toEqual(['earlier', 'later']);
  });
});

describe('artwork and discography fields', () => {
  it('reads an album cover, an artist image and the artist discography', () => {
    const [album] = loadAlbumNotes({ './notes/albums/a.md': '---\nartist: a\ntitles: [T]\ncover: https://i.scdn.co/image/abc\nshort: s\n---\n' });
    const [artist] = loadArtistNotes({
      './notes/artists/a.md':
        '---\nartistIds: [x]\nnames: [A]\nimage: https://i.scdn.co/image/def\ndiscography:\n  - First\n  - 0Ds6i3h0F9RcYIKAD5Olum\nshort: s\n---\n',
    });
    expect(album?.cover).toBe('https://i.scdn.co/image/abc');
    expect(artist?.image).toBe('https://i.scdn.co/image/def');
    expect(artist?.discography).toEqual(['First', '0Ds6i3h0F9RcYIKAD5Olum']);
  });

  it('rejects an artwork value that is not an https URL', () => {
    expect(() => loadAlbumNotes({ './notes/albums/bad.md': '---\nartist: a\ntitles: [T]\ncover: cover.jpg\nshort: s\n---\n' })).toThrow(
      /bad\.md.*cover.*https/,
    );
    expect(() => loadArtistNotes({ './notes/artists/bad.md': '---\nartistIds: [x]\nnames: [A]\nimage: http://x.test/a.jpg\nshort: s\n---\n' })).toThrow(
      /bad\.md.*image/,
    );
  });
});
