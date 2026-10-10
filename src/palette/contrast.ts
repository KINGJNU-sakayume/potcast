/** Colour utilities: WCAG 2.x contrast and lightness adjustments that preserve hue. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
}

function toRgb(color: string | Rgb): Rgb {
  if (typeof color !== 'string') return color;
  const parsed = parseHex(color);
  if (!parsed) throw new Error(`Invalid hex colour: ${color}`);
  return parsed;
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(toRgb(a));
  const lb = relativeLuminance(toRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  return { r: hue(p, q, hn + 1 / 3) * 255, g: hue(p, q, hn) * 255, b: hue(p, q, hn - 1 / 3) * 255 };
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, Math.max(0, alpha))})`;
}

/**
 * Returns `color`, darkened or lightened (hue and saturation preserved) until
 * it reaches `minRatio` against `background`; null if that is impossible.
 */
export function ensureContrast(color: string, background: string, minRatio: number): string | null {
  const rgb = parseHex(color);
  const bg = parseHex(background);
  if (!rgb || !bg) return null;
  if (contrastRatio(rgb, bg) >= minRatio) return toHex(rgb);

  const hsl = rgbToHsl(rgb);
  const darken = relativeLuminance(bg) > 0.18;
  for (let step = 1; step <= 50; step += 1) {
    const l = darken ? hsl.l - step * 0.02 : hsl.l + step * 0.02;
    if (l < 0 || l > 1) break;
    const candidate = hslToRgb({ ...hsl, l });
    if (contrastRatio(candidate, bg) >= minRatio) return toHex(candidate);
  }
  return null;
}

/** Whichever of the two text colours reads better on `background`. */
export function readableOn(background: string, light: string, dark: string): string {
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/** Perceptual-ish RGB distance ("redmean"). */
export function colourDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}
