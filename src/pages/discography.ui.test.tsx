import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { readConfig } from '../app/config';
import { createAppServices } from '../app/services';
import { albumNotes } from '../editorial/albums';
import { artistNotes } from '../editorial/artists';
import { songNotes } from '../editorial/songs';

const KENSHI = '1snhtMLeb2DYoMOcVbb8iB';
const STRAY_SHEEP = '052EiTRYh35MuDVJN9Emdh';

function renderApp(hash: string) {
  window.history.replaceState({}, '', `/?preview${hash}`);
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  return render(<App services={services} />);
}

const yearLabels = () => Array.from(document.querySelectorAll('.year-label')).map((el) => el.textContent);

beforeEach(() => {
  window.location.hash = '';
});

describe('discography digging (preview archive)', () => {
  it('shows the artist discography as a chronology with editions, eras, groups and order', async () => {
    const user = userEvent.setup();
    renderApp(`#/artist/${KENSHI}`);

    expect(await screen.findByRole('heading', { name: /Discography/ })).toBeInTheDocument();
    await waitFor(() => expect(yearLabels()).toEqual(['2020', '2024']));
    // The note's era covering these years marks the start of the timeline.
    expect(screen.getByText("'Lemon' 이후")).toBeInTheDocument();

    // The deluxe edition is folded under the original.
    expect(screen.queryByRole('link', { name: 'STRAY SHEEP (Deluxe Edition)' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+1 edition' }));
    expect(screen.getByRole('link', { name: 'STRAY SHEEP (Deluxe Edition)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Singles & EPs' }));
    await waitFor(() => expect(yearLabels()).toEqual(['2018', '2022']));
    expect(window.location.hash).toContain('group=single');
    await user.click(screen.getByRole('button', { name: 'Oldest first' }));
    expect(yearLabels()).toEqual(['2022', '2018']);
    expect(screen.getByRole('button', { name: 'Newest first' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Appears on' }));
    expect(await screen.findByRole('link', { name: 'Test Pressing' })).toBeInTheDocument();
    expect(screen.getByText(/ARC Preview Ensemble/)).toBeInTheDocument();
  });

  it('steps to the next and previous release from an album, also with [ and ]', async () => {
    const user = userEvent.setup();
    renderApp(`#/album/${STRAY_SHEEP}`);

    const nav = await screen.findByRole('navigation', { name: 'Discography' });
    await waitFor(() => expect(nav).toHaveTextContent('01 / 02 · Albums'));
    expect(within(nav).getByText('The first release')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Next → · 2024\s*LOST CORNER/ })).toHaveAttribute('href', '#/album/2HfY1kPSmmYfR13OSKYH5T');

    await user.keyboard(']');
    expect(await screen.findByRole('heading', { level: 1, name: 'LOST CORNER' })).toBeInTheDocument();
    const next = await screen.findByRole('navigation', { name: 'Discography' });
    await waitFor(() => expect(next).toHaveTextContent('02 / 02'));
    await user.keyboard('[['); // "[[" is a literal "[" in user-event's key syntax
    expect(await screen.findByRole('heading', { level: 1, name: 'STRAY SHEEP' })).toBeInTheDocument();
  });

  it('indexes every note by artist in the Archive and reads them beside the page', async () => {
    const user = userEvent.setup();
    renderApp('#/archive');

    expect(await screen.findByRole('heading', { level: 1, name: 'Archive' })).toBeInTheDocument();
    // Counts and order follow the note files, so adding a note never breaks this test.
    expect(
      screen.getByText(`${artistNotes.length} artists · ${albumNotes.length} album notes · ${songNotes.length} listening notes · works offline`),
    ).toBeInTheDocument();
    const index = screen.getByRole('navigation', { name: 'Artists with notes' });
    const names = artistNotes.map((artist) => artist.names[0]!).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    expect(within(index).getAllByRole('button').map((button) => button.querySelector('b')!.textContent)).toEqual(names);

    // The playing artist (the preview plays Lemon) is chosen first; another is one click away and lives in the address.
    expect(screen.getByRole('region', { name: 'Kenshi Yonezu' })).toBeInTheDocument();
    expect(within(index).getByRole('button', { name: /^Kenshi Yonezu/ })).toHaveAttribute('aria-current', 'true');
    await user.click(within(index).getByRole('button', { name: /^Coldplay/ }));
    expect(await screen.findByRole('region', { name: 'Coldplay' })).toBeInTheDocument();
    expect(window.location.hash).toContain('artist=coldplay');
    await user.click(within(index).getByRole('button', { name: /^Kenshi Yonezu/ }));
    const chosen = await screen.findByRole('region', { name: 'Kenshi Yonezu' });

    expect(within(chosen).getByRole('link', { name: 'STRAY SHEEP' })).toHaveAttribute('href', `#/album/${STRAY_SHEEP}`);
    await user.click(within(chosen).getByRole('button', { name: 'Read the note on STRAY SHEEP' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'STRAY SHEEP' })).toHaveTextContent('Editorial note / Album');

    // One row per song, all Listening notes: no separate translation entries.
    const row = (title: string) => within(chosen).getByText(title, { selector: 'b' }).closest('li')!;
    expect(within(chosen).getAllByText('Lemon', { selector: 'b' })).toHaveLength(1);
    expect(chosen).not.toHaveTextContent(/Translation/);
    // Listening notes sit under their album, oldest first, numbered by their place in the tracklist.
    const groups = within(chosen).getAllByRole('region').filter((el) => el.classList.contains('archive-song-group'));
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['STRAY SHEEP', 'LOST CORNER']);
    expect(row('Flamingo').querySelector('.archive-kind')).toHaveTextContent('02 · 번역');
    expect(row('Lemon').querySelector('.archive-kind')).toHaveTextContent('08 · 번역');
    await user.click(within(row('Lemon')).getByRole('button', { name: 'Read the note on Lemon' }));
    const lemon = screen.getByRole('complementary', { name: 'Lemon' });
    expect(lemon).toHaveTextContent('Listening note / Song');
    expect(within(lemon).getByRole('heading', { name: '번역에 대하여' })).toBeInTheDocument();
  });
});
