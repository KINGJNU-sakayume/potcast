import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { readConfig } from '../app/config';
import { createAppServices } from '../app/services';
import { findActiveLineIndex } from '../lyrics/lyricSync';
import { PREVIEW_LYRICS, PREVIEW_START } from '../preview/previewData';

const LEMON_ID = '04TshWXkhV1qkqHzf31Hn6';

// The preview plays original test lines, never real lyrics. The fixture note's segment is timed on the
// line the preview starts on; the preview lyrics get a timing so the segment applies to them.
const lines = PREVIEW_LYRICS[LEMON_ID]!.lines;
const startIndex = findActiveLineIndex(lines, PREVIEW_START.positionMs);
const current = lines[startIndex]!;

const fixture = vi.hoisted(() => ({ notes: [] as import('../editorial/types').SongNote[] }));

vi.mock('../preview/previewData', async (importOriginal) => {
  const original = await importOriginal<typeof import('../preview/previewData')>();
  const lemon = original.PREVIEW_LYRICS['04TshWXkhV1qkqHzf31Hn6']!;
  return {
    ...original,
    PREVIEW_LYRICS: { ...original.PREVIEW_LYRICS, '04TshWXkhV1qkqHzf31Hn6': { ...lemon, timing: { lrclibId: 9, durationMs: 256_000 } } },
  };
});

vi.mock('../editorial/songs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../editorial/songs')>();
  // Lookup reads this array; each test fills it with its own notes.
  return { ...original, songNotes: fixture.notes };
});

const BLOCK = [
  'translation:',
  '  sourceLanguage: en',
  '  targetLanguage: ko',
  '  register: haeche',
  '  speaker: 떠난 사람을 떠올리는 화자',
  '  addressee: 떠난 사람',
  '  pronouns:',
  '    - source: you',
  '      target: 너',
  '  written: 2026-10-02',
];

async function setFixtureNote({ listening }: { listening: boolean }) {
  const { loadSongNotes } = await import('../editorial/loadNotes');
  const markdown = [
    '---',
    'artist: kenshi-yonezu',
    `trackIds: [${LEMON_ID}]`,
    'titles: [Lemon]',
    ...(listening ? ['short: 감상 큐 문장.'] : []),
    'sources: [https://example.com/interview]',
    ...BLOCK,
    '---',
    '',
    ...(listening ? ['감상 본문 문단.', ''] : []),
    '## 번역에 대하여',
    '',
    '곁에 없는 사람에게 혼잣말처럼 말을 거는 곡이라 **해체**로 통일한다.',
  ].join('\n');
  const timeline = {
    schemaVersion: 2,
    timing: { lrclibId: 9, durationMs: 256_000 },
    segments: [{ startMs: current.startMs, endMs: current.endMs ?? lines[startIndex + 1]!.startMs, translation: '큐레이션 번역 문장' }],
  };
  fixture.notes.splice(0, fixture.notes.length, ...loadSongNotes({ 'lemon.md': markdown }, { 'lemon.translation.json': timeline }));
}

function renderNowPlaying() {
  window.history.replaceState({}, '', '/?preview#/now-playing');
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  render(<App services={services} />);
}

describe('curated lyric translation on Now Playing', () => {
  beforeEach(() => {
    fixture.notes.splice(0, fixture.notes.length);
  });

  it('shows the segment under its line with no translation chrome, and opens one Listening note beside the lyrics', async () => {
    await setFixtureNote({ listening: true });
    const user = userEvent.setup();
    renderNowPlaying();

    expect(await screen.findByText('큐레이션 번역 문장')).toBeInTheDocument();
    // Everything about the translation lives in the Listening note: no separate mark or link in the lyrics.
    expect(screen.queryByText(/Curated/)).not.toBeInTheDocument();
    expect(screen.queryByText('반말 · 해체')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Translation note/ })).not.toBeInTheDocument();
    expect(screen.getByText('Listening note')).toBeInTheDocument();
    expect(screen.getByText('감상 큐 문장.')).toBeInTheDocument();

    const more = screen.getByRole('button', { name: 'Read full note →' });
    await user.click(more);
    // In the page, not over it: no dialog, the lyrics stay readable.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const note = screen.getByRole('complementary', { name: 'Lemon' });
    expect(screen.getByText('큐레이션 번역 문장')).toBeInTheDocument();
    expect(within(note).getByText('Listening note / Song')).toBeInTheDocument();
    expect(within(note).getByRole('button', { name: 'Close note' })).toHaveFocus();
    // Listening body first, then the translation section.
    const body = within(note).getByText('감상 본문 문단.');
    const section = within(note).getByRole('heading', { name: '번역에 대하여' });
    expect(body.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(note).getByText('떠난 사람을 떠올리는 화자 → 떠난 사람')).toBeInTheDocument();
    expect(within(note).getByText('반말 · 해체')).toBeInTheDocument();
    expect(within(note).getByRole('table', { name: '호칭' })).toHaveTextContent('you너');
    expect(within(note).getByText('해체').tagName).toBe('STRONG');
    expect(within(note).getByRole('link', { name: 'example.com/interview' })).toHaveAttribute('href', 'https://example.com/interview');
    // No line-by-line pairs: the lyrics never appear in the note.
    expect(note).not.toHaveTextContent(current.text);
    expect(note).not.toHaveTextContent('큐레이션 번역 문장');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Lemon' })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    await user.click(more);
    await user.click(screen.getByRole('button', { name: 'Close note' }));
    expect(screen.queryByRole('complementary', { name: 'Lemon' })).not.toBeInTheDocument();
  });

  it('applies the Translation On / Off toggle to the curated translation too', async () => {
    await setFixtureNote({ listening: true });
    const user = userEvent.setup();
    renderNowPlaying();

    expect(await screen.findByText('큐레이션 번역 문장')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Translation (On|Off)/ }));
    await waitFor(() => expect(screen.queryByText('큐레이션 번역 문장')).not.toBeInTheDocument());
    // Preferences live for the session: switch it back on for the other tests.
    await user.click(screen.getByRole('button', { name: /Translation (On|Off)/ }));
    expect(await screen.findByText('큐레이션 번역 문장')).toBeInTheDocument();
  });

  it('shows a song with only a translation note as a Listening note without a cue', async () => {
    await setFixtureNote({ listening: false });
    const user = userEvent.setup();
    renderNowPlaying();

    expect(await screen.findByText('큐레이션 번역 문장')).toBeInTheDocument();
    expect(screen.getByText('Listening note')).toBeInTheDocument();
    expect(screen.queryByText(/Translation note/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Read full note →' }));
    const note = screen.getByRole('complementary', { name: 'Lemon' });
    expect(within(note).getByText('Listening note / Song')).toBeInTheDocument();
    expect(within(note).getByRole('heading', { name: '번역에 대하여' })).toBeInTheDocument();
  });
});
