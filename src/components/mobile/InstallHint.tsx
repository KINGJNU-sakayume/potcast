/** Whether ARC is running as an installed Home Screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

/** Settings sheet: how to put ARC on the Home Screen, until it is there. */
export function InstallHint() {
  if (isStandalone()) {
    return (
      <>
        <div className="label">App</div>
        <p>Opened from the Home Screen. Notes and the archive work offline; Spotify needs a connection.</p>
      </>
    );
  }
  return (
    <>
      <div className="label">Home Screen</div>
      <p>
        In Safari, tap Share, then <b>Add to Home Screen</b>. ARC then opens full screen, without the browser bars, and the archive works
        offline.
      </p>
    </>
  );
}
