import { useEffect, useMemo, type CSSProperties } from 'react';
import { pickImageUrl } from '../lib/images';
import { NEUTRAL_BASE } from '../palette/mapPaletteToTokens';
import { mapPaletteToStageTheme, type StageToken, type StageTone } from '../palette/stageTheme';
import type { AlbumPalette } from '../palette/types';
import { useAlbumPalette } from '../palette/usePalette';
import { usePlayerSelector } from '../playback/hooks';

export interface StageVars {
  tone: StageTone;
  /** The album-coloured surface, for `theme-color`. */
  background: string;
  /** Custom properties: `--s-*` for the phone stylesheet, player2's own token names on the desktop. */
  style: CSSProperties;
}

/** player1's stage tokens under the names the phone stylesheet reads. */
const STAGE_NAMES = {
  '--bg': '--s-bg',
  '--paper': '--s-paper',
  '--surface': '--s-surface',
  '--surface-strong': '--s-surface-strong',
  '--ink': '--s-ink',
  '--ink-2': '--s-ink-2',
  '--muted': '--s-muted',
  '--subtle': '--s-dim',
  '--line': '--s-line',
  '--line-2': '--s-line-soft',
  '--active': '--s-main',
  '--active-text': '--s-main-text',
  '--cover-shadow': '--s-shadow',
  '--stage-glow': '--s-glow',
} as const satisfies Partial<Record<StageToken, string>>;

/** The same tokens under player2's own names: the desktop paints the whole page with them. */
export const DESKTOP_STAGE_NAMES = {
  '--bg': '--bg',
  '--paper': '--paper',
  '--surface': '--surface',
  '--surface-strong': '--surface-strong',
  '--ink': '--ink',
  '--ink-2': '--ink-2',
  '--muted': '--muted',
  '--subtle': '--dim',
  '--line': '--line',
  '--line-2': '--line-soft',
  '--active': '--main',
  '--active-text': '--main-text',
  '--cover-shadow': '--cover-shadow',
  '--stage-glow': '--stage-glow',
} as const satisfies Partial<Record<StageToken, string>>;

/** A palette's stage theme as inline custom properties under the given names; null when the cover could not be read. */
export function stageVars(palette: AlbumPalette | null, names: Partial<Record<StageToken, string>>): StageVars | null {
  const theme = mapPaletteToStageTheme(palette);
  if (!theme) return null;
  const style: Record<string, string> = {};
  for (const [from, to] of Object.entries(names)) style[to] = theme.tokens[from as StageToken];
  return { tone: theme.tone, background: theme.tokens['--bg'], style: style as CSSProperties };
}

/**
 * The playing album's colour as a whole surface (player1's stage theme). Null
 * until the cover has been read, or when it cannot be; the phone stylesheet
 * then keeps its neutral stage.
 */
export function useStageTheme(): StageVars | null {
  const track = usePlayerSelector((state) => state.snapshot.track);
  const albumId = track?.album.id || null;
  // A 64 px image is plenty for a 48 px sample and keeps extraction cheap.
  const imageUrl = track ? pickImageUrl(track.album.images, 64) : null;
  const palette = useAlbumPalette(albumId, imageUrl);

  return useMemo(() => stageVars(palette, STAGE_NAMES), [palette]);
}

/** Keeps the browser chrome (status bar, Safari toolbar) the colour of the surface behind it. */
export function useThemeColor(color: string | null): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = color ?? NEUTRAL_BASE.bg;
    return () => {
      meta.content = previous;
    };
  }, [color]);
}
