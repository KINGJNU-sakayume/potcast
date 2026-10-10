import { useSession } from '../../app/sessionContext';
import { useEngine, usePlayerSelector } from '../../playback/hooks';
import { OPEN_DEVICES_EVENT } from './DevicePicker';

/**
 * Only real problems reach Now Playing (v7.5): a message and a way forward,
 * never a modal and never in the way of playback. Where playback happens,
 * the browser device and the preview's simulated clock are told in Settings.
 */
export function PlaybackNotice() {
  const engine = useEngine();
  const { store } = useSession();
  const issue = usePlayerSelector((s) => s.issue);
  if (!issue) return null;

  const alert = issue.kind !== 'autoplay-blocked' && issue.kind !== 'moved-to-app';
  return (
    <div className={alert ? 'playback-state alert' : 'playback-state'} role={alert ? 'alert' : 'status'}>
      <span>{issue.message}</span>
      {(issue.kind === 'autoplay-blocked' || issue.kind === 'playback-failed') && (
        <button
          type="button"
          className="notice-action"
          onClick={() => {
            engine.activateAudio();
            void engine.resume();
          }}
        >
          {issue.kind === 'autoplay-blocked' ? 'Start audio' : 'Try again'}
        </button>
      )}
      {issue.kind === 'playback-failed' && (
        <button
          type="button"
          className="notice-action"
          title="Stop playing in this browser: the Spotify app on this computer plays, and this page is its remote"
          onClick={() => void engine.setBrowserPlayback(false).then(() => engine.resume())}
        >
          Use the Spotify app instead
        </button>
      )}
      {issue.kind === 'moved-to-app' && (
        <button type="button" className="notice-action" onClick={() => void engine.setBrowserPlayback(true)}>
          Play in this browser again
        </button>
      )}
      {issue.kind === 'no-active-device' && (
        <button type="button" className="notice-action" onClick={() => window.dispatchEvent(new Event(OPEN_DEVICES_EVENT))}>
          Choose device
        </button>
      )}
      <button type="button" className="notice-action" onClick={() => store.dispatch({ type: 'issue/clear' })}>
        Dismiss
      </button>
      {issue.hints && issue.hints.length > 0 && (
        <ul className="notice-hints">
          {issue.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      {issue.detail && <p className="notice-detail">{issue.detail}</p>}
    </div>
  );
}
