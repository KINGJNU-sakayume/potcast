import { test, expect, type Page } from '@playwright/test';

const albumId = '052EiTRYh35MuDVJN9Emdh';
const artistId = '1snhtMLeb2DYoMOcVbb8iB';
const trackName = 'カムパネルラ';
async function openAlbum(page: Page) {
  await page.goto(`/?preview#/album/${albumId}`);
  await expect(page.getByRole('heading', { name: 'STRAY SHEEP', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '기록', exact: true })).toBeEnabled();
}
async function recordCount(page: Page, table: string) {
  return page.evaluate(async (table) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('potcast.digging.v1:preview'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const count = await new Promise<number>((resolve, reject) => { const request = db.transaction(table).objectStore(table).count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return count;
  }, table);
}

for (const [width, height] of [[320, 740], [375, 812], [390, 844], [430, 932], [844, 390]]) {
  test(`H2 controls preserve type, duration and touch areas at ${width}x${height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: width!, height: height! }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openAlbum(page);
    await page.getByRole('button', { name: '기록', exact: true }).click();
    const rows = page.locator('.dig-record-row');
    expect(await rows.count()).toBeGreaterThan(0);
    const geometry = await rows.evaluateAll((rows) => rows.map((row) => {
      const title = row.querySelector('.dig-record-title')!;
      const time = row.querySelector('.track-aside')!;
      const buttons = [...row.querySelectorAll('.dig-track-actions button')];
      return {
        rowHeight: row.getBoundingClientRect().height,
        titleSize: getComputedStyle(title.querySelector('b')!).fontSize,
        titleRight: title.getBoundingClientRect().right,
        timeLeft: time.getBoundingClientRect().left,
        timeRight: time.getBoundingClientRect().right,
        controlsLeft: buttons[0]!.getBoundingClientRect().left,
        controls: buttons.map((b) => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })),
        number: row.querySelector('.num')?.textContent,
        playingMark: Boolean(row.querySelector('.playing-mark')),
        time: row.querySelector('.track-aside-time')?.textContent,
      };
    }));
    for (const row of geometry) {
      expect(row.titleSize).toBe('15px');
      expect(row.titleRight).toBeLessThanOrEqual(row.timeLeft);
      expect(row.timeRight).toBeLessThanOrEqual(row.controlsLeft);
      expect(Boolean(row.number) || row.playingMark).toBe(true); expect(row.time).toMatch(/\d+:\d+/);
      for (const button of row.controls) { expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
    }
    expect(geometry.filter((r) => r.rowHeight <= 64).length).toBeGreaterThanOrEqual(Math.floor(geometry.length * 0.8));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: `청취: ${trackName}`, exact: true }).click();
    await expect(page.getByRole('button', { name: `청취: ${trackName}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await recordCount(page, 'events')).toBe(0);
    await page.getByRole('button', { name: `개인 기록: ${trackName}`, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: trackName, exact: true });
    await expect(sheet).toHaveClass(/m-sheet/);
    await sheet.getByLabel('개인 별점').selectOption('4.5');
    await sheet.getByLabel('개인 메모').fill('오프라인 개인 기록');
    await sheet.getByRole('button', { name: '저장', exact: true }).click();
    await expect(sheet).not.toBeVisible();
    await expect(page.getByRole('button', { name: `개인 기록: ${trackName}`, exact: true })).toBeFocused();
    expect(await recordCount(page, 'reviews')).toBe(1);
    await context.close();
  });
}

test('recording, explicit relistens and batch undo work offline while playback survives navigation', async ({ page, context }) => {
  await openAlbum(page);
  await page.getByRole('button', { name: '기록', exact: true }).click();
  await page.getByRole('button', { name: `개인 기록: ${trackName}`, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: trackName, exact: true });
  await expect(drawer).toHaveClass(/side-drawer/);
  await context.setOffline(true);
  await drawer.getByLabel('개인 메모').fill('Offline works');
  await drawer.getByRole('button', { name: '재청취 이벤트 추가' }).click();
  await expect(drawer.getByText('청취 이벤트를 기록했습니다.')).toBeVisible();
  await drawer.getByRole('button', { name: '저장', exact: true }).click();
  expect(await recordCount(page, 'events')).toBe(1);
  await page.getByRole('button', { name: '일괄', exact: true }).click();
  await page.getByRole('button', { name: '미검토만 선택', exact: true }).click();
  await page.getByRole('button', { name: '스킵 처리', exact: true }).click();
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeVisible();
  expect(await recordCount(page, 'events')).toBe(1);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).not.toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.locator('.track-table button.track-item').first().click();
  await expect(page).toHaveURL(/now-playing/);
  await page.getByRole('region', { name: 'Now playing', exact: true }).getByRole('link', { name: 'Kenshi Yonezu' }).click();
  await expect(page.getByRole('heading', { name: 'Kenshi Yonezu', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp('Now playing:') })).toBeVisible();
});

test('artist digging stays within the existing artist and Library sections', async ({ page }) => {
  await page.goto(`/?preview#/artist/${artistId}`);
  await expect(page.getByRole('button', { name: 'Start digging', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start digging', exact: true }).click();
  const digging = page.getByLabel('My digging', { exact: true });
  await expect(digging).toBeVisible();
  await expect(digging.getByRole('button', { name: 'Continue digging', exact: true })).toBeEnabled();
  await digging.getByRole('button', { name: '추적 범위', exact: true }).click();
  const scope = page.getByRole('dialog', { name: /추적 범위/ });
  await expect(scope.getByRole('checkbox', { name: '앨범', exact: true })).toBeChecked();
  await expect(scope.getByRole('checkbox', { name: '싱글·EP', exact: true })).not.toBeChecked();
  await scope.getByRole('button', { name: 'Close digging scope' }).click();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const artists = page.getByRole('region', { name: 'Artists', exact: true });
  await expect(artists.getByRole('link', { name: 'Kenshi Yonezu', exact: true }).first()).toBeVisible();
  await artists.getByRole('button', { name: 'Continue digging', exact: true }).click();
  await expect(page).toHaveURL(/now-playing/);
});

test('JSON preview requires approval, imports twice without duplication, and exposes conflict choices', async ({ page }) => {
  await page.goto('/?preview#/library');
  await page.getByRole('button', { name: '기록 백업·청취 이력', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '개인 음악 기록', exact: true });
  const at = '2026-06-01T00:00:00.000Z';
  const legacy = { schemaVersion: 1, exportedAt: at,
    artists: [{ id: artistId, name: 'Kenshi Yonezu', images: [], genres: [], addedAt: at, scope: { album: true, single: true, compilation: false }, discographySyncedAt: at }],
    albums: [{ id: albumId, artistId, name: 'STRAY SHEEP', albumGroup: 'album', releaseDate: '2020', totalTracks: 1, images: [], excluded: false, tracksSyncedAt: at }],
    tracks: [{ id: 'one', albumId, artistId, name: 'Original record', discNumber: 1, trackNumber: 1, durationMs: 200_000, status: 'listened', rating: 4.5, note: 'Original private note' }],
    listenEvents: [{ id: 'original-event', trackId: 'one', albumId, artistId, listenedAt: at, source: 'manual' }],
  };
  const upload = async (value: unknown) => panel.getByLabel('백업 파일 미리보기').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await upload(legacy);
  await expect(panel.getByRole('button', { name: /변경 승인·가져오기/ })).toBeEnabled();
  expect(await recordCount(page, 'projects')).toBe(0);
  await panel.getByRole('button', { name: /변경 승인·가져오기/ }).click();
  await expect(panel.getByText(/가져오기 완료:/)).toBeVisible();
  expect(await recordCount(page, 'events')).toBe(1);
  await upload(legacy);
  await expect(panel.getByRole('button', { name: /선택한 0개 변경/ })).toBeDisabled();
  expect(await recordCount(page, 'events')).toBe(1);
  const modified = structuredClone(legacy); modified.tracks[0]!.note = 'Conflicting note';
  await upload(modified);
  await panel.getByText('변경 사항 선택·충돌 확인', { exact: true }).click();
  const conflict = panel.getByRole('checkbox', { name: /reviews.*충돌/ });
  await expect(conflict).not.toBeChecked();
  await conflict.check();
  await panel.getByRole('button', { name: /변경 승인·가져오기/ }).click();
  await expect(panel.getByText(/가져오기 완료:/)).toBeVisible();
  expect(await recordCount(page, 'events')).toBe(1);
});

test('recent Spotify plays require explicit selection and approval before becoming records', async ({ page }) => {
  await page.goto(`/?preview#/artist/${artistId}`);
  await page.getByRole('button', { name: 'Start digging', exact: true }).click();
  await expect(page.getByLabel('My digging', { exact: true }).getByRole('button', { name: 'Continue digging', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: '기록 백업·청취 이력', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '개인 음악 기록', exact: true });
  await panel.getByRole('button', { name: 'Spotify 최근 재생 확인', exact: true }).click();
  const candidates = panel.locator('.dig-recent-candidates input[type="checkbox"]');
  await expect(candidates.first()).toBeVisible();
  expect(await recordCount(page, 'events')).toBe(0);
  await candidates.first().check();
  await panel.getByRole('button', { name: '선택한 1개 승인', exact: true }).click();
  await expect(panel.getByText('1개의 최근 재생을 기록했습니다.')).toBeVisible();
  expect(await recordCount(page, 'events')).toBe(1);
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'JSON 내보내기', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^potcast-digging-.*\.json$/);
});

test('ultrawide artist profile stays sticky beside the existing discography', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto(`/?preview#/artist/${artistId}`);
  await expect(page.getByRole('heading', { name: 'Kenshi Yonezu', exact: true })).toBeVisible();
  expect(await page.locator('.artist-hero').evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
  const hero = await page.locator('.artist-hero').boundingBox();
  const discography = await page.locator('.discography').boundingBox();
  expect(hero!.x + hero!.width).toBeLessThan(discography!.x);
});
