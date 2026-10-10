import { useEffect } from 'react';
import { pickImageUrl } from '../lib/images';
import { mapPaletteToTokens } from '../palette/mapPaletteToTokens';
import { useAlbumPalette } from '../palette/usePalette';
import { usePlayerSelector } from '../playback/hooks';

/**
 * Sets the v7 accent (`--main` and friends) from the cover of the album that
 * is playing — extracted once per album and cached, contrast-checked against
 * the warm page. Surfaces, text and separators stay neutral.
 */
export function AccentTokens() {
  const track = usePlayerSelector((state) => state.snapshot.track);
  const albumId = track?.album.id || null;
  // A 64 px image is plenty for a 48 px sample and keeps extraction cheap.
  const imageUrl = track ? pickImageUrl(track.album.images, 64) : null;
  const palette = useAlbumPalette(albumId, imageUrl);

  useEffect(() => {
    const root = document.documentElement;
    for (const [property, value] of Object.entries(mapPaletteToTokens(palette))) root.style.setProperty(property, value);
  }, [palette]);

  return null;
}
