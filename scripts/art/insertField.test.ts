import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/editorial/frontmatter';
import { insertField } from './insertField';

describe('insertField', () => {
  const note = '---\nartist: a\ntitles: [T]\nreleaseYear: 2005\ntracks:\n  - one\n  - two\nshort: >\n  Preview.\n---\n\nBody.\n';

  it('adds one line after the first key present and leaves the rest as it is', () => {
    const next = insertField(note, 'cover', 'https://i.scdn.co/image/x', ['releaseYear', 'titles']);
    expect(next).toBe(note.replace('releaseYear: 2005\n', 'releaseYear: 2005\ncover: https://i.scdn.co/image/x\n'));
    expect(parseFrontmatter(next).data.cover).toBe('https://i.scdn.co/image/x');
  });

  it('skips past an indented block, and falls back to the end of the frontmatter', () => {
    expect(insertField(note, 'cover', 'https://x.test/c', ['tracks'])).toContain('  - two\ncover: https://x.test/c\nshort: >');
    expect(insertField(note, 'cover', 'https://x.test/c', ['missing'])).toContain('  Preview.\ncover: https://x.test/c\n---\n');
  });
});
