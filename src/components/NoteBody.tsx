import { formatDuration } from '../lib/format';
import type { ReactNode } from 'react';

/**
 * Renders the long-form note text — a small Markdown subset — as React
 * elements (never as HTML, so a note cannot inject markup):
 *
 * - paragraphs separated by a blank line; a single line break is kept
 * - `## Section` and `### Subsection` headings
 * - `- item` and `1. item` lists, `> quote` blocks
 * - `**strong**`, `*emphasis*` and `[text](https://…)` links
 *
 * With `onTime`, a moment of the song the text names (“3분 무렵”, “2분 15초”,
 * “1:06”, “도입부”) becomes a button that plays the song from there.
 */

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] };

const LIST_ITEM = /^(?:[-*]|\d+[.)])\s+/;

export function parseNoteBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const chunks = markdown.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trimEnd());
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph });
      paragraph = [];
    };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!.trim();
      if (!line) continue;
      const heading = /^(#{2,3})\s+(.+)$/.exec(line);
      if (heading) {
        flush();
        blocks.push({ type: 'heading', level: heading[1]!.length as 2 | 3, text: heading[2]!.trim() });
      } else if (line.startsWith('>')) {
        flush();
        const quote: string[] = [];
        while (i < lines.length && lines[i]!.trim().startsWith('>')) {
          quote.push(lines[i]!.trim().replace(/^>\s?/, ''));
          i += 1;
        }
        i -= 1;
        blocks.push({ type: 'quote', lines: quote });
      } else if (LIST_ITEM.test(line)) {
        flush();
        const ordered = /^\d/.test(line);
        const items: string[] = [];
        while (i < lines.length && LIST_ITEM.test(lines[i]!.trim())) {
          items.push(lines[i]!.trim().replace(LIST_ITEM, ''));
          i += 1;
        }
        i -= 1;
        blocks.push({ type: 'list', ordered, items });
      } else {
        paragraph.push(line);
      }
    }
    flush();
  }
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Moments in a song as the notes write them. */
const MOMENT = /(\d{1,2}):([0-5]\d)(?![\d:])|(\d{1,2})분\s?(\d{1,2})초|(\d{1,2})분(?=\s?(?:무렵|께|쯤|즈음|경|대|부터|에서|이후|이 지나))|도입부/g;

/** "3분 무렵" → 180 000 ms; null for text that names no moment. */
export function momentMs(match: RegExpMatchArray): number | null {
  if (match[1] !== undefined) return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  if (match[3] !== undefined) return (Number(match[3]) * 60 + Number(match[4])) * 1000;
  if (match[5] !== undefined) return Number(match[5]) * 60 * 1000;
  if (match[0] === '도입부') return 0;
  return null;
}

type OnTime = (ms: number) => void;

function moments(text: string, keyPrefix: string, onTime: OnTime | undefined): ReactNode[] {
  if (!onTime) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(MOMENT)) {
    const ms = momentMs(match);
    const start = match.index ?? 0;
    if (ms === null) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <button key={`${keyPrefix}-t${index}`} type="button" className="note-time" title={`${formatDuration(ms)}부터 듣기`} onClick={() => onTime(ms)}>
        <span aria-hidden="true">▶ </span>
        {match[0]}
      </button>,
    );
    index += 1;
    last = start + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderInline(text: string, keyPrefix = 'i', onTime?: OnTime): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(...moments(text.slice(last, start), `${keyPrefix}-p${index}`, onTime));
    const key = `${keyPrefix}-${index}`;
    index += 1;
    if (match[1] !== undefined) {
      out.push(<strong key={key}>{renderInline(match[1], key, onTime)}</strong>);
    } else if (match[2] !== undefined) {
      out.push(<em key={key}>{renderInline(match[2], key, onTime)}</em>);
    } else {
      const label = match[3]!;
      const url = match[4]!;
      out.push(
        isSafeUrl(url) ? (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = start + match[0].length;
  }
  if (last < text.length) out.push(...moments(text.slice(last), `${keyPrefix}-p${index}`, onTime));
  return out;
}

function lines(list: string[], key: string, onTime?: OnTime): ReactNode[] {
  return list.flatMap((line, i) =>
    i === 0 ? renderInline(line, `${key}-${i}`, onTime) : [<br key={`${key}-br${i}`} />, ...renderInline(line, `${key}-${i}`, onTime)],
  );
}

/** The plain text of a heading, for its contents entry and for finding it by name. */
export function headingText(markdown: string): string {
  return markdown.replace(/\*\*?|\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The id of the section heading a name points to: the heading that is that name, or starts with it. */
export function sectionId(markdown: string, name: string): string | null {
  const wanted = normalise(name);
  if (!wanted) return null;
  const headings = parseNoteBlocks(markdown).filter((block) => block.type === 'heading');
  const index = headings.findIndex((block) => normalise(headingText(block.text)).startsWith(wanted));
  return index < 0 ? null : `note-section-${index}`;
}

/**
 * A note's long form. `contents`: a list of its sections above it, each a
 * link to the section (from three sections up, where a long note needs one).
 */
export function NoteBody({
  markdown,
  className,
  contents = false,
  onTime,
}: {
  markdown: string;
  className?: string;
  contents?: boolean;
  onTime?: OnTime;
}) {
  const blocks = parseNoteBlocks(markdown);
  const headings = blocks.filter((block) => block.type === 'heading');
  let headingIndex = 0;
  return (
    <div className={className ? `note-body ${className}` : 'note-body'}>
      {contents && headings.length >= 3 && (
        <nav className="note-contents" aria-label="이 노트의 차례">
          <ol>
            {headings.map((heading, i) => (
              <li key={`toc-${i}`} data-level={heading.level}>
                <a
                  href={`#note-section-${i}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(`note-section-${i}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
                  }}
                >
                  {headingText(heading.text)}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case 'heading': {
            const id = `note-section-${headingIndex}`;
            headingIndex += 1;
            return block.level === 2 ? (
              <h3 key={key} id={id}>
                {renderInline(block.text, key)}
              </h3>
            ) : (
              <h4 key={key} id={id}>
                {renderInline(block.text, key)}
              </h4>
            );
          }
          case 'quote':
            return (
              <blockquote key={key}>
                <p>{lines(block.lines, key, onTime)}</p>
              </blockquote>
            );
          case 'list': {
            const items = block.items.map((item, j) => <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`, onTime)}</li>);
            return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          default:
            return <p key={key}>{lines(block.lines, key, onTime)}</p>;
        }
      })}
    </div>
  );
}
