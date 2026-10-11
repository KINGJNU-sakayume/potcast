/**
 * Review bookkeeping for the criteria that a machine cannot check (see review/standards.json).
 *
 *   npm run review:status                 every criterion: done at the current version / outdated / not yet
 *   npm run review:status -- --list T2    the notes still to do for one criterion (outdated or missing)
 *
 * `npm run notes:audit` and `npm run check` cover the mechanical floor; this covers what a person or agent has to read.
 * Raise a criterion's `version` in standards.json when its meaning changes and checked notes must be looked at again.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type AppliesTo = 'translated-songs' | 'songs' | 'albums' | 'artists';
interface Criterion {
  id: string;
  title: string;
  version: number;
  appliesTo: AppliesTo;
  how: string;
}
interface ReviewRecord {
  version: number;
  date?: string;
  note?: string;
}
interface Status {
  notes: { [noteId: string]: { [criterionId: string]: ReviewRecord } };
}

const NOTES_DIR = 'src/editorial/notes';
const standards = JSON.parse(readFileSync('review/standards.json', 'utf8')) as { criteria: Criterion[] };
const status = JSON.parse(readFileSync('review/status.json', 'utf8')) as Status;

function keys(kind: string): string[] {
  return readdirSync(join(NOTES_DIR, kind))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -'.md'.length))
    .sort();
}

function applicable(criterion: Criterion): string[] {
  switch (criterion.appliesTo) {
    case 'songs':
      return keys('songs').map((key) => `songs/${key}`);
    case 'albums':
      return keys('albums').map((key) => `albums/${key}`);
    case 'artists':
      return keys('artists').map((key) => `artists/${key}`);
    case 'translated-songs':
      return keys('songs')
        .filter((key) => existsSync(join(NOTES_DIR, 'songs', `${key}.translation.json`)))
        .map((key) => `songs/${key}`);
  }
}

function state(noteId: string, criterion: Criterion): 'done' | 'outdated' | 'missing' {
  const record = status.notes[noteId]?.[criterion.id];
  if (!record) return 'missing';
  return record.version >= criterion.version ? 'done' : 'outdated';
}

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const listIndex = args.indexOf('--list');
const listId = listIndex >= 0 ? args[listIndex + 1] : undefined;

if (listId) {
  const criterion = standards.criteria.find((entry) => entry.id === listId);
  if (!criterion) {
    console.error(`No criterion ${listId}. Known: ${standards.criteria.map((entry) => entry.id).join(', ')}.`);
    process.exit(1);
  }
  console.log(`${criterion.id} v${criterion.version} ${criterion.title}\n${criterion.how}\n`);
  for (const noteId of applicable(criterion)) {
    const result = state(noteId, criterion);
    if (result !== 'done') console.log(`${result.padEnd(8)} ${noteId}`);
  }
} else {
  console.log(`${'criterion'.padEnd(34)} ${'v'.padStart(2)} ${'done'.padStart(5)} ${'outdated'.padStart(9)} ${'missing'.padStart(8)}`);
  for (const criterion of standards.criteria) {
    const ids = applicable(criterion);
    const count = (wanted: string) => ids.filter((noteId) => state(noteId, criterion) === wanted).length;
    console.log(
      `${`${criterion.id} ${criterion.title}`.padEnd(34)} ${String(criterion.version).padStart(2)} ${String(count('done')).padStart(5)} ${String(count('outdated')).padStart(9)} ${String(count('missing')).padStart(8)}`,
    );
  }
}
