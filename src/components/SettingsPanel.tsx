import { useLocation } from 'react-router-dom';
import { useAppServices, useAuthState } from '../app/appContext';
import { useSessionControls } from '../app/sessionControls';
import { useSession } from '../app/sessionContext';
import { useIsMobile } from '../app/useIsMobile';
import { EpisodeSettings } from '../episode/EpisodeSettings';
import { useDeviceStatus } from '../playback/deviceStatus';
import { useEngine, usePlayerSelector } from '../playback/hooks';
import { usePreferences } from '../preferences/preferences';
import { BottomSheet } from './BottomSheet';
import { InstallHint } from './mobile/InstallHint';

/** The phone's settings sheet. On the desktop the same body opens in the right-hand column. */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <BottomSheet open onClose={onClose} label="Settings" ariaLabel="ARC Music settings" closeLabel="Close settings">
      <SettingsBody />
    </BottomSheet>
  );
}

/** Account, device, translation, episodes and (phone) install or (desktop) the keyboard. */
export function SettingsBody() {
  const { config, auth } = useAppServices();
  const authState = useAuthState();
  const controls = useSessionControls();
  const { mode, translation, lyrics } = useSession();
  const engine = useEngine();
  const sdk = usePlayerSelector((s) => s.sdk);
  const deviceStatus = useDeviceStatus();
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
        <p className="settings-device" data-tone={deviceStatus.tone}>
          연결됨 · 재생 기기: <b>{deviceStatus.label}</b>
          {deviceStatus.detail && ` · ${deviceStatus.detail}`}
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
      {mode === 'spotify' && !mobile && (
        <p className="fineprint">
          {sdk.kind === 'disabled'
            ? 'Play and pause here; the Spotify app on this computer (or the device you choose in the device menu) makes the sound. Open the Spotify app first.'
            : 'If this browser cannot play Spotify’s protected (DRM) audio — some shared computers cannot — let the Spotify app installed on the computer play, with this page as its remote.'}
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
        {mode === 'spotify' && !mobile && (
          <button type="button" className="plain-action" aria-pressed={sdk.kind === 'disabled'} onClick={() => void engine.setBrowserPlayback(sdk.kind === 'disabled')}>
            {sdk.kind === 'disabled' ? 'Play in this browser again' : 'Play through the Spotify app'}
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
      <EpisodeSettings />
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
