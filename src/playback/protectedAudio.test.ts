import { describe, expect, it } from 'vitest';
import { probeProtectedAudio } from './protectedAudio';

function granting(...keySystems: string[]): Navigator['requestMediaKeySystemAccess'] {
  return async (keySystem) => {
    if (keySystems.includes(keySystem)) return {} as MediaKeySystemAccess;
    throw new DOMException('Unsupported keySystem', 'NotSupportedError');
  };
}

describe('probeProtectedAudio', () => {
  it('accepts any key system that grants protected AAC audio', async () => {
    expect(await probeProtectedAudio(granting('com.widevine.alpha'))).toBe(true);
    expect(await probeProtectedAudio(granting('com.apple.fps'))).toBe(true);
  });

  it('reports browsers that refuse every key system or have no EME at all', async () => {
    expect(await probeProtectedAudio(granting())).toBe(false);
    expect(await probeProtectedAudio(undefined)).toBe(false);
  });
});
