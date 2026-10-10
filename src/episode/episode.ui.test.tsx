import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { readConfig } from '../app/config';
import { createAppServices } from '../app/services';
import { MOBILE_QUERY } from '../app/useIsMobile';
import { DEFAULT_PREFERENCES, preferencesStore } from '../preferences/preferences';
import { getEpisodeScript } from './episodes';
import { NARRATION_ENGINE, RECORDED_VOICES, type NarrationManifest } from './narration/clip';
import { narrationLibrary } from './narration/library';
import { episodeClips, sampleClips } from './narration/plan';

const IGOR = '5zi7WsKlIiUXv09tbGLKsE';
const FIRST_LINE = '오늘 같이 들을 앨범은 타일러 더 크리에이터의 『IGOR』예요.';

function renderApp(hash: string) {
  window.history.replaceState({}, '', `/?preview${hash}`);
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  return render(<App services={services} />);
}

const now = () => screen.getByRole('region', { name: 'Now in the episode' });

beforeEach(() => {
  window.location.hash = '';
  preferencesStore.set(DEFAULT_PREFERENCES);
});

describe('an album episode on the desktop (preview archive, captions for a voice)', () => {
  it('is offered on the album page of an album that has one', async () => {
    const user = userEvent.setup();
    renderApp(`#/album/${IGOR}`);
    await user.click(await screen.findByRole('link', { name: 'Listen with the hosts' }));
    expect(await screen.findByRole('heading', { level: 2, name: '『IGOR』 같이 듣기' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'IGOR' })).toBeInTheDocument();
    expect(screen.getByText(/13 chapters · about \d+ min/)).toBeInTheDocument();
    // jsdom has no speech synthesis: the page says so instead of going quiet.
    expect(screen.getByText('Captions only')).toBeInTheDocument();
    expect(within(now()).getByText(/두 사람이 『IGOR』 열두 곡을 순서대로 같이 듣는다/)).toBeInTheDocument();
  });

  it('has no such link on an album without an episode', async () => {
    renderApp('#/album/052EiTRYh35MuDVJN9Emdh');
    expect(await screen.findByRole('button', { name: 'Play album' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Listen with the hosts' })).not.toBeInTheDocument();
  });

  it('says so at the episode address of an album without one', async () => {
    renderApp('#/episode/052EiTRYh35MuDVJN9Emdh');
    expect(await screen.findByRole('heading', { level: 1, name: 'No episode yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the album' })).toHaveAttribute('href', '#/album/052EiTRYh35MuDVJN9Emdh');
  });

  it('plays from the top, shows the line being said, and pauses and continues', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode details' });
    await user.click(within(details).getByRole('button', { name: 'Play episode' }));

    expect(within(now()).getByText('진행')).toBeInTheDocument();
    expect(within(now()).getByText(FIRST_LINE)).toBeInTheDocument();
    const script = screen.getByRole('group', { name: 'Script' });
    expect(within(script).getByRole('button', { current: true })).toHaveTextContent(FIRST_LINE);
    expect(screen.getByText('1 / 13 · 여는 말')).toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: 'Pause' }));
    expect(within(details).getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    await user.click(within(details).getByRole('button', { name: 'Continue' }));
    expect(within(details).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('starts from any line of the script, and from a stretch of music', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });

    await user.click(within(script).getByRole('button', { name: /그 인물의 이름이 이고르예요/ }));
    expect(within(now()).getByText('해설')).toBeInTheDocument();
    expect(within(now()).getByText('그 인물의 이름이 이고르예요.')).toBeInTheDocument();

    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    expect(within(now()).getByText('EARFQUAKE')).toBeInTheDocument();
    expect(within(now()).getByText('Listening to a part')).toBeInTheDocument();
    expect(screen.getByText('3 / 13 · EARFQUAKE')).toBeInTheDocument();
    // The preview's simulated player goes to the replayed lines of the track.
    await waitFor(() => expect(within(now()).getByText(/^0:4[6-9]$/)).toBeInTheDocument());
    expect(within(now()).getByText('1:11')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next part' }));
    expect(within(now()).getByText('화성은 똑같이 돌아오는데 안정감이 생기지 않아요.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous part' }));
    expect(within(now()).getByText('EARFQUAKE')).toBeInTheDocument();
  });

  it('marks talk over the music, and switches what the music does under it', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });
    const over = within(script).getByRole('button', { name: /여기서부터 목소리가 들어오는데/ });
    expect(over).toHaveTextContent('over the music');
    await user.click(over);
    expect(within(now()).getByText("over IGOR'S THEME")).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /Talk over music/ });
    expect(toggle).toHaveTextContent('music turned down');
    await user.click(toggle);
    expect(toggle).toHaveTextContent('music stops');
    expect(preferencesStore.get().episodeTalkOver).toBe('pause');
  });

  it('keeps running on other pages: the rail leads back, and Space and the transport pause the episode', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode details' });
    await user.click(within(details).getByRole('button', { name: 'Play episode' }));

    const rail = screen.getByRole('complementary', { name: 'Primary navigation' });
    expect(within(rail).queryByRole('link', { name: /^Episode:/ })).not.toBeInTheDocument();
    await user.click(within(rail).getByRole('link', { name: 'Now Playing' }));
    const transport = await screen.findByRole('button', { name: 'Pause episode' });
    await user.click(transport);
    expect(screen.getByRole('button', { name: 'Continue episode' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Pause episode' })).toBeInTheDocument();

    await user.click(within(rail).getByRole('link', { name: 'Episode: 『IGOR』 같이 듣기. Back to the episode' }));
    expect(await screen.findByRole('region', { name: 'Now in the episode' })).toHaveAttribute('data-status', 'playing');
    await user.click(screen.getByRole('button', { name: 'End episode' }));
    expect(now()).toHaveAttribute('data-status', 'idle');
    expect(screen.queryByRole('button', { name: 'End episode' })).not.toBeInTheDocument();
  });

  it('offers the way back from the album page while it runs', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode details' });
    await user.click(within(details).getByRole('button', { name: 'Play episode' }));
    await user.click(within(details).getByRole('link', { name: 'Album' }));
    expect(await screen.findByRole('link', { name: 'Back to the episode' })).toHaveAttribute('href', `#/episode/${IGOR}`);
  });

  it('has the episode settings in the settings column', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    await user.click(await screen.findByRole('button', { name: 'Voices and pace' }));
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    expect(within(settings).getByText(/This browser has no Korean voice/)).toBeInTheDocument();
    await user.click(within(within(settings).getByRole('group', { name: 'Pace' })).getByRole('button', { name: '1.25×' }));
    expect(preferencesStore.get().episodeRate).toBe(1.25);
    await user.click(within(settings).getByRole('button', { name: 'Music stops' }));
    expect(screen.getByRole('button', { name: /Talk over music/ })).toHaveTextContent('music stops');
    expect(within(settings).queryByRole('slider', { name: 'Music level under talk' })).not.toBeInTheDocument();
  });
});

describe('an episode that was left part-way', () => {
  it('offers to carry on from where it was left, or to start from the top', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });
    const details = screen.getByRole('region', { name: 'Episode details' });
    expect(within(details).queryByRole('button', { name: 'From the top' })).not.toBeInTheDocument();

    await user.click(within(script).getByRole('button', { name: /후렴 뒤에 떠나지 말라는 부탁이 세 번/ }));
    await user.click(within(details).getByRole('button', { name: 'End episode' }));
    expect(now()).toHaveAttribute('data-status', 'idle');
    expect(screen.getByText('Left at 3 / 13 · EARFQUAKE')).toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: 'Continue' }));
    expect(within(now()).getByText(/후렴 뒤에 떠나지 말라는 부탁이 세 번/)).toBeInTheDocument();
    await user.click(within(details).getByRole('button', { name: 'End episode' }));

    await user.click(within(details).getByRole('button', { name: 'From the top' }));
    expect(within(now()).getByText(FIRST_LINE)).toBeInTheDocument();
  });
});

describe('the music in an episode', () => {
  it('is subtitled with the song note\'s translation of the line being sung', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });
    // The replayed stretch of EARFQUAKE starts on a sung line.
    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    await waitFor(() => expect(container.querySelector('.ep-now-lyric')?.textContent?.trim().length ?? 0).toBeGreaterThan(1));
    expect(container.querySelector('.ep-now-lyric')).toHaveAttribute('lang', 'ko');
  });

  it('is left without subtitles when translations are turned off', async () => {
    const user = userEvent.setup();
    preferencesStore.set({ translationEnabled: false });
    const { container } = renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });
    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    await waitFor(() => expect(within(now()).getByText(/^0:4[6-9]$/)).toBeInTheDocument());
    expect(container.querySelector('.ep-now-lyric')).not.toBeInTheDocument();
  });
});

describe('an episode whose music the listener plays themselves', () => {
  it('shows what to play, links to it in Spotify, and goes on when told it has been heard', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });
    const toggle = screen.getByRole('button', { name: /^Music:/ });
    expect(toggle).toHaveTextContent('played for me');
    await user.click(toggle);
    expect(toggle).toHaveTextContent('I play it myself');
    expect(preferencesStore.get().episodeMusic).toBe('manual');
    // Talking over the music is not a choice any more: the music is not the episode's to turn down.
    expect(screen.queryByRole('button', { name: /Talk over music/ })).not.toBeInTheDocument();

    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    expect(within(now()).getByText('Your turn')).toBeInTheDocument();
    expect(within(now()).getByText('EARFQUAKE')).toBeInTheDocument();
    expect(within(now()).getByText(/^From 0:4\d to 1:1\d$/)).toBeInTheDocument();
    // The lines of the stretch, to read along with.
    const lines = within(now()).getByRole('list', { name: 'The lines of this stretch, translated' });
    expect(within(lines).getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(within(now()).getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}$/));

    await user.click(within(now()).getByRole('button', { name: 'Heard it · go on' }));
    expect(within(now()).getByText('화성은 똑같이 돌아오는데 안정감이 생기지 않아요.')).toBeInTheDocument();
  });

  it('asks for a whole track as a whole track, and takes up a stretch again when the choice is changed in the middle of it', async () => {
    const user = userEvent.setup();
    preferencesStore.set({ episodeMusic: 'manual' });
    renderApp(`#/episode/${IGOR}`);
    const script = await screen.findByRole('group', { name: 'Script' });
    await user.click(within(script).getByRole('button', { name: /부드러운 코드와 불안정한 보컬이 동시에 움직인다/ }));
    expect(within(now()).getByText(/^The whole track · \d:\d\d$/)).toBeInTheDocument();
    expect(within(now()).queryByRole('list')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Music:/ }));
    expect(within(now()).getByText('Listening')).toBeInTheDocument();
    expect(within(now()).queryByText('Your turn')).not.toBeInTheDocument();
  });
});

describe('the archive', () => {
  it('counts the episodes and leads to an album\'s episode from its card', async () => {
    renderApp('#/archive?artist=tyler');
    expect(await screen.findByText(/· 1 episode ·/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Listen to IGOR with the hosts' })).toHaveAttribute('href', `#/episode/${IGOR}`);
  });
});

describe('an episode on a site with recorded hosts', () => {
  function recorded(part: 'all' | 'half'): NarrationManifest {
    const clips = episodeClips(getEpisodeScript('igor')!);
    const kept = part === 'all' ? clips : clips.slice(0, Math.floor(clips.length / 2));
    const samples = sampleClips();
    return {
      version: 1,
      engine: { id: NARRATION_ENGINE.id, name: NARRATION_ENGINE.name },
      clips: Object.fromEntries([...kept, ...samples].map((clip) => [clip.key, 3000])),
      samples: Object.fromEntries(samples.map((clip) => [clip.voice, clip.key])),
    };
  }

  it('says that the hosts are recorded and machine-generated, and how long the episode really runs', async () => {
    vi.spyOn(narrationLibrary, 'getManifest').mockReturnValue(recorded('all'));
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode details' });
    expect(within(details).getByText('Recorded · Supertonic 3')).toBeInTheDocument();
    expect(within(details).getByText('The hosts’ voices are machine-generated (Supertonic 3).')).toBeInTheDocument();
    expect(within(details).queryByText(/has no Korean voice/)).not.toBeInTheDocument();
  });

  it('says how much is recorded when only part of it is', async () => {
    vi.spyOn(narrationLibrary, 'getManifest').mockReturnValue(recorded('half'));
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode details' });
    expect(within(details).getByText(/^Recorded in part · \d+ of \d+ lines$/)).toBeInTheDocument();
    // jsdom has no voice for the other half.
    expect(within(details).getByText(/Some lines have no recording yet/)).toBeInTheDocument();
  });

  it('lets each of the ten voices be heard in the settings', async () => {
    const user = userEvent.setup();
    vi.spyOn(narrationLibrary, 'getManifest').mockReturnValue(recorded('all'));
    const clip = vi.spyOn(narrationLibrary, 'clip').mockRejectedValue(new Error('no network in the tests'));
    renderApp(`#/episode/${IGOR}`);
    await user.click(await screen.findByRole('button', { name: 'Voices and pace' }));
    const voices = within(screen.getByRole('complementary', { name: 'Settings' })).getByRole('group', { name: 'The recorded voices' });
    expect(within(voices).getAllByRole('button')).toHaveLength(RECORDED_VOICES.length);
    await user.click(within(voices).getByRole('button', { name: /Hear voice M5, warm, storytelling/ }));
    expect(clip).toHaveBeenCalledWith(recorded('all').samples.M5);
  });
});

describe('an album episode on a phone', () => {
  beforeEach(() => {
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
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    delete (window as Partial<Window>).matchMedia;
  });

  it('plays on the episode page and leaves a mini player that leads back to it', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode details' });
    // On its own page the episode has its controls; the mini player stays away.
    await user.click(within(details).getByRole('button', { name: 'Play episode' }));
    expect(within(now()).getByText(FIRST_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Episode' })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'Library' }));
    const mini = await screen.findByRole('region', { name: 'Episode' });
    await user.click(within(mini).getByRole('button', { name: 'Pause episode' }));
    expect(within(mini).getByRole('button', { name: 'Continue episode' })).toBeInTheDocument();
    await user.click(within(mini).getByRole('button', { name: /Back to the episode/ }));
    expect(await screen.findByRole('region', { name: 'Now in the episode' })).toHaveAttribute('data-status', 'paused');
  });
});
