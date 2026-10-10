export type SpotifyEntityType = 'track' | 'album' | 'artist' | 'playlist' | 'episode' | 'show' | 'user';

const URI_PATTERN = /^spotify:(track|album|artist|playlist|episode|show|user):([A-Za-z0-9]+)$/;

export function parseSpotifyUri(uri: string | null | undefined): { type: SpotifyEntityType; id: string } | null {
  if (!uri) return null;
  const match = URI_PATTERN.exec(uri);
  if (!match) return null;
  return { type: match[1] as SpotifyEntityType, id: match[2]! };
}

export function idFromUri(uri: string | null | undefined): string | null {
  return parseSpotifyUri(uri)?.id ?? null;
}

export function toSpotifyUri(type: SpotifyEntityType, id: string): string {
  return `spotify:${type}:${id}`;
}

/** Spotify IDs are base-62 strings; used to validate route params before calling the API. */
export function isSpotifyId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{10,32}$/.test(value);
}
