import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../app/sessionContext';
import { loadDiscography } from '../discography/loadDiscography';
import type { ReleaseGroup, SearchResults, SearchType } from '../domain/types';
import { isSpotifyId } from '../lib/spotifyUri';
import { drawLikedShuffle } from './likedShuffle';

const MINUTE = 60_000;

/* ── Listener ──────────────────────────────────────────────────────────── */

export function useProfile() {
  const { catalogue } = useSession();
  return useQuery({
    queryKey: [catalogue.mode, 'profile'],
    queryFn: ({ signal }) => catalogue.getProfile(signal),
    staleTime: 60 * MINUTE,
  });
}

/* ── Library surfaces ──────────────────────────────────────────────────── */

export function useRecentlyPlayed() {
  const { catalogue } = useSession();
  return useQuery({
    queryKey: [catalogue.mode, 'recently-played'],
    queryFn: ({ signal }) => catalogue.getRecentlyPlayed(signal),
    staleTime: 30_000,
  });
}

export function useLikedTracks(pageSize = 20) {
  const { catalogue } = useSession();
  return useInfiniteQuery({
    queryKey: [catalogue.mode, 'liked-tracks', pageSize],
    queryFn: ({ pageParam, signal }) => catalogue.getLikedTracks({ offset: pageParam, limit: pageSize }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
    staleTime: 2 * MINUTE,
  });
}

/** A fresh shuffled selection from Liked Songs on every call (see likedShuffle.ts). */
export function useLikedShuffle() {
  const { catalogue } = useSession();
  return useMutation({ mutationFn: (total: number) => drawLikedShuffle(catalogue, total) });
}

export function useFollowedArtists(pageSize = 24) {
  const { catalogue } = useSession();
  return useInfiniteQuery({
    queryKey: [catalogue.mode, 'followed-artists', pageSize],
    queryFn: ({ pageParam, signal }) => catalogue.getFollowedArtists(pageParam, pageSize, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5 * MINUTE,
  });
}

export function useSavedAlbums(pageSize = 24) {
  const { catalogue } = useSession();
  return useInfiniteQuery({
    queryKey: [catalogue.mode, 'saved-albums', pageSize],
    queryFn: ({ pageParam, signal }) => catalogue.getSavedAlbums({ offset: pageParam, limit: pageSize }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
    staleTime: 5 * MINUTE,
  });
}

export function usePlaylists(pageSize = 20) {
  const { catalogue } = useSession();
  return useInfiniteQuery({
    queryKey: [catalogue.mode, 'playlists', pageSize],
    queryFn: ({ pageParam, signal }) => catalogue.getPlaylists({ offset: pageParam, limit: pageSize }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
    staleTime: 5 * MINUTE,
  });
}

/* ── Navigation data ───────────────────────────────────────────────────── */

export function useAlbum(albumId: string | undefined) {
  const { catalogue } = useSession();
  return useQuery({
    queryKey: [catalogue.mode, 'album', albumId],
    queryFn: ({ signal }) => catalogue.getAlbum(albumId!, signal),
    enabled: isSpotifyId(albumId),
    staleTime: 30 * MINUTE,
  });
}

export function useArtist(artistId: string | undefined) {
  const { catalogue } = useSession();
  return useQuery({
    queryKey: [catalogue.mode, 'artist', artistId],
    queryFn: ({ signal }) => catalogue.getArtist(artistId!, signal),
    enabled: isSpotifyId(artistId),
    staleTime: 30 * MINUTE,
  });
}

/**
 * Every release of one group (albums, singles & EPs, compilations or
 * "appears on"), loaded completely so it can be ordered as a chronology.
 * Artist and Album pages share the cache.
 */
export function useDiscography(artistId: string | null | undefined, group: ReleaseGroup, enabled = true) {
  const { catalogue } = useSession();
  return useQuery({
    queryKey: [catalogue.mode, 'discography', artistId, group],
    queryFn: ({ signal }) => loadDiscography(catalogue, artistId!, group, signal),
    enabled: enabled && isSpotifyId(artistId ?? undefined),
    staleTime: 30 * MINUTE,
  });
}

/* ── Search ────────────────────────────────────────────────────────────── */

export const ALL_SEARCH_TYPES: SearchType[] = ['track', 'artist', 'album', 'playlist'];

export function useCatalogueSearch(query: string, types: SearchType[], offset: number, limit: number) {
  const { catalogue } = useSession();
  const trimmed = query.trim();
  return useQuery({
    queryKey: [catalogue.mode, 'search', trimmed, types, offset, limit],
    // The signal aborts superseded requests; TanStack only exposes the latest key's data.
    queryFn: ({ signal }) => catalogue.search({ query: trimmed, types, offset, limit }, signal),
    enabled: trimmed.length > 0,
    staleTime: 5 * MINUTE,
    placeholderData: (previous, previousQuery) =>
      previousQuery && (previousQuery.queryKey[2] as string) === trimmed ? previous : undefined,
  });
}

const SEARCH_PAGE = 10;
/** The schema caps search offsets at 1000. */
const SEARCH_MAX_OFFSET = 1000;

function pageFor(results: SearchResults, type: SearchType) {
  switch (type) {
    case 'track':
      return results.tracks;
    case 'artist':
      return results.artists;
    case 'album':
      return results.albums;
    case 'playlist':
      return results.playlists;
  }
}

/** One result type, paged 10 at a time (Development Mode search limit). */
export function useCatalogueSearchPages(query: string, type: SearchType) {
  const { catalogue } = useSession();
  const trimmed = query.trim();
  return useInfiniteQuery({
    queryKey: [catalogue.mode, 'search-pages', trimmed, type],
    queryFn: ({ pageParam, signal }) =>
      catalogue.search({ query: trimmed, types: [type], offset: pageParam, limit: SEARCH_PAGE }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, _pages, lastOffset) => {
      const page = pageFor(last, type);
      if (!page?.hasMore) return undefined;
      const next = lastOffset + Math.max(page.items.length, 1);
      return next < SEARCH_MAX_OFFSET ? next : undefined;
    },
    enabled: trimmed.length > 0,
    staleTime: 5 * MINUTE,
  });
}

export { pageFor as searchPageFor };

/* ── Library state ─────────────────────────────────────────────────────── */

export function useSavedState(uri: string | null | undefined) {
  const { catalogue } = useSession();
  return useQuery({
    queryKey: [catalogue.mode, 'saved', uri],
    queryFn: async ({ signal }) => (await catalogue.checkSaved([uri!], signal))[0] ?? false,
    enabled: Boolean(uri),
    staleTime: 5 * MINUTE,
  });
}

export function useToggleSaved() {
  const { catalogue } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uri, saved }: { uri: string; saved: boolean }) => catalogue.setSaved([uri], saved),
    onMutate: async ({ uri, saved }) => {
      const key = [catalogue.mode, 'saved', uri];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, saved);
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, { uri }) => {
      void queryClient.invalidateQueries({ queryKey: [catalogue.mode, 'saved', uri] });
      if (uri.startsWith('spotify:album:')) void queryClient.invalidateQueries({ queryKey: [catalogue.mode, 'saved-albums'] });
      if (uri.startsWith('spotify:track:')) void queryClient.invalidateQueries({ queryKey: [catalogue.mode, 'liked-tracks'] });
    },
  });
}
