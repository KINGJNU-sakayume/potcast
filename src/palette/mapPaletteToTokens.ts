import { ensureContrast, parseHex, rgbToHsl } from './contrast';
import type { AlbumPalette } from './types';

/**
 * The ARC v7 base. Must match src/styles/base.css. Album colour never
 * replaces these: page surface, paper, text and separators always stay the
 * warm neutral archive.
 */
export const NEUTRAL_BASE = {
  bg: '#f1eee6',
  paper: '#f8f5ee',
  ink: '#171917',
} as const;

/** The v7 reference accent, used until an album colour is known. */
export const DEFAULT_ACCENT = '#b91f2e';

/**
 * Which palette role drives the accent. This is the single place that decides
 * album-colour usage — components only read the resulting CSS variables.
 * `secondary`, `accent`, `light` and `dark` are extracted and cached but
 * deliberately unused (v7 keeps colour to one restrained semantic accent).
 */
export const PALETTE_ROLE_MAP = {
  /** Active rail marker, note context token, current-row tint, the glow behind album art. */
  main: 'dominant',
} as const satisfies Record<string, keyof AlbumPalette>;

export interface PaletteTokens {
  /** Marks and graphics (≥ 3:1 on the page). */
  '--main': string;
  /** Accent-coloured text (≥ 4.5:1 on the page). */
  '--main-text': string;
}

export const NEUTRAL_TOKENS: PaletteTokens = { '--main': DEFAULT_ACCENT, '--main-text': DEFAULT_ACCENT };

/** A greyscale cover gets the neutral ink accent rather than an invented colour. */
const INK_TOKENS: PaletteTokens = { '--main': NEUTRAL_BASE.ink, '--main-text': NEUTRAL_BASE.ink };

/** Below this saturation a colour reads as grey. */
const MIN_ACCENT_SATURATION = 0.14;

/**
 * Maps a palette to the accent tokens with contrast guarantees: `--main`
 * reaches 3:1 (WCAG 1.4.11, non-text UI) and `--main-text` 4.5:1 against the
 * page background; otherwise the neutral tokens are used.
 */
export function mapPaletteToTokens(palette: AlbumPalette | null): PaletteTokens {
  if (!palette) return NEUTRAL_TOKENS;
  const source = palette[PALETTE_ROLE_MAP.main];
  const rgb = parseHex(source);
  if (!rgb) return NEUTRAL_TOKENS;
  if (rgbToHsl(rgb).s < MIN_ACCENT_SATURATION) return INK_TOKENS;

  const main = ensureContrast(source, NEUTRAL_BASE.bg, 3);
  const mainText = ensureContrast(source, NEUTRAL_BASE.bg, 4.5);
  return main && mainText ? { '--main': main, '--main-text': mainText } : NEUTRAL_TOKENS;
}
