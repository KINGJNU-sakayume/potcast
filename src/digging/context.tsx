import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '../app/sessionContext';
import { localTokenStore } from '../auth/tokenStore';
import { DigDatabase } from './db';
import { resolveDigAccount } from './identity';
import { DigService } from './service';
import { emptyDigData, type DigData } from './types';

interface DigContextValue {
  accountId: string | null;
  db: DigDatabase | null;
  service: DigService | null;
  data: DigData;
  ready: boolean;
  error: string | null;
}
const empty = emptyDigData();
const fallback: DigContextValue = { accountId: null, db: null, service: null, data: empty, ready: false, error: null };
const DigContext = createContext<DigContextValue>(fallback);

export function DigProvider({ children }: { children: ReactNode }) {
  const { catalogue } = useSession();
  const [credentialVersion, setCredentialVersion] = useState(0);
  useEffect(() => localTokenStore.onExternalChange(() => setCredentialVersion((n) => n + 1)), []);
  const identity = useQuery({
    queryKey: [catalogue.mode, 'digging-account', credentialVersion], queryFn: () => resolveDigAccount(catalogue),
    staleTime: Infinity, retry: false,
  });
  return <AccountRecords accountId={identity.data ?? null} identityError={identity.isError ? 'Connect Spotify to verify the account for personal records.' : null}>{children}</AccountRecords>;
}

function AccountRecords({ accountId, identityError, children }: { accountId: string | null; identityError: string | null; children: ReactNode }) {
  const db = useMemo(() => accountId && typeof indexedDB !== 'undefined' ? new DigDatabase(accountId) : null, [accountId]);
  const service = useMemo(() => db ? new DigService(db) : null, [db]);
  const [loaded, setLoaded] = useState<{ accountId: string | null; data: DigData }>({ accountId: null, data: empty });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!db) return;
    let active = true;
    const subscription = db.observe((value) => { if (active) { setLoaded({ accountId, data: value }); setError(null); } }, () => {
      if (active) { setLoaded({ accountId: null, data: empty }); setError('Personal storage is unavailable. Your existing backup has not been changed.'); }
    });
    return () => { active = false; subscription.unsubscribe(); db.close({ disableAutoOpen: false }); };
  }, [db, accountId]);
  const ready = Boolean(db && loaded.accountId === accountId);
  const data = ready ? loaded.data : empty;
  const value = useMemo(() => ({ accountId, db, service, data, ready, error: error ?? identityError ?? (accountId && !db ? 'This browser does not support personal IndexedDB storage.' : null) }), [accountId, db, service, data, ready, error, identityError]);
  return <DigContext.Provider value={value}>{children}</DigContext.Provider>;
}

export const useDigging = () => useContext(DigContext);

export function useDigAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save personal records.'); }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}
