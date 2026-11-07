import { describe, expect, it } from 'vitest';
import { imageSize } from './imageSize';

describe('imageSize', () => {
  it('reads a PNG header', () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 1400);
    new DataView(png.buffer).setUint32(20, 1400);
    expect(imageSize(png)).toEqual({ width: 1400, height: 1400 });
  });
  it('reads a JPEG frame header after an APP0 segment', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x78, 0x05, 0x78, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 1400, height: 1400 });
  });
  it('returns null for anything else', () => {
    expect(imageSize(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});
