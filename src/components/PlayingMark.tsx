/** Small "currently playing" bars in the album accent. */
export function PlayingMark({ playing }: { playing: boolean }) {
  return (
    <span className="playing-mark" data-playing={playing || undefined} role="img" aria-label={playing ? 'Playing' : 'Paused'}>
      <span />
      <span />
      <span />
    </span>
  );
}
