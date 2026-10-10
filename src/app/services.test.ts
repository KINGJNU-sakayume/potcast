import { describe, expect, it } from 'vitest';
import { SpotifyApiError } from '../spotify/errors';
import { shouldRetry } from './services';

const error = (kind: SpotifyApiError['kind'], retryAfterMs?: number) =>
  new SpotifyApiError({ kind, status: 0, message: kind, endpoint: '/x', retryAfterMs });

describe('query retry policy', () => {
  it('retries transient failures a limited number of times', () => {
    expect(shouldRetry(0, error('network'))).toBe(true);
    expect(shouldRetry(1, error('server'))).toBe(true);
    expect(shouldRetry(2, error('server'))).toBe(false);
  });

  it('waits out short rate limits but surfaces long or unknown ones immediately', () => {
    expect(shouldRetry(0, error('rate-limited', 5_000))).toBe(true);
    expect(shouldRetry(0, error('rate-limited', 120_000))).toBe(false);
    expect(shouldRetry(0, error('rate-limited'))).toBe(false);
  });

  it('never retries client errors', () => {
    expect(shouldRetry(0, error('not-found'))).toBe(false);
    expect(shouldRetry(0, error('unauthorized'))).toBe(false);
    expect(shouldRetry(0, error('forbidden'))).toBe(false);
  });
});
