import { describe, expect, it } from 'vitest';
import { artworkAt, baseTitle } from './apple';

describe('apple helpers', () => {
  it('rewrites the artwork size and refuses other URLs', () => {
    const u = 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/x.jpg/100x100bb.jpg';
    expect(artworkAt(u, 1400)).toBe(u.replace('100x100bb', '1400x1400bb'));
    expect(artworkAt('https://is1-ssl.mzstatic.com/a/b.jpg', 1400)).toBeNull();
  });
  it('ignores edition suffixes when comparing titles', () => {
    expect(baseTitle('My Beautiful Dark Twisted Fantasy (Deluxe Edition)')).toBe(baseTitle('My Beautiful Dark Twisted Fantasy'));
    expect(baseTitle('AUSTIN (Bonus)')).toBe('austin');
    expect(baseTitle('Fetch The Bolt Cutters')).toBe(baseTitle('Fetch the Bolt Cutters'));
  });
});
