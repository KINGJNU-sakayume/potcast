import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useCurrentPageTitle } from './pageTitle';

interface Visit {
  key: string;
  label: string;
}

/** undefined: no desktop shell (the phone has its own back bar). null: nothing to go back to. */
const BackContext = createContext<Visit | null | undefined>(undefined);

/** Pages named by their section; the rest (an artist, an album) by their title. */
const SECTION_PAGES = ['/now-playing', '/library', '/archive', '/search'];

/**
 * The desktop's replacement for the breadcrumb: it follows the session's own
 * history (push, replace, back) and remembers each page's name, so a page
 * can offer "‹ the page you came from".
 */
export function BackHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { section, title } = useCurrentPageTitle();
  const visits = useRef<Visit[]>([]);
  const [previous, setPrevious] = useState<Visit | null>(null);

  useEffect(() => {
    const list = visits.current;
    const index = list.findIndex((visit) => visit.key === location.key);
    if (navigationType === 'POP') {
      if (index >= 0) list.length = index + 1;
      else list.splice(0, list.length, { key: location.key, label: '' });
    } else if (navigationType === 'REPLACE' && list.length > 0) {
      list[list.length - 1] = { key: location.key, label: '' };
    } else {
      list.push({ key: location.key, label: '' });
    }
    setPrevious(list.length > 1 ? list[list.length - 2]! : null);
  }, [location.key, navigationType]);

  useEffect(() => {
    const current = visits.current.at(-1);
    if (!current || current.key !== location.key) return;
    const bySection = SECTION_PAGES.some((path) => location.pathname.startsWith(path));
    current.label = bySection ? section : (title ?? section);
  }, [location.key, location.pathname, section, title]);

  return <BackContext.Provider value={previous}>{children}</BackContext.Provider>;
}

/** "‹ Library": back to the page this one was opened from. Nothing on a first page or on the phone. */
export function BackLink() {
  const previous = useContext(BackContext);
  const navigate = useNavigate();
  if (!previous) return null;
  const label = previous.label || 'Back';
  return (
    <button type="button" className="back-link" aria-label={`Back to ${label}`} onClick={() => navigate(-1)}>
      <span aria-hidden="true">‹</span> {label}
    </button>
  );
}
