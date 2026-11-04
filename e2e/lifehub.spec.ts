import { test, expect } from '@playwright/test';

// Life Hub cards stage 7. Synthetic proposals; the Life Hub API is faked, the catalogue is the preview one.
const HUB = 'https://life-hub-api.213303.workers.dev';
const ALBUM = '2nkto6YNI4rUYTLqEwWJ3o'; // Flower Boy in the preview catalogue
const T1 = '33i3xxHB4YSYGYbtJrwwO8';
const T2 = '6KuXb26rHuRy3ZDse1VRmx';
const proposal = (key: string, status: string, extra: Record<string, unknown> = {}) => ({
  key, status, revision: 0, final_candidate: null, needs_app_review: false,
  candidate: {
    schema_version: 1, candidate_type: 'album_listening', source: 'spotify', idempotency_key: key.slice('spotify:'.length), created_at: '2026-11-02T01:00:00Z',
    payload: { artist: 'Tyler, The Creator', album: 'Flower Boy', spotify_album_id: ALBUM, origin: 'spotify_sync', listened_on: '2026-11-01',
      tracks: [{ spotify_track_id: T1, status: 'listened', played_at: '2026-11-01T10:00:00Z' }, { spotify_track_id: T2, status: 'skipped', played_at: '2026-11-01T10:03:00Z' }] },
  },
  ...extra,
});

test('opening the library records an album the owner approved in a Claude card and sends the receipt', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const approved = 'spotify:spsync-' + ALBUM + '-1793530800000';
  const waiting = 'spotify:spsync-' + ALBUM + '-1793617200000';
  const posts: Array<Record<string, string>> = [];
  const asked: string[] = [];
  await page.route(HUB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'POST') { posts.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ status: 200, headers: cors, body: '{}' }); }
    asked.push(new URL(req.url()).searchParams.get('status') ?? '');
    const done = new Set(posts.map((p) => p.key));
    const list = [proposal(approved, 'approved'), proposal(waiting, 'approved', { needs_app_review: true })].filter((p) => !done.has(p.key));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ candidates: list }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('potcast.lifehub.tokens.v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: Date.now() + 3_600_000 }));
  });
  await page.goto('/?preview#/library');
  await expect(page.getByText(/Claude에서 승인한 앨범을 기록했어요: Flower Boy/)).toBeVisible();
  expect(asked[0]).toBe('open');
  expect(posts).toEqual([{ key: approved, entity_type: 'album_listening', entity_id: ALBUM }]);

  // The one that asks for a last check waits behind the library's one-line band, marked as approved in the card.
  await page.getByRole('button', { name: '검토', exact: true }).first().click();
  const band = page.getByRole('region', { name: 'Claude 제안', exact: true });
  await expect(band.getByText('Claude가 제안한 감상 기록 1건')).toBeVisible();
  await expect(band.getByText(/Claude 카드에서 승인함 · 여기서 확인해 주세요/)).toBeVisible();
  // Connection, sync and the auto-apply setting live in settings' Life Hub section.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Claude에서 승인한 기록은 바로 반영/)).toBeChecked();
  expect(posts).toHaveLength(1);
  expect(errors).toEqual([]);
});
