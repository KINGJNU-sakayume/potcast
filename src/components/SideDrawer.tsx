import { useEffect, useRef, type ReactNode } from 'react';
import { useIsMobile } from '../app/useIsMobile';
import { BottomSheet } from './BottomSheet';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Small uppercase label in the drawer head, e.g. "Archive note". */
  label: string;
  /** Id of the element that names the dialog. */
  labelledBy: string;
  closeLabel: string;
  children: ReactNode;
}

/**
 * Notes and the queue: the right-hand drawer on desktop, a bottom sheet on a
 * phone (same content, same close and focus behaviour).
 */
export function SideDrawer(props: SideDrawerProps) {
  const mobile = useIsMobile();
  if (mobile) {
    const { open, onClose, label, labelledBy, closeLabel, children } = props;
    return (
      <BottomSheet open={open} onClose={onClose} label={label} labelledBy={labelledBy} closeLabel={closeLabel} tall>
        {children}
      </BottomSheet>
    );
  }
  return <DesktopSideDrawer {...props} />;
}

/**
 * The one right-hand drawer of the v7 design (warm paper, left hairline,
 * restrained shadow). Notes and the queue share it. Closes on the close
 * button, the backdrop and Escape; traps focus while open and returns it to
 * the trigger afterwards.
 */
function DesktopSideDrawer({ open, onClose, label, labelledBy, closeLabel, children }: SideDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const target = returnFocus.current;
      returnFocus.current = null;
      if (target?.isConnected) target.focus();
    };
  }, [open, onClose]);

  return (
    <>
      <div className={open ? 'side-drawer-backdrop open' : 'side-drawer-backdrop'} aria-hidden="true" onClick={onClose} />
      <aside
        ref={drawerRef}
        className={open ? 'side-drawer open' : 'side-drawer'}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-labelledby={labelledBy}
      >
        <div className="side-drawer-head">
          <span>{label}</span>
          <button ref={closeRef} type="button" aria-label={closeLabel} onClick={onClose} tabIndex={open ? 0 : -1}>
            ×
          </button>
        </div>
        <div className="side-drawer-body">{children}</div>
      </aside>
    </>
  );
}
