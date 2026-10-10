import type { TimedLyricLine } from '../types';

/**
 * Original, non-copyright test lines for development, tests and the preview
 * catalogue. They are not the lyrics of any real song and must never be shown
 * as if they were: the UI labels them "Test lines".
 */

export const TEST_LINES_EN: readonly string[] = [
  'A bright pulse runs under the floor',
  'You disappear and return in the same frame',
  'Nothing stays still for very long',
  "The radio hums a colour I can't name",
  'I leave the window open for the noise',
  'Every corner of the room is paper',
  'Write it down before it fades',
  'The street lights count to seven',
  'We fold the evening into squares',
  'A slow wave, and then the quiet',
  'Hold the line, hold the line',
  'The last note leans against the wall',
  'Somebody hums it on the stairs',
  'The record turns without a sound',
  'I read your name in the margin',
  'Keep the light on, keep it low',
];

export const TEST_LINES_JA: readonly string[] = [
  '窓の外で街が静かに光る',
  '名前のない朝を数えている',
  '紙の上に線を一本引いた',
  'その線はまだ乾いていない',
  '遠くの信号が青に変わる',
  '足音だけが先を急ぐ',
  '何も言わずにうなずいた',
  '指先に冬の匂いが残る',
  'ページをめくる音がする',
  '今日の続きを書いておく',
  '静かな部屋に灯りをともす',
  '言葉より先に夜が来た',
  '最後の音が壁にもたれる',
  'また明日、同じ場所で',
];

/** Korean lines mixed with English ones — only the English lines need translating to Korean. */
export const TEST_LINES_KO_MIXED: readonly string[] = [
  '우리는 같은 박자로 걷는다',
  'Twenty-four lights in a row',
  '끝나지 않는 여름의 문턱에서',
  '손을 들어 신호를 보내',
  'Say it louder, one more time',
  '지워지지 않는 선을 그어',
  '하나 둘 셋, 다시 처음부터',
  'Every voice becomes a colour',
  '창문 너머로 번지는 빛',
  '우리 이름을 크게 불러 줘',
  'Never folding, never fading',
  '같은 노래를 다른 목소리로',
  '오늘이 마지막인 것처럼',
  'We start again at the line',
];

/** Korean translations of the test lines, used by the mock translation provider. */
export const TEST_TRANSLATIONS_KO: Readonly<Record<string, string>> = {
  'A bright pulse runs under the floor': '밝은 맥박이 바닥 아래로 흐른다',
  'You disappear and return in the same frame': '너는 같은 장면 속에서 사라졌다가 다시 돌아온다',
  'Nothing stays still for very long': '오래 가만히 머무는 것은 없다',
  "The radio hums a colour I can't name": '라디오가 이름 붙일 수 없는 색으로 웅웅거린다',
  'I leave the window open for the noise': '소음이 들어오도록 창문을 열어 둔다',
  'Every corner of the room is paper': '방의 모든 모서리가 종이로 되어 있다',
  'Write it down before it fades': '흐려지기 전에 적어 둬',
  'The street lights count to seven': '가로등이 일곱까지 센다',
  'We fold the evening into squares': '우리는 저녁을 네모나게 접는다',
  'A slow wave, and then the quiet': '느린 파도, 그리고 고요',
  'Hold the line, hold the line': '선을 지켜, 선을 지켜',
  'The last note leans against the wall': '마지막 음이 벽에 기대어 선다',
  'Somebody hums it on the stairs': '누군가 계단에서 그 노래를 흥얼거린다',
  'The record turns without a sound': '레코드는 소리 없이 돈다',
  'I read your name in the margin': '여백에서 너의 이름을 읽는다',
  'Keep the light on, keep it low': '불을 켜 둬, 낮게 켜 둬',
  '窓の外で街が静かに光る': '창밖에서 도시가 조용히 빛난다',
  '名前のない朝を数えている': '이름 없는 아침을 세고 있다',
  '紙の上に線を一本引いた': '종이 위에 선을 하나 그었다',
  'その線はまだ乾いていない': '그 선은 아직 마르지 않았다',
  '遠くの信号が青に変わる': '먼 신호가 초록불로 바뀐다',
  '足音だけが先を急ぐ': '발소리만 앞서 서두른다',
  '何も言わずにうなずいた': '아무 말 없이 고개를 끄덕였다',
  '指先に冬の匂いが残る': '손끝에 겨울 냄새가 남는다',
  'ページをめくる音がする': '페이지를 넘기는 소리가 난다',
  '今日の続きを書いておく': '오늘의 뒷이야기를 적어 둔다',
  '静かな部屋に灯りをともす': '조용한 방에 불을 밝힌다',
  '言葉より先に夜が来た': '말보다 먼저 밤이 왔다',
  '最後の音が壁にもたれる': '마지막 음이 벽에 기댄다',
  'また明日、同じ場所で': '내일 또, 같은 곳에서',
  'Twenty-four lights in a row': '한 줄로 늘어선 스물네 개의 불빛',
  'Say it louder, one more time': '더 크게, 한 번만 더 말해 줘',
  'Every voice becomes a colour': '모든 목소리가 하나의 색이 된다',
  'Never folding, never fading': '접히지 않고, 바래지 않고',
  'We start again at the line': '우리는 선에서 다시 시작한다',
};

export interface TimingOptions {
  introMs?: number;
  outroMs?: number;
  /** Target spacing between lines; texts repeat to fill longer tracks. */
  spacingMs?: number;
  /** Every n-th line ends early, leaving an instrumental gap. 0 disables gaps. */
  gapEvery?: number;
}

/** Deterministically lays test lines across a track's duration. */
export function buildTimedLines(
  texts: readonly string[],
  durationMs: number,
  options: TimingOptions = {},
): TimedLyricLine[] {
  if (texts.length === 0 || durationMs <= 0) return [];
  const intro = options.introMs ?? Math.min(12_000, durationMs * 0.08);
  const outro = options.outroMs ?? Math.min(10_000, durationMs * 0.06);
  const usable = Math.max(1000, durationMs - intro - outro);
  const spacing = options.spacingMs ?? 7_000;
  const count = Math.max(2, Math.min(64, Math.round(usable / spacing)));
  const step = usable / count;
  const gapEvery = options.gapEvery ?? 6;

  return Array.from({ length: count }, (_, i) => {
    const startMs = Math.round(intro + i * step);
    const gap = gapEvery > 0 && (i + 1) % gapEvery === 0 && i < count - 1;
    return {
      startMs,
      endMs: Math.round(startMs + (gap ? step * 0.55 : step)),
      text: texts[i % texts.length]!,
    };
  });
}
