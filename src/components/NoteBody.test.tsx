import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteBody, parseNoteBlocks } from './NoteBody';

describe('parseNoteBlocks', () => {
  it('splits paragraphs, headings, lists and quotes', () => {
    expect(
      parseNoteBlocks('Lead.\n\n## 배경\n첫 줄\n둘째 줄\n\n- 하나\n- 둘\n\n1. first\n2. second\n\n> 인용\n> 계속\n\n### 세부'),
    ).toEqual([
      { type: 'paragraph', lines: ['Lead.'] },
      { type: 'heading', level: 2, text: '배경' },
      { type: 'paragraph', lines: ['첫 줄', '둘째 줄'] },
      { type: 'list', ordered: false, items: ['하나', '둘'] },
      { type: 'list', ordered: true, items: ['first', 'second'] },
      { type: 'quote', lines: ['인용', '계속'] },
      { type: 'heading', level: 3, text: '세부' },
    ]);
  });

  it('keeps a mid-line ">" or "*" as text', () => {
    expect(parseNoteBlocks('『<ASSEMBLE24>』와 A BOY IS A GUN*')).toEqual([
      { type: 'paragraph', lines: ['『<ASSEMBLE24>』와 A BOY IS A GUN*'] },
    ]);
  });
});

describe('NoteBody', () => {
  it('renders emphasis and safe links as elements', () => {
    const { container } = render(<NoteBody markdown={'**굵게** 그리고 *기울임*, [인터뷰](https://example.com/a).'} />);
    expect(container.querySelector('strong')?.textContent).toBe('굵게');
    expect(container.querySelector('em')?.textContent).toBe('기울임');
    const link = screen.getByRole('link', { name: '인터뷰' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never renders markup from the note or unsafe link targets', () => {
    const { container } = render(<NoteBody markdown={'<img src=x onerror=alert(1)> [x](javascript:alert(1))'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders the existing two-paragraph notes as two paragraphs', () => {
    const { container } = render(<NoteBody markdown={'첫 문단.\n\n둘째 문단.'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
