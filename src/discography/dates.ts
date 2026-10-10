/**
 * Sortable form of a Spotify release date of any precision: "2020" and
 * "2020-08" sort before "2020-08-05" of the same year. Unknown dates sort last.
 */
export function releaseDateKey(date: string | null | undefined): string {
  const match = date ? /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date) : null;
  if (!match) return '9999-99-99';
  return `${match[1]}-${match[2] ?? '00'}-${match[3] ?? '00'}`;
}

export function compareReleaseDates(a: string | null | undefined, b: string | null | undefined): number {
  return releaseDateKey(a).localeCompare(releaseDateKey(b));
}
