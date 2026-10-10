import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface NotePayload {
  /** Optional identity, e.g. `track:<id>` for the playing song's note, so a page can tell its own note is open. */
  id?: string;
  /** e.g. "Editorial note / Album". */
  context: string;
  title: string;
  subtitle?: string;
  /** Long-form note text (the Markdown subset NoteBody renders). */
  copy: string;
  /** Rendered after the copy, for notes that carry more than text (a song's "번역에 대하여" section). */
  extra?: ReactNode;
  /** BCP 47 language of the title, for CJK glyph selection. */
  titleLang?: string;
  /** Quiet foot: when the note was written / revised and what it relies on. */
  written?: string;
  updated?: string;
  sources?: string[];
}

interface NoteContextValue {
  note: NotePayload | null;
  openNote: (note: NotePayload) => void;
  closeNote: () => void;
}

const NoteContext = createContext<NoteContextValue | null>(null);

/** Drawer state is UI state: opening or closing a note never touches playback. */
export function NoteProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<NotePayload | null>(null);
  const openNote = useCallback((payload: NotePayload) => setNote(payload), []);
  const closeNote = useCallback(() => setNote(null), []);
  const value = useMemo(() => ({ note, openNote, closeNote }), [note, openNote, closeNote]);
  return <NoteContext.Provider value={value}>{children}</NoteContext.Provider>;
}

export function useNote(): NoteContextValue {
  const value = useContext(NoteContext);
  if (!value) throw new Error('useNote must be used within NoteProvider.');
  return value;
}
