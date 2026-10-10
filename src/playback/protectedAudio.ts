/**
 * Every Spotify track is DRM-protected, so the Web Playback SDK can only play
 * in a browser that grants a key system (Widevine in Chrome, Edge and
 * Firefox; PlayReady or FairPlay elsewhere) for AAC audio.
 */
const KEY_SYSTEMS = [
  'com.widevine.alpha',
  'com.microsoft.playready.recommendation',
  'com.microsoft.playready',
  'com.apple.fps',
  'com.apple.fps.1_0',
];

const AUDIO_CONFIG: MediaKeySystemConfiguration[] = [
  { audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] },
];

/**
 * Whether the browser grants any key system for protected audio. A browser
 * with protected content turned off, without a DRM module, or an in-app
 * browser answers false. Used to explain playback failures — never to block
 * playback, since a false answer cannot be ruled out for every browser.
 */
export async function probeProtectedAudio(
  request: Navigator['requestMediaKeySystemAccess'] | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.requestMediaKeySystemAccess?.bind(navigator),
): Promise<boolean> {
  if (typeof request !== 'function') return false;
  for (const keySystem of KEY_SYSTEMS) {
    try {
      await request(keySystem, AUDIO_CONFIG);
      return true;
    } catch {
      // Not granted: try the next key system.
    }
  }
  return false;
}
