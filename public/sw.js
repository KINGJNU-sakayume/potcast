/*
 * ARC Music service worker: the app opens from the Home Screen and without a
 * connection. Pages are network-first (a new deploy shows up on the next
 * launch), the hashed build files and the hosts' recorded lines are
 * cache-first, and nothing from another origin is touched — Spotify, its
 * login, the playback SDK and LRCLIB always go to the network.
 */
const CACHE = 'arc-shell-v1';
/** Episode narration clips: kept apart from the shell, so a new shell version does not throw them away. */
const NARRATION = 'arc-narration-v1';
const SCOPE = new URL(self.registration.scope);
const SHELL = [SCOPE.href, new URL('manifest.webmanifest', SCOPE).href, new URL('icons/icon-192.png', SCOPE).href];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== NARRATION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  // The app itself: the network first, the last copy when offline. The Spotify login callback
  // (`?code=`) is never served from the cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !url.search) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SCOPE.href, copy));
          }
          return response;
        })
        .catch(() => caches.match(SCOPE.href).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Hashed build files never change, and neither does a recorded line (a clip is named after the voice and the
  // words it says; the app fetches it whole): the cache first, the network once.
  const hashed = url.pathname.startsWith(`${SCOPE.pathname}assets/`);
  const clip = url.pathname.startsWith(`${SCOPE.pathname}narration/clips/`);
  if (hashed || clip) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            // Only a whole file is kept: a partial answer to a range request is not the clip.
            if (response.status === 200) {
              const copy = response.clone();
              void caches.open(clip ? NARRATION : CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
