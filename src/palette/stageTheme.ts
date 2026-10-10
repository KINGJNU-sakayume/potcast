import { contrastRatio, ensureContrast, hslToRgb, mix, parseHex, readableOn, rgbToHsl, toHex, withAlpha, type Hsl } from './contrast';
import type { AlbumPalette } from './types';

/**
 * Now Playing surface theme: the whole screen takes the album's colour.
 * Covers with a light dominant colour get a pale tinted surface with dark
 * ink; everything else gets a deep tinted surface with light ink. Every text
 * token is contrast-checked against the derived background, so the page
 * stays as readable as the neutral base.
 */

export type StageTone = 'light' | 'dark';

export interface StageTheme {
  tone: StageTone;
  tokens: Record<StageToken, string>;
}

export const STAGE_TOKENS = [
  '--bg',
  '--paper',
  '--surface',
  '--surface-strong',
  '--ink',
  '--ink-2',
  '--muted',
  '--subtle',
  '--faint',
  '--line',
  '--line-2',
  '--line-strong',
  '--focus',
  '--active',
  '--active-text',
  '--on-active',
  '--active-soft',
  '--cover-shadow',
  '--stage-glow',
] as const;

export type StageToken = (typeof STAGE_TOKENS)[number];

/** Dominant colours lighter than this get the pale surface. */
const LIGHT_DOMINANT = 0.64;
/** Below this saturation the cover is effectively greyscale. */
const GREY = 0.08;
/** Minimum contrast between the surface and pure white/black, leaving room for tinted ink. */
const SURFACE_HEADROOM = 13;

const hex = (hsl: Hsl) => toHex(hslToRgb(hsl));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A tone between `ink` and `bg` that still reaches `ratio` against `bg`. */
function between(ink: string, bg: string, t: number, ratio: number): string {
  const blended = toHex(mix(parseHex(ink)!, parseHex(bg)!, t));
  return ensureContrast(blended, bg, ratio) ?? ink;
}

export function mapPaletteToStageTheme(palette: AlbumPalette | null): StageTheme | null {
  const dominant = palette ? parseHex(palette.dominant) : null;
  if (!palette || !dominant) return null;

  const base = rgbToHsl(dominant);
  const grey = base.s < GREY;
  const tone: StageTone = base.l >= LIGHT_DOMINANT ? 'light' : 'dark';
  const s = grey ? base.s : clamp(base.s, 0.22, tone === 'light' ? 0.58 : 0.52);
  const h = base.h;

  let bgL = tone === 'light' ? clamp(base.l, 0.8, 0.88) : clamp(base.l * 0.62, 0.13, 0.24);
  // Bright hues (yellow, green) carry more luminance at the same lightness:
  // move the surface until white (dark tone) or black (light tone) text has headroom.
  const extreme = tone === 'light' ? '#000000' : '#ffffff';
  while (bgL > 0.06 && bgL < 0.95 && contrastRatio(hex({ h, s, l: bgL }), extreme) < SURFACE_HEADROOM) {
    bgL += tone === 'light' ? 0.01 : -0.01;
  }
  const lift = tone === 'light' ? 0.035 : 0.045;
  const bg = hex({ h, s, l: bgL });
  const paper = hex({ h, s, l: bgL + lift });
  const surface = hex({ h, s, l: tone === 'light' ? bgL - 0.05 : bgL + 0.08 });
  const surfaceStrong = hex({ h, s, l: tone === 'light' ? bgL - 0.09 : bgL + 0.13 });

  const inkSeed = hex({ h, s: grey ? 0 : 0.28, l: tone === 'light' ? 0.09 : 0.97 });
  const ink = ensureContrast(inkSeed, bg, 10) ?? readableOn(bg, '#ffffff', '#000000');
  const ink2 = between(ink, bg, 0.22, 7);
  const muted = between(ink, bg, 0.34, 5.2);
  const subtle = between(ink, bg, 0.42, 4.5);
  const faint = between(ink, bg, 0.62, 2.4);

  // Accent: the most characterful other colour of the cover, made legible on the surface.
  const accentSource = [palette.accent, palette.secondary, palette.light]
    .map((c) => ({ c, rgb: parseHex(c) }))
    .find(({ rgb }) => rgb && rgbToHsl(rgb).s >= 0.2 && contrastRatio(rgb, bg) >= 1.6)?.c;
  const active = (accentSource && ensureContrast(accentSource, bg, 3)) ?? ink;
  const activeText = (accentSource && ensureContrast(accentSource, bg, 4.5)) ?? ink;

  // Soft light across the surface: a brighter tint of the cover colour, never grey.
  const glow = hex({
    h,
    s: grey ? s : clamp(base.s, 0.3, 0.62),
    l: tone === 'light' ? 0.93 : clamp(bgL + 0.14, 0.26, 0.4),
  });

  return {
    tone,
    tokens: {
      '--bg': bg,
      '--paper': paper,
      '--surface': surface,
      '--surface-strong': surfaceStrong,
      '--ink': ink,
      '--ink-2': ink2,
      '--muted': muted,
      '--subtle': subtle,
      '--faint': faint,
      '--line': withAlpha(ink, tone === 'light' ? 0.16 : 0.2),
      '--line-2': withAlpha(ink, tone === 'light' ? 0.08 : 0.1),
      '--line-strong': withAlpha(ink, tone === 'light' ? 0.32 : 0.38),
      '--focus': ink,
      '--active': active,
      '--active-text': activeText,
      '--on-active': readableOn(active, bg, ink),
      '--active-soft': withAlpha(active, 0.14),
      '--cover-shadow': tone === 'light' ? withAlpha(hex({ h, s, l: 0.22 }), 0.34) : 'rgba(0, 0, 0, 0.5)',
      '--stage-glow': withAlpha(glow, tone === 'light' ? 0.7 : 0.6),
    },
  };
}
