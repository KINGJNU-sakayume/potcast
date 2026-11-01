import { localTokenStore } from '../auth/tokenStore';
import type { CatalogueSource } from '../catalogue/CatalogueSource';
import { storageKey } from '../lib/storageNamespace';
import { isSpotifyApiError } from '../spotify/errors';

const BINDING = storageKey('digging.account-binding.v1');
/** An offline account binding is valid only for the exact authenticated credential set. No credentials are stored here. */
async function credentialFingerprint(): Promise<string | null> {
  const tokens = localTokenStore.load();
  if (!tokens || !globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${tokens.accessToken}\n${tokens.refreshToken ?? ''}`));
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function resolveDigAccount(catalogue: CatalogueSource): Promise<string> {
  if (catalogue.mode === 'preview') return 'preview';
  try {
    const profile = await catalogue.getProfile();
    if (!profile.accountId) throw new Error('Spotify did not provide an account ID. Personal records remain locked.');
    const fingerprint = await credentialFingerprint();
    if (fingerprint) {
      try { localStorage.setItem(BINDING, JSON.stringify({ fingerprint, accountId: profile.accountId })); } catch { /* Online identity still works. */ }
    }
    return `spotify:${profile.accountId}`;
  } catch (error) {
    // Authentication and permission failures must never fall back to another listener's stored identity.
    const networkFailure = (isSpotifyApiError(error) && error.kind === 'network') || error instanceof TypeError;
    if (networkFailure) {
      const fingerprint = await credentialFingerprint();
      try {
        const binding = JSON.parse(localStorage.getItem(BINDING) ?? 'null') as { fingerprint?: string; accountId?: string } | null;
        if (fingerprint && binding?.fingerprint === fingerprint && binding.accountId) return `spotify:${binding.accountId}`;
      } catch { /* Fail closed. */ }
    }
    throw error;
  }
}
