import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../catalogue/queries';
import { CoverImage } from '../components/CoverImage';
import { SidePanel } from '../components/desktop/SidePanel';
import { AlbumIcon, ArchiveIcon, ArtistIcon, LibraryIcon, MusicIcon, QueueIcon, SearchIcon, SettingsIcon } from '../components/icons';
import { Logo } from '../components/Logo';
import { NoteContent } from '../components/NoteContent';
import { NoteProvider, useNote } from '../components/NoteContext';
import { PlayingMark } from '../components/PlayingMark';
import { QueueContent } from '../components/QueueDrawer';
import { SearchOverlay } from '../components/SearchOverlay';
import { SettingsBody } from '../components/SettingsPanel';
import { usePlayerSelector, useProgressProperty } from '../playback/hooks';
import { AccentTokens } from './AccentTokens';
import { BackHistoryProvider } from './backHistory';
import { GlobalShortcuts } from './GlobalShortcuts';
import { MobileShell } from './MobileShell';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ScopeNotice } from './ScopeNotice';
import { ShellContext, useShell, type ShellControls } from './shellContext';
import { SurfaceProvider } from './surface';
import { useIsMobile } from './useIsMobile';

function initials(name: string | null | undefined): string {
  if (!name) return 'ARC';
  const parts = name.split(/[\s,._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => Array.from(part)[0]!.toUpperCase()).join('') || 'ARC';
}

type Panel = 'queue' | 'settings';

/** Away from Now Playing: the playing cover, its progress and a playing mark at the foot of the rail. */
function RailNow() {
  const track = usePlayerSelector((s) => s.snapshot.track);
  const paused = usePlayerSelector((s) => s.snapshot.paused);
  const { pathname } = useLocation();
  const ref = useRef<HTMLAnchorElement>(null);
  useProgressProperty(ref);
  if (!track || pathname === '/now-playing') return null;
  return (
    <Link ref={ref} to="/now-playing" className="rail-now" aria-label={`Now playing: ${track.title}. Open Now Playing`} title={track.title}>
      <span className="rail-now-cover">
        <CoverImage images={track.album.images} size={50} alt="" title={track.album.name} paletteKey={track.album.id} />
        <PlayingMark playing={!paused} />
      </span>
      <span className="rail-now-bar" aria-hidden="true" />
      <span className="rail-now-label" aria-hidden="true">
        {paused ? 'Paused' : 'Playing'}
      </span>
    </Link>
  );
}

function Rail({ panel }: { panel: Panel | null }) {
  const track = usePlayerSelector((s) => s.snapshot.track);
  const shell = useShell();
  const profile = useProfile();
  const artistId = track?.artists[0]?.id;
  const albumId = track?.album.id;
  const name = profile.data?.displayName ?? null;

  return (
    <aside className="rail" aria-label="Primary navigation">
      <Link className="logo" to="/now-playing" aria-label="ARC Music — Now Playing">
        <Logo size={40} />
      </Link>
      <nav className="rail-nav">
        <NavLink className="rail-item" to="/now-playing" aria-label="Now Playing">
          <MusicIcon />
          <span aria-hidden="true">Now playing</span>
        </NavLink>
        <NavLink className="rail-item" to="/library" aria-label="Library">
          <LibraryIcon />
          <span aria-hidden="true">Library</span>
        </NavLink>
        <NavLink className="rail-item" to="/archive" aria-label="Archive">
          <ArchiveIcon />
          <span aria-hidden="true">Archive</span>
        </NavLink>
        <button type="button" className="rail-item" title="Search (/)" aria-label="Search" aria-keyshortcuts="/" onClick={shell.openSearch}>
          <SearchIcon />
          <span aria-hidden="true">Search</span>
        </button>
        {artistId && (
          <NavLink className="rail-item" to={`/artist/${artistId}`} aria-label="Current artist">
            <ArtistIcon />
            <span aria-hidden="true">Artist</span>
          </NavLink>
        )}
        {albumId && (
          <NavLink className="rail-item" to={`/album/${albumId}`} aria-label="Current album">
            <AlbumIcon />
            <span aria-hidden="true">Album</span>
          </NavLink>
        )}
      </nav>
      <div className="rail-foot">
        <RailNow />
        <button type="button" className="rail-item" aria-label="Queue" aria-expanded={panel === 'queue'} onClick={shell.openQueue}>
          <QueueIcon />
          <span aria-hidden="true">Queue</span>
        </button>
        <button type="button" className="rail-item" aria-label="Settings" aria-expanded={panel === 'settings'} onClick={shell.toggleSettings}>
          <SettingsIcon />
          <span aria-hidden="true">Settings</span>
        </button>
        <div className="user" role="img" title={name ?? 'Personal archive'} aria-label={name ? `Signed in as ${name}` : 'Personal archive'}>
          {initials(name)}
        </div>
      </div>
    </aside>
  );
}

/** The desktop shell, or the phone's tab shell on a narrow or sideways touch screen. Playback survives the switch. */
export function AppShell() {
  return useIsMobile() ? <MobileShell /> : <DesktopShell />;
}

/**
 * The desktop shell (v7.5): the rail and the routed page, with no top bar.
 * Notes, the queue and settings open one at a time in a right-hand column
 * that pushes the page aside. Each page paints the shell in its own image's
 * colour (surface.tsx). Search is the one overlay. There is no global
 * playback footer — transport lives on Now Playing — and playback survives
 * every route change.
 */
function DesktopShell() {
  return (
    <NoteProvider>
      <BackHistoryProvider>
        <DesktopFrame />
      </BackHistoryProvider>
    </NoteProvider>
  );
}

function DesktopFrame() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { note, closeNote } = useNote();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // A note replaces the queue or settings in the column; the queue or settings replace a note.
  useEffect(() => {
    if (note) setPanel(null);
  }, [note]);

  const togglePanel = useCallback(
    (kind: Panel) => {
      closeNote();
      setPanel((current) => (current === kind ? null : kind));
    },
    [closeNote],
  );
  const closePanel = useCallback(() => {
    closeNote();
    setPanel(null);
  }, [closeNote]);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const toggleFocus = useCallback(() => {
    if (!focusMode && pathname !== '/now-playing') navigate('/now-playing');
    setFocusMode(!focusMode);
  }, [focusMode, navigate, pathname]);

  // Focus Mode asks for the whole screen; leaving full screen (Esc) leaves Focus Mode.
  useEffect(() => {
    if (!focusMode) return;
    setSearchOpen(false);
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => undefined);
    const onFullscreen = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
    };
  }, [focusMode]);

  const controls = useMemo<ShellControls>(
    () => ({
      openSearch: () => setSearchOpen(true),
      openQueue: () => togglePanel('queue'),
      toggleSettings: () => togglePanel('settings'),
      toggleFocus,
      focusMode,
    }),
    [togglePanel, toggleFocus, focusMode],
  );

  const open = panel ?? (note ? 'note' : null);
  // One column instance across note / queue / settings, so switching keeps focus inside it.
  const panelView =
    open === 'note' && note
      ? {
          key: `note:${note.id ?? note.title}:${note.context}`,
          label: note.context.startsWith('Listening') ? 'Listening note' : 'Editorial note',
          labelledBy: 'side-panel-title',
          closeLabel: 'Close note',
          content: <NoteContent note={note} titleId="side-panel-title" />,
        }
      : open === 'queue'
        ? { key: 'queue', label: 'Playback', labelledBy: 'queue-title', closeLabel: 'Close queue', content: <QueueContent open /> }
        : open === 'settings'
          ? {
              key: 'settings',
              label: 'ARC Music',
              labelledBy: 'settings-title',
              closeLabel: 'Close settings',
              content: (
                <>
                  <h2 id="settings-title" className="note-drawer-title">
                    Settings
                  </h2>
                  <div className="note-drawer-rule" />
                  <SettingsBody />
                </>
              ),
            }
          : null;

  return (
    <ShellContext.Provider value={controls}>
      <SurfaceProvider>
        {(stage) => (
          <div
            className="app desktop"
            style={stage?.style}
            data-surface={stage ? 'stage' : 'paper'}
            data-tone={stage?.tone}
            data-focus={focusMode || undefined}
            data-panel={open ?? undefined}
          >
            <a href="#main" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus(); }}>
              Skip to content
            </a>
            <Rail panel={panel} />
            <div className="workspace">
              <main className="workspace-main">
                <ScopeNotice />
                <section className="stage" id="main" tabIndex={-1}>
                  <RouteErrorBoundary resetKey={pathname}>
                    <Outlet />
                  </RouteErrorBoundary>
                </section>
              </main>
              {panelView && (
                <SidePanel
                  contentKey={panelView.key}
                  label={panelView.label}
                  labelledBy={panelView.labelledBy}
                  closeLabel={panelView.closeLabel}
                  onClose={closePanel}
                >
                  {panelView.content}
                </SidePanel>
              )}
            </div>
            <SearchOverlay open={searchOpen} onClose={closeSearch} />
            <AccentTokens />
            <GlobalShortcuts />
          </div>
        )}
      </SurfaceProvider>
    </ShellContext.Provider>
  );
}
