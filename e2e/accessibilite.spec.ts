import { test, expect, televerser, FILM_WEBM } from './support/fixtures.ts';
import { creerSeance } from './support/salle.ts';

// Base d'accessibilité : pas d'erreur console, un titre de page, un focus visible au clavier.
test.describe('Accessibilité de base', () => {
  test('chaque page principale : sans erreur console, titre, focus visible', async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const seanceId = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const { page } = await ouvrir(monde.admin);

    const erreurs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`[console] ${m.text()} (${m.location().url})`); });
    page.on('pageerror', (e) => erreurs.push(`[page] ${e.message}`));

    const pages: Array<[string, RegExp]> = [
      ['/', /Ce soir/],
      ['/galerie', /Films/],
      [`/galerie/${filmId}`, /Mire de test/],
      ['/seances', /Séances/],
      ['/seances/nouvelle', /Nouvelle séance/],
      ['/historique', /Historique/],
      ['/compte', /Mon compte/],
      ['/admin', /Administration/],
      ['/admin/utilisateurs', /Comptes/],
      ['/admin/invitations', /Invitations/],
      ['/admin/stockage', /Espace disque/],
      ['/admin/reglages', /Réglages/],
      [`/seances/${seanceId}`, /.+/],
    ];
    for (const [chemin, titre] of pages) {
      await test.step(chemin, async () => {
        await page.goto(chemin);
        await expect(page).toHaveTitle(titre);
        await expect(page.locator('h1, h2').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        // Le clavier fait apparaître un contour de focus.
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return null;
          const c = getComputedStyle(e);
          return {
            balise: e.tagName,
            contour: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0,
            ombre: c.boxShadow !== 'none',
            bordure: e.matches(':focus-visible'),
          };
        });
        expect(focus, `aucun élément ne prend le focus clavier sur ${chemin}`).not.toBeNull();
        expect(focus?.bordure, `pas de :focus-visible sur ${chemin}`).toBe(true);
        expect(focus?.contour || focus?.ombre, `focus invisible sur ${chemin} (${focus?.balise})`).toBe(true);
      });
    }
    expect(erreurs).toEqual([]);
  });

  test("pas de défilement horizontal sur les écrans principaux", async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.admin);
    for (const chemin of ['/', '/galerie', '/seances', '/compte', '/admin', '/admin/utilisateurs']) {
      await page.goto(chemin);
      await page.waitForLoadState('networkidle');
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debord, `défilement horizontal sur ${chemin}`).toBeLessThanOrEqual(1);
    }
  });
});
