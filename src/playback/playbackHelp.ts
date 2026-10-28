import type { PlaybackIssue } from './types';

const REMOTE_HINT =
  '또는 이 컴퓨터나 휴대폰에서 Spotify를 열고 기기 메뉴에서 고르세요 — 이 페이지가 리모컨이 됩니다.';

/**
 * The notice shown after the engine stops a runaway skip (see SKIP_LOOP in
 * spotifyEngine.ts). `protectedAudio` is the result of probeProtectedAudio():
 * false means the browser grants no DRM at all, true that DRM exists but
 * Spotify's licence or audio requests failed.
 *
 * The message is the one line the listener sees; the hints and what Spotify
 * reported fold away under “왜 안 되나요?”.
 */
export function describeSkipLoop(
  protectedAudio: boolean,
  sdkMessage: string | null,
): Pick<PlaybackIssue, 'message' | 'hints' | 'detail'> {
  const detail = sdkMessage ? `Spotify 응답: ${sdkMessage}` : undefined;
  if (!protectedAudio) {
    return {
      message: '이 브라우저에선 재생할 수 없어요 — 보호된(DRM) 음원을 지원하지 않습니다.',
      hints: [
        '보호된 콘텐츠를 허용하세요 — Chrome·Edge: 설정 → 개인정보 보호 및 보안 → 사이트 설정 → 보호된 콘텐츠, Firefox: 설정 → DRM 제어 콘텐츠 재생.',
        '카카오톡·인스타그램 같은 앱 안 브라우저가 아니라 최신 Chrome·Edge·Firefox를 쓰세요.',
        REMOTE_HINT,
      ],
      detail,
    };
  }
  return {
    message: '이 브라우저에선 재생할 수 없어요 — 음원 재생 라이선스(Widevine DRM)를 받지 못했습니다.',
    hints: [
      'DRM 모듈을 업데이트하세요: chrome://components(Edge는 edge://components)에서 Widevine Content Decryption Module의 “업데이트 확인”을 누른 뒤 브라우저를 다시 시작합니다.',
      '이 사이트에서 광고 차단·개인정보 보호 확장 프로그램을 끄세요 — Spotify의 라이선스·음원 요청을 막을 수 있습니다.',
      REMOTE_HINT,
    ],
    detail,
  };
}
