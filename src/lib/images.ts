import type { ImageRef } from '../domain/types';

/**
 * Picks the smallest image that is at least `minSize` px wide (Spotify returns
 * images widest-first). Falls back to the largest available image.
 */
export function pickImage(images: readonly ImageRef[] | undefined, minSize: number): ImageRef | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  let choice: ImageRef = sorted[0]!;
  for (const image of sorted) {
    if (image.width === null || image.width >= minSize) choice = image;
  }
  return choice;
}

export function pickImageUrl(images: readonly ImageRef[] | undefined, minSize: number): string | null {
  return pickImage(images, minSize)?.url ?? null;
}
