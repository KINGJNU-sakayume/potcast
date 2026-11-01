import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { usePlay } from '../playback/hooks';
import { percent } from './ArtistDigging';
import { useDigging } from './context';
import { progressFor } from './progress';
import { RecordTools } from './RecordTools';

/** Lives within the existing Artists section on both layouts. */
export function DigLibrary() {
  const { data, error } = useDigging();
  const play = usePlay();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const sorted = [...data.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const projects = showAll ? sorted : sorted.filter((p) => !progressFor(p, data).reviewComplete).slice(0, 6);
  return <div className="dig-library">
    {projects.length > 0 && <>
      <div className="label">MY DIGGING</div>
      <ul>{projects.map((project) => {
        const progress = progressFor(project, data);
        return <li key={project.id}>
          <div><Link className="linkish" to={`/artist/${project.id}`}>{project.name}</Link><span className="dig-help">검토 {percent(progress.reviewRatio)} · 청취 {percent(progress.listenRatio)}</span></div>
          <button className="text-toggle" type="button" onClick={() => {
            if (progress.next) play({ contextUri: `spotify:album:${progress.next.albumId}`, offsetUri: progress.next.track.uri }, { openNowPlaying: true });
            else navigate(`/artist/${project.id}`);
          }}>Continue digging</button>
        </li>;
      })}</ul>
    </>}
    {data.projects.length > 0 && <button type="button" className="text-toggle" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? '진행 중인 프로젝트만' : `전체 디깅 (${data.projects.length})`}</button>}
    <RecordTools />
    {error && <p className="dig-help" role="status">{error}</p>}
  </div>;
}
