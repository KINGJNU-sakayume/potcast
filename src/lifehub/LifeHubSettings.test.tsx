import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { readConfig } from '../app/config';
import { createAppServices } from '../app/services';
import { LIFEHUB_ORIGIN } from './remote';

function renderApp(hash: string) {
  window.history.replaceState({}, '', `/?preview${hash}`);
  const services = createAppServices(readConfig({ BASE_URL: '/', VITE_ENABLE_PREVIEW: 'true' }, 'http://localhost:3000'));
  return render(<App services={services} />);
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;

/** Life Hub answers with `hub`; anything else is left to the original fetch. */
function fakeHub(hub: (url: string, init?: RequestInit) => Response) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(LIFEHUB_ORIGIN)) return realFetch(input, init);
    calls.push(url);
    return hub(url, init);
  }) as typeof fetch;
  return calls;
}

const connect = () => localStorage.setItem('potcast.lifehub.tokens.v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: Date.now() + 3_600_000 }));

beforeEach(() => { window.location.hash = ''; });
afterEach(() => { globalThis.fetch = realFetch; });

describe('Life Hub in settings', { timeout: 40_000 }, () => {
  it('before connecting, the 「Life Hub 연결」 button is only in the settings Life Hub section', async () => {
    const user = userEvent.setup();
    renderApp('#/library');
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Life Hub 연결' })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: '기록 백업·청취 이력' })).toBeEnabled(), { timeout: 8000 });
    {
      await user.click(screen.getByRole('button', { name: '기록 백업·청취 이력' }));
      const drawer = await screen.findByRole('dialog', { name: '개인 음악 기록' });
      expect(within(drawer).queryByRole('button', { name: 'Life Hub 연결' })).not.toBeInTheDocument();
      expect(within(drawer).queryByText(/Life Hub/)).not.toBeInTheDocument();
      await user.click(within(drawer).getByRole('button', { name: 'Close record tools' }));
    }

    const rail = screen.getByRole('complementary', { name: 'Primary navigation' });
    await user.click(within(rail).getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    expect(within(settings).getByText('Life Hub', { selector: '.label' })).toBeInTheDocument();
    expect(within(settings).getByText('Claude가 제안한 기록을 받습니다.')).toBeInTheDocument();
    // The preview address cannot connect: the button stays, disabled, with the reason under it.
    expect(within(settings).getByRole('button', { name: 'Life Hub 연결' })).toBeDisabled();
    expect(within(settings).getByText('배포된 주소에서만 연결할 수 있어요.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Life Hub 연결' })).toHaveLength(1);
  });

  it('a refused connection needs attention: a dot and 「(확인 필요)」 on the settings entry point', async () => {
    const user = userEvent.setup();
    connect();
    fakeHub((url) => url.endsWith('/oauth/token') ? json(400, { error: 'invalid_grant' }) : json(401, {}));
    renderApp('#/library');
    // A plain DOM check while waiting; the rail re-renders, so it is looked up afterwards.
    await waitFor(() => expect(document.querySelector('.attention-dot')).not.toBeNull(), { timeout: 15_000 });
    const rail = screen.getByRole('complementary', { name: 'Primary navigation' });
    const entry = within(rail).getByRole('button', { name: 'Settings (확인 필요)' });
    expect(entry.querySelector('.attention-dot')).not.toBeNull();

    await user.click(entry);
    const settings = screen.getByRole('complementary', { name: /^Settings/ });
    expect(within(settings).getByText('확인 필요')).toBeInTheDocument();
    expect(within(settings).getByText('Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.')).toBeInTheDocument();
    expect(within(settings).getByRole('button', { name: '다시 연결' })).toBeInTheDocument();

    // Disconnecting goes back to state A and the dot goes away.
    await user.click(within(settings).getByRole('button', { name: '연결 해제' }));
    expect(within(settings).getByRole('button', { name: 'Life Hub 연결' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' }).querySelector('.attention-dot')).toBeNull();
    expect(document.querySelector('.attention-dot')).toBeNull();
  });

  it('with no proposals, the library renders no proposal entry point', async () => {
    connect();
    const user = userEvent.setup();
    const calls = fakeHub(() => json(200, { candidates: [] }));
    renderApp('#/library');
    await screen.findByRole('heading', { level: 1, name: 'Library' });
    // The library's round runs once per page load (the test above used it); the settings section syncs on opening.
    await waitFor(() => expect(screen.getByRole('button', { name: '기록 백업·청취 이력' })).toBeEnabled(), { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(document.querySelector('.settings-body')).not.toBeNull());
    await waitFor(() => expect(calls.some((url) => url.includes('/candidates'))).toBe(true), { timeout: 15_000 });
    await waitFor(() => expect(document.querySelector('.lifehub-status')?.textContent).toBe('연결됨'), { timeout: 15_000 });
    expect(screen.queryByText(/Claude가 제안한 감상 기록/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Claude 제안' })).not.toBeInTheDocument();
  });

});
