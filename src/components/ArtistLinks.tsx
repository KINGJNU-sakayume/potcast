import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { ArtistRef } from '../domain/types';

/** "Artist A, Artist B", each name linking to its Artist page. */
export function ArtistLinks({ artists, className = 'linkish' }: { artists: readonly ArtistRef[]; className?: string }) {
  return (
    <>
      {artists.map((artist, index) => (
        <Fragment key={`${artist.id}-${index}`}>
          {index > 0 && ', '}
          {artist.id ? (
            <Link className={className} to={`/artist/${artist.id}`}>
              {artist.name}
            </Link>
          ) : (
            artist.name
          )}
        </Fragment>
      ))}
    </>
  );
}
