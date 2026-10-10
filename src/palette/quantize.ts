import { colourDistance, mix, relativeLuminance, rgbToHsl, toHex, type Rgb } from './contrast';
import type { AlbumPalette } from './types';

export interface Swatch {
  rgb: Rgb;
  population: number;
}

export interface QuantizeOptions {
  maxSwatches?: number;
  /** Colours closer than this (redmean distance) merge into one swatch. */
  mergeDistance?: number;
}

/** Pure colour quantisation of RGBA pixel data (4-bit buckets, then greedy merge). */
export function quantizePixels(data: ArrayLike<number>, options: QuantizeOptions = {}): Swatch[] {
  const maxSwatches = options.maxSwatches ?? 10;
  const mergeDistance = options.mergeDistance ?? 60;
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] ?? 255) < 125) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const colours = [...buckets.values()]
    .map((bucket) => ({
      rgb: { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count },
      population: bucket.count,
    }))
    .sort((a, b) => b.population - a.population);

  const swatches: Swatch[] = [];
  for (const colour of colours) {
    const near = swatches.find((s) => colourDistance(s.rgb, colour.rgb) < mergeDistance);
    if (near) {
      const total = near.population + colour.population;
      near.rgb = mix(near.rgb, colour.rgb, colour.population / total);
      near.population = total;
    } else {
      swatches.push({ rgb: { ...colour.rgb }, population: colour.population });
    }
  }

  return swatches
    .sort((a, b) => b.population - a.population)
    .slice(0, maxSwatches)
    .map((s) => ({ rgb: { r: Math.round(s.rgb.r), g: Math.round(s.rgb.g), b: Math.round(s.rgb.b) }, population: s.population }));
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

function lightnessWeight(l: number): number {
  if (l < 0.1 || l > 0.93) return 0.12;
  if (l < 0.18 || l > 0.86) return 0.5;
  return 1;
}

/** Assigns semantic roles to swatches. Pure; returns null when there is nothing to work with. */
export function derivePalette(swatches: readonly Swatch[]): AlbumPalette | null {
  if (swatches.length === 0) return null;
  const total = swatches.reduce((sum, s) => sum + s.population, 0) || 1;
  const enriched = swatches.map((s) => {
    const hsl = rgbToHsl(s.rgb);
    return { ...s, share: s.population / total, hsl, luminance: relativeLuminance(s.rgb) };
  });

  // Dominant: prominent *and* characterful — population weighted by saturation, penalising near-white/black.
  const score = (s: (typeof enriched)[number]) => s.share * (0.25 + s.hsl.s) * lightnessWeight(s.hsl.l);
  const dominant = [...enriched].sort((a, b) => score(b) - score(a))[0]!;

  const others = enriched.filter((s) => s !== dominant);
  const secondary =
    [...others].filter((s) => colourDistance(s.rgb, dominant.rgb) > 90).sort((a, b) => b.share - a.share)[0] ?? null;
  const accent =
    [...others]
      .filter((s) => s.share >= 0.01 && colourDistance(s.rgb, dominant.rgb) > 70)
      .sort((a, b) => b.hsl.s * Math.sqrt(b.share) - a.hsl.s * Math.sqrt(a.share))[0] ?? null;

  const lightest = [...enriched].sort((a, b) => b.luminance - a.luminance)[0]!;
  const darkest = [...enriched].sort((a, b) => a.luminance - b.luminance)[0]!;

  return {
    dominant: toHex(dominant.rgb),
    secondary: toHex(secondary?.rgb ?? mix(dominant.rgb, dominant.hsl.l > 0.5 ? BLACK : WHITE, 0.45)),
    accent: toHex(accent?.rgb ?? secondary?.rgb ?? dominant.rgb),
    light: toHex(mix(lightest.rgb, WHITE, lightest.hsl.l < 0.8 ? 0.55 : 0.15)),
    dark: toHex(mix(darkest.rgb, BLACK, darkest.hsl.l > 0.2 ? 0.55 : 0)),
  };
}
