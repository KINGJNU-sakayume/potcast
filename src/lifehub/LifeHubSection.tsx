import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSession } from '../app/sessionContext';
import { useDigAction, useDigging } from '../digging/context';
import type { AlbumDetail, AlbumSummary } from '../domain/types';
import type { ReviewStatus } from '../digging/types';
import { applyApproval, fallbackPlayedAt, planTracks, resolveAlbum, type PlannedTrack } from './approve';
import {
  beginConnect, browserDeps, completeStoredCallback, connectAvailable, disconnect, isConnected, LifeHubError,
  rejectLocally, rememberReceipt, sync, type AlbumProposal,
} from './remote';

const STATUS_LABEL: Record<ReviewStatus, string> = { listened: '들음', skipped: '넘김', none: '기록 안 함' };

/** One exchange per page load, even when effects run twice (StrictMode) or both layouts mount. */
let callbackOnce: Promise<boolean> | null = null;
const finishCallback = () => (callbackOnce ??= completeStoredCallback(browserDeps()));

/** Shown in the library: finishes a Life Hub sign-in that the callback page handed over. */
export function LifeHubCallbackNotice() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    finishCallback()
      .then((done) => { if (active && done) setMessage('Life Hub에 연결했어요. 기록 백업·청취 이력에서 제안을 확인하세요.'); })
      .catch((e: unknown) => { if (active) setMessage(e instanceof Error ? e.message : 'Life Hub에 연결하지 못했어요.'); });
    return () => { active = false; };
  }, []);
  return message ? <p className="dig-help" role="status">{message}</p> : null;
}

function ProposalReview({ proposal, onDone }: { proposal: AlbumProposal; onDone: (message: string) => void }) {
  const { service } = useDigging();
  const { catalogue } = useSession();
  const action = useDigAction();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [choices, setChoices] = useState<AlbumSummary[]>([]);
  const [rows, setRows] = useState<PlannedTrack[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const adopt = useCallback((detail: AlbumDetail) => {
    const plan = planTracks(proposal, detail);
    setAlbum(detail); setChoices([]); setRows(plan.rows); setUnmatched(plan.unmatched);
  }, [proposal]);

  useEffect(() => {
    const controller = new AbortController();
    resolveAlbum(proposal, catalogue, controller.signal)
      .then((r) => { if (r.album) adopt(r.album); else setChoices(r.choices); })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoadError(e instanceof Error ? e.message : 'Spotify에서 앨범을 찾지 못했어요.'); });
    return () => controller.abort();
  }, [proposal, catalogue, adopt]);

  const counts = { listened: rows.filter((r) => r.status === 'listened').length, skipped: rows.filter((r) => r.status === 'skipped').length };
  return <div className="dig-lifehub-review">
    {loadError && <p role="alert">{loadError}</p>}
    {!album && !loadError && choices.length === 0 && <p role="status">Spotify에서 앨범을 찾는 중…</p>}
    {!album && choices.length > 0 && <>
      <p className="dig-help">정확히 일치하는 앨범이 하나가 아니에요. 들은 앨범을 골라 주세요.</p>
      <ul className="dig-lifehub-choices">{choices.map((c) => <li key={c.id}>
        <button type="button" className="plain-action" disabled={action.busy} onClick={() => {
          void action.run(async () => adopt(await catalogue.getAlbum(c.id)));
        }}>{c.name} · {c.artists.map((a) => a.name).join(', ')}{c.releaseDate ? ` · ${c.releaseDate.slice(0, 4)}` : ''}</button>
      </li>)}</ul>
    </>}
    {album && <>
      <p><strong>{album.name}</strong> · {album.artists.map((a) => a.name).join(', ')}</p>
      {unmatched.length > 0 && <p className="dig-help">이 앨범에서 찾지 못한 곡: {unmatched.join(', ')}</p>}
      <ol className="dig-lifehub-tracks">{rows.map((row, i) => <li key={row.track.id}>
        <span>{row.track.name}</span>
        <select aria-label={`${row.track.name} 상태`} value={row.status} onChange={(e) => {
          const status = e.target.value as ReviewStatus;
          setRows((old) => old.map((r, j) => j === i ? { ...r, status, playedAt: r.playedAt ?? fallbackPlayedAt(proposal) } : r));
        }}>
          {(['listened', 'skipped', 'none'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </li>)}</ol>
      <p className="dig-help">들음 {counts.listened}곡 · 넘김 {counts.skipped}곡. 승인하면 들은 곡마다 청취 기록이 남고, 이미 들음인 곡은 넘김으로 바뀌지 않아요.</p>
      <button type="button" className="plain-action primary" disabled={!service || action.busy || counts.listened + counts.skipped === 0} onClick={() => {
        if (!service) return;
        void action.run(async () => {
          const result = await applyApproval(service, proposal, album, rows);
          rememberReceipt(proposal.key, album.id, browserDeps());
          onDone(`${album.name}: 들음 ${result.listened}곡, 넘김 ${result.skipped}곡을 기록했어요.${result.keptListened ? ` 이미 들음인 ${result.keptListened}곡은 그대로 두었어요.` : ''}`);
        });
      }}>확인하고 기록</button>
    </>}
    {action.error && <p role="alert">{action.error}</p>}
  </div>;
}

/** Inside the record tools drawer: connect, review and decide Claude's album proposals. */
export function LifeHubSection() {
  const { data, ready } = useDigging();
  const heading = useId();
  const [connected, setConnected] = useState(() => isConnected(browserDeps()));
  const [proposals, setProposals] = useState<AlbumProposal[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const runSync = useCallback(async () => {
    if (!isConnected(browserDeps())) return;
    setSyncing(true); setError(null);
    try {
      const result = await sync(dataRef.current, browserDeps());
      // Keep the objects already on screen, so a review in progress is not reset by a refresh.
      setProposals((old) => result.proposals.map((p) => old.find((o) => o.key === p.key) ?? p));
      if (result.conflicts) setError(`${result.conflicts}개 제안은 Life Hub와 상태가 달라요. potcast 기록은 그대로 유지돼요.`);
    } catch (e) {
      if (e instanceof LifeHubError && e.kind === 'not_connected') { setConnected(false); setProposals([]); }
      setError(e instanceof Error ? e.message : '동기화하지 못했어요.');
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => { if (ready) void runSync(); }, [ready, runSync]);

  const canConnect = connectAvailable(window.location);
  return <section className="dig-editor" aria-labelledby={heading}>
    <h3 id={heading}>Life Hub 앨범 제안</h3>
    <p className="dig-help">Claude가 대화나 Spotify 청취 기록 파일에서 찾아, 직접 확인한 앨범만 여기에 와요. 곡별로 확인하고 승인해야 기록돼요.</p>
    {!connected ? <>
      <button type="button" className="plain-action" disabled={!canConnect} onClick={() => {
        void beginConnect(browserDeps()).then((url) => window.location.assign(url)).catch((e: unknown) => setError(e instanceof Error ? e.message : '연결을 시작하지 못했어요.'));
      }}>Life Hub 연결</button>
      {!canConnect && <p className="dig-help">배포된 potcast 주소에서만 연결할 수 있어요.</p>}
    </> : <>
      <div className="dig-lifehub-actions">
        <button type="button" className="plain-action" disabled={syncing} onClick={() => void runSync()}>{syncing ? '동기화 중…' : '지금 동기화'}</button>
        <button type="button" className="text-toggle" onClick={() => { disconnect(browserDeps()); setConnected(false); setProposals([]); setMessage('Life Hub 연결을 해제했어요.'); }}>연결 해제</button>
      </div>
      {proposals.length === 0 && !syncing && <p className="dig-help">검토할 제안이 없어요.</p>}
      <ul className="dig-lifehub-list">{proposals.map((p) => <li key={p.key}>
        <div>
          <strong>{p.album}</strong> · {p.artist}
          <span className="dig-help"> {p.origin === 'spotify_history' ? 'Spotify 기록' : '대화'}{p.listenedOn ? ` · ${p.listenedOn}` : ''}{p.wholeAlbum ? ' · 앨범 전체' : ` · ${p.tracks.length}곡`}</span>
        </div>
        {open === p.key
          ? <ProposalReview proposal={p} onDone={(text) => { setOpen(null); setMessage(text); setProposals((old) => old.filter((x) => x.key !== p.key)); void runSync(); }} />
          : <div className="dig-lifehub-actions">
            <button type="button" className="plain-action" onClick={() => setOpen(p.key)}>검토</button>
            <button type="button" className="text-toggle" onClick={() => {
              rejectLocally(p.key, browserDeps());
              setProposals((old) => old.filter((x) => x.key !== p.key));
              setMessage(`${p.album} 제안을 거절했어요. 기록은 바뀌지 않았어요.`);
              void runSync();
            }}>거절</button>
          </div>}
      </li>)}</ul>
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
