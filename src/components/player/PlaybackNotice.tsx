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
 * about it. How to fix it for good folds away under “Why doesn’t it play?”.
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
        <button type="button" className="notice-close" aria-label="Dismiss" title="Dismiss" onClick={() => store.dispatch({ type: 'issue/clear' })}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {help && (
        <details className="notice-why">
          <summary>Why doesn’t it play?</summary>
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
              Try again in this browser
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
          Start audio
        </button>
      );
    case 'playback-failed':
      return (
        <button
          type="button"
          className="notice-action"
          title="Stop playing in this browser: the Spotify app on this computer plays, and this page is its remote"
          onClick={onAppInstead}
        >
          Use the Spotify app
        </button>
      );
    case 'moved-to-app':
      return (
        <button type="button" className="notice-action" onClick={onBrowserAgain}>
          Play in this browser again
        </button>
      );
    case 'no-active-device':
      return (
        <button type="button" className="notice-action" onClick={() => window.dispatchEvent(new Event(OPEN_DEVICES_EVENT))}>
          Choose device
        </button>
      );
    default:
      return null;
  }
}
