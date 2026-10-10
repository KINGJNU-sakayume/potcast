import { describe, expect, it, vi } from 'vitest';
import { contrastRatio, ensureContrast, parseHex, readableOn, rgbToHsl, toHex } from './contrast';
import { NEUTRAL_BASE, NEUTRAL_TOKENS, PALETTE_ROLE_MAP, mapPaletteToTokens } from './mapPaletteToTokens';
import { PaletteCache } from './paletteCache';
import { derivePalette, quantizePixels } from './quantize';
import type { AlbumPalette } from './types';

function pixels(...blocks: Array<[hex: string, count: number, alpha?: number]>): Uint8ClampedArray {
  const data: number[] = [];
  for (const [hex, count, alpha = 255] of blocks) {
    const { r, g, b } = parseHex(hex)!;
    for (let i = 0; i < count; i += 1) data.push(r, g, b, alpha);
  }
  return new Uint8ClampedArray(data);
}

const IGOR: AlbumPalette = {
  dominant: '#eaa2bf',
  secondary: '#2d292b',
  accent: '#f6d8e4',
  light: '#f0d9df',
  dark: '#161416',
};

describe('contrast', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(contrastRatio(NEUTRAL_BASE.ink, NEUTRAL_BASE.bg)).toBeGreaterThan(15);
  });

  it('adjusts a colour until it reaches the requested ratio, preserving hue', () => {
    const adjusted = ensureContrast('#eaa2bf', NEUTRAL_BASE.bg, 4.5)!;
    expect(contrastRatio(adjusted, NEUTRAL_BASE.bg)).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(rgbToHsl(parseHex(adjusted)!).h - rgbToHsl(parseHex('#eaa2bf')!).h)).toBeLessThan(4);
  });

  it('returns the colour unchanged when it already passes, and null for invalid input', () => {
    expect(ensureContrast('#171917', NEUTRAL_BASE.bg, 4.5)).toBe('#171917');
    expect(ensureContrast('not-a-colour', NEUTRAL_BASE.bg, 3)).toBeNull();
  });

  it('picks the more readable text colour for a surface', () => {
    expect(readableOn('#b91f2e', NEUTRAL_BASE.paper, NEUTRAL_BASE.ink)).toBe(NEUTRAL_BASE.paper);
    expect(readableOn('#eaa2bf', NEUTRAL_BASE.paper, NEUTRAL_BASE.ink)).toBe(NEUTRAL_BASE.ink);
  });

  it('round-trips hex', () => {
    expect(toHex(parseHex('#0a1b2c')!)).toBe('#0a1b2c');
    expect(toHex(parseHex('#abc')!)).toBe('#aabbcc');
  });
});

describe('quantizePixels / derivePalette', () => {
  it('ignores transparent pixels and merges near-identical colours', () => {
    const swatches = quantizePixels(pixels(['#e8a0be', 50], ['#eba3c0', 50], ['#00ff00', 400, 0], ['#161416', 30]));
    expect(swatches).toHaveLength(2);
    expect(swatches[0]!.population).toBe(100);
  });

  it('prefers a characterful colour over a large near-white background for the dominant role', () => {
    const palette = derivePalette(quantizePixels(pixels(['#f7f6f3', 600], ['#b91f2e', 250], ['#101315', 150])));
    expect(palette?.dominant).toBe('#b91f2e');
    expect(parseHex(palette!.dark)).toBeTruthy();
    expect(contrastRatio(palette!.light, '#000000')).toBeGreaterThan(contrastRatio(palette!.dark, '#000000'));
  });

  it('returns null when there is nothing to analyse', () => {
    expect(derivePalette(quantizePixels(new Uint8ClampedArray()))).toBeNull();
  });
});

describe('mapPaletteToTokens', () => {
  it('falls back to neutral tokens when extraction failed', () => {
    expect(mapPaletteToTokens(null)).toEqual(NEUTRAL_TOKENS);
  });

  it('maps the dominant role and guarantees contrast for graphics (3:1) and text (4.5:1)', () => {
    expect(PALETTE_ROLE_MAP.main).toBe('dominant');
    const tokens = mapPaletteToTokens(IGOR);
    expect(contrastRatio(tokens['--main'], NEUTRAL_BASE.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tokens['--main-text'], NEUTRAL_BASE.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('only produces accent tokens — never page, text or separator colours', () => {
    expect(Object.keys(mapPaletteToTokens(IGOR)).sort()).toEqual(
      ['--main', '--main-text'],
    );
  });

  it('uses the ink accent for greyscale artwork', () => {
    const tokens = mapPaletteToTokens({ ...IGOR, dominant: '#8a8a88' });
    expect(tokens['--main']).toBe(NEUTRAL_BASE.ink);
  });

  it('ignores malformed colours', () => {
    expect(mapPaletteToTokens({ ...IGOR, dominant: 'pink' })).toEqual(NEUTRAL_TOKENS);
  });
});

describe('PaletteCache', () => {
  it('extracts once per key, even for concurrent requests', async () => {
    const extract = vi.fn(async () => IGOR);
    const cache = new PaletteCache(null, extract);
    const [a, b] = await Promise.all([cache.load('album1', 'https://img/1'), cache.load('album1', 'https://img/1')]);
    expect(a).toBe(IGOR);
    expect(b).toBe(IGOR);
    await cache.load('album1', 'https://img/1');
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('caches failures as neutral (null) and prefers registered palettes', async () => {
    const extract = vi.fn(async () => {
      throw new Error('tainted canvas');
    });
    const cache = new PaletteCache(null, extract);
    expect(await cache.load('broken', 'https://img/2')).toBeNull();
    expect(cache.peek('broken')).toBeNull();
    cache.register('seeded', IGOR);
    expect(await cache.load('seeded', 'https://img/3')).toBe(IGOR);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('resolves null without an image', async () => {
    const cache = new PaletteCache(null, vi.fn());
    expect(await cache.load('no-art', null)).toBeNull();
  });
});
