import { useSession } from '../../app/sessionContext';
import { useEngine, usePlayerSelector } from '../../playback/hooks';
import type { PlaybackIssue } from '../../playback/types';
import { OPEN_DEVICES_EVENT } from './DevicePicker';

/**
 * Only real problems reach Now Playing (v7.5): a message and a way forward,
 * never a modal and never in the way of playback. Where playback happens,
 * the browser device and the preview's simulated clock are told in Settings.
 *
 * One line, in one place under the play button, the same on Now Playing,
 * in Focus Mode and in the episode: what happened and the one thing to do
 * about it. How to fix it for good folds away under “왜 안 되나요?”.
 */
export function PlaybackNotice() {
  const engine = useEngine();
  const { store } = useSession();
  const issue = usePlayerSelector((s) => s.issue);
  if (!issue) return null;

  const alert = issue.kind !== 'autoplay-blocked' && issue.kind !== 'moved-to-app';
  const retry = () => {
    engine.activateAudio();
    void engine.resume();
  };
  const help = (issue.hints?.length ?? 0) > 0 || Boolean(issue.detail);

  return (
    <div className={alert ? 'playback-state alert' : 'playback-state'} role={alert ? 'alert' : 'status'} data-kind={issue.kind}>
      <div className="notice-line">
        <span className="notice-message">{issue.message}</span>
        <PrimaryAction issue={issue} onRetry={retry} onAppInstead={() => void engine.setBrowserPlayback(false).then(() => engine.resume())} onBrowserAgain={() => void engine.setBrowserPlayback(true)} />
        <button type="button" className="notice-close" aria-label="안내 닫기" title="안내 닫기" onClick={() => store.dispatch({ type: 'issue/clear' })}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {help && (
        <details className="notice-why">
          <summary>왜 안 되나요?</summary>
          {issue.hints && issue.hints.length > 0 && (
            <ul className="notice-hints">
              {issue.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
          {issue.detail && <p className="notice-detail">{issue.detail}</p>}
          {issue.kind === 'playback-failed' && (
            <button type="button" className="notice-action" onClick={retry}>
              이 브라우저에서 다시 시도
            </button>
          )}
        </details>
      )}
    </div>
  );
}

function PrimaryAction({
  issue,
  onRetry,
  onAppInstead,
  onBrowserAgain,
}: {
  issue: PlaybackIssue;
  onRetry: () => void;
  onAppInstead: () => void;
  onBrowserAgain: () => void;
}) {
  switch (issue.kind) {
    case 'autoplay-blocked':
      return (
        <button type="button" className="notice-action" onClick={onRetry}>
          재생 시작
        </button>
      );
    case 'playback-failed':
      return (
        <button
          type="button"
          className="notice-action"
          title="이 브라우저 대신 이 컴퓨터의 Spotify 앱이 재생하고, 이 페이지는 리모컨이 됩니다"
          onClick={onAppInstead}
        >
          Spotify 앱으로 듣기
        </button>
      );
    case 'moved-to-app':
      return (
        <button type="button" className="notice-action" onClick={onBrowserAgain}>
          이 브라우저에서 다시 재생
        </button>
      );
    case 'no-active-device':
      return (
        <button type="button" className="notice-action" onClick={() => window.dispatchEvent(new Event(OPEN_DEVICES_EVENT))}>
          기기 고르기
        </button>
      );
    default:
      return null;
  }
}
