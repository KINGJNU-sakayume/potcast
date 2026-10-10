import { ArchiveIcon, LibraryIcon, MusicIcon, SearchIcon } from '../icons';

export type MobileTab = 'play' | 'library' | 'search' | 'archive';

const TABS: ReadonlyArray<{ id: MobileTab; label: string; icon: () => JSX.Element }> = [
  { id: 'play', label: 'Now Playing', icon: MusicIcon },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'archive', label: 'Archive', icon: ArchiveIcon },
];

/** The phone's four bottom tabs. Tapping the current tab returns it to its first page. */
export function TabBar({ tab, onSelect }: { tab: MobileTab; onSelect: (tab: MobileTab) => void }) {
  return (
    <nav className="m-tabbar" aria-label="Primary">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" className="m-tab" aria-current={id === tab ? 'page' : undefined} onClick={() => onSelect(id)}>
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
