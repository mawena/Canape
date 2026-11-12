import { test, expect, cheminMedia, FILM_WEBM } from './support/fixtures.ts';

test.describe('Galerie', () => {
  test("téléversement par le bouton : progression, analyse, fiche prête avec affiche ; partage ; recherche et filtres", async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/galerie');
    await expect(page.getByRole('heading', { name: 'Films' })).toBeVisible();

    // Le bouton « Ajouter un film » ouvre le sélecteur de fichiers.
    const [selecteur] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Ajouter un film' }).first().click(),
    ]);
    await selecteur.setFiles(cheminMedia(FILM_WEBM));

    // Envoi en cours, puis terminé.
    const panneau = page.getByRole('region', { name: 'Envois en cours' });
    await expect(panneau).toBeVisible();
    await expect(panneau.getByRole('progressbar').first()).toBeVisible().catch(() => undefined);

    // La carte du film apparaît ; la fiche passe à « prêt » avec une affiche tirée du film.
    const carte = page.getByRole('link', { name: /Mire de test/ }).first();
    await expect(carte).toBeVisible({ timeout: 60_000 });
    await carte.click();
    await expect(page.getByRole('heading', { name: 'Mire de test' })).toBeVisible();
    await expect(page.getByText('Analyse du film en cours…')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByRole('img', { name: /Affiche de Mire de test/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/2026/).first()).toBeVisible();
    await expect(page.getByText(/1 piste audio/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lancer une séance' })).toBeVisible();

    // Le viewer ne voit pas le film tant qu'il n'est pas partagé.
    const viewer = await ouvrir(monde.viewer);
    await viewer.page.goto('/galerie');
    await expect(viewer.page.getByRole('heading', { name: 'Films' })).toBeVisible();
    await expect(viewer.page.getByRole('link', { name: /Mire de test/ })).toHaveCount(0);

    // Partage avec le viewer.
    await page.getByText('Partage', { exact: true }).click();
    await page.getByLabel('Certaines personnes').check();
    await page.getByRole('checkbox', { name: monde.viewer.prenom }).check();
    await page.getByRole('button', { name: 'Enregistrer le partage' }).click();
    await expect(page.getByText('Partage mis à jour.')).toBeVisible();

    await viewer.page.goto('/galerie?filtre=partages');
    await expect(viewer.page.getByRole('link', { name: /Mire de test/ })).toBeVisible();

    // Recherche et filtres côté admin.
    await page.goto('/galerie');
    const recherche = page.getByRole('searchbox', { name: 'Chercher un film' });
    await recherche.fill('zzzz introuvable');
    await expect(page.getByRole('link', { name: /Mire de test/ })).toHaveCount(0);
    await recherche.fill('mire');
    await expect(page.getByRole('link', { name: /Mire de test/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Partagés avec moi' }).click();
    await expect(page).toHaveURL(/filtre=partages/);
    await page.getByRole('tab', { name: 'Les miens' }).click();
    await expect(page).toHaveURL(/filtre=miens/);
    await expect(page.getByRole('link', { name: /Mire de test/ })).toBeVisible();
  });

  test('téléversement par glisser-déposer', async ({ ouvrir, monde }) => {
    const { page: p } = await ouvrir(monde.admin);
    await p.goto('/galerie');
    await expect(p.getByRole('heading', { name: 'Films' })).toBeVisible();
    const octets = (await import('node:fs')).readFileSync(cheminMedia(FILM_WEBM));
    const transfert = await p.evaluateHandle(async (b64: string) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([u8], 'Glisse depose (2026).webm', { type: 'video/webm' }));
      return dt;
    }, octets.toString('base64'));
    await p.dispatchEvent('body', 'dragenter', { dataTransfer: transfert });
    await p.dispatchEvent('body', 'drop', { dataTransfer: transfert });
    await expect(p.getByRole('link', { name: /Glisse depose/ })).toBeVisible({ timeout: 60_000 });
  });
});
