import { derivePalette, quantizePixels } from './quantize';
import type { AlbumPalette } from './types';

const SAMPLE_SIZE = 48;

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Spotify's image CDN serves CORS headers; without them the canvas would be tainted.
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    const abort = () => {
      image.src = '';
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      signal?.removeEventListener('abort', abort);
      resolve(image);
    };
    image.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Album art could not be loaded'));
    };
    image.src = url;
  });
}

/**
 * Extracts semantic colour roles from album art by sampling a downscaled copy.
 * Resolves null on any failure (missing art, CORS, no canvas) so callers fall
 * back to the neutral tokens.
 */
export async function extractAlbumPalette(imageUrl: string, signal?: AbortSignal): Promise<AlbumPalette | null> {
  try {
    const image = await loadImage(imageUrl, signal);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return derivePalette(quantizePixels(data));
  } catch {
    return null;
  }
}
