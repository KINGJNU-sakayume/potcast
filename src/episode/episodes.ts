import { devWarn } from '../lib/devWarn';
import { parseEpisodeScript } from './script';
import type { EpisodeScript } from './types';

/**
 * Episode scripts — one Markdown file per album in
 * `src/editorial/notes/episodes/`, named after the album note it belongs to
 * (`igor.md` for `notes/albums/igor.md`). The format is in script.ts.
 *
 * A broken script is skipped with a development warning, so one bad file
 * never takes the album page down; the tests load the same files strictly
 * and fail instead.
 */
export const EPISODE_FILES = import.meta.glob<string>('../editorial/notes/episodes/*.md', { query: '?raw', import: 'default', eager: true });

export function loadEpisodeScripts(files: Record<string, string>, options: { strict?: boolean; warn?: (message: string) => void } = {}): EpisodeScript[] {
  const scripts: EpisodeScript[] = [];
  for (const file of Object.keys(files).sort()) {
    try {
      scripts.push(parseEpisodeScript(file, files[file]!));
    } catch (error) {
      if (options.strict ?? true) throw error;
      options.warn?.(`Episode skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return scripts;
}

export const episodeScripts: readonly EpisodeScript[] = loadEpisodeScripts(EPISODE_FILES, { strict: false, warn: devWarn });

/** The episode written for an album note, if there is one. */
export function getEpisodeScript(albumKey: string | null | undefined, scripts: readonly EpisodeScript[] = episodeScripts): EpisodeScript | null {
  if (!albumKey) return null;
  return scripts.find((script) => script.album === albumKey) ?? null;
}
