import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../app/sessionContext';
import { useShell } from '../app/shellContext';
import { useDigAction, useDigging } from '../digging/context';
import type { AlbumDetail, AlbumSummary } from '../domain/types';
import type { ReviewStatus } from '../digging/types';
import { applyApproval, fallbackPlayedAt, planTracks, resolveAlbum, type PlannedTrack } from './approve';
import { useLifeHub } from './LifeHubContext';
import { browserDeps, completeStoredCallback, connectAvailable, isConnected, rejectLocally, rememberReceipt, type AlbumProposal } from './remote';

const STATUS_LABEL: Record<ReviewStatus, string> = { listened: '들음', skipped: '넘김', none: '기록 안 함' };

/** One exchange per page load, even when effects run twice (StrictMode) or both layouts mount. */
let callbackOnce: Promise<boolean> | null = null;
const finishCallback = () => (callbackOnce ??= completeStoredCallback(browserDeps()));

/** One background round per page load: albums approved in a Claude card are recorded when potcast opens. */
let openedOnce = false;

/**
 * Shown in the library: finishes a Life Hub sign-in that the callback page handed over (then opens settings,
 * where the Life Hub section shows the connection), and (once per page load) records what the owner already
 * approved in a Claude card and sends those receipts.
 */
export function LifeHubCallbackNotice() {
  const { ready, service } = useDigging();
  const { message: hubMessage, runSync, markConnected } = useLifeHub();
  const { openSettings } = useShell();
  const [message, setMessage] = useState<string | null>(null);
  const after = useRef({ runSync, markConnected, openSettings });
  useEffect(() => { after.current = { runSync, markConnected, openSettings }; }, [runSync, markConnected, openSettings]);
  useEffect(() => {
    let active = true;
    finishCallback()
      .then((done) => {
        if (!active || !done) return;
        after.current.markConnected();
        after.current.openSettings();
        void after.current.runSync();
      })
      .catch((e: unknown) => { if (active) setMessage(e instanceof Error ? e.message : 'Life Hub에 연결하지 못했어요.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || !service || openedOnce || !isConnected(browserDeps())) return;
    openedOnce = true;
    void runSync();
  }, [ready, service, runSync]);
  const shown = message ?? hubMessage;
  return shown ? <p className="dig-help" role="status">{shown}</p> : null;
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

const ORIGIN_LABEL = (p: AlbumProposal) => p.origin === 'spotify_sync' ? 'Spotify 자동 수집' : p.origin === 'spotify_history' ? 'Spotify 기록' : '대화';

/** At the top of the digging library, only while there are proposals: one line, then the existing list. */
export function LifeHubProposals() {
  const { proposals, removeProposal } = useLifeHub();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (proposals.length === 0) return null;
  return <section className="dig-lifehub-proposals" aria-label="Claude 제안">
    <p className="dig-lifehub-band">
      Claude가 제안한 감상 기록 {proposals.length}건 · <button type="button" className="text-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>검토</button>
    </p>
    {expanded && <div className="dig-editor">
      <p className="dig-help">Claude가 대화나 Spotify 청취 기록 파일에서 찾아 직접 확인한 앨범, 그리고 Life Hub가 한 시간마다 Spotify에서 모은 앨범 재생(앨범에서 직접 튼 것만)이 여기에 와요. 곡별로 확인하고 승인해야 기록돼요.</p>
      <ul className="dig-lifehub-list">{proposals.map((p) => <li key={p.key}>
        <div>
          <strong>{p.album}</strong> · {p.artist}
          <span className="dig-help"> {ORIGIN_LABEL(p)}{p.listenedOn ? ` · ${p.listenedOn}` : ''}{p.wholeAlbum ? ' · 앨범 전체' : ` · ${p.tracks.length}곡`}</span>
          {p.status === 'approved' && <span className="dig-help"> · Claude 카드에서 승인함{p.needsAppReview ? ' · 여기서 확인해 주세요' : ''}</span>}
        </div>
        {open === p.key
          ? <ProposalReview proposal={p} onDone={(text) => { setOpen(null); removeProposal(p.key, text); }} />
          : <div className="dig-lifehub-actions">
            <button type="button" className="plain-action" onClick={() => setOpen(p.key)}>검토</button>
            <button type="button" className="text-toggle" onClick={() => {
              rejectLocally(p.key, browserDeps());
              removeProposal(p.key, `${p.album} 제안을 거절했어요. 기록은 바뀌지 않았어요.`);
            }}>거절</button>
          </div>}
      </li>)}</ul>
    </div>}
  </section>;
}

/** The settings panel's 「Life Hub」 section: connect, sync now, disconnect, and what needs attention. */
export function LifeHubSection() {
  const hub = useLifeHub();
  const { ready } = useDigging();
  const { connected, phase, attention, runSync } = hub;
  // Opening the section syncs once, as opening the record tools drawer did.
  useEffect(() => { if (ready) void runSync(); }, [ready, runSync]);
  const canConnect = connectAvailable(window.location);

  if (attention) return <>
    <div className="label">Life Hub</div>
    <p className="lifehub-status"><span className="lifehub-dot" data-tone="alert" aria-hidden="true" />확인 필요</p>
    <div className="lifehub-alert" role="alert">
      {attention.cause === 'reconnect'
        ? <><p>Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.</p>
          <div className="settings-actions"><button type="button" className="plain-action" disabled={!canConnect} onClick={hub.connect}>다시 연결</button></div>
          {!canConnect && <p className="fineprint">배포된 주소에서만 연결할 수 있어요.</p>}</>
        : <><p>{attention.message}</p>
          <div className="settings-actions"><button type="button" className="plain-action" disabled={phase === 'syncing'} onClick={() => void runSync()}>지금 동기화</button></div></>}
    </div>
    <div className="settings-actions"><button type="button" className="plain-action" onClick={hub.disconnect}>연결 해제</button></div>
  </>;

  if (!connected) return <>
    <div className="label">Life Hub</div>
    <p>Claude가 제안한 기록을 받습니다.</p>
    <div className="settings-actions"><button type="button" className="plain-action primary" disabled={!canConnect} onClick={hub.connect}>Life Hub 연결</button></div>
    {!canConnect && <p className="fineprint">배포된 주소에서만 연결할 수 있어요.</p>}
  </>;

  const status = phase === 'syncing' ? '연결됨 · 동기화 중…' : phase === 'retry' ? '연결됨 · 잠시 뒤 다시 시도' : '연결됨';
  return <>
    <div className="label">Life Hub</div>
    <p className="lifehub-status" role="status"><span className="lifehub-dot" data-tone="ok" aria-hidden="true" />{status}</p>
    <div className="settings-actions">
      <button type="button" className="plain-action" disabled={phase === 'syncing'} onClick={() => void runSync()}>지금 동기화</button>
      <button type="button" className="plain-action" onClick={hub.disconnect}>연결 해제</button>
    </div>
    <label className="dig-check">
      <input type="checkbox" checked={hub.autoApply} onChange={(e) => hub.setAutoApply(e.target.checked)} />
      <span>Claude에서 승인한 기록은 바로 반영 <span className="dig-help">(앨범과 곡이 정확히 맞을 때만)</span></span>
    </label>
    {hub.conflictNote && <p className="fineprint">{hub.conflictNote}</p>}
  </>;
}
