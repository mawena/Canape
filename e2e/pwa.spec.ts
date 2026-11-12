import { test, expect } from './support/fixtures.ts';

test.describe('PWA', () => {
  test('manifeste servi, service worker enregistré, jamais /api ni /media en cache', async ({ ouvrir, monde, browserName }) => {
    const { page, contexte } = await ouvrir(monde.admin);
    const m = await page.request.get('/manifest.webmanifest');
    expect(m.status()).toBe(200);
    const manifeste = await m.json() as { name: string; start_url: string; icons: unknown[]; display: string };
    expect(manifeste.name).toMatch(/Canap/);
    expect(manifeste.icons.length).toBeGreaterThan(0);
    expect(['standalone', 'minimal-ui', 'fullscreen']).toContain(manifeste.display);

    await page.goto('/');
    await expect(page).toHaveTitle(/Ce soir/);
    const lien = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(lien).toContain('manifest.webmanifest');

    // Service worker enregistré et actif.
    const portee = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return r.scope;
    });
    expect(portee).toBe(`${monde.serveur.url}/`);

    // Faire passer quelques requêtes, puis vérifier le contenu des caches.
    await page.reload();
    await page.evaluate(async () => { await fetch('/api/etat'); await fetch('/api/films?vue=tous'); });
    await page.waitForTimeout(500);
    const urls = await page.evaluate(async () => {
      const sortie: string[] = [];
      for (const nom of await caches.keys()) {
        const c = await caches.open(nom);
        for (const r of await c.keys()) sortie.push(new URL(r.url).pathname);
      }
      return sortie;
    });
    expect(urls.length, `caches : ${browserName}`).toBeGreaterThan(0);
    expect(urls.filter((u) => u.startsWith('/api') || u.startsWith('/media'))).toEqual([]);
    void contexte;
  });
});
