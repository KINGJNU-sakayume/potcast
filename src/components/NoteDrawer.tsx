import { useEffect, useRef, useState } from 'react';
import { NoteContent } from './NoteContent';
import { useNote, type NotePayload } from './NoteContext';
import { SideDrawer } from './SideDrawer';

/** The single, app-level note drawer shared by Artist, Album and Song notes (Now Playing shows its song note in-page). */
export function NoteDrawer() {
  const { note, closeNote } = useNote();
  // Keep the last note while the drawer slides out.
  const [shown, setShown] = useState<NotePayload | null>(note);
  useEffect(() => {
    if (note) setShown(note);
  }, [note]);
  // Each note opens at its top, not where the previous one was scrolled to.
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (note && shown === note) topRef.current?.closest('.side-drawer-body, .m-sheet-body')?.scrollTo?.({ top: 0 });
  }, [note, shown]);

  return (
    <SideDrawer open={Boolean(note)} onClose={closeNote} label="Archive note" labelledBy="note-drawer-title" closeLabel="Close note">
      <NoteContent note={shown} titleId="note-drawer-title" topRef={topRef} />
    </SideDrawer>
  );
}
