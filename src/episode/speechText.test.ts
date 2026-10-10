import { describe, expect, it } from 'vitest';
import { estimateSpeechMs, MAX_UTTERANCE_CHARS, speechText, splitUtterances } from './speechText';

describe('speech text', () => {
  it('drops marks that are written but not said', () => {
    expect(speechText("『IGOR』의 'A BOY IS A GUN*'과 “Bound”")).toBe('IGOR의 A BOY IS A GUN과 Bound');
    expect(speechText("'GONE, GONE / THANK YOU'는  길다 — 6분.")).toBe('GONE, GONE, THANK YOU는 길다, 6분.');
    expect(speechText("첫 곡 'IGOR'S THEME'과 'I DON’T LOVE YOU ANYMORE'")).toBe("첫 곡 IGOR'S THEME과 I DON’T LOVE YOU ANYMORE");
  });

  it('splits a turn at sentence ends', () => {
    expect(splitUtterances('첫 문장이다. 둘째 문장일까? 셋째다!')).toEqual(['첫 문장이다.', '둘째 문장일까?', '셋째다!']);
    expect(splitUtterances('마침표 없이 끝난다')).toEqual(['마침표 없이 끝난다']);
  });

  it('keeps punctuation inside a quoted title, a date or an abbreviation in its sentence', () => {
    expect(splitUtterances("마지막 곡 'ARE WE STILL FRIENDS?'는 질문으로 끝난다. 그래서 돌아간다.")).toEqual([
      "마지막 곡 'ARE WE STILL FRIENDS?'는 질문으로 끝난다.",
      '그래서 돌아간다.',
    ]);
    expect(splitUtterances('2019. 5. 17. 에 나왔다. 그렇다.')).toEqual(['2019. 5. 17. 에 나왔다.', '그렇다.']);
    expect(splitUtterances('EARFQUAKE feat. Playboi Carti 버전이다.')).toEqual(['EARFQUAKE feat. Playboi Carti 버전이다.']);
  });

  it('cuts a long sentence near its middle, at a comma when there is one', () => {
    const long = '타일러는 이 앨범을 직접 쓰고 프로듀싱했고, 신스 베이스와 부풀어 오른 코드 위에 짧은 노래와 외침을 얹어서 한 인물의 연애 서사를 처음부터 끝까지 이어 붙인다.';
    const parts = splitUtterances(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= MAX_UTTERANCE_CHARS)).toBe(true);
    expect(parts[0]).toBe('타일러는 이 앨범을 직접 쓰고 프로듀싱했고,');
    expect(parts.join(' ')).toBe(long);
    const noComma = '가'.repeat(40) + ' ' + '나'.repeat(40) + ' ' + '다'.repeat(40);
    expect(splitUtterances(noComma).join(' ')).toBe(noComma);
    expect(splitUtterances(noComma).length).toBeGreaterThan(1);
    // Nothing to cut at: the sentence stays whole rather than being broken mid-word.
    expect(splitUtterances('가'.repeat(200))).toEqual(['가'.repeat(200)]);
  });

  it('estimates how long a line takes to say', () => {
    const line = '사랑에 빠지고, 매달리고, 놓아 주기까지를 열두 곡으로 이어 붙인 앨범이다.';
    const ms = estimateSpeechMs(line);
    expect(ms).toBeGreaterThan(4000);
    expect(ms).toBeLessThan(9000);
    expect(estimateSpeechMs(line, 1.25)).toBeLessThan(ms);
    expect(estimateSpeechMs('네.')).toBe(900);
  });
});
