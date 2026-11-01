import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localTokenStore } from '../auth/tokenStore';
import type { CatalogueSource } from '../catalogue/CatalogueSource';
import { SpotifyApiError } from '../spotify/errors';
import { resolveDigAccount } from './identity';

const source = (getProfile: CatalogueSource['getProfile']) => ({ mode: 'spotify', getProfile }) as CatalogueSource;
const tokens = (id: string) => ({ accessToken: `test-access-${id}`, refreshToken: `test-refresh-${id}`, expiresAt: Date.now() + 3600_000, scopes: [] });
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); localTokenStore.save(tokens('a')); });
afterEach(() => vi.unstubAllGlobals());

describe('account identity for offline personal records', () => {
  it('uses the verified Spotify subject, then permits offline access for the same credentials', async () => {
    expect(await resolveDigAccount(source(async () => ({ displayName: 'A', accountId: 'a' })))).toBe('spotify:a');
    expect(await resolveDigAccount(source(async () => { throw new TypeError('Offline'); }))).toBe('spotify:a');
    expect(JSON.stringify(localStorage.getItem('potcast.digging.account-binding.v1'))).not.toContain('test-access');
    expect(JSON.stringify(localStorage.getItem('potcast.digging.account-binding.v1'))).not.toContain('test-refresh');
  });

  it('locks records after account credentials change or disappear until identity is verified again', async () => {
    await resolveDigAccount(source(async () => ({ displayName: 'A', accountId: 'a' })));
    localTokenStore.save(tokens('b'));
    await expect(resolveDigAccount(source(async () => { throw new TypeError('Offline'); }))).rejects.toThrow('Offline');
    expect(await resolveDigAccount(source(async () => ({ displayName: 'B', accountId: 'b' })))).toBe('spotify:b');
    localTokenStore.clear();
    await expect(resolveDigAccount(source(async () => { throw new TypeError('Offline'); }))).rejects.toThrow('Offline');
  });

  it('does not fall back on authentication failures or a missing subject', async () => {
    await resolveDigAccount(source(async () => ({ displayName: 'A', accountId: 'a' })));
    await expect(resolveDigAccount(source(async () => { throw new SpotifyApiError({ kind: 'unauthorized', status: 401, endpoint: '/me', message: 'Unauthorized' }); }))).rejects.toThrow('Unauthorized');
    await expect(resolveDigAccount(source(async () => ({ displayName: 'No ID' })))).rejects.toThrow('account ID');
  });

  it('keeps preview identity separate and never consults Spotify for it', async () => {
    const getProfile = vi.fn();
    expect(await resolveDigAccount({ mode: 'preview', getProfile } as unknown as CatalogueSource)).toBe('preview');
    expect(getProfile).not.toHaveBeenCalled();
  });
});
