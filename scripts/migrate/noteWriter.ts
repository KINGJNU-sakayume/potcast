import type { TranslationBrief } from '../../src/translation/curated/types';

/**
 * Writes a song note in the frontmatter subset `src/editorial/frontmatter.ts`
 * reads, fields in a fixed order. Used by `npm run notes:migrate`; the
 * migration parses every note it writes back and compares, so a value this
 * writer cannot express fails loudly instead of being written wrong.
 */

export interface SongNoteFields {
  artist: string;
  trackIds?: string[];
  titles: string[];
  short?: string;
  written?: string;
  updated?: string;
  sources?: string[];
  translation?: TranslationBrief;
}

const WRAP = 96;

/** Text that the reader would take for a list, a number or a quoted string goes in JSON quotes. */
function needsQuotes(value: string): boolean {
  return /^["'[]/.test(value) || /^-?\d+$/.test(value) || value !== value.trim() || value === '>' || value === '' || /\n/.test(value);
}

function scalar(value: string): string {
  return needsQuotes(value) ? JSON.stringify(value) : value;
}

function listItem(value: string): string {
  return /[,[\]"']/.test(value) || needsQuotes(value) ? JSON.stringify(value) : value;
}

/** Wraps long text into a folded block (`key: >`), which the reader joins back with single spaces. */
function text(key: string, value: string, indent: string, folded = false): string[] {
  const clean = value.replace(/\s+/g, ' ').trim();
  if ((!folded && clean.length <= WRAP) || needsQuotes(clean)) return [`${indent}${key}: ${scalar(clean)}`];
  const lines: string[] = [];
  let current = '';
  for (const word of clean.split(' ')) {
    if (current && current.length + 1 + word.length > WRAP) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return [`${indent}${key}: >`, ...lines.map((line) => `${indent}  ${line}`)];
}

function terms(key: string, list: TranslationBrief['pronouns']): string[] {
  if (!list?.length) return [];
  const out = [`  ${key}:`];
  for (const term of list) {
    out.push(`    - source: ${scalar(term.source)}`);
    out.push(`      target: ${scalar(term.target)}`);
    if (term.note) out.push(...text('note', term.note, '      '));
  }
  return out;
}

export function writeSongNote(fields: SongNoteFields, body: string): string {
  const lines = ['---', `artist: ${scalar(fields.artist)}`];
  if (fields.trackIds?.length) lines.push(`trackIds: [${fields.trackIds.map(listItem).join(', ')}]`);
  lines.push(`titles: [${fields.titles.map(listItem).join(', ')}]`);
  if (fields.short) lines.push(...text('short', fields.short, '', true));
  if (fields.written) lines.push(`written: ${fields.written}`);
  if (fields.updated) lines.push(`updated: ${fields.updated}`);
  if (fields.sources?.length) lines.push('sources:', ...fields.sources.map((source) => `  - ${scalar(source)}`));
  const brief = fields.translation;
  if (brief) {
    lines.push('translation:');
    lines.push(`  sourceLanguage: ${scalar(brief.sourceLanguage)}`);
    lines.push(`  targetLanguage: ${scalar(brief.targetLanguage)}`);
    lines.push(`  register: ${brief.register}`);
    lines.push(...text('speaker', brief.speaker, '  '));
    lines.push(...text('addressee', brief.addressee, '  '));
    if (brief.relationship) lines.push(...text('relationship', brief.relationship, '  '));
    if (brief.situation) lines.push(...text('situation', brief.situation, '  '));
    lines.push(...terms('pronouns', brief.pronouns));
    lines.push(...terms('glossary', brief.glossary));
    lines.push(`  written: ${brief.written}`);
    if (brief.updated) lines.push(`  updated: ${brief.updated}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}\n${body.trim()}\n`;
}
