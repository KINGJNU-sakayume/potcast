import { Fragment, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BackLink } from '../app/backHistory';
import { usePageTitle } from '../app/pageTitle';
import { useSession } from '../app/sessionContext';
import { usePageSurface } from '../app/surface';
import { useIsMobile } from '../app/useIsMobile';
import { useArtist, useDiscography } from '../catalogue/queries';
import { CoverImage, Portrait } from '../components/CoverImage';
import { ObjectRow } from '../components/IndexRow';
import { NotePreview } from '../components/NotePreview';
import { QuietRow, StateView } from '../components/StateView';
import { sectionsByYear, sortChronologically, type ReleaseOrder } from '../discography/chronology';
import { groupEditions, type EditionGroup } from '../discography/editions';
import type { AlbumSummary, ReleaseGroup } from '../domain/types';
import { getAlbumNote, getArtistNote } from '../editorial/lookup';
import type { ArtistEra } from '../editorial/types';
import { albumTypeLabel, formatReleaseDate, joinArtistNames, pluralise } from '../lib/format';
import { pickImageUrl } from '../lib/images';
import { isSpotifyId } from '../lib/spotifyUri';
import { usePlay } from '../playback/hooks';
import { describeSpotifyError, isSpotifyApiError } from '../spotify/errors';
import { detectLineLanguage } from '../translation/languageDetect';

function noteFor(release: AlbumSummary) {
  return getAlbumNote({
    id: release.id,
    name: release.name,
    artistNames: release.artists.map((a) => a.name),
    releaseDate: release.releaseDate,
  });
}

/** Other editions of a release, folded under it until opened. */
function Editions({ group, id }: { group: EditionGroup; id: string }) {
  if (group.editions.length === 0) return null;
  return (
    <ul className="edition-list" id={id}>
      {group.editions.map((edition) => (
        <li key={edition.id}>
          <Link className="linkish" to={`/album/${edition.id}`} lang={detectLineLanguage(edition.name)}>
            {edition.name}
          </Link>
          <span>
            {[formatReleaseDate(edition.releaseDate, edition.releaseDatePrecision), edition.totalTracks !== null ? pluralise(edition.totalTracks, 'track') : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EditionsToggle({ group, open, onToggle, controls }: { group: EditionGroup; open: boolean; onToggle: () => void; controls: string }) {
  if (group.editions.length === 0) return null;
  return (
    <button type="button" className="text-toggle editions-toggle" aria-expanded={open} aria-controls={open ? controls : undefined} onClick={onToggle}>
      {open ? 'Hide editions' : `+${pluralise(group.editions.length, 'edition')}`}
    </button>
  );
}

/** A studio album: the v7 horizontal release row with its 180px cover. */
function ReleaseRow({ group }: { group: EditionGroup }) {
  const play = usePlay();
  const [open, setOpen] = useState(false);
  const release = group.primary;
  const noted = noteFor(release) ?? group.editions.map(noteFor).find(Boolean);
  const editionsId = `editions-${release.id}`;
  return (
    <article className="release-card">
      <Link to={`/album/${release.id}`} tabIndex={-1} aria-hidden="true" className="release-cover">
        <CoverImage images={release.images} size={180} alt="" title={release.name} subtitle={joinArtistNames(release.artists)} paletteKey={release.id} />
      </Link>
      <div>
        <div className="label">
          {formatReleaseDate(release.releaseDate, release.releaseDatePrecision) ?? '—'} / {albumTypeLabel(release.albumType)}
          {noted && <span className="release-note"> · Editorial note</span>}
        </div>
        <h4 lang={detectLineLanguage(release.name)}>
          <Link className="linkish" to={`/album/${release.id}`}>
            {release.name}
          </Link>
        </h4>
        <div className="release-meta">
          {release.totalTracks !== null && <span>{pluralise(release.totalTracks, 'track')}</span>}
          {release.artists.length > 1 && <span>{joinArtistNames(release.artists)}</span>}
          <EditionsToggle group={group} open={open} onToggle={() => setOpen(!open)} controls={editionsId} />
        </div>
        {open && <Editions group={group} id={editionsId} />}
      </div>
      <div className="release-actions">
        <button type="button" onClick={() => play({ contextUri: release.uri }, { openNowPlaying: true })}>
          Play
        </button>
        <Link className="release-open" to={`/album/${release.id}`}>
          Open album
        </Link>
      </div>
    </article>
  );
}

/** Singles, compilations and appearances: the compact object row. */
function CompactReleaseRow({ group, kind }: { group: EditionGroup; kind: ReleaseGroup }) {
  const play = usePlay();
  const [open, setOpen] = useState(false);
  const release = group.primary;
  const noted = noteFor(release) ?? group.editions.map(noteFor).find(Boolean);
  const editionsId = `editions-${release.id}`;
  return (
    <>
      <ObjectRow
        images={release.images}
        title={release.name}
        to={`/album/${release.id}`}
        paletteKey={release.id}
        kicker={
          <>
            {formatReleaseDate(release.releaseDate, release.releaseDatePrecision) ?? '—'} / {albumTypeLabel(release.albumType)}
            {noted && <span className="release-note"> · Editorial note</span>}
          </>
        }
        meta={
          <>
            {[release.totalTracks !== null ? pluralise(release.totalTracks, 'track') : null, kind === 'appears_on' ? joinArtistNames(release.artists) : null]
              .filter(Boolean)
              .join(' · ')}
            <EditionsToggle group={group} open={open} onToggle={() => setOpen(!open)} controls={editionsId} />
          </>
        }
        onPlay={() => play({ contextUri: release.uri }, { openNowPlaying: true })}
      />
      {open && (
        <li className="edition-item">
          <Editions group={group} id={editionsId} />
        </li>
      )}
    </>
  );
}

const RELEASE_GROUPS: ReadonlyArray<{ id: ReleaseGroup; label: string; noun: [string, string] }> = [
  { id: 'album', label: 'Albums', noun: ['album', 'albums'] },
  { id: 'single', label: 'Singles & EPs', noun: ['single or EP', 'singles & EPs'] },
  { id: 'compilation', label: 'Compilations', noun: ['compilation', 'compilations'] },
  { id: 'appears_on', label: 'Appears on', noun: ['appearance', 'appearances'] },
];

function eraOf(eras: readonly ArtistEra[] | undefined, year: number | null): ArtistEra | null {
  if (!eras || year === null) return null;
  return eras.find((era) => era.from <= year && (era.to === null || year <= era.to)) ?? null;
}

function eraYears(era: ArtistEra): string {
  if (era.to === era.from) return String(era.from);
  return `${era.from}–${era.to ?? ''}`;
}

/**
 * The artist's discography as a chronology: one release group at a time,
 * every page loaded, editions folded together, grouped by year — oldest
 * first by default, for listening through a career in order.
 */
function Discography({ artistId, eras }: { artistId: string; eras?: readonly ArtistEra[] }) {
  const [params, setParams] = useSearchParams();
  const group = RELEASE_GROUPS.find((g) => g.id === params.get('group')) ?? RELEASE_GROUPS[0]!;
  const order: ReleaseOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const discography = useDiscography(artistId, group.id);
  const data = discography.data;
  const sections = useMemo(() => (data ? sectionsByYear(sortChronologically(groupEditions(data.releases), order)) : []), [data, order]);
  const releaseCount = sections.reduce((sum, section) => sum + section.groups.length, 0);

  const update = (next: { group?: ReleaseGroup; order?: ReleaseOrder }) => {
    const search = new URLSearchParams(params);
    const nextGroup = next.group ?? group.id;
    const nextOrder = next.order ?? order;
    if (nextGroup === 'album') search.delete('group');
    else search.set('group', nextGroup);
    if (nextOrder === 'asc') search.delete('order');
    else search.set('order', nextOrder);
    setParams(search, { replace: true });
  };

  let previousEra: ArtistEra | null = null;
  return (
    <section className="artist-grid discography" aria-labelledby="releases-title">
      <div className="discography-head">
        <h3 id="releases-title">
          Discography
          {data && <span className="section-count">{pluralise(releaseCount, group.noun[0], group.noun[1])}</span>}
        </h3>
        <div className="discography-tools">
          <div className="search-filters discography-filters" role="group" aria-label="Release type">
            {RELEASE_GROUPS.map((option) => (
              <button key={option.id} type="button" aria-pressed={option.id === group.id} onClick={() => update({ group: option.id })}>
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="text-toggle" onClick={() => update({ order: order === 'asc' ? 'desc' : 'asc' })}>
            {order === 'asc' ? 'Oldest first' : 'Newest first'}
          </button>
        </div>
      </div>
      {discography.isPending ? (
        <QuietRow role="status">Loading {group.noun[1]}…</QuietRow>
      ) : discography.isError ? (
        <QuietRow role="alert">{describeSpotifyError(discography.error).body}</QuietRow>
      ) : sections.length === 0 ? (
        <QuietRow>Spotify lists no {group.noun[1]} for this artist.</QuietRow>
      ) : (
        <div className="timeline">
          {sections.map((section) => {
            const era = eraOf(eras, section.year);
            const showEra = era !== null && era !== previousEra;
            previousEra = era;
            return (
              <Fragment key={`${section.year ?? 'undated'}-${section.groups[0]!.primary.id}`}>
                {showEra && (
                  <div className="era-marker">
                    <span className="era-years">{eraYears(era)}</span>
                    <span lang="ko">{era.title}</span>
                  </div>
                )}
                <div className="year-section">
                  <div className="year-label">{section.year ?? 'Undated'}</div>
                  {group.id === 'album' ? (
                    <div className="year-releases">
                      {section.groups.map((g) => (
                        <ReleaseRow key={g.primary.id} group={g} />
                      ))}
                    </div>
                  ) : (
                    <ul className="object-rows compact year-releases">
                      {section.groups.map((g) => (
                        <CompactReleaseRow key={g.primary.id} group={g} kind={group.id} />
                      ))}
                    </ul>
                  )}
                </div>
              </Fragment>
            );
          })}
          {data && !data.complete && (
            <QuietRow>
              Showing the first {data.releases.length} of {data.total} {group.noun[1]} Spotify lists.
            </QuietRow>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The v7 Artist dossier: portrait beside name, origin line and Editorial
 * Note; releases below as restrained horizontal rows.
 */
export function ArtistPage() {
  const { artistId } = useParams();
  const artist = useArtist(artistId);
  const play = usePlay();
  const { mode } = useSession();
  const mobile = useIsMobile();
  usePageTitle('Artist', artist.data?.name ?? null);
  // Desktop (v7.5): the page takes the colour of the artist's photograph; without one it stays on paper.
  const portraitUrl = artist.data ? pickImageUrl(artist.data.images, 64) : null;
  usePageSurface(isSpotifyId(artistId) && portraitUrl ? { key: `artist:${artistId}`, imageUrl: portraitUrl } : null);

  if (!isSpotifyId(artistId)) {
    return (
      <StateView label="Artist profile" title="Artist unavailable" actions={<Link className="plain-action" to="/library">Library</Link>}>
        <p>This isn’t a valid artist address. Artists open from their Spotify ID.</p>
      </StateView>
    );
  }

  if (artist.isPending) {
    return (
      <StateView label="Artist profile" title="Loading artist…">
        <p>Reading the artist and their releases.</p>
      </StateView>
    );
  }

  if (artist.isError) {
    const notFound = isSpotifyApiError(artist.error) && artist.error.kind === 'not-found';
    const { title, body } = describeSpotifyError(artist.error);
    return (
      <StateView
        label="Artist profile"
        title={title}
        tone={notFound ? 'neutral' : 'alert'}
        actions={
          <>
            {!notFound && (
              <button type="button" className="plain-action" onClick={() => void artist.refetch()}>
                Try again
              </button>
            )}
            <Link className="plain-action" to="/library">
              Library
            </Link>
          </>
        }
      >
        <p>{body}</p>
      </StateView>
    );
  }

  const data = artist.data;
  const note = getArtistNote({ id: data.id, name: data.name });
  // Deprecated Spotify fields are shown only while Spotify still returns them.
  const facts = [
    data.genres.length > 0 ? data.genres.slice(0, 3).join(' / ') : null,
    data.followers !== null ? `${new Intl.NumberFormat('en').format(data.followers)} followers` : null,
  ].filter(Boolean);
  const origin = note?.origin ?? (facts.length > 0 ? facts.join(' · ') : 'Spotify artist');

  return (
    <div className="view active">
      <div className="artist-page">
        <div className="artist-shell">
          {!mobile && <BackLink />}
          <section className="artist-hero">
            <Portrait images={data.images} name={data.name} />
            <div className="artist-copy">
              <div className="artist-number">Artist profile</div>
              <h1 lang={detectLineLanguage(data.name)}>{data.name}</h1>
              <div className="origin">{origin}</div>
              <NotePreview kind="ARTIST" note={note} title={data.name} subtitle={origin} titleLang={detectLineLanguage(data.name)} />
              <div className="object-actions">
                <button type="button" className="plain-action primary" onClick={() => play({ contextUri: data.uri }, { openNowPlaying: true })}>
                  Play artist
                </button>
                {mode === 'spotify' && (
                  <a className="plain-action" href={`https://open.spotify.com/artist/${data.id}`} target="_blank" rel="noopener noreferrer">
                    Open in Spotify<span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </div>
          </section>
          <Discography artistId={data.id} eras={note?.eras} />
        </div>
      </div>
    </div>
  );
}
