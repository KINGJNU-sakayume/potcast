import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../app/sessionContext';
import { useDigging } from '../digging/context';
import { albumNotes } from '../editorial/albums';
import { paletteCache } from '../palette/paletteCache';
import { parseHex, rgbToHsl } from '../palette/contrast';
import { browserDeps, isConnected } from '../lifehub/remote';
import { buildBoardTiles, type BoardCoverSource } from './buildBoardTiles';
import { MIN_INTERVAL_MS, boardEnabled, boardNeedsReconnect, boardRound, clearBoardReconnect, setBoardEnabled } from './upload';

/** One "app opened" check per page load, even when effects run twice (StrictMode) or both layouts mount. */
let openedOnce = false;
const DEBOUNCE_MS = 2000;

const covers = (): BoardCoverSource[] => albumNotes.map((n) => ({ albumIds: n.albumIds, appleCover: n.appleCover, cover: n.cover }));

/** Accent (hue, saturation) from the palette the app already took from an album's cover; none when not known yet. */
function accents(albumIds: Iterable<string>): Record<string, { h: number; s: number }> {
  const out: Record<string, { h: number; s: number }> = {};
  for (const id of albumIds) {
    const hex = paletteCache.peek(id)?.dominant;
    const rgb = hex ? parseHex(hex) : null;
    if (!rgb) continue;
    const { h, s } = rgbToHsl(rgb);
    out[id] = { h: Math.round(h), s: Math.round(s * 100) / 100 };
  }
  return out;
}

/**
 * Sends the board tiles to Life Hub when this device is switched on for it (see upload.ts for the rules).
 * `onDisconnected` runs when Life Hub refuses the token for a reason other than a missing `potcast:board` scope.
 */
export function useBoardUpload(connected: boolean, onDisconnected: (message: string) => void) {
  const { data, ready, service } = useDigging();
  const { catalogue } = useSession();
  const [enabled, setEnabledState] = useState(() => boardEnabled(browserDeps().storage));
  const [needsReconnect, setNeedsReconnect] = useState(() => boardNeedsReconnect(browserDeps().storage));
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Rounds run one after another: two overlapping ones could both pass the 10-minute check before either records an attempt. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lastDisconnect = useRef(onDisconnected);
  useEffect(() => { lastDisconnect.current = onDisconnected; }, [onDisconnected]);

  const runRef = useRef<(opening: boolean) => Promise<void>>(() => Promise.resolve());
  const runOnce = useCallback(async (opening: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const records = dataRef.current;
    const ids = new Set(records.events.map((e) => e.albumId));
    const result = await boardRound({
      deps: browserDeps(), connected: isConnected(browserDeps()), preview: catalogue.mode === 'preview', opening,
      hasRecords: Object.values(records).some((rows) => rows.length > 0),
      build: (now) => buildBoardTiles({ data: records, covers: covers(), accents: accents(ids) }, now),
      log: (message) => console.error(message),
    });
    const again = (ms: number) => { timer.current = setTimeout(() => void runRef.current(false), ms); };
    if (result.kind === 'waiting') again(result.ms + 1000);
    else if (result.kind === 'sent') {
      if (result.result.kind === 'retry') again(MIN_INTERVAL_MS + 1000);
      else if (result.result.kind === 'scope') setNeedsReconnect(true);
      else if (result.result.kind === 'ok') setNeedsReconnect(false);
      else if (result.result.kind === 'disconnected') lastDisconnect.current('Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.');
    }
  }, [catalogue]);
  const run = useCallback((opening: boolean): Promise<void> => {
    chain.current = chain.current.then(() => runOnce(opening), () => runOnce(opening));
    return chain.current;
  }, [runOnce]);
  useEffect(() => { runRef.current = run; }, [run]);

  // Changes in the records (and a connection or switch change) schedule a round; the opening check adds the daily send.
  useEffect(() => {
    if (!ready || !service) return undefined;
    // Marked inside the timer: a StrictMode cleanup that cancels the first timer must not use up the opening check.
    const t = setTimeout(() => { const opening = !openedOnce; openedOnce = true; void run(opening); }, openedOnce ? DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [ready, service, data, connected, enabled, run]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setEnabled = useCallback((on: boolean) => {
    setBoardEnabled(browserDeps().storage, on);
    setEnabledState(on);
  }, []);
  const clearReconnect = useCallback(() => { clearBoardReconnect(browserDeps().storage); setNeedsReconnect(false); }, []);
  return { enabled, setEnabled, needsReconnect, clearReconnect };
}
