import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { shortcutBlocked } from '../app/shortcuts';
import { useDiscography } from '../catalogue/queries';
import { adjacentReleases, curatedSequence, sortChronologically } from '../discography/chronology';
import { groupEditions, type EditionGroup } from '../discography/editions';
import type { AlbumDetail } from '../domain/types';
import { getArtistNote } from '../editorial/lookup';
import { releaseYear } from '../lib/format';
import { detectLineLanguage } from '../translation/languageDetect';

const GROUP_LABEL: Record<AlbumDetail['albumType'], string> = { album: 'Albums', single: 'Singles & EPs', compilation: 'Compilations' };

function Neighbour({ group, direction }: { group: EditionGroup | null; direction: 'prev' | 'next' }) {
  const label = direction === 'prev' ? '← Previous' : 'Next →';
  if (!group) {
    return <span className={`discography-step ${direction} is-edge`}>{direction === 'prev' ? 'The first release' : 'The latest release'}</span>;
  }
  const release = group.primary;
  const year = releaseYear(release.releaseDate);
  return (
    <Link className={`discography-step ${direction}`} to={`/album/${release.id}`} rel={direction} aria-keyshortcuts={direction === 'prev' ? '[' : ']'}>
      <span className="label">
        {label}
        {year && ` · ${year}`}
      </span>
      <b lang={detectLineLanguage(release.name)}>{release.name}</b>
    </Link>
  );
}

/**
 * Where this release sits in its artist's discography, with the releases
 * before and after it — finish the sequence, move on to the next record.
 * `[` and `]` step through. For albums, the artist note's `discography:`
 * list sets the order when this release is on it (so a live album can be
 * left out); otherwise the order is chronological. Hidden when the release is not one of the
 * artist's own (e.g. an appearance), is their only one, or the discography
 * cannot be read.
 */
export function DiscographyNav({ album }: { album: AlbumDetail }) {
  const navigate = useNavigate();
  const artist = album.artists[0];
  const discography = useDiscography(artist?.id, album.albumType);
  const curated = album.albumType === 'album' ? getArtistNote({ id: artist?.id, name: artist?.name })?.discography : undefined;
  const adjacent = useMemo(() => {
    if (!discography.data) return null;
    const groups = groupEditions(discography.data.releases);
    return (
      (curated && adjacentReleases(curatedSequence(groups, curated), album.id)) ?? adjacentReleases(sortChronologically(groups), album.id)
    );
  }, [discography.data, album.id, curated]);

  const previousId = adjacent?.previous?.primary.id;
  const nextId = adjacent?.next?.primary.id;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return;
      const target = event.key === '[' ? previousId : event.key === ']' ? nextId : undefined;
      if (!target) return;
      event.preventDefault();
      navigate(`/album/${target}`);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previousId, nextId, navigate]);

  if (!artist || !adjacent || adjacent.total < 2) return null;
  const groupParam = album.albumType === 'album' ? '' : `?group=${album.albumType}`;
  return (
    <nav className="discography-nav" aria-label="Discography">
      <div className="discography-nav-head">
        <span>Discography</span>
        <span>
          {String(adjacent.position).padStart(2, '0')} / {String(adjacent.total).padStart(2, '0')} · {GROUP_LABEL[album.albumType]} ·{' '}
          <Link className="linkish" to={`/artist/${artist.id}${groupParam}`}>
            {artist.name}
          </Link>
        </span>
      </div>
      <div className="discography-steps">
        <Neighbour group={adjacent.previous} direction="prev" />
        <Neighbour group={adjacent.next} direction="next" />
      </div>
    </nav>
  );
}
