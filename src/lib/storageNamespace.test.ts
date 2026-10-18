import { describe, expect, it } from 'vitest';
import { adoptLegacyStorage, storageKey } from './storageNamespace';

describe('storage namespace', () => {
  it('prefixes keys with this app’s name', () => {
    expect(storageKey('preferences.v1')).toBe('potcast.preferences.v1');
  });

  it('copies shared settings from the old arc. keys and moves keys only this app wrote', () => {
    window.localStorage.setItem('arc.preferences.v1', '{"translation":false}');
    window.localStorage.setItem('arc.episode.bookmarks.v1', '{}');
    window.localStorage.setItem('arc.spotify.session.v1', '{"accessToken":"other-app"}');
    adoptLegacyStorage(window.localStorage);
    expect(window.localStorage.getItem('potcast.preferences.v1')).toBe('{"translation":false}');
    expect(window.localStorage.getItem('arc.preferences.v1')).toBe('{"translation":false}');
    expect(window.localStorage.getItem('potcast.episode.bookmarks.v1')).toBe('{}');
    expect(window.localStorage.getItem('arc.episode.bookmarks.v1')).toBeNull();
    expect(window.localStorage.getItem('potcast.spotify.session.v1')).toBeNull();
  });

  it('never overwrites a value already saved under the new key', () => {
    window.localStorage.setItem('potcast.player.volume.v1', '0.3');
    window.localStorage.setItem('arc.player.volume.v1', '0.9');
    adoptLegacyStorage(window.localStorage);
    expect(window.localStorage.getItem('potcast.player.volume.v1')).toBe('0.3');
  });
});
