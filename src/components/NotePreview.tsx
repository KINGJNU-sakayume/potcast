import type { EditorialBody, NoteKind } from '../editorial/types';
import { useNote } from './NoteContext';

const KIND_LABEL: Record<NoteKind, string> = { ARTIST: 'Artist', ALBUM: 'Album', SONG: 'Song' };

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
  const { openNote } = useNote();
  if (!note?.short.trim()) return null;
  const heading = kind === 'SONG' ? 'Listening note' : 'Editorial note';
  return (
    <div className={className ? `note-preview ${className}` : 'note-preview'}>
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
          onClick={() =>
            openNote({
              context: `${heading} / ${KIND_LABEL[kind]}`,
              title,
              subtitle,
              copy: note.full ?? '',
              titleLang,
              written: note.written,
              updated: note.updated,
              sources: note.sources,
            })
          }
        >
          Read full note →
        </button>
      )}
    </div>
  );
}
