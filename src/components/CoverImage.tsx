import { useState, type CSSProperties } from 'react';
import type { ImageRef } from '../domain/types';
import { pickImageUrl } from '../lib/images';
import { readableOn } from '../palette/contrast';
import { NEUTRAL_BASE } from '../palette/mapPaletteToTokens';
import { useAlbumPalette } from '../palette/usePalette';

interface CoverImageProps {
  images: readonly ImageRef[];
  /** Rendered size in CSS px; picks a sharp but small image. */
  size: number;
  alt: string;
  /** Printed on the plate that replaces missing or broken artwork. */
  title: string;
  subtitle?: string;
  /** Album ID: lets the plate use a known palette. */
  paletteKey?: string;
  /** The soft accent glow behind large covers. */
  shadow?: boolean;
  priority?: boolean;
  className?: string;
}

/** Square album art in the v7 frame. Missing art becomes a quiet archive plate. */
export function CoverImage({ images, size, alt, title, subtitle, paletteKey, shadow = false, priority = false, className }: CoverImageProps) {
  const url = pickImageUrl(images, size * 2);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && failedUrl !== url;

  return (
    <div className={className ? `cover-frame ${className}` : 'cover-frame'}>
      {shadow && <div className="cover-shadow" />}
      {showImage ? (
        <img
          className="cover"
          src={url}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <CoverPlate title={title} subtitle={subtitle} paletteKey={paletteKey} label={alt ? `${alt} (artwork unavailable)` : null} />
      )}
    </div>
  );
}

function CoverPlate({ title, subtitle, paletteKey, label }: { title: string; subtitle?: string; paletteKey?: string; label: string | null }) {
  // Only palettes that are already known (cached or seeded); never extracts.
  const palette = useAlbumPalette(paletteKey, null);
  const style = palette
    ? ({ '--plate-bg': palette.dominant, '--plate-ink': readableOn(palette.dominant, NEUTRAL_BASE.paper, NEUTRAL_BASE.ink) } as CSSProperties)
    : undefined;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <div className="cover cover-plate" style={style} {...a11y}>
      <span className="cover-plate-mark" aria-hidden="true">ARC</span>
      <span className="cover-plate-title" aria-hidden="true">{title}</span>
      {subtitle && <span className="cover-plate-subtitle" aria-hidden="true">{subtitle}</span>}
    </div>
  );
}

/** Artist photograph; the v7 monogram plate when Spotify has no image. */
export function Portrait({ images, name, size = 390 }: { images: readonly ImageRef[]; name: string; size?: number }) {
  const url = pickImageUrl(images, size * 2);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && failedUrl !== url;
  const monogram = Array.from(name.trim())[0]?.toUpperCase() ?? 'A';
  return (
    <div className={showImage ? 'artist-portrait has-image' : 'artist-portrait'} data-monogram={monogram}>
      {showImage ? (
        <img src={url} alt={`${name}, artist portrait`} decoding="async" onError={() => setFailedUrl(url)} />
      ) : (
        <span className="visually-hidden">{`${name} (no artist image)`}</span>
      )}
    </div>
  );
}
