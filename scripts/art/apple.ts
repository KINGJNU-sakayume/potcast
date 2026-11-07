import { normaliseTitle } from '../../src/editorial/lookup';

/** `…/100x100bb.jpg` → `…/1400x1400bb.jpg` (an undocumented Apple convention); null when the URL has no such size. */
export function artworkAt(url: string, px: number): string | null {
  return /\/\d+x\d+bb\.\w+$/.test(url) ? url.replace(/\/\d+x\d+bb(\.\w+)$/, `/${px}x${px}bb$1`) : null;
}

/** A title without edition words, so "IGOR (Deluxe)" and "IGOR" compare equal. */
export const baseTitle = (title: string) =>
  normaliseTitle(title).replace(/\s*[([][^)\]]*(deluxe|edition|remaster|version|expanded|anniversary|bonus)[^)\]]*[)\]]/g, '').trim();
