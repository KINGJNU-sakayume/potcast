import { describe, expect, it } from 'vitest';
import { maxChunkLength, prepareText, textIds } from './text';

describe('text as Supertonic reads it', () => {
  it('is wrapped in its language and takes Hangul apart into jamo', () => {
    const prepared = prepareText('안녕.', 'ko');
    expect(prepared.startsWith('<ko>')).toBe(true);
    expect(prepared.endsWith('</ko>')).toBe(true);
    expect(prepared).toBe(`<ko>${'안녕.'.normalize('NFKD')}</ko>`);
    expect(prepared.length).toBeGreaterThan('<ko>안녕.</ko>'.length);
  });

  it('ends a line that has no punctuation with a full stop, and leaves a comma alone', () => {
    expect(prepareText('hello', 'en')).toBe('<en>hello.</en>');
    expect(prepareText('hello,', 'en')).toBe('<en>hello,</en>');
    expect(prepareText('hello?', 'en')).toBe('<en>hello?</en>');
  });

  it('normalises dashes, quotes, symbols, emoji and spacing as the reference does', () => {
    expect(prepareText('“A” — B_C [d] e/f ♥ 😀 x , y .', 'en')).toBe('<en>"A" - B C d e f x, y.</en>');
    expect(prepareText("it’s  `fine`", 'en')).toBe("<en>it's 'fine'</en>");
    expect(prepareText('a@b e.g., c', 'en')).toBe('<en>a at b for example, c.</en>');
  });

  it('keeps the sounds a host makes', () => {
    expect(prepareText('ok. <laugh>', 'en')).toBe('<en>ok. <laugh>.</en>');
  });

  it('refuses a language the model does not have', () => {
    expect(() => prepareText('x', 'xx')).toThrow('Invalid language');
    expect(prepareText('x', 'na')).toBe('<na>x.</na>');
  });

  it('maps each UTF-16 unit to its token and leaves out what the model cannot read', () => {
    const indexer = Array.from({ length: 200 }, (_, unit) => (unit === 'b'.charCodeAt(0) ? -1 : unit + 1000));
    expect(textIds('abc', indexer)).toEqual({ ids: [1097, 1099], unknown: ['b'] });
    // Beyond the table: unknown as well.
    expect(textIds('a가', indexer)).toEqual({ ids: [1097], unknown: ['가'] });
  });

  it('gives Korean and Japanese shorter chunks', () => {
    expect(maxChunkLength('ko')).toBe(120);
    expect(maxChunkLength('ja')).toBe(120);
    expect(maxChunkLength('en')).toBe(300);
  });
});
