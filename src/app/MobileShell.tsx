import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MiniPlayer } from '../components/mobile/MiniPlayer';
import { TabBar, type MobileTab } from '../components/mobile/TabBar';
import { NoteProvider } from '../components/NoteContext';
import { NoteDrawer } from '../components/NoteDrawer';
import { QueueDrawer } from '../components/QueueDrawer';
import { SettingsPanel } from '../components/SettingsPanel';
import { BackIcon } from '../components/icons';
import { AccentTokens } from './AccentTokens';
import { ScopeNotice } from './ScopeNotice';
import { GlobalShortcuts } from './GlobalShortcuts';
import { useCurrentPageTitle } from './pageTitle';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ShellContext, type ShellControls } from './shellContext';
import { useStageTheme, useThemeColor } from './useStageTheme';

export const TAB_ROOT: Record<MobileTab, string> = {
  play: '/now-playing',
  library: '/library',
  search: '/search',
  archive: '/archive',
};

/** The tab a route belongs to; artist, album and other pages belong to the tab they were opened from. */
export function tabOfPath(pathname: string): MobileTab | null {
  for (const [tab, root] of Object.entries(TAB_ROOT) as [MobileTab, string][]) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return tab;
  }
  return null;
}

/** Dispatched when the Search tab is tapped while already on Search. */
export const FOCUS_SEARCH_EVENT = 'arc:focus-search';

/** Pages keep their scroll position per address, so a tab comes back where it was left. */
function useScrollMemory(path: string) {
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    window.scrollTo(0, positions.current.get(path) ?? 0);
    const remember = () => positions.current.set(path, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [path]);
}

/** Artist, album and other pages opened inside a tab: back, and the page title once it has scrolled away. */
function SubBar({ tab }: { tab: MobileTab }) {
  const navigate = useNavigate();
  const { title } = useCurrentPageTitle();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const back = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) navigate(-1);
    else navigate(TAB_ROOT[tab]);
  };
  return (
    <header className="m-subbar" data-scrolled={scrolled || undefined}>
      <button type="button" className="m-back" aria-label="Back" onClick={back}>
        <BackIcon />
      </button>
      <span className="m-subbar-title" aria-hidden={!scrolled}>
        {title}
      </span>
      <span />
    </header>
  );
}

/**
 * The phone shell: four bottom tabs (Now Playing · Library · Search · Archive),
 * artist and album pages pushed inside the current tab, a mini player above
 * the tabs away from Now Playing, and bottom sheets for notes, the queue,
 * devices and settings. Now Playing takes the playing album's colour.
 */
export function MobileShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname, search } = location;
  const stage = useStageTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const routeTab = tabOfPath(pathname);
  const lastTab = useRef<MobileTab>(routeTab ?? 'play');
  const tab = routeTab ?? lastTab.current;
  const lastPath = useRef<Record<MobileTab, string>>({ ...TAB_ROOT });
  useEffect(() => {
    if (routeTab) lastTab.current = routeTab;
    lastPath.current[routeTab ?? lastTab.current] = `${pathname}${search}`;
  }, [routeTab, pathname, search]);

  const onNowPlaying = routeTab === 'play';
  useThemeColor(onNowPlaying ? (stage?.background ?? null) : null);
  useScrollMemory(`${pathname}${search}`);
  useEffect(() => setSettingsOpen(false), [pathname]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const controls = useMemo<ShellControls>(
    () => ({
      openSearch: () => navigate(TAB_ROOT.search),
      openQueue: () => setQueueOpen(true),
      toggleSettings: () => setSettingsOpen((value) => !value),
    }),
    [navigate],
  );

  const selectTab = (next: MobileTab) => {
    if (next !== tab) {
      // Now Playing always opens on the player; the other tabs come back where they were left.
      navigate(next === 'play' ? TAB_ROOT.play : lastPath.current[next]);
      return;
    }
    if (pathname !== TAB_ROOT[next]) navigate(TAB_ROOT[next]);
    else if (next === 'search') window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <ShellContext.Provider value={controls}>
      <NoteProvider>
        <div className="m-shell" style={stage?.style} data-tone={stage?.tone} data-tab={tab} data-stage={onNowPlaying || undefined}>
          {!routeTab && <SubBar tab={tab} />}
          <ScopeNotice />
          <main className="m-main" id="main" tabIndex={-1}>
            <RouteErrorBoundary resetKey={pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </main>
          {!onNowPlaying && <MiniPlayer />}
          <TabBar tab={tab} onSelect={selectTab} />
          <SettingsPanel open={settingsOpen} onClose={closeSettings} />
          <QueueDrawer open={queueOpen} onClose={closeQueue} />
          <NoteDrawer />
          <AccentTokens />
          <GlobalShortcuts />
        </div>
      </NoteProvider>
    </ShellContext.Provider>
  );
}
