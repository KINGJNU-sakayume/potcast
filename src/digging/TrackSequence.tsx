import { useCallback, useEffect, useState } from 'react';
import { AlbumBadges } from '../components/Badge';
import { PlayingMark } from '../components/PlayingMark';
import type { AlbumDetail, AlbumTrack } from '../domain/types';
import { getSongNote } from '../editorial/lookup';
import { formatDuration, formatTrackNumber, joinArtistNames } from '../lib/format';
import { usePlay } from '../playback/hooks';
import { useCurrentTrackMatcher } from '../playback/useCurrentTrack';
import { detectLineLanguage } from '../translation/languageDetect';
import { useDigAction, useDigging } from './context';
import { PersonalEditor } from './PersonalEditor';
import { reviewStatesFor } from './progress';
import type { StatusUndo } from './service';
import type { ReviewStatus } from './types';

type SequenceMode = 'play' | 'record' | 'batch';

/** H2: original playback rows by default; personal controls only in explicitly selected modes. */
export function TrackSequence({ album }: { album: AlbumDetail }) {
  const play = usePlay();
  const isCurrent = useCurrentTrackMatcher();
  const { data, service, ready, accountId } = useDigging();
  const action = useDigAction();
  const [mode, setMode] = useState<SequenceMode>('play');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [undo, setUndo] = useState<StatusUndo | null>(null);
  const [editing, setEditing] = useState<AlbumTrack | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  useEffect(() => { setMode('play'); setSelected(new Set()); setUndo(null); setEditing(null); }, [accountId, album.id]);
  const artistNames = album.artists.map((a) => a.name);
  const states = reviewStatesFor(data);
  const statusOf = (id: string) => states.get(id) ?? 'none';

  const setStatus = (track: AlbumTrack, status: ReviewStatus) => {
    if (!service) return;
    void action.run(async () => {
      await service.rememberAlbum(album);
      await service.setStatuses([track.id], statusOf(track.id) === status ? 'none' : status);
    });
  };
  const batch = (status: ReviewStatus) => {
    if (!service || !selected.size) return;
    void action.run(async () => {
      await service.rememberAlbum(album);
      const change = await service.setStatuses([...selected], status);
      setUndo(change.before.length ? change : null);
    });
  };

  const discs = new Map<number, AlbumTrack[]>();
  for (const track of album.tracks) discs.set(track.discNumber, [...(discs.get(track.discNumber) ?? []), track]);

  const row = (track: AlbumTrack) => {
    const current = isCurrent({ id: track.id, uri: track.uri, name: track.name, albumId: album.id });
    const albumIds = new Set(album.artists.map((a) => a.id));
    const guests = track.artists.filter((a) => !albumIds.has(a.id));
    const noted = getSongNote({ id: track.id, title: track.name, artistNames: [...artistNames, ...track.artists.map((a) => a.name)] });
    const status = statusOf(track.id);
    const number = <span className="num" aria-hidden="true">{current ? <PlayingMark playing={current.playing} /> : formatTrackNumber(track.trackNumber)}</span>;
    const title = <span className="track-text">
      <b lang={detectLineLanguage(track.name)}>
        {track.name}
        {noted && <AlbumBadges noted episode={false} />}
        {mode === 'play' && status !== 'none' && <span className="dig-status" role="img" aria-label={status === 'listened' ? '청취' : '스킵'}>{status === 'listened' ? '✓' : '⇥'}</span>}
      </b>
      {guests.length > 0 && <span className="track-guests">with {joinArtistNames(guests)}</span>}
    </span>;
    const explicit = track.explicit && <span className="explicit" role="img" aria-label="Explicit" title="Explicit">E</span>;
    const time = <span className="track-aside">
      <span className="track-aside-explicit">{explicit}</span>
      <span className="track-aside-time">{formatDuration(track.durationMs)}</span>
    </span>;
    if (mode === 'play') return <li key={track.id}>
      <button type="button" className={current ? 'track-item active' : 'track-item'} aria-current={current ? 'true' : undefined}
        disabled={!track.isPlayable} title={track.isPlayable ? undefined : 'Not available in your market'}
        onClick={() => play({ contextUri: album.uri, offsetUri: track.uri }, { openNowPlaying: true })}>
        {number}{title}{time}
      </button>
    </li>;

    return <li key={track.id}>
      <div className={`track-item dig-record-row${mode === 'batch' ? ' dig-batch-row' : ''}${current ? ' active' : ''}`}>
        {mode === 'batch' && <label className="dig-select"><input type="checkbox" aria-label={`선택: ${track.name}`} checked={selected.has(track.id)} onChange={(e) => {
          setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(track.id); else next.delete(track.id); return next; });
        }} /></label>}
        {number}
        <button type="button" className="dig-record-title" aria-label={`개인 기록: ${track.name}`} onClick={() => setEditing(track)}>{title}</button>
        {time}
        {mode === 'record' && <span className="dig-track-actions" role="group" aria-label={`${track.name} 검토 상태`}>
          <button type="button" disabled={!ready || action.busy} aria-label={`청취: ${track.name}`} aria-pressed={status === 'listened'} onClick={() => setStatus(track, 'listened')}>✓</button>
          <button type="button" disabled={!ready || action.busy} aria-label={`스킵: ${track.name}`} aria-pressed={status === 'skipped'} onClick={() => setStatus(track, 'skipped')}>⇥</button>
        </span>}
      </div>
    </li>;
  };

  return <>
    <div className="dig-sequence-tools">
      <div className="search-filters" role="group" aria-label="Track sequence mode">
        {([['play', '재생'], ['record', '기록'], ['batch', '일괄']] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={mode === value} disabled={value !== 'play' && !ready} onClick={() => { setMode(value); setSelected(new Set()); }}>{label}</button>)}
      </div>
      {mode === 'record' && <span className="dig-help">제목을 누르면 상세 기록 · ✓ 청취 / ⇥ 스킵</span>}
    </div>
    {mode === 'batch' && <div className="dig-batch-tools" aria-label="일괄 기록">
      <span role="status">{selected.size}곡 선택</span>
      <button className="text-toggle" type="button" onClick={() => setSelected(new Set(album.tracks.map((t) => t.id)))}>전체 선택</button>
      <button className="text-toggle" type="button" onClick={() => setSelected(new Set(album.tracks.filter((t) => statusOf(t.id) === 'none').map((t) => t.id)))}>미검토만 선택</button>
      <button className="text-toggle" type="button" onClick={() => setSelected(new Set())}>선택 해제</button>
      {([['listened', '청취 처리'], ['skipped', '스킵 처리'], ['none', '미검토로 초기화']] as const).map(([status, label]) =>
        <button className="plain-action" key={status} type="button" disabled={!selected.size || action.busy} onClick={() => batch(status)}>{label}</button>)}
    </div>}
    {undo && <div className="dig-undo" role="status">{undo.before.length}곡의 상태를 변경했습니다. <button className="note-more" type="button" disabled={action.busy} onClick={() => {
      if (service) void action.run(async () => { await service.undo(undo); setUndo(null); });
    }}>실행 취소</button></div>}
    {action.error && <p className="dig-help" role="alert">{action.error}</p>}
    {discs.size <= 1 ? <ol className="track-table">{album.tracks.map(row)}</ol> : <div className="track-table">
      {[...discs].map(([disc, tracks]) => <section key={disc} aria-label={`Disc ${disc}`}><h3 className="disc-label">Disc {disc}</h3><ol>{tracks.map(row)}</ol></section>)}
    </div>}
    {editing && <PersonalEditor key={`${accountId}:${editing.id}`} kind="track" subjectId={editing.id} title={editing.name} albumId={album.id} artistId={album.artists[0]?.id ?? ''} onClose={closeEditor} />}
  </>;
}
