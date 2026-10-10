import { describe, expect, it } from 'vitest';
import { parseEpisodeScript } from './script';
import { EpisodeError } from './types';

const HEAD = `---
album: test-album
title: Test episode
hosts:
  a: 진행
  b: 해설
written: 2026-10-10
---
`;

const parse = (body: string, head = HEAD) => parseEpisodeScript('./notes/episodes/test-album.md', `${head}\n${body}`);

function problems(body: string, head = HEAD): string[] {
  try {
    parse(body, head);
  } catch (error) {
    if (error instanceof EpisodeError) return error.problems;
    throw error;
  }
  return [];
}

describe('episode script', () => {
  it('reads the frontmatter and takes the key from the file name', () => {
    const script = parse('A: 안녕하세요.');
    expect(script).toMatchObject({
      key: 'test-album',
      album: 'test-album',
      title: 'Test episode',
      written: '2026-10-10',
      hosts: [
        { id: 'a', name: '진행' },
        { id: 'b', name: '해설' },
      ],
    });
  });

  it('groups consecutive lines into talk and talk-over cues', () => {
    const { cues } = parse(['A: 첫 줄.', 'B: 둘째 줄.', '', 'A: 셋째 줄.', '> play one', 'A~ 음악 위에서.', 'B~ 이어서.', 'A: 음악을 멈추고.'].join('\n'));
    expect(cues.map((cue) => cue.type)).toEqual(['talk', 'music', 'over', 'talk']);
    expect(cues[0]).toMatchObject({ lines: [{ host: 'a', text: '첫 줄.' }, { host: 'b', text: '둘째 줄.' }, { host: 'a', text: '셋째 줄.' }] });
    expect(cues[2]).toMatchObject({ lines: [{ host: 'a', text: '음악 위에서.' }, { host: 'b', text: '이어서.' }] });
  });

  it('joins a line to the host line right above it, and ends the turn at a blank line', () => {
    const { cues } = parse(['A: 긴 문장의 앞부분과', '뒷부분: 콜론이 있어도 이어진다.', '', 'B: 다음 사람.'].join('\n'));
    expect(cues[0]).toMatchObject({ lines: [{ host: 'a', text: '긴 문장의 앞부분과 뒷부분: 콜론이 있어도 이어진다.' }, { host: 'b', text: '다음 사람.' }] });
    expect(problems(['A: 한 줄.', '', '주인 없는 줄.'].join('\n'))[0]).toMatch(/test-album\.md:12: This line belongs to no host/);
  });

  it('starts a chapter at the cue after its heading and skips comments', () => {
    const script = parse(['## 여는 말', '<!-- 메모 -->', 'A: 시작.', '## 첫 곡', '> play one', 'A: 감상.'].join('\n'));
    expect(script.chapters).toEqual([
      { title: '여는 말', cueIndex: 0 },
      { title: '첫 곡', cueIndex: 1 },
    ]);
    expect(script.cues).toHaveLength(3);
  });

  it.each([
    ['> play one', { tracks: ['one'], from: { kind: 'start' }, until: { kind: 'end' } }],
    ['> play one 0:47–1:11', { tracks: ['one'], from: { kind: 'time', ms: 47_000 }, until: { kind: 'time', ms: 71_000 } }],
    ['> play one 0:47 - 1:11.5', { from: { kind: 'time', ms: 47_000 }, until: { kind: 'time', ms: 71_500 } }],
    ['> play one 0:47-1:11', { from: { kind: 'time', ms: 47_000 }, until: { kind: 'time', ms: 71_000 } }],
    ['> play one L14–L17', { from: { kind: 'lyric', line: 14, edge: 'start' }, until: { kind: 'lyric', line: 17, edge: 'end' } }],
    ['> play one from L3.end to L9.start', { from: { kind: 'lyric', line: 3, edge: 'end' }, until: { kind: 'lyric', line: 9, edge: 'start' } }],
    ['> play one from 2:25', { tracks: ['one'], from: { kind: 'time', ms: 145_000 }, until: { kind: 'end' } }],
    ['> play one to 0:30', { tracks: ['one'], from: { kind: 'start' }, until: { kind: 'time', ms: 30_000 } }],
    ['> play to 1:05', { tracks: [], from: null, until: { kind: 'time', ms: 65_000 } }],
    ['> play to end', { tracks: [], from: null, until: { kind: 'end' } }],
    ['> play 1:12–1:31', { tracks: [], from: { kind: 'time', ms: 72_000 }, until: { kind: 'time', ms: 91_000 } }],
    ['> play one + two+three', { tracks: ['one', 'two', 'three'], from: { kind: 'start' }, until: { kind: 'end' } }],
    ['> play one-two to L5 | 첫 후렴까지 | 그리고', { tracks: ['one-two'], until: { kind: 'lyric', line: 5, edge: 'end' }, caption: '첫 후렴까지 | 그리고' }],
  ])('reads "%s"', (line, expected) => {
    const { cues } = parse(line);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ type: 'music', ...expected });
  });

  it.each([
    ['> play', /needs a track, a range, or both/],
    ['> play one 1:99', /Unexpected "1:99"/],
    ['> play one from', /is not a position/],
    ['> play one + ', /"\+" must be followed by a track key/],
    ['> play one end–1:00', /cannot start at "end"/],
    ['> play one 0:10–start', /cannot stop at "start"/],
    ['> play one 0:10–0:20–0:30', /is not a range/],
    ['> stop', /Unknown directive "> stop"/],
    ['C: 없는 진행자.', /"C" is not one of the hosts \(a, b\)/],
    ['## 빈 장', /The chapter "빈 장" has nothing in it/],
    ['## 하나\n## 둘\nA: 말.', /The chapter "하나" \(line 10\) has nothing in it/],
  ])('rejects "%s" with its line number', (body, message) => {
    const found = problems(body);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(message);
    expect(found[0]).toMatch(/test-album\.md(?::\d+)?: /);
  });

  it('reports every bad line at once', () => {
    expect(problems(['A: 좋은 줄.', '> stop', '', 'Z: 없는 사람.', '> play one 9:99'].join('\n'))).toHaveLength(3);
  });

  it('needs an album, a title and one or two hosts', () => {
    expect(problems('A: 말.', '---\ntitle: T\nhosts:\n  a: 진행\n---\n')[0]).toMatch(/"album" is required/);
    expect(problems('A: 말.', '---\nalbum: x\ntitle: T\n---\n')[0]).toMatch(/"hosts" is required/);
    expect(problems('A: 말.', '---\nalbum: x\ntitle: T\nhosts:\n  a: 1\n  b: 2\n  c: 3\n---\n')[0]).toMatch(/one or two hosts, found 3/);
    expect(problems('A: 말.', '---\nalbum: x\ntitle: T\nhosts:\n  Host: 진행\n---\n')[0]).toMatch(/Host key "Host"/);
    expect(problems('A: 말.', '---\nalbum: x\ntitle: T\nwritten: 10 Oct\nhosts:\n  a: 진행\n---\n')[0]).toMatch(/YYYY-MM-DD/);
    expect(problems('', HEAD)[0]).toMatch(/has no lines/);
  });

  it('lets a single host carry an episode', () => {
    const script = parse('A: 혼자 진행합니다.\n> play one', '---\nalbum: x\ntitle: T\nhosts:\n  a: 진행\n---\n');
    expect(script.hosts).toEqual([{ id: 'a', name: '진행' }]);
    expect(script.cues).toHaveLength(2);
  });
});
