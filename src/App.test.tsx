import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { readConfig } from './app/config';
import { createAppServices } from './app/services';
import { findActiveLineIndex } from './lyrics/lyricSync';
import { TEST_TRANSLATIONS_KO } from './lyrics/providers/testLines';
import { PREVIEW_LYRICS, PREVIEW_START } from './preview/previewData';

function renderApp(search: string, hash = '') {
  window.history.replaceState({}, '', `/${search}${hash}`);
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  return render(<App services={services} />);
}

/** The test line the preview is on when it starts (Lemon, 57 s in). */
function startLine() {
  const lines = PREVIEW_LYRICS['04TshWXkhV1qkqHzf31Hn6']!.lines;
  return lines[findActiveLineIndex(lines, PREVIEW_START.positionMs)]!.text;
}

beforeEach(() => {
  window.location.hash = '';
});

describe('ARC Music (preview archive)', () => {
  it('offers setup guidance and the preview when Spotify is not configured', async () => {
    const user = userEvent.setup();
    renderApp('');
    expect(await screen.findByRole('heading', { name: 'Spotify isn’t configured' })).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preview without Spotify' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
  });

  it('renders the v7 Now Playing with synced lyrics, translation, Listening Note and working transport', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/now-playing');

    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Now playing' })).getByRole('link', { name: 'STRAY SHEEP' })).toBeInTheDocument();
    const line = startLine();
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(await screen.findByText(TEST_TRANSLATIONS_KO[line]!)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Next lines' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Listening note')).toBeInTheDocument();
    expect(screen.getByText(/애도를 다루는 곡이지만/)).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Translation/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    await waitFor(() => expect(screen.queryByText(TEST_TRANSLATIONS_KO[line]!)).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next track' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'まちがいさがし' })).toBeInTheDocument();
    // This track now has its own listening cue as well as the preserved translation.
    expect(screen.queryByText(/애도를 다루는 곡이지만/)).not.toBeInTheDocument();
    expect(screen.getByText('Listening note')).toBeInTheDocument();
    expect(screen.getByText(/절의 자기 판단이 후렴에서/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read full note →' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('aria-valuemax', '302');
  });

  it('opens a note in the right-hand column, closes it on Escape and returns focus', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/artist/1snhtMLeb2DYoMOcVbb8iB');

    expect(await screen.findByRole('heading', { level: 1, name: 'Kenshi Yonezu' })).toBeInTheDocument();
    expect(screen.getByText('Tokushima, Japan · singer-songwriter / producer / illustrator')).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'Read full note →' });
    await user.click(more);
    // Beside the page, not over it: no dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const note = screen.getByRole('complementary', { name: 'Kenshi Yonezu' });
    expect(within(note).getByText('Editorial note / Artist')).toBeInTheDocument();
    expect(within(note).getByText(/요네즈 켄시\(米津玄師\)의 디스코그래피는/)).toBeInTheDocument();
    expect(within(note).getByRole('button', { name: 'Close note' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(more).toHaveFocus());
    expect(screen.queryByRole('complementary', { name: 'Kenshi Yonezu' })).not.toBeInTheDocument();
  });

  it.each([
    ['tripleS', '5Z71xE9prhpHrqL5thVMyK', /조합을 전제로 움직이는 스물네 명/],
    ['Coldplay', '4gzpq5DPGxSnKTe4SA8HAU', /크게 따라 부를 수 있는 후렴/],
  ])('shows the %s Editorial Note on the Artist page', async (name, id, text) => {
    renderApp('?preview', `#/artist/${id}`);
    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(await screen.findAllByText(/· Editorial note/)).not.toHaveLength(0);
  });

  it('marks noted tracks in an album sequence and shows the album note', async () => {
    renderApp('?preview', '#/album/0RHX9XECH8IVI3LNgWDpmQ');
    expect(await screen.findByRole('heading', { level: 1, name: 'A Rush of Blood to the Head' })).toBeInTheDocument();
    expect(screen.getByText(/데뷔작의 조용함 위에/)).toBeInTheDocument();
    const scientist = screen.getByRole('button', { name: /The Scientist/ });
    expect(within(scientist).getByText('Note')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Politik/ })).queryByText('Note')).not.toBeInTheDocument();
  });

  it('lays the library out on one screen: lists, then covers, then artists', async () => {
    renderApp('?preview', '#/library');
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Liked songs', 'Recently played', 'Liked albums', 'Playlists', 'Artists']);
    expect(await screen.findAllByRole('link', { name: 'Kenshi Yonezu' })).not.toHaveLength(0);
  });
});
