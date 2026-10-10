import { describe, expect, it } from 'vitest';
import { BoundedCache } from './boundedCache';

describe('BoundedCache', () => {
  it('stores values including null, and expires them after their TTL', () => {
    let now = 0;
    const cache = new BoundedCache<string | null>({ prefix: 'bc1:', maxEntries: 5, now: () => now });
    cache.set('a', 'value', 1000);
    cache.set('b', null, 1000);
    expect(cache.get('a')).toBe('value');
    expect(cache.get('b')).toBeNull();
    expect(cache.get('missing')).toBeUndefined();
    now = 1500;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entries beyond its size bound', () => {
    let now = 0;
    const cache = new BoundedCache<number>({ prefix: 'bc2:', maxEntries: 2, now: () => now });
    for (const key of ['x', 'y', 'z']) {
      now += 10;
      cache.set(key, now, 60_000);
    }
    expect(cache.get('x')).toBeUndefined();
    expect(cache.get('y')).toBe(20);
    expect(cache.get('z')).toBe(30);
  });
});
