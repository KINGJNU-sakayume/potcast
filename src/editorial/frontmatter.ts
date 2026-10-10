/**
 * The small frontmatter subset ARC's note and translation files use — no YAML
 * dependency in the bundle. A file starts with `---`, then one `key: value`
 * per line, then `---` and the Markdown body.
 *
 * Values:
 * - plain text to the end of the line (`origin: Tokyo, Japan · singer`)
 * - a string wrapped in double quotes (JSON escapes) or single quotes (`''`)
 * - an integer (`releaseYear: 2020`)
 * - an inline list (`titles: [Lemon, "感電, Kanden"]`)
 * - a block list: `key:` followed by indented `- item` lines
 * - a folded block: `key: >` followed by indented lines, joined with spaces
 * - a nested map: `key:` followed by indented `key: value` lines (any of the
 *   values above). Inside a nested map, a block list may hold maps:
 *   `- source: …` with its other fields indented under the first one. A song
 *   note's `translation:` block uses this.
 *
 * Lines starting with `#` are comments. Anything else is an error, so a
 * mistyped note fails the tests instead of silently losing a field.
 */

export interface FrontmatterMap {
  [key: string]: FrontmatterValue;
}

export type FrontmatterValue = string | number | string[] | FrontmatterMap | FrontmatterMap[];

export interface ParsedDocument {
  data: FrontmatterMap;
  body: string;
}

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontmatterError';
  }
}

const KEY_LINE = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/;

function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      throw new FrontmatterError(`Invalid double-quoted string: ${raw}`);
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

/** Splits `a, "b, c", 'd'` on commas outside quoted items. */
function splitInlineList(inner: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i]!;
    if (quote) {
      current += char;
      if (char === '\\' && quote === '"' && i + 1 < inner.length) {
        current += inner[i + 1];
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
    } else if ((char === '"' || char === "'") && current.trim() === '') {
      // Quotes open only at the start of an item, so "Prospekt's" stays plain.
      quote = char;
      current += char;
    } else if (char === ',') {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (quote) throw new FrontmatterError(`Unclosed quote in list: [${inner}]`);
  if (current.trim()) items.push(current.trim());
  return items.map(unquote);
}

function scalar(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) return splitInlineList(value.slice(1, -1));
  if (/^-?\d+$/.test(value)) return Number(value);
  return unquote(value);
}

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** The lines after `start` indented deeper than `indent` (a nested block). */
function blockAfter(lines: readonly string[], start: number, indent: number): string[] {
  const block: string[] = [];
  for (let i = start + 1; i < lines.length && lines[i]!.trim() && indentOf(lines[i]!) > indent; i += 1) block.push(lines[i]!);
  return block;
}

/** `key: value` lines at one indentation; nested values follow deeper. */
function parseMap(lines: readonly string[], path: string): FrontmatterMap {
  const data: FrontmatterMap = {};
  const indent = indentOf(lines[0]!);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (indentOf(line) !== indent) throw new FrontmatterError(`Unexpected indentation in ${path}: ${line.trim()}`);
    const match = KEY_LINE.exec(line.trim());
    if (!match) throw new FrontmatterError(`Unexpected line in ${path}: ${line.trim()}`);
    const key = match[1]!;
    const rest = match[2]?.trim() ?? '';
    if (key in data) throw new FrontmatterError(`Duplicate key in ${path}: ${key}`);
    if (rest !== '' && rest !== '>') {
      data[key] = scalar(rest);
      continue;
    }
    const block = blockAfter(lines, i, indent);
    i += block.length;
    data[key] = rest === '>' ? block.map((item) => item.trim()).join(' ') : nestedValue(block, `${path}.${key}`);
  }
  return data;
}

/** The value of a nested `key:` line: a block list (of text or of maps) or a nested map. */
function nestedValue(block: readonly string[], path: string): FrontmatterValue {
  if (block.length === 0) throw new FrontmatterError(`"${path}" has no value.`);
  return block[0]!.trim().startsWith('- ') ? parseList(block, path, true) : parseMap(block, path);
}

function parseList(lines: readonly string[], path: string, allowMaps: boolean): string[] | FrontmatterMap[] {
  const indent = indentOf(lines[0]!);
  const texts: string[] = [];
  const maps: FrontmatterMap[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const item = lines[i]!.trim();
    if (indentOf(lines[i]!) !== indent || !item.startsWith('- ')) {
      throw new FrontmatterError(`"${path}" list items must start with "- ": ${item}`);
    }
    const content = item.slice(2).trim();
    const rest = blockAfter(lines, i, indent);
    i += rest.length;
    if (allowMaps && KEY_LINE.test(content)) {
      // `- key: value` with the item's other fields aligned under `key`.
      maps.push(parseMap([`${' '.repeat(indent + 2)}${content}`, ...rest], `${path}[${maps.length}]`));
    } else {
      if (rest.length > 0) throw new FrontmatterError(`"${path}" text items cannot continue on the next line: ${content}`);
      texts.push(unquote(content));
    }
  }
  if (texts.length > 0 && maps.length > 0) throw new FrontmatterError(`"${path}" mixes text items and map items.`);
  return maps.length > 0 ? maps : texts;
}

export function parseFrontmatter(source: string): ParsedDocument {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) throw new FrontmatterError('The file must start with a "---" frontmatter line.');
  const end = text.indexOf('\n---', 3);
  if (end < 0) throw new FrontmatterError('The frontmatter is not closed with "---".');
  const afterFence = text.indexOf('\n', end + 1);
  const header = text.slice(4, end).split('\n');
  const body = afterFence < 0 ? '' : text.slice(afterFence + 1);

  const data: FrontmatterMap = {};
  for (let i = 0; i < header.length; i += 1) {
    const line = header[i]!;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = KEY_LINE.exec(line);
    if (!match) throw new FrontmatterError(`Unexpected frontmatter line: ${line}`);
    const key = match[1]!;
    const rest = match[2]?.trim() ?? '';
    if (key in data) throw new FrontmatterError(`Duplicate frontmatter key: ${key}`);

    if (rest === '' || rest === '>') {
      // Block list, folded text or nested map: the following indented lines.
      const block = blockAfter(header, i, 0);
      i += block.length;
      if (rest === '>') {
        data[key] = block.map((item) => item.trim()).join(' ');
      } else if (block.length === 0) {
        throw new FrontmatterError(`"${key}" has no value.`);
      } else if (KEY_LINE.test(block[0]!.trim()) && !block[0]!.trim().startsWith('- ')) {
        data[key] = parseMap(block, key);
      } else {
        // Top-level lists hold text only (`- Liner notes: 2020` stays one string).
        data[key] = parseList(block, key, false);
      }
      continue;
    }
    data[key] = scalar(rest);
  }
  return { data, body: body.trim() };
}

/** Typed field readers for the loaders; they throw with the file name on a bad field. */
export class FieldReader {
  constructor(
    private readonly data: FrontmatterMap,
    private readonly file: string,
    /** Prefix for field names in errors, e.g. "translation." for a nested map. */
    private readonly path = '',
  ) {}

  /** The keys present, for rejecting unknown fields. */
  keys(): string[] {
    return Object.keys(this.data);
  }

  fail(message: string): never {
    throw new FrontmatterError(`${this.file}: ${message}`);
  }

  string(key: string): string {
    const value = this.optionalString(key);
    if (value === undefined) this.fail(`"${this.path}${key}" is required.`);
    return value;
  }

  optionalString(key: string): string | undefined {
    const value = this.data[key];
    if (value === undefined) return undefined;
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') this.fail(`"${this.path}${key}" must be text.`);
    return value.trim() || undefined;
  }

  list(key: string): string[] {
    const value = this.optionalList(key);
    if (!value?.length) this.fail(`"${this.path}${key}" must list at least one value.`);
    return value;
  }

  optionalList(key: string): string[] | undefined {
    const value = this.data[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) this.fail(`"${this.path}${key}" must be a list of text.`);
    return (value as string[]).map((item) => item.trim()).filter(Boolean);
  }

  optionalNumber(key: string): number | undefined {
    const value = this.data[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'number') this.fail(`"${this.path}${key}" must be a number.`);
    return value;
  }

  /** A nested `key:` map, read with the same helpers. */
  optionalMap(key: string): FieldReader | undefined {
    const value = this.data[key];
    if (value === undefined) return undefined;
    if (!isMap(value)) this.fail(`"${this.path}${key}" must be a nested block of "field: value" lines.`);
    return new FieldReader(value, this.file, `${this.path}${key}.`);
  }

  /** A block list of maps (`- source: …` items). */
  optionalMapList(key: string): FieldReader[] | undefined {
    const value = this.data[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => !isMap(item))) this.fail(`"${this.path}${key}" must be a list of "- field: value" items.`);
    return (value as FrontmatterMap[]).map((item, i) => new FieldReader(item, this.file, `${this.path}${key}[${i}].`));
  }
}

function isMap(value: FrontmatterValue): value is FrontmatterMap {
  return typeof value === 'object' && !Array.isArray(value);
}

/** `./notes/albums/stray-sheep.md` → `stray-sheep`. */
export function fileKey(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
}
