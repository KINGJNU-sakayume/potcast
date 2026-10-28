import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { readConfig } from './config';
import { createAppServices } from './services';
import { MOBILE_QUERY } from './useIsMobile';

function renderApp(search: string, hash = '') {
  window.history.replaceState({}, '', `/${search}${hash}`);
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  return render(<App services={services} />);
}

/** A phone-sized window: only the phone query matches. */
function mockPhone() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === MOBILE_QUERY,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mockPhone();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.location.hash = '';
});

afterEach(() => {
  // jsdom has no matchMedia: removing the mock puts the desktop shell back for the other suites.
  delete (window as Partial<Window>).matchMedia;
});

describe('ARC Music on a phone (preview archive)', () => {
  it('uses four bottom tabs and keeps the mini player off Now Playing', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/now-playing');

    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Now Playing', 'Library', 'Search', 'Archive']);
    expect(tabs[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
    // No desktop rail or top bar.
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();

    await user.click(tabs[1]!);
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    const mini = screen.getByRole('region', { name: 'Now playing' });
    expect(within(mini).getByText('Lemon')).toBeInTheDocument();
    await user.click(within(mini).getByRole('button', { name: /Open Now Playing/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
  });

  it('opens the listening note as a bottom sheet and closes it on Escape', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/now-playing');

    await user.click(await screen.findByRole('button', { name: /Listening note/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Lemon' });
    expect(within(sheet).getByText('Listening note / Song')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Close note' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lemon' })).not.toBeInTheDocument());
  });

  it('opens and closes the lyrics view', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/now-playing');

    await user.click(await screen.findByRole('button', { name: 'Open lyrics' }));
    const lyrics = await screen.findByRole('dialog', { name: 'Lyrics · Lemon' });
    expect(within(lyrics).getByRole('list', { name: 'Next lines' })).toBeInTheDocument();
    expect(within(lyrics).getByText('Previous line:', { exact: false })).toBeInTheDocument();
    expect(within(lyrics).getByRole('button', { name: /Translation/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(lyrics).getByRole('button', { name: 'Close lyrics' }));
    expect(screen.queryByRole('dialog', { name: 'Lyrics · Lemon' })).not.toBeInTheDocument();
  });

  it('searches from the Search tab and keeps the query in the address', async () => {
    renderApp('?preview', '#/search?q=lemon');
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search Spotify' })).toHaveValue('lemon');
    expect(await screen.findByRole('region', { name: 'Tracks' })).toBeInTheDocument();
  });

  it('pushes the artist page inside the tab with a way back', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/artist/1snhtMLeb2DYoMOcVbb8iB');

    expect(await screen.findByRole('heading', { level: 1, name: 'Kenshi Yonezu' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lemon' })).toBeInTheDocument();
  });

  it('reads the archive offline-first, artist by artist', async () => {
    const user = userEvent.setup();
    renderApp('?preview', '#/archive');

    expect(await screen.findByRole('heading', { level: 1, name: 'Archive' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Kenshi Yonezu' });
    await user.click(within(card).getByRole('button', { expanded: false }));
    expect(within(card).getByText('Lemon')).toBeInTheDocument();
  });
});
