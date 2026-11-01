import { useCallback, useId, useState } from 'react';
import { useArtist } from '../catalogue/queries';
import { SideDrawer } from '../components/SideDrawer';
import { usePlay } from '../playback/hooks';
import { useDigAction, useDigging } from './context';
import { useSyncDigProject } from './hooks';
import { progressFor } from './progress';
import type { ArtistDigProject, ReleaseMembership } from './types';

export const percent = (ratio: number) => `${Math.floor(ratio * 100)}%`;

function ScopeEditor({ project, onClose }: { project: ArtistDigProject; onClose: () => void }) {
  const { data, service } = useDigging();
  const action = useDigAction();
  const heading = useId();
  const [note, setNote] = useState(project.note);
  const members = data.memberships.filter((m) => m.artistId === project.id);
  const changeMembership = (m: ReleaseMembership, override: ReleaseMembership['override'], studio: boolean | null) => {
    if (service) void action.run(() => service.setMembership(m.id, override, studio));
  };
  return <SideDrawer open onClose={onClose} label="Digging scope" labelledBy={heading} closeLabel="Close digging scope">
    <div className="dig-editor">
      <h2 id={heading}>추적 범위 · {project.name}</h2>
      {([['album', '앨범'], ['single', '싱글·EP'], ['compilation', '컴필레이션'], ['appears_on', '참여작']] as const).map(([key, label]) =>
        <label className="dig-check" key={key}><input type="checkbox" checked={project.scope[key]} disabled={action.busy} onChange={(e) => {
          if (service) void action.run(() => service.configure(project.id, { scope: { ...project.scope, [key]: e.target.checked } }));
        }} />{label}</label>)}
      <label className="dig-check"><input type="checkbox" checked={project.studioOnly} disabled={action.busy} onChange={(e) => {
        if (service) void action.run(() => service.configure(project.id, { studioOnly: e.target.checked }));
      }} />앨범 그룹은 스튜디오 정규 앨범만 기본 포함</label>
      <p className="dig-help">Spotify의 앨범 분류에는 라이브·OST 등이 섞일 수 있습니다. 아래에서 정규 여부와 포함·제외를 직접 지정할 수 있습니다.</p>
      <ul className="dig-scope-releases">{members.map((m) => {
        const release = data.releases.find((r) => r.id === m.albumId);
        return release && <li key={m.id}><span>{release.name}</span><div>
          <select aria-label={`${release.name} 추적 범위`} disabled={action.busy} value={m.override} onChange={(e) => changeMembership(m, e.target.value as ReleaseMembership['override'], m.studio)}>
            <option value="auto">기본 범위</option><option value="include">포함</option><option value="exclude">제외</option>
          </select>
          {m.group === 'album' && <select aria-label={`${release.name} 정규 여부`} disabled={action.busy} value={m.studio === null ? 'auto' : String(m.studio)} onChange={(e) => changeMembership(m, m.override, e.target.value === 'auto' ? null : e.target.value === 'true')}>
            <option value="auto">정규 여부 자동</option><option value="true">정규 앨범</option><option value="false">비정규 앨범</option>
          </select>}
        </div></li>;
      })}</ul>
      <label>아티스트 개인 메모<textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button type="button" className="plain-action" disabled={action.busy} onClick={() => { if (service) void action.run(() => service.configure(project.id, { note })); }}>메모 저장</button>
      {action.error && <p role="alert">{action.error}</p>}
      {data.completions.some((c) => c.artistId === project.id) && <details className="dig-completions"><summary>지난 완주 이력</summary>
        <ul>{data.completions.filter((c) => c.artistId === project.id).map((c) => <li key={c.id}>
          <time dateTime={c.completedAt}>{new Date(c.completedAt).toLocaleDateString()}</time> · {c.kind === 'reviewed' ? '검토 완료' : '전곡 청취'} · 당시 {c.releaseIds.length}개 앨범 / {c.trackIds.length}곡
        </li>)}</ul>
      </details>}
    </div>
  </SideDrawer>;
}

export function ArtistDigging({ artistId }: { artistId: string }) {
  const { data, service, ready, error } = useDigging();
  const artist = useArtist(artistId);
  const project = data.projects.find((p) => p.id === artistId);
  const sync = useSyncDigProject(artistId);
  const action = useDigAction();
  const play = usePlay();
  const [scopeOpen, setScopeOpen] = useState(false);
  const closeScope = useCallback(() => setScopeOpen(false), []);
  if (!project) return <div className="dig-start">
    <button type="button" className="text-toggle" disabled={!ready || action.busy} onClick={() => {
      if (service && artist.data) void action.run(() => service.start(artist.data));
    }}>Start digging</button>
    {(action.error || error) && <p className="dig-help" role="status">{action.error || error}</p>}
  </div>;
  const progress = progressFor(project, data);
  return <div className="dig-artist" aria-label="My digging">
    <span className="label">MY DIGGING</span>
    <div className="dig-progress-line">
      <span>검토 {percent(progress.reviewRatio)} · 청취 {percent(progress.listenRatio)} · 정규 {progress.completedAlbums}/{progress.totalAlbums}</span>
      <div className="dig-inline-actions">
        <button type="button" className="text-toggle" disabled={!progress.next} onClick={() => {
          if (progress.next) play({ contextUri: `spotify:album:${progress.next.albumId}`, offsetUri: progress.next.track.uri }, { openNowPlaying: true });
        }}>Continue digging</button>
        <button type="button" className="text-toggle" onClick={() => setScopeOpen(true)}>추적 범위</button>
      </div>
    </div>
    <div className="dig-progress-rule" role="progressbar" aria-label="검토 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress.reviewRatio * 100)}><span style={{ width: percent(progress.reviewRatio) }} /></div>
    {progress.reviewComplete && <span className="dig-help">{progress.allListened ? '전곡 청취' : '검토 완료 (스킵 포함)'}</span>}
    {!progress.known && <span className="dig-help">{sync.isFetching ? '대상 앨범·수록곡 확인 중…' : '전체 수록곡 확인 전 · 완료 판정 보류'}</span>}
    {sync.isError && <p className="dig-help">목록을 갱신하지 못했습니다. 저장된 기록은 편집할 수 있습니다. <button type="button" className="note-more" onClick={() => void sync.refetch()}>다시 시도</button></p>}
    {scopeOpen && <ScopeEditor project={project} onClose={closeScope} />}
  </div>;
}
