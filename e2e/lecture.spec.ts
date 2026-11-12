import { test, expect, televerser, FILM_MKV, FILM_WEBM } from './support/fixtures.ts';

test.describe('Lecture sur la fiche', () => {
  test('« Regarder seul » lit le film (mode direct) ; la préparation est visible pour le propriétaire', async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const plan = await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/films/${filmId}/lecture`)).json() as { mode: string; duree: number };
    expect(plan.mode).toBe('direct');
    expect(plan.duree).toBeGreaterThan(20);

    const { page } = await ouvrir(monde.admin);
    await page.goto(`/galerie/${filmId}`);
    await expect(page.getByRole('heading', { name: 'Préparation' })).toBeVisible();
    await page.getByRole('button', { name: 'Regarder seul' }).click();
    const video = page.getByTestId('lecteur-seul').locator('video');
    await expect(video).toBeVisible();
    await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Fermer le lecteur' }).click();
    await expect(page.getByTestId('lecteur-seul')).toHaveCount(0);
  });

  test("le viewer à qui le film est partagé ne voit pas la préparation", async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/films/${filmId}`, {
      headers: { Origin: monde.serveur.url }, data: { visibilite: 'tous' },
    });
    expect(r.status()).toBeLessThan(300);
    const { page } = await ouvrir(monde.viewer);
    await page.goto(`/galerie/${filmId}`);
    await expect(page.getByRole('button', { name: 'Regarder seul' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Préparation' })).toHaveCount(0);
  });
});

// Lecture convertie : MKV H.264/AAC → HLS. Le Chromium de Playwright ne décode pas le H.264 : le projet « chrome »
// (Google Chrome installé) et WebKit le font ; les autres projets sautent l'essai.
test.describe('Lecture convertie (HLS)', () => {
  test('MKV H.264/AAC : plan hls, la vidéo démarre et avance', async ({ ouvrir, monde, browserName, page: _ }, info) => {
    // Le WebKit de Playwright sous Linux (WebKitGTK, décodage par GStreamer) plante par intermittence en lisant du H.264
    // par MediaSource : page blanche, « Target page closed » (constaté 2 fois sur 3, 12/11/2026). Ce n'est pas Canapé :
    // Safari (macOS, iPhone) décode autrement. L'essai reste actif dans Chromium, Firefox et Chrome.
    test.fixme(browserName === 'webkit' && process.platform === 'linux', 'WebKitGTK plante en lisant du H.264 par MediaSource');
    test.setTimeout(150_000);
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_MKV);
    const plan = await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/films/${filmId}/lecture`)).json() as { mode: string; url: string };
    expect(plan.mode).toBe('hls');

    const { page } = await ouvrir(monde.admin);
    const decodeH264 = await page.evaluate(() => {
      const v = document.createElement('video');
      return v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== '' || v.canPlayType('application/vnd.apple.mpegurl') !== '';
    }).catch(() => false);
    void decodeH264;
    await page.goto(`/galerie/${filmId}`);
    const peut = await page.evaluate(() => {
      const v = document.createElement('video');
      return v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== '';
    });
    test.skip(!peut, `${info.project.name} (${browserName}) ne décode pas le H.264 : lecture convertie non testable ici.`);
    await page.getByRole('button', { name: 'Regarder seul' }).click();
    const video = page.getByTestId('lecteur-seul').locator('video');
    await expect(video).toBeVisible();
    await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 60_000 }).toBeGreaterThan(1.5);
    expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(320);
  });
});
