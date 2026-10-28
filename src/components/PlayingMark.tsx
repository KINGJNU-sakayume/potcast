/** Small "currently playing" bars in the album accent; two still bars (a pause sign) when the music is not sounding. */
export function PlayingMark({ playing }: { playing: boolean }) {
  return (
    <span className="playing-mark" data-playing={playing || undefined} data-stopped={playing ? undefined : ''} role="img" aria-label={playing ? 'Playing' : 'Paused'}>
      <span />
      <span />
      <span />
    </span>
  );
}
