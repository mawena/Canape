import { test, expect, televerser, FILM_WEBM } from './support/fixtures.ts';

test.describe('Séances', () => {
  test("création avec invitation du viewer, lien stable, /rejoindre/<jeton> pour un troisième compte", async ({ ouvrir, monde }) => {
    await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const { page } = await ouvrir(monde.admin);
    await page.goto('/seances');
    await expect(page).toHaveTitle(/Séances/);
    await page.getByTestId('nouvelle-seance').click();

    await expect(page.getByTestId('page-nouvelle-seance')).toBeVisible();
    await page.getByLabel(/Mire de test/).first().check({ force: true });
    await page.getByRole('checkbox', { name: new RegExp(monde.viewer.prenom) }).check();
    await page.getByTestId('creer-seance').click();

    await expect(page.getByTestId('seance-creee')).toBeVisible();
    const lien = await page.getByTestId('lien-invitation').inputValue();
    expect(lien).toMatch(/\/rejoindre\/.+/);
    await page.getByTestId('copier-lien').click();

    // Le lien est stable : l'API le redonne identique.
    const seanceUrl = await page.getByTestId('entrer-salle-creee').getAttribute('href');
    const idSeance = (seanceUrl ?? '').split('/').pop() ?? '';
    const encore = await (await page.request.post(`/api/seances/${idSeance}/lien`, { headers: { Origin: monde.serveur.url } })).json() as { lien: string };
    expect(encore.lien).toBe(lien);

    // Le viewer invité la voit dans ses séances.
    const viewer = await ouvrir(monde.viewer);
    await viewer.page.goto('/seances');
    await expect(viewer.page.getByTestId('seance').first()).toBeVisible();

    // Un troisième compte rejoint par le lien.
    const tiers = await monde.nouveauViewer('Dominique');
    const t = await ouvrir(tiers);
    await t.page.goto(lien);
    await expect(t.page).toHaveURL(new RegExp(`/seances/${idSeance}`));
    await expect(t.page.getByTestId('sas').or(t.page.getByTestId('salle'))).toBeVisible();

    // Un lien inconnu : message clair.
    await t.page.goto('/rejoindre/jeton-qui-nexiste-pas');
    await expect(t.page.getByRole('heading', { name: 'Impossible de rejoindre' })).toBeVisible();
  });

  test("l'invité ne peut pas supprimer ; l'hôte supprime après confirmation", async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const r = await monde.requeteAdmin.post(`${monde.serveur.url}/api/seances`, {
      data: { filmId, titre: 'À effacer', invites: [monde.viewer.id] }, headers: { Origin: monde.serveur.url },
    });
    const creee = await r.json() as { id: string };

    // L'invité voit la séance, sans « Supprimer ».
    const viewer = await ouvrir(monde.viewer);
    await viewer.page.goto('/seances');
    await expect(viewer.page.getByTestId('seance').filter({ hasText: 'À effacer' })).toBeVisible();
    await expect(viewer.page.getByTestId('supprimer-seance')).toHaveCount(0);

    // L'hôte (ici l'admin) supprime après confirmation.
    const { page } = await ouvrir(monde.admin);
    await page.goto('/seances');
    const ligne = page.getByTestId('seance').filter({ hasText: 'À effacer' });
    await ligne.getByTestId('supprimer-seance').click();
    await page.getByTestId('confirmer-suppression-seance').click();
    await expect(ligne).toHaveCount(0);
    expect((await monde.requeteAdmin.get(`${monde.serveur.url}/api/seances/${creee.id}`)).status()).toBe(404);
  });
});
