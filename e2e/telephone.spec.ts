import { test, expect, televerser, FILM_WEBM } from './support/fixtures.ts';
import { creerSeance, entrerDansLaSalle } from './support/salle.ts';

// Projet « téléphone » (Pixel 7) : les écrans principaux tiennent dans l'écran et la salle marche au toucher.
test.describe('Téléphone', () => {
  test('écrans principaux sans débordement ; navigation, séance et salle', async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const seanceId = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const { page } = await ouvrir(monde.admin);

    for (const [chemin, titre] of [['/', /Ce soir/], ['/galerie', /Films/], [`/galerie/${filmId}`, /Mire/], ['/seances', /Séances/], ['/compte', /Mon compte/]] as const) {
      await page.goto(chemin);
      await expect(page).toHaveTitle(titre);
      await page.waitForLoadState('networkidle');
      const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debord, `défilement horizontal sur ${chemin}`).toBeLessThanOrEqual(1);
    }

    await entrerDansLaSalle(page, seanceId);
    await page.getByTestId('bouton-chat').tap();
    await page.getByTestId('saisie-chat').fill('Depuis le téléphone');
    await page.getByTestId('saisie-chat').press('Enter');
    await expect(page.getByTestId('message').filter({ hasText: 'Depuis le téléphone' })).toBeVisible();
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debord, 'défilement horizontal dans la salle').toBeLessThanOrEqual(1);
  });
});
