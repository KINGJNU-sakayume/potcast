import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../app/sessionContext';
import { useDigging } from '../digging/context';
import { applyApproved } from './approve';
import {
  autoApplyEnabled, beginConnect, browserDeps, disconnect as forget, isConnected, LifeHubError,
  setAutoApply as storeAutoApply, sync, type AlbumProposal,
} from './remote';

/**
 * The Life Hub screen states shared by the settings section, the library's proposal band and the settings
 * entry point's dot: A (not connected), B (connected: idle, syncing or waiting to retry) and C (attention).
 */
export type LifeHubPhase = 'idle' | 'syncing' | 'retry' | 'attention';
export interface LifeHubAttention { cause: 'reconnect' | 'error'; message: string }

export interface LifeHubState {
  connected: boolean;
  phase: LifeHubPhase;
  attention: LifeHubAttention | null;
  proposals: AlbumProposal[];
  /** The existing note when some proposals differ from the hub's state; informational, not state C. */
  conflictNote: string | null;
  /** Records made from Claude card approvals and decisions taken on proposals. */
  message: string | null;
  autoApply: boolean;
  runSync: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  markConnected: () => void;
  removeProposal: (key: string, message: string) => void;
  setAutoApply: (on: boolean) => void;
}

const noop = () => undefined;
const fallback: LifeHubState = {
  connected: false, phase: 'idle', attention: null, proposals: [], conflictNote: null, message: null, autoApply: true,
  runSync: async () => undefined, connect: noop, disconnect: noop, markConnected: noop, removeProposal: noop, setAutoApply: noop,
};
const LifeHubContext = createContext<LifeHubState>(fallback);
export const useLifeHub = () => useContext(LifeHubContext);

/**
 * Starts over for each Spotify account, as the drawer section (keyed by account) did. The state is reset rather
 * than the provider re-keyed, so the app beneath it is not remounted when the account resolves.
 */
export function LifeHubProvider({ children }: { children: ReactNode }) {
  const { accountId, data, service } = useDigging();
  const { catalogue } = useSession();
  const [connected, setConnected] = useState(() => isConnected(browserDeps()));
  const [phase, setPhase] = useState<LifeHubPhase>('idle');
  const [attention, setAttention] = useState<LifeHubAttention | null>(null);
  const [proposals, setProposals] = useState<AlbumProposal[]>([]);
  const [conflictNote, setConflictNote] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [autoApply, setAutoApplyState] = useState(() => autoApplyEnabled(browserDeps()));
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const running = useRef<Promise<void> | null>(null);
  // A round started for another account (its service) must not write into this one's state.
  const current = useRef(service);
  useEffect(() => { current.current = service; running.current = null; }, [service]);
  const [scope, setScope] = useState(accountId);
  if (scope !== accountId) {
    setScope(accountId);
    setConnected(isConnected(browserDeps())); setPhase('idle'); setAttention(null);
    setProposals([]); setConflictNote(null); setMessage(null);
  }

  const runSync = useCallback(() => {
    if (!isConnected(browserDeps())) return Promise.resolve();
    // One round at a time: effects that run twice (StrictMode) or two callers share it.
    if (running.current) return running.current;
    let round: Promise<void> | null = null;
    round = (async () => {
      setPhase('syncing'); setAttention(null);
      try {
        const deps = browserDeps();
        const stale = () => current.current !== service;
        let result = await sync(dataRef.current, deps);
        // Approved in a Claude card with nothing left to decide: record now, then send the receipts.
        const recorded = service ? await applyApproved(result.proposals, service, catalogue, autoApplyEnabled(deps), deps) : [];
        if (stale()) return;
        if (recorded.length && service) {
          result = await sync(await service.repository.read(), deps);
          if (stale()) return;
          setMessage(`Claude에서 승인한 앨범을 기록했어요: ${recorded.join(', ')}`);
        }
        // Keep the objects already on screen, so a review in progress is not reset by a refresh.
        setProposals((old) => result.proposals.map((p) => old.find((o) => o.key === p.key) ?? p));
        setConflictNote(result.conflicts ? `${result.conflicts}개 제안은 Life Hub와 상태가 달라요. potcast 기록은 그대로 유지돼요.` : null);
        setPhase('idle');
      } catch (e) {
        if (current.current !== service) return;
        const text = e instanceof Error ? e.message : '동기화하지 못했어요.';
        if (e instanceof LifeHubError && (e.kind === 'network' || e.kind === 'server')) {
          setPhase('retry');
        } else if (e instanceof LifeHubError && e.kind === 'not_connected') {
          setConnected(false); setProposals([]);
          setAttention({ cause: 'reconnect', message: text }); setPhase('attention');
        } else {
          setAttention({ cause: 'error', message: text }); setPhase('attention');
        }
      } finally { if (running.current === round) running.current = null; }
    })();
    running.current = round;
    return round;
  }, [service, catalogue]);

  const connect = useCallback(() => {
    void beginConnect(browserDeps()).then((url) => window.location.assign(url)).catch((e: unknown) => {
      setAttention({ cause: 'error', message: e instanceof Error ? e.message : '연결을 시작하지 못했어요.' }); setPhase('attention');
    });
  }, []);
  const disconnect = useCallback(() => {
    forget(browserDeps());
    setConnected(false); setProposals([]); setAttention(null); setConflictNote(null); setPhase('idle');
  }, []);
  const markConnected = useCallback(() => {
    setConnected(isConnected(browserDeps())); setAttention(null); setPhase('idle');
  }, []);
  const removeProposal = useCallback((key: string, text: string) => {
    setProposals((old) => old.filter((x) => x.key !== key));
    setMessage(text);
    void runSync();
  }, [runSync]);
  const setAutoApply = useCallback((on: boolean) => {
    storeAutoApply(browserDeps(), on); setAutoApplyState(on);
    if (on) void runSync();
  }, [runSync]);

  const value = useMemo<LifeHubState>(() => ({
    connected, phase, attention, proposals, conflictNote, message, autoApply,
    runSync, connect, disconnect, markConnected, removeProposal, setAutoApply,
  }), [connected, phase, attention, proposals, conflictNote, message, autoApply, runSync, connect, disconnect, markConnected, removeProposal, setAutoApply]);
  return <LifeHubContext.Provider value={value}>{children}</LifeHubContext.Provider>;
}
