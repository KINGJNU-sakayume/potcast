import { describe, expect, it, vi } from 'vitest';
import { NarrationLibrary, type LibraryEnvironment } from './library';

const MANIFEST = { version: 1, engine: { id: 'e', name: 'E' }, clips: { aa11: 1200, bb22: 800, cc33: 500 }, samples: { F4: 'aa11' } };

function environment(routes: Record<string, () => Response | Promise<Response>>) {
  const fetched: string[] = [];
  const revoked: string[] = [];
  let made = 0;
  const env: LibraryEnvironment = {
    fetch: vi.fn(async (url: string) => {
      fetched.push(url);
      const route = routes[url];
      if (!route) return new Response('', { status: 404 });
      return route();
    }),
    createObjectURL: () => `blob:${(made += 1)}`,
    revokeObjectURL: (url) => void revoked.push(url),
  };
  return { env, fetched, revoked };
}

const json = (value: unknown) => () => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const audio = () => new Response(new Uint8Array([1, 2, 3]));

describe('the index', () => {
  it('is read once and announced', async () => {
    const { env, fetched } = environment({ '/site/narration/index.json': json(MANIFEST) });
    const library = new NarrationLibrary('/site/narration/', env);
    const listener = vi.fn();
    library.subscribe(listener);
    expect(library.getManifest()).toBeNull();
    await Promise.all([library.load(), library.load()]);
    expect(fetched).toEqual(['/site/narration/index.json']);
    expect(library.getManifest()).toEqual(MANIFEST);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(library.clipMs('aa11')).toBe(1200);
    expect(library.clipMs('zz99')).toBeUndefined();
  });

  it('stays empty on a site without recordings', async () => {
    const missing = new NarrationLibrary('/n/', environment({}).env);
    await missing.load();
    expect(missing.getManifest()).toBeNull();

    // A development server answers any path with the app's page.
    const page = new NarrationLibrary('/n/', environment({ '/n/index.json': () => new Response('<!doctype html><html></html>') }).env);
    await page.load();
    expect(page.getManifest()).toBeNull();

    const offline = new NarrationLibrary('/n/', {
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      createObjectURL: () => '',
      revokeObjectURL: () => undefined,
    });
    await expect(offline.load()).resolves.toBeUndefined();
    expect(offline.getManifest()).toBeNull();

    const nowhere = new NarrationLibrary('/n/', null);
    await nowhere.load();
    await expect(nowhere.clip('aa11')).rejects.toThrow();
  });
});

describe('clips', () => {
  it('are fetched once and handed out as object URLs', async () => {
    const { env, fetched } = environment({ '/n/index.json': json(MANIFEST), '/n/clips/aa/aa11.mp3': audio });
    const library = new NarrationLibrary('/n/', env);
    await library.load();
    const [first, second] = await Promise.all([library.clip('aa11'), library.clip('aa11')]);
    expect(first).toBe('blob:1');
    expect(second).toBe('blob:1');
    expect(fetched.filter((url) => url.endsWith('.mp3'))).toEqual(['/n/clips/aa/aa11.mp3']);
  });

  it('are tried again after a failure', async () => {
    let online = false;
    const { env } = environment({ '/n/index.json': json(MANIFEST), '/n/clips/aa/aa11.mp3': () => (online ? audio() : new Response('', { status: 503 })) });
    const library = new NarrationLibrary('/n/', env);
    await library.load();
    await expect(library.clip('aa11')).rejects.toThrow('503');
    online = true;
    await expect(library.clip('aa11')).resolves.toBe('blob:1');
  });

  it('are fetched ahead for what is about to be said, and only if the site has them', async () => {
    const { env, fetched } = environment({
      '/n/index.json': json(MANIFEST),
      '/n/clips/aa/aa11.mp3': audio,
      '/n/clips/bb/bb22.mp3': audio,
      '/n/clips/cc/cc33.mp3': audio,
    });
    const library = new NarrationLibrary('/n/', env);
    await library.load();
    library.prepare(['bb22', 'zz99', 'aa11', 'bb22']);
    await vi.waitFor(() => expect(fetched.filter((url) => url.endsWith('.mp3'))).toHaveLength(2));
    expect(fetched).toContain('/n/clips/bb/bb22.mp3');
    expect(fetched).not.toContain('/n/clips/zz/zz99.mp3');
    // Already there: preparing it again fetches nothing.
    library.prepare(['aa11']);
    await library.clip('aa11');
    expect(fetched.filter((url) => url.endsWith('aa11.mp3'))).toHaveLength(1);
  });
});
