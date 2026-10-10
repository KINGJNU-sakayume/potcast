import { useLocation } from 'react-router-dom';
import { useAppServices, useAuthState } from '../app/appContext';
import { useSessionControls } from '../app/sessionControls';
import { useSession } from '../app/sessionContext';
import { useIsMobile } from '../app/useIsMobile';
import { useEngine, usePlayerSelector } from '../playback/hooks';
import { usePreferences } from '../preferences/preferences';
import { BottomSheet } from './BottomSheet';
import { InstallHint } from './mobile/InstallHint';

function sdkLabel(kind: string): string {
  switch (kind) {
    case 'ready':
      return 'Browser device ready';
    case 'loading':
      return 'Starting browser device…';
    case 'reconnecting':
      return 'Reconnecting browser device…';
    case 'error':
      return 'Browser device unavailable';
    default:
      return 'Browser device off';
  }
}

/** The phone's settings sheet. On the desktop the same body opens in the right-hand column. */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <BottomSheet open onClose={onClose} label="Settings" ariaLabel="ARC Music settings" closeLabel="Close settings">
      <SettingsBody />
    </BottomSheet>
  );
}

/** Account, device, translation and (phone) install or (desktop) the keyboard. */
export function SettingsBody() {
  const { config, auth } = useAppServices();
  const authState = useAuthState();
  const controls = useSessionControls();
  const { mode, translation, lyrics } = useSession();
  const engine = useEngine();
  const sdk = usePlayerSelector((s) => s.sdk);
  const device = usePlayerSelector((s) => s.snapshot.device);
  const source = usePlayerSelector((s) => s.snapshot.source);
  const [preferences, setPreferences] = usePreferences();
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  const missing = authState.status === 'signed-in' ? authState.missingScopes : [];

  return (
    <div className="settings-body">
      <div className="label">Spotify</div>
      {mode === 'preview' ? (
        <p>Preview archive · sample data, simulated clock, no audio.</p>
      ) : mobile ? (
        <p>Connected · this phone is the remote. The Spotify app, or another device signed in to your account, plays the audio.</p>
      ) : (
        <p>
          Connected · {sdk.kind === 'error' ? `${sdkLabel(sdk.kind)} — ${sdk.message}` : sdkLabel(sdk.kind)}
          {device && (source === 'sdk' ? ' · playing in this browser' : ` · playing on ${device.name}`)}
        </p>
      )}
      {missing.length > 0 && (
        <p className="settings-error">
          {missing.length} permission(s) are missing for all features.{' '}
          <button type="button" className="note-more" onClick={() => void auth?.beginLogin(pathname)}>
            Reconnect
          </button>
        </p>
      )}
      <div className="settings-actions">
        {mode === 'spotify' && sdk.kind === 'ready' && (
          <button
            type="button"
            className="plain-action"
            onClick={() => {
              engine.activateAudio();
              void engine.transferToBrowser(false);
            }}
          >
            Use browser device
          </button>
        )}
        {mode === 'preview' ? (
          <button type="button" className="plain-action" onClick={controls.exitPreview}>
            {auth ? 'Connect Spotify' : 'Exit preview'}
          </button>
        ) : (
          <button type="button" className="plain-action" onClick={controls.signOut}>
            Disconnect
          </button>
        )}
      </div>

      <div className="label">Lyrics</div>
      <p>
        {lyrics ? `Timed lyrics: ${lyrics.label}` : 'Lyrics are turned off.'}
        {translation ? ` · Translation: ${translation.label} → ${config.translationTarget}` : ' · No translation provider.'}
      </p>
      {translation && (
        <div className="settings-actions">
          <button
            type="button"
            className="plain-action"
            aria-pressed={preferences.translationEnabled}
            onClick={() => setPreferences({ translationEnabled: !preferences.translationEnabled })}
          >
            Translation {preferences.translationEnabled ? 'on' : 'off'}
          </button>
        </div>
      )}
      {mobile ? (
        <InstallHint />
      ) : (
        <>
          <div className="label">Keyboard</div>
          <dl className="settings-keys">
            <div>
              <dt><kbd>/</kbd></dt>
              <dd>Search</dd>
            </div>
            <div>
              <dt><kbd>Space</kbd></dt>
              <dd>Play / pause</dd>
            </div>
            <div>
              <dt><kbd>F</kbd></dt>
              <dd>Focus Mode</dd>
            </div>
            <div>
              <dt>
                <kbd>[</kbd> <kbd>]</kbd>
              </dt>
              <dd>Previous / next release on an album</dd>
            </div>
            <div>
              <dt><kbd>Esc</kbd></dt>
              <dd>Close the note, queue or settings column</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
