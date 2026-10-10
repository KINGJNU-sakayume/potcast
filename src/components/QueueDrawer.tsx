import { useQuery } from '@tanstack/react-query';
import { useSession } from '../app/sessionContext';
import type { TrackIdentity } from '../domain/types';
import { joinArtistNames } from '../lib/format';
import { useEngine, usePlayerSelector } from '../playback/hooks';
import { describeSpotifyError } from '../spotify/errors';
import { TrackIndexRow } from './IndexRow';
import { SideDrawer } from './SideDrawer';

function contextLabel(context: { type: string; name: string | null } | null, track: TrackIdentity | null): string | null {
  if (!context) return null;
  if (context.name) return context.name;
  if (context.type === 'album' && track) return `Album · ${track.album.name}`;
  if (context.type === 'playlist') return 'a playlist';
  if (context.type === 'artist' && track) return `Artist · ${joinArtistNames(track.artists)}`;
  return null;
}

/** The real Spotify queue in the phone's queue sheet. */
export function QueueDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SideDrawer open={open} onClose={onClose} label="Playback" labelledBy="queue-title" closeLabel="Close queue">
      <QueueContent open={open} />
    </SideDrawer>
  );
}

/** The real Spotify queue: the phone's sheet and the desktop's right-hand column. Informational: the Web API cannot reorder it. */
export function QueueContent({ open }: { open: boolean }) {
  const engine = useEngine();
  const { mode } = useSession();
  const track = usePlayerSelector((s) => s.snapshot.track);
  const paused = usePlayerSelector((s) => s.snapshot.paused);
  const context = usePlayerSelector((s) => s.snapshot.context);

  const queue = useQuery({
    queryKey: [mode, 'queue', track?.spotifyTrackId ?? null],
    queryFn: () => engine.getQueue(),
    enabled: open,
    staleTime: 5_000,
  });

  const from = contextLabel(context, track);

  return (
    <>
      <div className="note-drawer-context">Queue / Spotify</div>
      <h2 id="queue-title" className="note-drawer-title">
        Queue
      </h2>
      {from && <div className="note-drawer-subtitle">Playing from {from}</div>}
      <div className="note-drawer-rule" />

      <div className="label queue-label">Now playing</div>
      {track ? (
        <ol className="index-list queue-list">
          <TrackIndexRow track={track} position={0} current={{ playing: !paused }} />
        </ol>
      ) : (
        <p className="queue-note">Nothing is playing.</p>
      )}

      <div className="label queue-label">Next up</div>
      {queue.isPending && open ? (
        <p className="queue-note" role="status">
          Reading the queue from Spotify…
        </p>
      ) : queue.isError ? (
        <p className="queue-note" role="alert">
          {describeSpotifyError(queue.error).body}
        </p>
      ) : queue.data && queue.data.upNext.length > 0 ? (
        <ol className="index-list queue-list">
          {queue.data.upNext.slice(0, 40).map((item, index) => (
            <TrackIndexRow key={`${item.uri}-${index}`} track={item} position={index + 1} />
          ))}
        </ol>
      ) : (
        <p className="queue-note">The queue is empty.</p>
      )}

      <div className="note-drawer-foot">Spotify’s Web API lists the queue but cannot reorder it</div>
    </>
  );
}
