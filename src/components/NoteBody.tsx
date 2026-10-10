import type { ReactNode } from 'react';

/**
 * Renders the long-form note text — a small Markdown subset — as React
 * elements (never as HTML, so a note cannot inject markup):
 *
 * - paragraphs separated by a blank line; a single line break is kept
 * - `## Section` and `### Subsection` headings
 * - `- item` and `1. item` lists, `> quote` blocks
 * - `**strong**`, `*emphasis*` and `[text](https://…)` links
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

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${index}`;
    index += 1;
    if (match[1] !== undefined) {
      out.push(<strong key={key}>{renderInline(match[1], key)}</strong>);
    } else if (match[2] !== undefined) {
      out.push(<em key={key}>{renderInline(match[2], key)}</em>);
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
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(list: string[], key: string): ReactNode[] {
  return list.flatMap((line, i) => (i === 0 ? renderInline(line, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...renderInline(line, `${key}-${i}`)]));
}

export function NoteBody({ markdown, className }: { markdown: string; className?: string }) {
  const blocks = parseNoteBlocks(markdown);
  return (
    <div className={className ? `note-body ${className}` : 'note-body'}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? <h3 key={key}>{renderInline(block.text, key)}</h3> : <h4 key={key}>{renderInline(block.text, key)}</h4>;
          case 'quote':
            return (
              <blockquote key={key}>
                <p>{lines(block.lines, key)}</p>
              </blockquote>
            );
          case 'list': {
            const items = block.items.map((item, j) => <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>);
            return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          default:
            return <p key={key}>{lines(block.lines, key)}</p>;
        }
      })}
    </div>
  );
}
