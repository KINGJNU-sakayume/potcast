import { useLocation } from 'react-router-dom';
import { useAppServices, useAuthState } from './appContext';

/** Shown when a stored authorization predates scopes the app now requires. */
export function ScopeNotice() {
  const auth = useAuthState();
  const services = useAppServices();
  const { pathname } = useLocation();
  if (auth.status !== 'signed-in' || auth.missingScopes.length === 0 || !services.auth) return null;
  return (
    <div className="scope-notice" role="status">
      <span>ARC needs {auth.missingScopes.length} more Spotify permission(s) for every feature.</span>
      <button type="button" className="note-more" onClick={() => void services.auth?.beginLogin(pathname)}>
        Reconnect Spotify →
      </button>
    </div>
  );
}
