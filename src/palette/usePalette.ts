import { useQuery } from '@tanstack/react-query';
import { paletteCache } from './paletteCache';
import type { AlbumPalette } from './types';

/**
 * Palette for an album, extracted once per album ID (or image URL) and cached.
 * Pass `imageUrl: null` to read only known palettes without extracting.
 */
export function useAlbumPalette(key: string | null | undefined, imageUrl: string | null): AlbumPalette | null {
  return useAlbumPaletteState(key, imageUrl).palette;
}

/** The palette and whether it is still being extracted (so a surface can hold its last colour meanwhile). */
export function useAlbumPaletteState(key: string | null | undefined, imageUrl: string | null): { palette: AlbumPalette | null; pending: boolean } {
  const { data, fetchStatus } = useQuery({
    queryKey: ['palette', key, imageUrl],
    queryFn: () => paletteCache.load(key!, imageUrl),
    enabled: Boolean(key),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60 * 60_000,
    initialData: () => (key ? (paletteCache.peek(key) ?? undefined) : undefined),
  });
  return { palette: data ?? null, pending: !data && fetchStatus === 'fetching' };
}
