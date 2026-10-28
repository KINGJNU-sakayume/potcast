import { getAlbumNote, type AlbumQuery } from '../editorial/lookup';
import { getEpisodeScript } from '../episode/episodes';

/**
 * The marks for what this archive adds to Spotify: a note, and an episode.
 * One fixed bordered form on every page and theme, in the same place —
 * Album, Artist, Search, Library and Archive.
 */
export function Badge({ kind, title }: { kind: 'note' | 'episode'; title?: string }) {
  return (
    <span className="badge" data-kind={kind} title={title ?? (kind === 'note' ? '노트가 있음' : '진행자와 듣는 에피소드가 있음')}>
      {kind === 'note' ? '노트' : '에피소드'}
    </span>
  );
}

/** Whether an album has an album note and an episode written for it. */
export function albumMarks(query: AlbumQuery): { noted: boolean; episode: boolean } {
  const note = getAlbumNote(query);
  return { noted: note !== null, episode: getEpisodeScript(note?.key) !== null };
}

/** The note and episode badges of an album, or nothing. */
export function AlbumBadges({ noted, episode }: { noted: boolean; episode: boolean }) {
  if (!noted && !episode) return null;
  return (
    <span className="badges">
      {noted && <Badge kind="note" />}
      {episode && <Badge kind="episode" />}
    </span>
  );
}
