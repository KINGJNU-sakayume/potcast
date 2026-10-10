/**
 * Fills the artwork URLs the Archive shows: `cover:` on album notes and `image:` on artist notes.
 *
 *   npm run notes:art -- --dry-run
 *   npm run notes:art
 *   npm run notes:art -- --only kanye-west,graduation
 *
 * For every note without one, asks Spotify's public oEmbed endpoint (no sign-in) for the first `albumIds` /
 * `artistIds` entry and writes its `thumbnail_url` into the frontmatter, after `releaseYear:` / `origin:` (or after
 * the ID line). Only that one line is added; the rest of the file is left as it is. Notes that already have artwork
 * are skipped, so editing a URL by hand sticks. Any failure is listed and makes the command exit 1.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter } from '../src/editorial/frontmatter';
import { insertField } from './art/insertField';

const NOTES = join(import.meta.dirname, '../src/editorial/notes');

interface Target {
  file: string;
  key: string;
  kind: 'album' | 'artist';
  field: 'cover' | 'image';
  id: string;
  /** Frontmatter keys to insert after, first match wins. */
  after: string[];
}

function args(): { dryRun: boolean; only: Set<string> | null } {
  const argv = process.argv.slice(2);
  const onlyIndex = argv.indexOf('--only');
  const only = onlyIndex >= 0 && argv[onlyIndex + 1] ? new Set(argv[onlyIndex + 1]!.split(',').map((key) => key.trim())) : null;
  return { dryRun: argv.includes('--dry-run'), only };
}

function targets(only: Set<string> | null): Target[] {
  const kinds = [
    { dir: 'albums', kind: 'album', field: 'cover', ids: 'albumIds', after: ['releaseYear', 'titles', 'albumIds'] },
    { dir: 'artists', kind: 'artist', field: 'image', ids: 'artistIds', after: ['origin', 'names', 'artistIds'] },
  ] as const;
  const list: Target[] = [];
  for (const { dir, kind, field, ids, after } of kinds) {
    for (const name of readdirSync(join(NOTES, dir)).filter((n) => n.endsWith('.md')).sort()) {
      const key = name.replace(/\.md$/, '');
      if (only && !only.has(key)) continue;
      const file = join(NOTES, dir, name);
      const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
      const idList = data[ids];
      const id = Array.isArray(idList) && typeof idList[0] === 'string' ? idList[0] : null;
      if (data[field] !== undefined || !id) continue;
      list.push({ file, key, kind, field, id, after: [...after] });
    }
  }
  return list;
}

async function thumbnail(kind: Target['kind'], id: string): Promise<string> {
  const page = `https://open.spotify.com/${kind}/${id}`;
  const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(page)}`);
  if (!response.ok) throw new Error(`oEmbed ${response.status} for ${page}`);
  const body = (await response.json()) as { thumbnail_url?: unknown };
  if (typeof body.thumbnail_url !== 'string' || !body.thumbnail_url.startsWith('https://')) throw new Error(`no thumbnail_url for ${page}`);
  return body.thumbnail_url;
}

async function main() {
  const { dryRun, only } = args();
  const failures: string[] = [];
  const list = targets(only);
  if (list.length === 0) console.log('Every note already has its artwork.');
  for (const target of list) {
    const path = relative(process.cwd(), target.file);
    try {
      const url = await thumbnail(target.kind, target.id);
      if (!dryRun) writeFileSync(target.file, insertField(readFileSync(target.file, 'utf8'), target.field, url, target.after));
      console.log(`${dryRun ? 'would set' : 'set'} ${target.field} · ${path} · ${url}`);
    } catch (error) {
      failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:\n${failures.map((line) => `  ${line}`).join('\n')}`);
    process.exit(1);
  }
}

void main();
