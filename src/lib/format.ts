import type { ReleaseDatePrecision } from '../domain/types';

/** Formats a playback position / duration as m:ss (or h:mm:ss past an hour). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Spoken form for assistive technology, e.g. "3 minutes 10 seconds". */
export function formatDurationForSpeech(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Album runtime, e.g. "39 min" or "1 hr 12 min". */
export function formatRuntime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${Math.max(1, minutes)} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function formatTrackNumber(n: number): string {
  return String(n).padStart(2, '0');
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FORMAT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function releaseYear(date: string | null): string | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date);
  return match ? match[1]! : null;
}

/** Formats a Spotify release date with the precision Spotify reports. */
export function formatReleaseDate(date: string | null, precision: ReleaseDatePrecision | null): string | null {
  if (!date) return null;
  const year = releaseYear(date);
  if (!year) return null;
  if (precision === 'year' || !precision) return year;
  const [, month = '01', day = '01'] = date.split('-');
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(parsed.getTime())) return year;
  return precision === 'month' ? MONTH_FORMAT.format(parsed) : DAY_FORMAT.format(parsed);
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "4 minutes ago", "yesterday", "3 days ago"… for recently played rows. */
export function formatRelativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffSeconds = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return RELATIVE.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 86400 * 7) return RELATIVE.format(Math.round(diffSeconds / 86400), 'day');
  return RELATIVE.format(Math.round(diffSeconds / (86400 * 7)), 'week');
}

export function joinArtistNames(artists: ReadonlyArray<{ name: string }>): string {
  return artists.map((a) => a.name).join(', ');
}

export function albumTypeLabel(type: string): string {
  switch (type) {
    case 'single':
      return 'Single';
    case 'compilation':
      return 'Compilation';
    default:
      return 'Album';
  }
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
