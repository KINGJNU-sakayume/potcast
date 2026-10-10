import { useId } from 'react';
import type { SongNote } from '../editorial/types';
import { SPEECH_LEVEL_LABEL, type SongTranslation, type TermMapping } from '../translation/curated/types';
import { NoteBody } from './NoteBody';
import { useNote, type NotePayload } from './NoteContext';

/**
 * The one note for a song: the listening note first, then — when the song
 * has a curated translation — "번역에 대하여" (who speaks to whom, the speech
 * level, pronouns and terms, the reasoning), then sources and dates in the
 * shared foot. The translation itself is read in the lyrics, never here.
 */

const LANGUAGE_LABEL: Record<string, string> = { ja: '일본어', en: '영어', ko: '한국어', zh: '중국어' };

function languageLabel(tag: string): string {
  return LANGUAGE_LABEL[tag.split('-')[0]!.toLowerCase()] ?? tag;
}

function TermTable({ caption, terms, sourceLang }: { caption: string; terms: TermMapping[] | undefined; sourceLang: string }) {
  if (!terms?.length) return null;
  const notes = terms.some((term) => term.note);
  return (
    <table className="term-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">원어</th>
          <th scope="col">번역</th>
          {notes && <th scope="col">메모</th>}
        </tr>
      </thead>
      <tbody>
        {terms.map((term) => (
          <tr key={`${term.source}→${term.target}`}>
            <td lang={sourceLang}>{term.source}</td>
            <td>{term.target}</td>
            {notes && <td>{term.note}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TranslationAbout({ translation }: { translation: SongTranslation }) {
  const { brief, about } = translation;
  const titleId = useId();
  const dates = [`작성 ${brief.written}`, brief.updated && `수정 ${brief.updated}`].filter(Boolean).join(' · ');
  return (
    <section className="note-body song-translation" aria-labelledby={titleId}>
      <h3 id={titleId}>번역에 대하여</h3>
      <dl className="translation-brief">
        <div>
          <dt>화자 → 청자</dt>
          <dd>
            {brief.speaker} → {brief.addressee}
          </dd>
        </div>
        {brief.relationship && (
          <div>
            <dt>관계</dt>
            <dd>{brief.relationship}</dd>
          </div>
        )}
        {brief.situation && (
          <div>
            <dt>상황</dt>
            <dd>{brief.situation}</dd>
          </div>
        )}
        <div>
          <dt>어체</dt>
          <dd>{SPEECH_LEVEL_LABEL[brief.register]}</dd>
        </div>
      </dl>
      <TermTable caption="호칭" terms={brief.pronouns} sourceLang={brief.sourceLanguage} />
      <TermTable caption="용어" terms={brief.glossary} sourceLang={brief.sourceLanguage} />
      <NoteBody markdown={about} className="translation-reasoning" />
      <p className="translation-dates">
        {languageLabel(brief.sourceLanguage)} → {languageLabel(brief.targetLanguage)} · {dates}
      </p>
    </section>
  );
}

export interface SongNoteContext {
  title: string;
  subtitle?: string;
  titleLang?: string;
}

/** A song's one note: the listening body, then 번역에 대하여 when the song has a curated translation. */
export function songNotePayload(note: SongNote, { title, subtitle, titleLang }: SongNoteContext): NotePayload {
  return {
    context: 'Listening note / Song',
    title,
    subtitle,
    titleLang,
    copy: note.full ?? '',
    extra: note.translation ? <TranslationAbout translation={note.translation} /> : undefined,
    written: note.written,
    updated: note.updated,
    sources: note.sources,
  };
}

/**
 * Now Playing's one-line Listening note: the kicker, the cue on one line and
 * "Read full note →". `onOpen` opens or closes the note in the right-hand
 * column (Now Playing tracks which note is open); without it the note opens
 * through the shared note context. Nothing without a note.
 */
export function SongNotePreview({
  note,
  className,
  onOpen,
  expanded,
  ...context
}: { note: SongNote | null; className?: string; onOpen?: () => void; expanded?: boolean } & SongNoteContext) {
  const { openNote } = useNote();
  if (!note) return null;
  const short = note.short?.trim();
  const hasBody = Boolean(note.full?.trim() || note.translation);
  if (!short && !hasBody) return null;
  return (
    <div className={className ? `note-line ${className}` : 'note-line'}>
      <span className="note-line-kicker">Listening note</span>
      {short ? <p lang="ko">{short}</p> : <p aria-hidden="true" />}
      {hasBody && (
        <button
          type="button"
          className="note-more"
          aria-expanded={onOpen ? Boolean(expanded) : undefined}
          onClick={() => (onOpen ? onOpen() : openNote(songNotePayload(note, context)))}
        >
          {expanded ? 'Close note ×' : 'Read full note →'}
        </button>
      )}
    </div>
  );
}
