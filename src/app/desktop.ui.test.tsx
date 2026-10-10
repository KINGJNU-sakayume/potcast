import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { findActiveLineIndex } from '../lyrics/lyricSync';
import { PREVIEW_LYRICS, PREVIEW_START } from '../preview/previewData';
import { readConfig } from './config';
import { createAppServices } from './services';

function renderApp(hash: string) {
  window.history.replaceState({}, '', `/?preview${hash}`);
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  return render(<App services={services} />);
}

beforeEach(() => {
  window.location.hash = '';
});

describe('ARC Music on the desktop (preview archive)', () => {
  it('has no top bar: no breadcrumb, no status line, search in the rail', async () => {
    renderApp('#/library');
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Breadcrumb')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal Music Archive')).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview · no audio/)).not.toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'Primary navigation' });
    expect(within(rail).getByRole('button', { name: 'Search' })).toHaveAttribute('aria-keyshortcuts', '/');
  });

  it('shows the playing cover in the rail away from Now Playing, and goes back to it', async () => {
    const user = userEvent.setup();
    renderApp('#/library');
    const now = await screen.findByRole('link', { name: 'Now playing: Lemon. Open Now Playing' });
    await user.click(now);
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Now playing: Lemon/ })).not.toBeInTheDocument();
  });

  it('offers "‹ the page you came from" instead of a breadcrumb', async () => {
    const user = userEvent.setup();
    renderApp('#/now-playing');
    const playing = await screen.findByRole('region', { name: 'Now playing' });
    await user.click(within(playing).getByRole('link', { name: 'Kenshi Yonezu' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Kenshi Yonezu' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Now Playing' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
  });

  it('opens the queue and settings in the right-hand column, one at a time', async () => {
    const user = userEvent.setup();
    renderApp('#/library');
    await screen.findByRole('heading', { level: 1, name: 'Library' });
    const rail = screen.getByRole('complementary', { name: 'Primary navigation' });

    const queueButton = within(rail).getByRole('button', { name: 'Queue' });
    await user.click(queueButton);
    const queue = screen.getByRole('complementary', { name: 'Queue' });
    expect(within(queue).getByRole('button', { name: 'Close queue' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(within(rail).getByRole('button', { name: 'Settings' }));
    expect(screen.queryByRole('complementary', { name: 'Queue' })).not.toBeInTheDocument();
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    expect(within(settings).getByText(/Preview archive · sample data/)).toBeInTheDocument();
    expect(within(settings).getByText('Focus Mode')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Settings' })).not.toBeInTheDocument());
  });

  it('turns Focus Mode on with F and off with Escape', async () => {
    const user = userEvent.setup();
    renderApp('#/library');
    await screen.findByRole('heading', { level: 1, name: 'Library' });
    await user.keyboard('f');
    // Focus Mode is a Now Playing view.
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit Focus Mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.app')).toHaveAttribute('data-focus');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('.app')).not.toHaveAttribute('data-focus'));
    expect(screen.getByRole('button', { name: 'Enter Focus Mode' })).toBeInTheDocument();
  });

  it('shows the line just sung above the current lyric, and two lines after it', async () => {
    renderApp('#/now-playing');
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
    const lines = PREVIEW_LYRICS['04TshWXkhV1qkqHzf31Hn6']!.lines;
    const active = findActiveLineIndex(lines, PREVIEW_START.positionMs);
    const previous = (await screen.findByText('Previous line:', { exact: false })).closest('p')!;
    expect(previous).toHaveTextContent(lines[active - 1]!.text);
    expect(within(screen.getByRole('list', { name: 'Next lines' })).getAllByRole('listitem')).toHaveLength(2);
  });
});
