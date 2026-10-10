import { describe, expect, it } from 'vitest';
import { parseEpisodeScript } from '../script';
import { clipKey, RECORDED_VOICES } from './clip';
import { coverage, episodeClips, readAsWritten, sampleClips } from './plan';

const SCRIPT = parseEpisodeScript(
  './notes/episodes/test.md',
  `---
album: test
title: Test
hosts:
  a: 진행
  b: 해설
voices:
  b: M4
say:
  - IGOR = 이고르
---

A: 『IGOR』를 들어요. 첫 곡부터요.
> play one
B~ 여기서 목소리가 들어옵니다.
`,
);

describe('the clips of an episode', () => {
  it('are its utterances in order, each in its host\'s voice, as the voice says them', () => {
    expect(episodeClips(SCRIPT)).toEqual([
      { key: clipKey('F1', '이고르를 들어요.'), voice: 'F1', text: '이고르를 들어요.' },
      { key: clipKey('F1', '첫 곡부터요.'), voice: 'F1', text: '첫 곡부터요.' },
      { key: clipKey('M4', '여기서 목소리가 들어옵니다.'), voice: 'M4', text: '여기서 목소리가 들어옵니다.' },
    ]);
  });

  it('count as recorded when the site has them', () => {
    const [first] = episodeClips(SCRIPT);
    expect(coverage(SCRIPT, () => true)).toEqual({ recorded: 3, total: 3 });
    expect(coverage(SCRIPT, (key) => key === first!.key)).toEqual({ recorded: 1, total: 3 });
    expect(coverage(SCRIPT, () => false)).toEqual({ recorded: 0, total: 3 });
  });
});

describe('samples', () => {
  it('have every voice say the same sentence', () => {
    const samples = sampleClips();
    expect(samples.map((clip) => clip.voice)).toEqual([...RECORDED_VOICES]);
    expect(new Set(samples.map((clip) => clip.text)).size).toBe(1);
    expect(new Set(samples.map((clip) => clip.key)).size).toBe(RECORDED_VOICES.length);
  });
});

describe('what is left for the voice to read as written', () => {
  it('lists English words and numerals, and not the sounds a host makes', () => {
    expect(readAsWritten('Head West의 Attention이 2019년에 13위. <laugh> 그렇죠.')).toEqual(['Head West', 'Attention', '2019', '13']);
    expect(readAsWritten('전부 한글이에요.')).toEqual([]);
  });
});
