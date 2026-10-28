import { useCallback, useEffect, type Ref } from 'react';
import { useEngine, usePlay, usePlayerSelector } from '../playback/hooks';
import { NoteBody, isSafeUrl, sectionId } from './NoteBody';
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
 * Playing a moment a song note names: a seek when the song is already
 * playing, else the song from that moment. Nothing for notes about no song.
 */
function useNoteMoments(note: NotePayload | null): ((ms: number) => void) | undefined {
  const engine = useEngine();
  const play = usePlay();
  const playingId = usePlayerSelector((s) => s.snapshot.track?.spotifyTrackId ?? null);
  const ids = note?.trackIds;
  const onTime = useCallback(
    (ms: number) => {
      if (!ids?.length) return;
      if (playingId && ids.includes(playingId)) {
        void engine.seek(ms);
        return;
      }
      play({ uris: [`spotify:track:${ids[0]}`], positionMs: ms });
    },
    [engine, play, playingId, ids],
  );
  return ids?.length ? onTime : undefined;
}

/**
 * A note's reading layout: context kicker, title, subtitle, rule, the long
 * form, then dates and sources. Shared by the app-level drawer and Now
 * Playing's in-page note column.
 */
export function NoteContent({
  note,
  titleId,
  topRef,
  showContext = true,
}: {
  note: NotePayload | null;
  titleId: string;
  topRef?: Ref<HTMLDivElement>;
  /** False where the column's own head already says what kind of note this is. */
  showContext?: boolean;
}) {
  const onTime = useNoteMoments(note);
  const copy = note?.copy ?? '';
  const anchor = note?.anchor ?? '';

  // Opened at a section (an era of the discography): bring its heading into view.
  useEffect(() => {
    if (!anchor) return;
    const id = sectionId(copy, anchor);
    if (id) document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
  }, [copy, anchor]);

  return (
    <>
      {showContext && (
        <div ref={topRef} className="note-drawer-context">
          {note?.context}
        </div>
      )}
      <h2 id={titleId} className="note-drawer-title" lang={note?.titleLang}>
        {note?.title}
      </h2>
      {note?.subtitle && <div className="note-drawer-subtitle">{note.subtitle}</div>}
      <div className="note-drawer-rule" />
      <div className="note-drawer-copy" lang="ko">
        {note?.copy && <NoteBody markdown={note.copy} contents onTime={onTime} />}
        {note?.extra}
      </div>
      <NoteFoot note={note} />
    </>
  );
}
