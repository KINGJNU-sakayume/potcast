import type { EditorialBody, NoteKind } from '../editorial/types';
import { useNote, type NotePayload } from './NoteContext';

const KIND_LABEL: Record<NoteKind, string> = { ARTIST: 'Artist', ALBUM: 'Album', SONG: 'Song' };

/** The full note as the side panel opens it. */
export function notePayload(
  kind: NoteKind,
  note: EditorialBody,
  meta: { title: string; subtitle?: string; titleLang?: string; anchor?: string },
): NotePayload {
  const heading = kind === 'SONG' ? 'Listening note' : 'Editorial note';
  return {
    context: `${heading} / ${KIND_LABEL[kind]}`,
    title: meta.title,
    subtitle: meta.subtitle,
    copy: note.full ?? '',
    titleLang: meta.titleLang,
    written: note.written,
    updated: note.updated,
    sources: note.sources,
    anchor: meta.anchor,
  };
}

/**
 * The v7 note preview: hairline divider, kicker with the context token, a
 * short paragraph and "Read full note →". Renders nothing when the entity has
 * no local note.
 */
export function NotePreview({
  kind,
  note,
  title,
  subtitle,
  titleLang,
  className,
}: {
  kind: NoteKind;
  note: EditorialBody | null | undefined;
  title: string;
  subtitle?: string;
  titleLang?: string;
  className?: string;
}) {
  const { note: openOne, openNote, closeNote } = useNote();
  if (!note?.short.trim()) return null;
  const heading = kind === 'SONG' ? 'Listening note' : 'Editorial note';
  // The full note is open beside the page: the preview says so and its button closes it.
  const open = openOne !== null && openOne.title === title && openOne.context === `${heading} / ${KIND_LABEL[kind]}`;
  return (
    <div className={className ? `note-preview ${className}` : 'note-preview'} data-open={open ? '' : undefined}>
      <div className="note-kicker">
        <span>{heading}</span>
        <span className="index">{kind}</span>
      </div>
      <p lang="ko">{note.short}</p>
      {note.full?.trim() && (
        <button
          type="button"
          className="note-more"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? closeNote() : openNote(notePayload(kind, note, { title, subtitle, titleLang })))}
        >
          {open ? 'Close note' : 'Read full note →'}
        </button>
      )}
    </div>
  );
}
