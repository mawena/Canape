import { test, expect, MOT_DE_PASSE } from './support/fixtures.ts';

test.describe('Installation et connexion', () => {
  test('lien admin, création du compte, accueil « Ce soir », déconnexion, connexion, mauvais mot de passe', async ({ page, serveurVierge: s }) => {
    // Premier démarrage : aucun compte, la connexion dit qu'il faut installer.
    const etat = await (await page.request.get(`${s.url}/api/etat`)).json() as { installationRequise: boolean; utilisateur: unknown };
    expect(etat.installationRequise).toBe(true);

    const lien = s.inviter('admin');
    await page.goto(lien);
    await expect(page).toHaveTitle(/Invitation/);
    await page.getByLabel('Prénom').fill('Alix');
    await page.getByLabel('Identifiant').fill('alix');
    await page.getByLabel('Mot de passe', { exact: true }).fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    // On arrive sur l'accueil, connecté.
    await expect(page).toHaveTitle(/Ce soir/);
    await expect(page.getByText(/Alix/).first()).toBeVisible();

    // Déconnexion depuis la page du compte.
    await page.goto(`${s.url}/compte`);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/connexion/);

    // Mauvais mot de passe : message, pas de session.
    await page.getByLabel('Identifiant').fill('alix');
    await page.getByLabel('Mot de passe', { exact: true }).fill('pas-le-bon-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/incorrect|invalide|ne correspond/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/connexion/);

    // Bon mot de passe : retour à la page demandée (le compte), puis l'accueil sans page demandée.
    await page.getByLabel('Mot de passe', { exact: true }).fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveTitle(/Mon compte/);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.goto(`${s.url}/connexion`);
    await page.getByLabel('Identifiant').fill('alix');
    await page.getByLabel('Mot de passe', { exact: true }).fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveTitle(/Ce soir/);
  });

  test('le lien d\'invitation ne sert qu\'une fois', async ({ page, serveurVierge: s }) => {
    const lien = s.inviter('admin');
    await page.goto(lien);
    await page.getByLabel('Prénom').fill('Alix');
    await page.getByLabel('Identifiant').fill('alix');
    await page.getByLabel('Mot de passe', { exact: true }).fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page).toHaveTitle(/Ce soir/);
    await page.goto(lien);
    await expect(page.getByText('Ce lien a expiré.')).toBeVisible();
  });
});
