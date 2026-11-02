import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useState } from 'react';
import { useSession } from '../app/sessionContext';
import { useRecentlyPlayed } from '../catalogue/queries';
import { SideDrawer } from '../components/SideDrawer';
import { applyImport, exportBackup, parseBackup, previewImport, type ImportPlan } from './backup';
import { useDigAction, useDigging } from './context';
import { historyByDay, inScope } from './progress';
import { TABLES } from './types';
import { LifeHubSection } from '../lifehub/LifeHubSection';

function BackupTools() {
  const { db, accountId } = useDigging();
  const action = useDigAction();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<string | null>(null);
  const heading = useId();
  return <section className="dig-editor" aria-labelledby={heading}>
    <h3 id={heading}>JSON 백업·가져오기</h3>
    <p className="dig-help">이 기기·브라우저에 저장합니다. 기기 간 자동 동기화는 없습니다. 기존 spottied DB는 읽거나 변경하지 않으며, spottied 설정에서 내보낸 JSON 파일을 사용합니다.</p>
    <button type="button" className="plain-action" disabled={!db || action.busy} onClick={() => {
      if (!db || !accountId) return;
      void action.run(async () => {
        const text = await exportBackup(db, accountId);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `potcast-digging-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }}>JSON 내보내기</button>
    <label>백업 파일 미리보기<input type="file" accept=".json,application/json" disabled={!db || action.busy} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = '';
      setPlan(null); setSelected(new Set()); setResult(null);
      if (!file || !db) return;
      void action.run(async () => {
        if (file.size > 32 * 1024 * 1024) throw new Error('백업은 32 MB 이하만 지원합니다.');
        const parsed = parseBackup(await file.text());
        const preview = await previewImport(db, parsed);
        setPlan(preview); setSelected(new Set(preview.entries.filter((e) => e.status === 'new').map((e) => e.key)));
      });
    }} /></label>
    {plan && <div className="dig-import-preview">
      <p>{plan.backup.source} · <time dateTime={plan.backup.exportedAt}>{new Date(plan.backup.exportedAt).toLocaleString()}</time></p>
      {plan.backup.accountId && plan.backup.accountId !== accountId && <p>다른 계정의 백업입니다. 선택한 항목을 현재 계정 ({accountId})에 가져옵니다.</p>}
      {!plan.backup.accountId && <p className="dig-help">spottied 백업에는 계정 정보가 없습니다. 본인의 백업인지 확인한 후 가져오세요.</p>}
      <table className="dig-import-counts"><thead><tr><th>항목</th><th>신규</th><th>동일</th><th>충돌</th></tr></thead><tbody>
        {TABLES.map((table) => <tr key={table}><th>{table}</th>{(['new', 'identical', 'conflict'] as const).map((status) => <td key={status}>{plan.entries.filter((e) => e.table === table && e.status === status).length}</td>)}</tr>)}
      </tbody></table>
      <p className="dig-help">신규 항목은 기본 선택, 동일 항목은 생략, 충돌은 기본 보존합니다. 충돌을 열어 비교하고 개별 승인할 수 있습니다.</p>
      <details><summary>변경 사항 선택·충돌 확인</summary><ul className="dig-import-entries">{plan.entries.filter((e) => e.status !== 'identical').map((entry) => <li key={entry.key}>
        <label className="dig-check"><input type="checkbox" checked={selected.has(entry.key)} onChange={(event) => setSelected((old) => {
          const next = new Set(old); if (event.target.checked) next.add(entry.key); else next.delete(entry.key); return next;
        })} /><span>{entry.table} · {entry.id.length > 70 ? `${entry.id.slice(0, 70)}…` : entry.id} · {entry.status === 'conflict' ? '충돌: 가져온 값으로 변경' : '신규'}</span></label>
        {entry.status === 'conflict' && <details><summary>기존 값 / 가져올 값 비교</summary><h4>기존 값</h4><pre>{JSON.stringify(JSON.parse(entry.before!), null, 2)}</pre><h4>가져올 값</h4><pre>{JSON.stringify(JSON.parse(entry.incoming), null, 2)}</pre></details>}
      </li>)}</ul></details>
      <button type="button" className="plain-action primary" disabled={!selected.size || action.busy} onClick={() => {
        if (!db) return;
        void action.run(async () => {
          const counts = await applyImport(db, plan, selected);
          setResult(`가져오기 완료: ${TABLES.map((t) => `${t} ${counts[t]}`).join(' · ')}`); setPlan(null); setSelected(new Set());
        });
      }}>선택한 {selected.size}개 변경 승인·가져오기</button>
    </div>}
    {result && <p role="status">{result}</p>}
    {action.error && <p role="alert">{action.error}</p>}
  </section>;
}

function RecentApproval() {
  const { data, service } = useDigging();
  const { catalogue } = useSession();
  const client = useQueryClient();
  const recent = useRecentlyPlayed();
  const action = useDigAction();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (!recent.data || !service) return;
    const missing = [...new Set(recent.data.filter((item) => data.memberships.some((m) => m.albumId === item.track.album.id) && !data.tracks.some((t) => t.id === item.track.spotifyTrackId)).map((item) => item.track.album.id))];
    let active = true;
    void (async () => {
      for (const id of missing) {
        try {
          const album = await client.fetchQuery({ queryKey: [catalogue.mode, 'album', id], queryFn: () => catalogue.getAlbum(id), staleTime: 30 * 60_000 });
          if (active) await service.rememberAlbum(album);
        } catch { /* Existing known tracks remain available for approval. */ }
      }
    })();
    return () => { active = false; };
  }, [recent.data, service, data.memberships, data.tracks, client, catalogue]);
  const candidates = (recent.data ?? []).filter((item) => {
    const album = data.releases.find((r) => r.id === item.track.album.id);
    return album && data.tracks.some((t) => t.id === item.track.spotifyTrackId) && data.memberships.some((m) => {
      const project = data.projects.find((p) => p.id === m.artistId);
      return m.albumId === album.id && project && inScope(project, m, album);
    }) && !data.events.some((e) => e.trackId === item.track.spotifyTrackId && e.listenedAt === item.playedAt);
  });
  return <section className="dig-editor">
    <h3>Spotify 최근 재생 승인</h3>
    <p className="dig-help">추적 대상의 최근 재생만 제안합니다. 선택·승인 후에만 청취 상태와 이벤트를 기록하며, 청취 시간을 검증하지 않습니다.</p>
    {recent.isPending ? <p role="status">최근 재생 확인 중…</p> : recent.isError ? <p role="alert">최근 재생을 불러오지 못했습니다. <button className="note-more" onClick={() => void recent.refetch()}>다시 시도</button></p> : candidates.length === 0 ? <p className="dig-help">승인할 새 기록이 없습니다.</p> : <>
      <ul className="dig-recent-candidates">{candidates.map((item) => {
        const key = `${item.track.spotifyTrackId}@${item.playedAt}`;
        return <li key={key}><label className="dig-check"><input type="checkbox" checked={selected.has(key)} onChange={(e) => setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(key); else next.delete(key); return next; })} />
          <span>{item.track.title}<time dateTime={item.playedAt}>{new Date(item.playedAt).toLocaleString()}</time></span>
        </label></li>;
      })}</ul>
      <button className="plain-action" type="button" disabled={action.busy || !selected.size} onClick={() => {
        if (!service) return;
        void action.run(async () => {
          const count = await service.approveRecent(candidates.filter((item) => selected.has(`${item.track.spotifyTrackId}@${item.playedAt}`)).map((item) => ({
            id: `spotify:${item.track.spotifyTrackId}:${item.playedAt}`, trackId: item.track.spotifyTrackId, albumId: item.track.album.id,
            artistId: data.memberships.find((m) => m.albumId === item.track.album.id)!.artistId, listenedAt: item.playedAt, source: 'spotify-sync',
          })));
          setSelected(new Set()); setResult(`${count}개의 최근 재생을 기록했습니다.`);
        });
      }}>선택한 {selected.size}개 승인</button>
    </>}
    {result && <p role="status">{result}</p>}{action.error && <p role="alert">{action.error}</p>}
  </section>;
}

export function RecordTools() {
  const { data, ready, accountId } = useDigging();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [recentOpen, setRecentOpen] = useState(false);
  useEffect(() => { setOpen(false); setRecentOpen(false); }, [accountId]);
  const heading = useId();
  const days = historyByDay(data.events);
  return <div className="dig-record-tools">
    <button type="button" className="text-toggle" disabled={!ready} onClick={() => setOpen(true)}>기록 백업·청취 이력</button>
    {open && <SideDrawer open onClose={close} label="Personal records" labelledBy={heading} closeLabel="Close record tools">
      <h2 id={heading}>개인 음악 기록</h2>
      <BackupTools key={accountId} />
      <div className="dig-editor"><button type="button" className="text-toggle" aria-expanded={recentOpen} onClick={() => setRecentOpen((v) => !v)}>Spotify 최근 재생 확인</button></div>
      {recentOpen && <RecentApproval />}
      <LifeHubSection key={`lifehub-${accountId ?? ''}`} />
      <section className="dig-editor dig-history" aria-label="날짜별 청취 기록"><h3>날짜별 청취 기록</h3>
        {!days.size && <p className="dig-help">기록된 청취 이벤트가 없습니다. 상태 변경만으로 이벤트를 생성하지 않습니다.</p>}
        {[...days].map(([day, events]) => <details key={day}><summary>{day} · {events.length}회</summary><ul>{events.map((e) => <li key={e.id}>
          <time dateTime={e.listenedAt}>{new Date(e.listenedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> · {data.tracks.find((t) => t.id === e.trackId)?.name ?? e.trackId}
        </li>)}</ul></details>)}
      </section>
    </SideDrawer>}
  </div>;
}
