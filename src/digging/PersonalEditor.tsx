import { useCallback, useId, useState } from 'react';
import { SideDrawer } from '../components/SideDrawer';
import { useDigAction, useDigging } from './context';
import { historyByDay, statusForTrack } from './progress';
import { reviewId, type ReviewStatus } from './types';

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface PersonalEditorProps {
  kind: 'album' | 'track';
  subjectId: string;
  title: string;
  albumId: string;
  artistId: string;
  onClose: () => void;
}

export function PersonalEditor({ kind, subjectId, title, albumId, artistId, onClose }: PersonalEditorProps) {
  const { data, service, ready } = useDigging();
  const action = useDigAction();
  const heading = useId();
  const existing = data.reviews.find((r) => r.id === reviewId(kind, subjectId));
  const [rating, setRating] = useState(existing?.rating ?? null);
  const [favoriteAt, setFavoriteAt] = useState(existing?.favoriteAt ?? null);
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [status, setStatus] = useState<ReviewStatus>(statusForTrack(subjectId, data));
  const [listenedAt, setListenedAt] = useState(localDateTime);
  const [added, setAdded] = useState(false);
  const close = useCallback(() => onClose(), [onClose]);
  const history = historyByDay(data.events.filter((e) => e.trackId === subjectId));

  return (
    <SideDrawer open onClose={close} label="Personal listening" labelledBy={heading} closeLabel="Close personal record">
      <form className="dig-editor" onSubmit={(event) => {
        event.preventDefault();
        if (!service) return;
        void action.run(async () => {
          await service.repository.write(async () => {
            await service.saveReview(kind, subjectId, { rating, favoriteAt, summary, note });
            if (kind === 'track') await service.setStatuses([subjectId], status);
          });
          onClose();
        });
      }}>
        <h2 id={heading}>{title}</h2>
        {kind === 'track' && <label>검토 상태<select value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
          <option value="none">미검토</option><option value="listened">청취</option><option value="skipped">스킵</option>
        </select></label>}
        <label>개인 별점<select value={rating ?? ''} onChange={(e) => setRating(e.target.value ? Number(e.target.value) : null)}>
          <option value="">별점 없음</option>
          {Array.from({ length: 10 }, (_, i) => (i + 1) / 2).map((n) => <option value={n} key={n}>{n.toFixed(1)} / 5</option>)}
        </select></label>
        <label className="dig-check"><input type="checkbox" checked={favoriteAt !== null} onChange={(e) => setFavoriteAt(e.target.checked ? new Date().toISOString() : null)} />개인 즐겨찾기</label>
        <p className="dig-help">Spotify Saved / Liked와 별도로 보관합니다.</p>
        <label>감상 한 줄<input value={summary} maxLength={240} onChange={(e) => setSummary(e.target.value)} /></label>
        <label>개인 메모<textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="dig-help">이 기기·브라우저의 개인 기록입니다. Editorial Notes와 별도로 저장합니다.</p>
        {(action.error) && <p role="alert">{action.error}</p>}
        <button className="plain-action primary" type="submit" disabled={!ready || action.busy}>저장</button>
      </form>
      {kind === 'track' && <section className="dig-editor dig-history" aria-label="청취 이력">
        <h3>청취 이력</h3>
        <p className="dig-help">상태 표시는 재생 검증이 아닙니다. 재청취는 별도 이벤트로 남깁니다.</p>
        {history.size === 0 && <p className="dig-help">기록된 청취 이벤트가 없습니다.</p>}
        {[...history].map(([day, events]) => <div key={day}><h4>{day}</h4><ul>{events.map((e) => <li key={e.id}>
          <time dateTime={e.listenedAt}>{new Date(e.listenedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> · {e.source === 'manual' ? '수동 기록' : 'Spotify 최근 재생 승인'}
        </li>)}</ul></div>)}
        <label>청취 날짜<input type="datetime-local" value={listenedAt} onChange={(e) => setListenedAt(e.target.value)} /></label>
        <button type="button" className="plain-action" disabled={!ready || action.busy || !listenedAt} onClick={() => {
          if (!service) return;
          void action.run(async () => {
            await service.addListen({ id: crypto.randomUUID(), trackId: subjectId, albumId, artistId, listenedAt: new Date(listenedAt).toISOString(), source: 'manual' });
            setAdded(true);
          });
        }}>재청취 이벤트 추가</button>
        {added && <p role="status" className="dig-help">청취 이벤트를 기록했습니다.</p>}
      </section>}
    </SideDrawer>
  );
}
