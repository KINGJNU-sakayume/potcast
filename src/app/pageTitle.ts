import { useEffect, useSyncExternalStore } from 'react';

export interface PageTitle {
  section: string;
  title?: string | null;
}

let current: PageTitle = { section: 'ARC Music' };
const listeners = new Set<() => void>();

const pageTitleStore = {
  get: () => current,
  set(next: PageTitle) {
    if (next.section === current.section && next.title === current.title) return;
    current = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Sets the top-bar context line and the document title for the current page. */
export function usePageTitle(section: string, title?: string | null): void {
  useEffect(() => {
    pageTitleStore.set({ section, title });
    document.title = title ? `${title} — ${section} · ARC Music` : `${section} · ARC Music`;
  }, [section, title]);
}

export function useCurrentPageTitle(): PageTitle {
  return useSyncExternalStore(pageTitleStore.subscribe, pageTitleStore.get);
}
