/**
 * Curated lyric translations: written per song after the song's context has
 * been worked out — who is speaking, to whom, in what relationship — so the
 * Korean speech level stays deliberate and consistent across the whole song
 * instead of drifting line by line as machine translation does.
 *
 * A translation belongs to the song's note (`src/editorial/notes/songs/`):
 * - the note's frontmatter holds the brief (`translation:` block),
 * - the note's `## 번역에 대하여` section holds the reasoning,
 * - `<song-key>.translation.json` holds the timed segments.
 *
 * The repository never holds the original lyrics. Segments are time ranges in
 * one LRCLIB record; the original lines are loaded from LRCLIB at runtime and
 * each segment is placed on the lines it overlaps (see align.ts).
 */

/**
 * Korean speech levels used in lyrics.
 * - hapsyoche: 하십시오체 (formal polite: -습니다)
 * - haeyoche:  해요체 (polite: -아요/-어요)
 * - haeche:    해체 (intimate 반말: -아/-어, -지)
 * - haerache:  해라체 (plain 반말, monologue / written: -는다, -다)
 */
export type SpeechLevel = 'hapsyoche' | 'haeyoche' | 'haeche' | 'haerache';

export const SPEECH_LEVELS: readonly SpeechLevel[] = ['hapsyoche', 'haeyoche', 'haeche', 'haerache'];

export const SPEECH_LEVEL_LABEL: Record<SpeechLevel, string> = {
  hapsyoche: '존댓말 · 하십시오체',
  haeyoche: '존댓말 · 해요체',
  haeche: '반말 · 해체',
  haerache: '반말 · 해라체',
};

export interface TermMapping {
  source: string;
  target: string;
  note?: string;
}

/** The context worked out before translating (the note's `translation:` block); it decides every line's voice. */
export interface TranslationBrief {
  /** Language of the original lyrics (BCP 47). */
  sourceLanguage: string;
  /** Language of the translation (BCP 47), usually "ko". */
  targetLanguage: string;
  /** The speech level the translation keeps throughout. */
  register: SpeechLevel;
  /** Who sings the lines, as the song presents them. */
  speaker: string;
  /** Who the lines are addressed to ("너", "떠난 사람", "자기 자신", "청중"). */
  addressee: string;
  relationship?: string;
  /** Time, place and situation of the song. */
  situation?: string;
  /** How pronouns and forms of address are carried over (君 → 너, あなた → 당신 …). */
  pronouns?: TermMapping[];
  /** Recurring words, names and images and how they are rendered. */
  glossary?: TermMapping[];
  /** ISO dates (YYYY-MM-DD) the translation was written and last revised. */
  written: string;
  updated?: string;
}

/** One unit of translation: a sentence that may span several LRCLIB lines, or share one with the next sentence. */
export interface TranslationSegment {
  startMs: number;
  endMs: number;
  translation: string;
}

/** `<song-key>.translation.json`. */
export interface TranslationTimeline {
  schemaVersion: 2;
  /** The LRCLIB record the segment times were taken from. */
  timing: { lrclibId: number; durationMs: number };
  /** Sorted by `startMs`, never overlapping. */
  segments: TranslationSegment[];
}

/** A song note's curated translation, as loaded. */
export interface SongTranslation {
  brief: TranslationBrief;
  /** The note's `## 번역에 대하여` section (Markdown subset): why this voice. */
  about: string;
  timeline: TranslationTimeline;
}
