import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAlbumPaletteState } from '../palette/usePalette';
import { DESKTOP_STAGE_NAMES, stageVars, type StageVars } from './useStageTheme';

/** The image whose colour paints a page: a cover, or an artist's photograph. */
export interface SurfaceSource {
  /** Palette cache key: the album id, or `artist:<id>`. */
  key: string;
  imageUrl: string | null;
}

type SetSurface = (source: SurfaceSource | null) => void;

const SurfaceContext = createContext<SetSurface | null>(null);

/**
 * Declares the image that colours the current page (v7.5: each page takes
 * the colour of its own image). Pages without one — Library, Archive —
 * stay on the warm paper. Outside the desktop shell this does nothing.
 */
export function usePageSurface(source: SurfaceSource | null): void {
  const setSurface = useContext(SurfaceContext);
  const key = source?.key ?? null;
  const imageUrl = source?.imageUrl ?? null;
  useEffect(() => {
    if (!setSurface) return;
    setSurface(key ? { key, imageUrl } : null);
    return () => setSurface(null);
  }, [setSurface, key, imageUrl]);
}

/**
 * Holds the page's surface source and turns it into player1's stage tokens
 * under player2's names. Null means paper: the base tokens plus the playing
 * album's accent (AccentTokens).
 */
export function SurfaceProvider({ children }: { children: (stage: StageVars | null) => ReactNode }) {
  const [source, setSource] = useState<SurfaceSource | null>(null);
  const { palette, pending } = useAlbumPaletteState(source?.key ?? null, source?.imageUrl ?? null);
  const next = useMemo(() => (source ? stageVars(palette, DESKTOP_STAGE_NAMES) : null), [source, palette]);
  // While the next page's colour is being read, keep the last one instead of flashing to paper.
  const last = useRef<StageVars | null>(null);
  const stage = source ? (next ?? (pending ? last.current : null)) : null;
  useEffect(() => {
    last.current = stage;
  });
  return <SurfaceContext.Provider value={setSource}>{children(stage)}</SurfaceContext.Provider>;
}
