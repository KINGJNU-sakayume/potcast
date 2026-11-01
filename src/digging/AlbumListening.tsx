import { useCallback, useEffect, useState } from 'react';
import type { AlbumDetail } from '../domain/types';
import { useDigging } from './context';
import { PersonalEditor } from './PersonalEditor';
import { reviewId } from './types';

export function AlbumListening({ album }: { album: AlbumDetail }) {
  const { data, ready, error, accountId } = useDigging();
  const review = data.reviews.find((r) => r.id === reviewId('album', album.id));
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => setOpen(false), [accountId]);
  return <section className="dig-album-listening" aria-label="My listening">
    <div className="label">MY LISTENING</div>
    {review && <p className="dig-review-line">
      {review.rating !== null && <span aria-label={`Personal rating ${review.rating} out of 5`}>★ {review.rating.toFixed(1)}</span>}
      {review.favoriteAt && <span aria-label="Personal favorite">♡</span>}
      <span>{review.summary || review.note.split('\n')[0]}</span>
    </p>}
    <button className="note-more" type="button" disabled={!ready} onClick={() => setOpen(true)}>{review ? '개인 감상 편집' : '개인 감상 작성'}</button>
    {error && <p className="dig-help" role="status">{error}</p>}
    {open && <PersonalEditor key={accountId} kind="album" subjectId={album.id} title={album.name} albumId={album.id} artistId={album.artists[0]?.id ?? ''} onClose={close} />}
  </section>;
}
