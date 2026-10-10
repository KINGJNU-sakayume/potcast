import { describe, expect, it } from 'vitest';
import { seeded } from '../test/random';
import { shuffled } from './shuffle';

describe('shuffled', () => {
  it('returns a permutation without changing the input', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const result = shuffled(input, seeded(7));
    expect(input).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect([...result].sort((a, b) => a - b)).toEqual(input);
    expect(result).not.toEqual(input);
  });
});
