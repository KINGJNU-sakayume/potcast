function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * True when a single-key shortcut must not fire: a modifier is held, the
 * listener is typing, or a modal dialog (search, a note, the queue) is open.
 */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
  if (isTypingTarget(event.target)) return true;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"])'));
}
