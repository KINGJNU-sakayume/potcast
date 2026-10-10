/**
 * Authorization Code with PKCE primitives (RFC 7636).
 * The verifier uses the unreserved character set; the challenge is
 * BASE64URL(SHA-256(verifier)) without padding.
 */

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

type RandomBytes = (length: number) => Uint8Array;

const cryptoRandom: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/** Uniformly random string over `charset` (rejection sampling avoids modulo bias). */
export function randomString(length: number, charset: string = UNRESERVED, random: RandomBytes = cryptoRandom): string {
  const limit = 256 - (256 % charset.length);
  let out = '';
  while (out.length < length) {
    for (const byte of random(Math.max(16, (length - out.length) * 2))) {
      if (byte >= limit) continue;
      out += charset[byte % charset.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function generateCodeVerifier(length = 64): string {
  if (length < 43 || length > 128) throw new RangeError('PKCE code verifier must be 43–128 characters');
  return randomString(length);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateState(): string {
  return randomString(32);
}
