import { forwardRef, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

interface SliderProps {
  /** Accessible name. */
  label: string;
  /** Current value, 0–1. */
  value: number;
  disabled?: boolean;
  /** Keyboard step as a fraction (arrows) and big step (Page Up/Down). */
  step: number;
  bigStep: number;
  /** aria-valuemax / aria-valuenow scale, e.g. duration in seconds or 100 for percent. */
  scale: number;
  valueText: (fraction: number) => string;
  onCommit: (fraction: number) => void;
  /** Called continuously while dragging or stepping (before commit). */
  onPreview?: (fraction: number | null) => void;
  /** Keyboard changes are committed after this idle delay. */
  commitDelayMs?: number;
  /** Fill follows the rAF-driven --progress variable while idle (seek bar). */
  live?: boolean;
  className?: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Accessible slider (role="slider") drawn as the v7 hairline bar: pointer drag
 * commits on release; arrow / Page / Home / End keys preview immediately and
 * commit after a short pause so seeking does not flood Spotify with requests.
 */
export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(
  { label, value, disabled = false, step, bigStep, scale, valueText, onCommit, onPreview, commitDelayMs = 350, live = false, className },
  ref,
) {
  const [draft, setDraft] = useState<number | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  const shown = draft ?? clamp01(value);

  const setPreview = (next: number | null) => {
    draftRef.current = next;
    setDraft(next);
    onPreview?.(next);
  };

  const commit = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const pending = draftRef.current;
    if (pending !== null) onCommit(pending);
    setPreview(null);
  };

  const fractionAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : 0;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPreview(fractionAt(event));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setPreview(fractionAt(event));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    draftRef.current = fractionAt(event);
    commit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const base = draftRef.current ?? clamp01(value);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = base + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = base - step;
        break;
      case 'PageUp':
        next = base + bigStep;
        break;
      case 'PageDown':
        next = base - bigStep;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setPreview(clamp01(next));
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(commit, commitDelayMs);
  };

  const classes = ['slider', live && 'slider-live', className].filter(Boolean).join(' ');
  return (
    <div
      ref={ref}
      className={classes}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-valuemin={0}
      aria-valuemax={Math.round(scale)}
      aria-valuenow={Math.round(shown * scale)}
      aria-valuetext={valueText(shown)}
      data-interacting={draft !== null || undefined}
      style={{ '--value': shown } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragging.current = false;
        setPreview(null);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (commitTimer.current) commit();
      }}
    >
      <div className="slider-track">
        <div className="slider-fill" />
      </div>
      <div className="slider-thumb" aria-hidden="true" />
    </div>
  );
});
