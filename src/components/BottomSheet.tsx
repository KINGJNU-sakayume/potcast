import { useEffect, useRef, useState, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Dragging the grip further than this closes the sheet. */
const CLOSE_DISTANCE = 90;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Small uppercase label in the sheet head, e.g. "Listening note". */
  label: string;
  /** Id of the element that names the dialog, or a plain name. */
  labelledBy?: string;
  ariaLabel?: string;
  closeLabel: string;
  /** Long reading (notes, queue) opens at nearly full height. */
  tall?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * The phone's one secondary surface: a paper sheet that rises from the bottom
 * edge. Closes on the × button, the backdrop, Escape, or a downward drag of
 * its grip; traps focus while open and returns it to the trigger afterwards.
 */
export function BottomSheet({ open, onClose, label, labelledBy, ariaLabel, closeLabel, tall = false, bodyClassName, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; pointer: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOffset(0);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (offset > CLOSE_DISTANCE) onClose();
    else setOffset(0);
  };

  return (
    <div className="m-sheet-layer">
      <div className="m-sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        ref={sheetRef}
        className={tall ? 'm-sheet tall' : 'm-sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : (ariaLabel ?? label)}
        data-dragging={dragging || undefined}
        style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      >
        <div
          className="m-sheet-grip"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            drag.current = { y: event.clientY, pointer: event.pointerId };
            setDragging(true);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setOffset(Math.max(0, event.clientY - drag.current.y));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="m-sheet-head">
            <span>{label}</span>
            <button ref={closeRef} type="button" aria-label={closeLabel} onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className={bodyClassName ? `m-sheet-body ${bodyClassName}` : 'm-sheet-body'}>{children}</div>
      </section>
    </div>
  );
}
