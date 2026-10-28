import { getAlbumNote, type AlbumQuery } from '../editorial/lookup';
import { getEpisodeScript } from '../episode/episodes';

const LABEL = { note: 'Note', episode: 'Episode' } as const;

/**
 * What this archive adds to Spotify — a note, an episode — marked like a
 * footnote: a small raised `note` or `ep` right after the title. The same
 * form, colour and place on Album, Artist, Search, Library and Archive.
 */
export function Badge({ kind }: { kind: 'note' | 'episode' }) {
  return (
    <sup className="mark" data-kind={kind} title={LABEL[kind]} aria-label={LABEL[kind]}>
      {kind === 'note' ? 'note' : 'ep'}
    </sup>
  );
}

/** Whether an album has an album note and an episode written for it. */
export function albumMarks(query: AlbumQuery): { noted: boolean; episode: boolean } {
  const note = getAlbumNote(query);
  return { noted: note !== null, episode: getEpisodeScript(note?.key) !== null };
}

/** The note and episode marks of an album, or nothing. */
export function AlbumBadges({ noted, episode }: { noted: boolean; episode: boolean }) {
  if (!noted && !episode) return null;
  return (
    <span className="marks">
      {noted && <Badge kind="note" />}
      {episode && <Badge kind="episode" />}
    </span>
  );
}
