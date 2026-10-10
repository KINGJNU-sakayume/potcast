import type { PlaybackIssue } from './types';

const REMOTE_HINT =
  'Or open Spotify on this computer or your phone and choose it in the device menu — this page controls it as a remote.';

/**
 * The notice shown after the engine stops a runaway skip (see SKIP_LOOP in
 * spotifyEngine.ts). `protectedAudio` is the result of probeProtectedAudio():
 * false means the browser grants no DRM at all, true that DRM exists but
 * Spotify's licence or audio requests failed.
 */
export function describeSkipLoop(
  protectedAudio: boolean,
  sdkMessage: string | null,
): Pick<PlaybackIssue, 'message' | 'hints' | 'detail'> {
  const detail = sdkMessage ? `Spotify reported: ${sdkMessage}` : undefined;
  if (!protectedAudio) {
    return {
      message:
        'Spotify skipped tracks without playing them: this browser can’t play protected (DRM) audio. Playback is paused.',
      hints: [
        'Allow protected content — Chrome or Edge: Settings → Privacy and security → Site settings → Protected content; Firefox: Settings → Play DRM-controlled content.',
        'Use an up-to-date Chrome, Edge or Firefox rather than an in-app browser (KakaoTalk, Instagram and the like).',
        REMOTE_HINT,
      ],
      detail,
    };
  }
  return {
    message:
      'Spotify skipped tracks without playing them: this browser couldn’t get a playback licence for the audio (Widevine DRM). Playback is paused.',
    hints: [
      'Update the DRM module: open chrome://components (edge://components in Edge), choose “Check for update” under Widevine Content Decryption Module, then restart the browser.',
      'Turn off ad blockers and privacy extensions for this site — they can block Spotify’s licence and audio requests.',
      REMOTE_HINT,
    ],
    detail,
  };
}
