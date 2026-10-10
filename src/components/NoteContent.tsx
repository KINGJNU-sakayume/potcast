import type { Ref } from 'react';
import { NoteBody, isSafeUrl } from './NoteBody';
import type { NotePayload } from './NoteContext';

function NoteFoot({ note }: { note: NotePayload | null }) {
  const dates = [note?.written && `Written ${note.written}`, note?.updated && `Revised ${note.updated}`].filter(Boolean).join(' · ');
  return (
    <div className="note-drawer-foot">
      <div>Personal Music Archive / Notes{dates && <span className="note-drawer-dates"> · {dates}</span>}</div>
      {note?.sources && note.sources.length > 0 && (
        <ol className="note-sources" aria-label="Sources">
          {note.sources.map((source) => (
            <li key={source}>
              {isSafeUrl(source) ? (
                <a href={source} target="_blank" rel="noopener noreferrer">
                  {source.replace(/^https?:\/\/(www\.)?/i, '')}
                </a>
              ) : (
                source
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * A note's reading layout: context kicker, title, subtitle, rule, the long
 * form, then dates and sources. Shared by the app-level drawer and Now
 * Playing's in-page note column.
 */
export function NoteContent({ note, titleId, topRef }: { note: NotePayload | null; titleId: string; topRef?: Ref<HTMLDivElement> }) {
  return (
    <>
      <div ref={topRef} className="note-drawer-context">
        {note?.context}
      </div>
      <h2 id={titleId} className="note-drawer-title" lang={note?.titleLang}>
        {note?.title}
      </h2>
      {note?.subtitle && <div className="note-drawer-subtitle">{note.subtitle}</div>}
      <div className="note-drawer-rule" />
      <div className="note-drawer-copy" lang="ko">
        {note?.copy && <NoteBody markdown={note.copy} />}
        {note?.extra}
      </div>
      <NoteFoot note={note} />
    </>
  );
}
