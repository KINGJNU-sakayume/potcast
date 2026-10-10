import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { shortcutBlocked } from '../../app/shortcuts';

/**
 * The desktop's right-hand column for a note, the queue or settings. It sits
 * beside the page and pushes it aside instead of covering it, so it is a
 * complementary region rather than a dialog. Opening moves focus to its close
 * button; closing returns focus to whatever opened it; Escape closes it.
 */
export function SidePanel({
  contentKey,
  label,
  labelledBy,
  closeLabel,
  onClose,
  children,
}: {
  /** Changes when different content opens, so the column starts at its top. */
  contentKey: string;
  label: string;
  labelledBy: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!returnTo.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      returnTo.current = document.activeElement;
    }
    bodyRef.current?.scrollTo?.({ top: 0 });
    closeRef.current?.focus({ preventScroll: true });
  }, [contentKey]);

  useEffect(() => {
    return () => {
      const target = returnTo.current;
      // After the page has re-laid out without the column (the opener may have been hidden while it was open).
      requestAnimationFrame(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // The device popover and Focus Mode take Escape first.
      if (document.querySelector('.device-panel, .app[data-focus]')) return;
      const inside = event.target instanceof Node && bodyRef.current?.parentElement?.contains(event.target);
      if (!inside && shortcutBlocked(event)) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="side-panel" aria-labelledby={labelledBy}>
      <div className="side-panel-head">
        <span className="label">{label}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
      </div>
      <div ref={bodyRef} className="side-panel-body">
        {children}
      </div>
    </aside>
  );
}
