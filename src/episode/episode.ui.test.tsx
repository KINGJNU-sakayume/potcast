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

const MBDTF = '20r762YmB5HeofjMCiPMLv';

const now = () => screen.getByRole('region', { name: 'Now in the episode' });
/** The slab in front of the cover with the line a host is saying. */
const hosts = () => within(now()).getByRole('group', { name: 'The hosts' });
/** The intro's own button: the transport's play button says the same. */
const playEpisode = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(within(await screen.findByRole('region', { name: 'Episode' })).getByRole('button', { name: 'Play episode' }));
};
const openScript = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Script' }));
  return screen.getByRole('group', { name: 'Script' });
};

beforeEach(() => {
  window.location.hash = '';
  preferencesStore.set(DEFAULT_PREFERENCES);
});

describe('an album episode on the desktop (preview archive, captions for a voice)', () => {
  it('is offered on the album page of an album that has one', async () => {
    const user = userEvent.setup();
    renderApp(`#/album/${IGOR}`);
    await user.click(await screen.findByRole('link', { name: 'Listen with the hosts' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Episode' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'IGOR' })).toBeInTheDocument();
    expect(within(now()).getByText('『IGOR』 같이 듣기', { selector: '.ep-title' })).toBeInTheDocument();
    expect(screen.getByText(/13 chapters · about \d+ (hr|min)/)).toBeInTheDocument();
    // jsdom has no speech synthesis: the page says so instead of going quiet.
    expect(screen.getByText('Captions only')).toBeInTheDocument();
    expect(within(now()).getByText(/두 사람이 『IGOR』 열두 곡을 순서대로 같이 듣는다/)).toBeInTheDocument();
    // Nobody is speaking yet, so nothing stands in front of the cover.
    expect(within(now()).queryByRole('group', { name: 'The hosts' })).not.toBeInTheDocument();
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

  it('plays from the top with the host\'s line in the lyrics\' place, and pauses and continues', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    await playEpisode(user);

    expect(within(hosts()).getByText('진행')).toBeInTheDocument();
    expect(within(hosts()).getByText(FIRST_LINE)).toBeInTheDocument();
    // Nothing is sounding yet: the cover and the title stay with the album, and the track the hosts are
    // leading up to is named as what is next, under their line.
    expect(screen.getByRole('heading', { level: 1, name: 'IGOR' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'The hosts' })).toBeInTheDocument();
    expect(within(now()).getByText('Up next')).toBeInTheDocument();
    expect(within(now()).getByText('From the start to 0:25')).toBeInTheDocument();
    expect(screen.getByText('Episode · 1 / 13')).toBeInTheDocument();

    const script = await openScript(user);
    expect(within(script).getByRole('button', { current: true })).toHaveTextContent(FIRST_LINE);
    // The script takes the lyrics' place, and with it the host's line: the line being said is its current row.
    expect(screen.getByRole('heading', { level: 2, name: 'Script' })).toBeInTheDocument();
    expect(within(now()).queryByRole('group', { name: 'The hosts' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close the script' }));
    expect(screen.queryByRole('group', { name: 'Script' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('starts from any line of the script, and from a stretch of music', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    const script = await openScript(user);

    await user.click(within(script).getByRole('button', { name: /가면을 쓰고 오히려 더 정직해져요/ }));
    expect(within(script).getByRole('button', { current: true })).toHaveTextContent('해설');
    expect(within(script).getByRole('button', { current: true })).toHaveTextContent('그래서 타일러는 가면을 쓰고 오히려 더 정직해져요.');

    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'EARFQUAKE' })).toBeInTheDocument();
    expect(screen.getByText('Episode · 3 / 13')).toBeInTheDocument();
    // While the music plays, nothing stands in front of the cover.
    expect(within(now()).queryByRole('group', { name: 'The hosts' })).not.toBeInTheDocument();
    // The preview's simulated player goes to the replayed lines of the track.
    await waitFor(() => expect(within(now()).getByText(/^0:4[6-9]$/)).toBeInTheDocument());
    expect(within(script).getByRole('button', { current: true })).toHaveTextContent('0:46–1:11');

    await user.click(screen.getByRole('button', { name: 'Next part' }));
    expect(within(script).getByRole('button', { current: true })).toHaveTextContent('화성은 똑같이 돌아오는데 안정감이 생기지 않아요.');
    await user.click(screen.getByRole('button', { name: 'Previous part' }));
    expect(within(now()).queryByRole('group', { name: 'The hosts' })).not.toBeInTheDocument();
  });

  it('shows the lyrics of what is playing, as Now Playing does, and the host\'s line over them when a host talks over the music', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(`#/episode/${IGOR}`);
    const script = await openScript(user);
    const over = within(script).getByRole('button', { name: /여기서부터 목소리가 들어오는데/ });
    expect(over).toHaveTextContent('over the music');
    await user.click(over);
    await user.click(screen.getByRole('button', { name: 'Close the script' }));

    expect(within(hosts()).getByText('over the music')).toBeInTheDocument();
    expect(hosts()).toHaveAttribute('data-over');
    // The track's own lyrics, with their translation, in the lyrics' place.
    await waitFor(() => expect(container.querySelector('.lyrics-panel .current-lyric:not(.is-state)')).toBeInTheDocument());
    await waitFor(() => expect(container.querySelector('.lyrics-panel .current-trans')).toHaveAttribute('lang', 'ko'));
    expect(screen.getByRole('button', { name: /^Translation/ })).toHaveTextContent('On');
  });

  it('keeps running on other pages: the rail leads back, and Space and the transport pause the episode', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    await playEpisode(user);

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
    await playEpisode(user);
    // The hosts are still talking: the album stands under the cover, linked as on the intro.
    await user.click(within(now()).getByRole('link', { name: 'Album' }));
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
    expect(preferencesStore.get().episodeTalkOver).toBe('pause');
    expect(within(settings).queryByRole('slider', { name: 'Music level under talk' })).not.toBeInTheDocument();
  });
});

describe('an episode that was left part-way', () => {
  it('offers to carry on from where it was left, or to start from the top', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    expect(await screen.findByRole('region', { name: 'Episode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'From the top' })).not.toBeInTheDocument();

    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /후렴 뒤에 떠나지 말라는 부탁이 세 번/ }));
    await user.click(screen.getByRole('button', { name: 'End episode' }));
    expect(now()).toHaveAttribute('data-status', 'idle');
    expect(screen.getByText('Left at 3 / 13 · EARFQUAKE')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close the script' }));
    await user.click(within(screen.getByRole('region', { name: 'Episode' })).getByRole('button', { name: 'Continue' }));
    expect(within(hosts()).getByText(/후렴 뒤에 떠나지 말라는 부탁이 세 번/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End episode' }));

    await user.click(screen.getByRole('button', { name: 'From the top' }));
    expect(within(hosts()).getByText(FIRST_LINE)).toBeInTheDocument();
  });
});

describe('the music in an episode', () => {
  it('is left without a translation when translations are turned off', async () => {
    const user = userEvent.setup();
    preferencesStore.set({ translationEnabled: false });
    const { container } = renderApp(`#/episode/${IGOR}`);
    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    await user.click(screen.getByRole('button', { name: 'Close the script' }));
    await waitFor(() => expect(container.querySelector('.lyrics-panel .current-lyric:not(.is-state)')).toBeInTheDocument());
    expect(container.querySelector('.lyrics-panel .current-trans')).not.toBeInTheDocument();
  });

  it('marks on the seek bar the stretch of the track that is being played', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(`#/episode/${IGOR}`);
    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    const stretch = await waitFor(() => {
      const mark = container.querySelector<HTMLElement>('.ep-bar-stretch');
      expect(mark).toBeInTheDocument();
      return mark!;
    });
    // 0:46–1:11 of a 3:10 track.
    expect(Number.parseFloat(stretch.style.left)).toBeGreaterThan(23);
    expect(Number.parseFloat(stretch.style.left)).toBeLessThan(26);
    expect(Number.parseFloat(stretch.style.width)).toBeGreaterThan(11);
    expect(Number.parseFloat(stretch.style.width)).toBeLessThan(15);

    // A whole track has no stretch to mark.
    await user.click(within(script).getByRole('button', { name: /부드러운 코드와 불안정한 보컬이 동시에 움직인다/ }));
    await waitFor(() => expect(container.querySelector('.ep-bar-stretch')).not.toBeInTheDocument());
  });
});

describe('a track from outside the album', () => {
  it('takes the cover, the title and the lyrics\' place while the episode steps out to it', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${MBDTF}`);
    expect(await screen.findByText(/5 chapters · about \d+ min/)).toBeInTheDocument();
    const script = await openScript(user);
    const row = within(script).getByRole('button', { name: /킹 크림슨의 원곡, 첫 절과 제목을 부르는 목소리/ });
    expect(row).toHaveTextContent('21st Century Schizoid Man — King Crimson · 1969');
    expect(row).toHaveTextContent('0:47–1:05');
    await user.click(row);
    await user.click(screen.getByRole('button', { name: 'Close the script' }));

    expect(screen.getByRole('heading', { level: 1, name: '21st Century Schizoid Man' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Outside the album' })).toBeInTheDocument();
    expect(within(now()).getByText('POWER의 후렴 끝마다 잘려 들어오는 목소리')).toBeInTheDocument();
    // Its own cover in front of the album's.
    expect(within(now()).getByRole('img', { name: /21st Century Schizoid Man cover/ })).toBeInTheDocument();
    // What is played, and the stretch of the album's own track it is heard against next.
    const pair = within(now()).getByRole('list', { name: 'What is played, and what it is heard against' });
    const [source, against] = within(pair).getAllByRole('listitem');
    expect(source).toHaveAttribute('aria-current', 'true');
    expect(source).toHaveTextContent('0:47–1:05');
    expect(against).toHaveTextContent('POWER');
    expect(against).toHaveTextContent('0:21–0:37');
    await waitFor(() => expect(within(now()).getByText(/^0:(4[6-9]|5\d)$/)).toBeInTheDocument());

    // Back in the album: the album's cover and the track's own lyrics again.
    await user.click(screen.getByRole('button', { name: 'Next part' }));
    await user.click(screen.getByRole('button', { name: 'Next part' }));
    expect(screen.getByRole('heading', { level: 1, name: 'POWER' })).toBeInTheDocument();
    expect(within(now()).queryByRole('img', { name: /21st Century Schizoid Man cover/ })).not.toBeInTheDocument();
  });

  it('is announced as what is next while the hosts are still leading up to it', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${MBDTF}`);
    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /그 목소리는 킹 크림슨의 것이에요/ }));
    await user.click(screen.getByRole('button', { name: 'Close the script' }));
    expect(within(hosts()).getByText('그 목소리는 킹 크림슨의 것이에요.')).toBeInTheDocument();
    // Not on yet: the album keeps the cover and the title; the track is named under the hosts' line.
    expect(screen.queryByRole('heading', { level: 1, name: '21st Century Schizoid Man' })).not.toBeInTheDocument();
    expect(within(now()).queryByRole('img', { name: /21st Century Schizoid Man cover/ })).not.toBeInTheDocument();
    expect(within(now()).getByText('Up next')).toBeInTheDocument();
    expect(within(now()).getByText(/King Crimson · 1969/)).toBeInTheDocument();
  });
});

describe('an episode whose music the listener plays themselves', () => {
  const playItMyself = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Voices and pace' }));
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    await user.click(within(settings).getByRole('button', { name: 'I play it myself' }));
    expect(preferencesStore.get().episodeMusic).toBe('manual');
    // Talking over the music is not a choice any more: the music is not the episode's to turn down.
    expect(within(settings).queryByRole('group', { name: 'Music while a host talks over it' })).not.toBeInTheDocument();
    return settings;
  };

  it('shows what to play, links to it in Spotify, and goes on when told it has been heard', async () => {
    const user = userEvent.setup();
    renderApp(`#/episode/${IGOR}`);
    await playItMyself(user);
    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /같은 부탁이 세 번, 화성은 그대로/ }));
    await user.click(screen.getByRole('button', { name: 'Close the script' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Your turn' })).toBeInTheDocument();
    expect(within(now()).getByText('EARFQUAKE', { selector: '.current-lyric' })).toBeInTheDocument();
    expect(within(now()).getByText(/^From 0:4\d to 1:1\d$/)).toBeInTheDocument();
    // The lines of the stretch, to read along with.
    const lines = within(now()).getByRole('list', { name: 'The lines of this stretch, translated' });
    expect(within(lines).getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(within(now()).getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}$/));

    await user.click(within(now()).getByRole('button', { name: 'Heard it · go on' }));
    expect(within(hosts()).getByText('화성은 똑같이 돌아오는데 안정감이 생기지 않아요.')).toBeInTheDocument();
  });

  it('asks for a whole track as a whole track, and takes up a stretch again when the choice is changed in the middle of it', async () => {
    const user = userEvent.setup();
    preferencesStore.set({ episodeMusic: 'manual' });
    renderApp(`#/episode/${IGOR}`);
    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /부드러운 코드와 불안정한 보컬이 동시에 움직인다/ }));
    await user.click(screen.getByRole('button', { name: 'Close the script' }));
    expect(within(now()).getByText(/^The whole track · \d:\d\d$/)).toBeInTheDocument();
    expect(within(now()).queryByRole('list')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voices and pace' }));
    await user.click(within(screen.getByRole('complementary', { name: 'Settings' })).getByRole('button', { name: 'Played for me' }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'Your turn' })).not.toBeInTheDocument());
    expect(now()).toHaveAttribute('data-status', 'playing');
  });

  it('asks for a track from outside the album by its artist too', async () => {
    const user = userEvent.setup();
    preferencesStore.set({ episodeMusic: 'manual' });
    renderApp(`#/episode/${MBDTF}`);
    const script = await openScript(user);
    await user.click(within(script).getByRole('button', { name: /터틀스의 원곡, 첫 소절/ }));
    await user.click(screen.getByRole('button', { name: 'Close the script' }));
    expect(within(now()).getByText('The Turtles · From 0:10 to 0:35')).toBeInTheDocument();
    expect(within(now()).getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', 'https://open.spotify.com/track/7j1ABZOylWUPUIZTt5x6AL');
  });
});

describe('the archive', () => {
  it('counts the episodes and leads to an album\'s episode from its card', async () => {
    renderApp('#/archive?artist=tyler');
    expect(await screen.findByText(/· 3 episodes ·/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Listen to IGOR with the hosts' })).toHaveAttribute('href', `#/episode/${IGOR}`);
    expect(screen.getByRole('link', { name: 'Listen to Flower Boy with the hosts' })).toHaveAttribute('href', '#/episode/2nkto6YNI4rUYTLqEwWJ3o');
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
    const details = await screen.findByRole('region', { name: 'Episode' });
    expect(within(details).getByText('Recorded · Supertonic 3')).toBeInTheDocument();
    expect(within(details).getByText('The hosts’ voices are machine-generated (Supertonic 3).')).toBeInTheDocument();
    expect(within(details).queryByText(/has no Korean voice/)).not.toBeInTheDocument();
  });

  it('says how much is recorded when only part of it is', async () => {
    vi.spyOn(narrationLibrary, 'getManifest').mockReturnValue(recorded('half'));
    renderApp(`#/episode/${IGOR}`);
    const details = await screen.findByRole('region', { name: 'Episode' });
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
    // On its own page the episode has its controls; the mini player stays away.
    await playEpisode(user);
    expect(within(hosts()).getByText(FIRST_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Episode' })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'Library' }));
    const mini = await screen.findByRole('region', { name: 'Episode' });
    await user.click(within(mini).getByRole('button', { name: 'Pause episode' }));
    expect(within(mini).getByRole('button', { name: 'Continue episode' })).toBeInTheDocument();
    await user.click(within(mini).getByRole('button', { name: /Back to the episode/ }));
    expect(await screen.findByRole('region', { name: 'Now in the episode' })).toHaveAttribute('data-status', 'paused');
  });
});
