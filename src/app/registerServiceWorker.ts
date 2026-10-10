/**
 * Registers the service worker that lets ARC open from the Home Screen and
 * offline (public/sw.js). Production builds only: the dev server and the
 * tests always talk to the network.
 */
export function registerServiceWorker(baseUrl: string): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {
      // Without it ARC still works online; only the offline start is lost.
    });
  });
}
