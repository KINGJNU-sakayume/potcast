import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '../app/sessionContext';
import { loadDiscography } from '../discography/loadDiscography';
import type { AlbumDetail, AlbumSummary, ReleaseGroup } from '../domain/types';
import { useDigging } from './context';
import { inScope } from './progress';
import { releaseSnapshot, stableJson } from './service';
import { membershipId } from './types';

export function useRememberAlbum(album: AlbumDetail | undefined) {
  const { service, ready } = useDigging();
  const [error, setError] = useState<string | null>(null);
  // The catalogue object is stable in the existing query cache. Never refetch it just to edit records.
  useEffect(() => {
    if (service && ready && album) void service.rememberAlbum(album).then(() => setError(null), () => setError('Could not store this album for personal recording.'));
  }, [service, ready, album]);
  return error;
}

/** The adapter reuses the existing paged discography loader and album query cache, with sequential album requests. */
export function useSyncDigProject(artistId: string) {
  const { catalogue } = useSession();
  const client = useQueryClient();
  const { data, service, ready } = useDigging();
  const project = data.projects.find((p) => p.id === artistId);
  const members = data.memberships.filter((m) => m.artistId === artistId);
  const settings = stableJson({ scope: project?.scope, studioOnly: project?.studioOnly,
    overrides: members.filter((m) => m.override !== 'auto' || m.studio !== null) });
  const query = useQuery({
    queryKey: [catalogue.mode, 'digging-catalogue', artistId, settings],
    enabled: ready && Boolean(project && service), staleTime: 5 * 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const releases: Array<{ album: AlbumSummary | AlbumDetail; group: ReleaseGroup }> = [];
      let complete = true;
      for (const group of ['album', 'single', 'compilation', 'appears_on'] as const) {
        if (!project?.scope[group] && group !== 'album') continue;
        const discography = await client.fetchQuery({
          queryKey: [catalogue.mode, 'discography', artistId, group],
          queryFn: () => loadDiscography(catalogue, artistId, group, signal), staleTime: 30 * 60_000,
        });
        if (project?.scope[group]) complete = complete && discography.complete;
        for (const summary of discography.releases) releases.push({ album: summary, group });
      }
      for (const m of members.filter((m) => m.override === 'include')) {
        const release = data.releases.find((r) => r.id === m.albumId);
        if (release && !releases.some((r) => r.album.id === release.id)) releases.push({ album: release, group: m.group });
      }
      for (const release of releases) {
        const m = members.find((m) => m.albumId === release.album.id) ?? { id: membershipId(artistId, release.album.id), artistId, albumId: release.album.id, group: release.group, override: 'auto' as const, studio: null };
        if (!project || !inScope(project, m, releaseSnapshot(release.album))) continue;
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        try {
          release.album = await client.fetchQuery({
            queryKey: [catalogue.mode, 'album', release.album.id],
            queryFn: () => catalogue.getAlbum(release.album.id, signal), staleTime: 30 * 60_000,
          });
        } catch (error) {
          if (signal.aborted) throw error;
          // Keep the summary; progress explicitly remains incomplete until every sequence is known.
        }
      }
      return { releases, complete };
    },
  });
  useEffect(() => {
    if (query.data && service) void service.syncCatalogue(artistId, query.data.releases, query.data.complete).catch(() => undefined);
  }, [query.data, service, artistId]);
  return query;
}
