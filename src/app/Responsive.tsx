import { useEffect, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useShell } from './shellContext';
import { useIsMobile } from './useIsMobile';

/** One route, two layouts: the desktop page, or its phone counterpart. */
export function Responsive({ desktop, mobile }: { desktop: ReactElement; mobile: ReactElement }) {
  return useIsMobile() ? mobile : desktop;
}

/** `/search` is a phone tab; on desktop it opens the search overlay over Now Playing instead. */
export function DesktopSearchRoute() {
  const shell = useShell();
  useEffect(() => shell.openSearch(), [shell]);
  return <Navigate to="/now-playing" replace />;
}
