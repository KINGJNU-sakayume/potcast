import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, rgbToHsl } from './contrast';
import { mapPaletteToStageTheme } from './stageTheme';
import type { AlbumPalette } from './types';

const PALETTES: Record<string, AlbumPalette> = {
  pink: { dominant: '#eaa2bf', secondary: '#2d292b', accent: '#f6d8e4', light: '#f0d9df', dark: '#161416' },
  red: { dominant: '#b91f2e', secondary: '#f2e6d0', accent: '#e8b33c', light: '#f7ecdc', dark: '#2a0b0e' },
  navy: { dominant: '#1c2c5a', secondary: '#c9d4ea', accent: '#e1553d', light: '#e8edf6', dark: '#0b1020' },
  grey: { dominant: '#8a8a8a', secondary: '#1a1a1a', accent: '#8a8a8a', light: '#f2f2f2', dark: '#0d0d0d' },
  yellow: { dominant: '#f2d23a', secondary: '#20361f', accent: '#3a7d44', light: '#fbf3c8', dark: '#141a10' },
};

describe('mapPaletteToStageTheme', () => {
  it('returns null without a readable palette', () => {
    expect(mapPaletteToStageTheme(null)).toBeNull();
    expect(mapPaletteToStageTheme({ ...PALETTES.red!, dominant: 'nope' })).toBeNull();
  });

  it.each(Object.entries(PALETTES))('keeps every text token legible on the %s surface', (_name, palette) => {
    const { tokens } = mapPaletteToStageTheme(palette)!;
    const bg = tokens['--bg'];
    expect(contrastRatio(tokens['--ink'], bg)).toBeGreaterThanOrEqual(10);
    expect(contrastRatio(tokens['--ink-2'], bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(tokens['--muted'], bg)).toBeGreaterThanOrEqual(5.2);
    expect(contrastRatio(tokens['--subtle'], bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens['--active'], bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tokens['--active-text'], bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('follows the cover hue and picks the tone from its lightness', () => {
    const red = mapPaletteToStageTheme(PALETTES.red!)!;
    expect(red.tone).toBe('dark');
    const redHue = rgbToHsl(parseHex(red.tokens['--bg'])!).h;
    expect(Math.abs(redHue - rgbToHsl(parseHex('#b91f2e')!).h)).toBeLessThan(4);

    const pink = mapPaletteToStageTheme(PALETTES.pink!)!;
    expect(pink.tone).toBe('light');
    expect(rgbToHsl(parseHex(pink.tokens['--bg'])!).l).toBeGreaterThan(0.75);
  });
});
