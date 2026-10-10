import { useEffect } from 'react';
import { useEngine } from '../playback/hooks';
import { shortcutBlocked } from './shortcuts';
import { useShell } from './shellContext';

/**
 * "/" opens search; Space toggles playback when focus is not on a control
 * (so it never hijacks buttons, links or sliders); F toggles the desktop's
 * Focus Mode.
 */
export function GlobalShortcuts() {
  const engine = useEngine();
  const shell = useShell();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutBlocked(event)) return;

      if (event.key === '/') {
        event.preventDefault();
        shell.openSearch();
        return;
      }
      if ((event.key === 'f' || event.key === 'F') && shell.toggleFocus) {
        event.preventDefault();
        shell.toggleFocus();
        return;
      }
      const target = event.target as HTMLElement | null;
      const onPage = !target || target === document.body || target.id === 'main';
      if (event.key === ' ' && onPage) {
        event.preventDefault();
        engine.activateAudio();
        void engine.togglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine, shell]);

  return null;
}
