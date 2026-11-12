import { test, expect, MOT_DE_PASSE, unique } from './support/fixtures.ts';

test.describe('Comptes', () => {
  test("l'admin invite un viewer par lien ; le viewer crée son compte avec sa couleur", async ({ ouvrir, browser, monde }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/admin/invitations');
    await expect(page).toHaveTitle(/Invitations/);
    await page.getByLabel('Prénom (facultatif)').fill('Jade');
    await page.getByRole('button', { name: 'Créer un lien' }).click();
    const lien = (await page.locator('code').first().textContent())?.trim() ?? '';
    expect(lien).toContain('/invitation/');

    // La personne invitée, sans compte, ouvre le lien dans un autre navigateur.
    const invite = await browser.newContext({ baseURL: monde.serveur.url });
    const p = await invite.newPage();
    await p.goto(lien);
    await expect(p.getByLabel('Prénom')).toHaveValue('Jade');
    const identifiant = unique('jade');
    await p.getByLabel('Identifiant').fill(identifiant);
    await p.getByLabel('Mot de passe', { exact: true }).fill(MOT_DE_PASSE);
    const couleurs = p.getByRole('button', { name: /^Couleur / });
    await couleurs.nth(3).click();
    await expect(couleurs.nth(3)).toHaveAttribute('aria-pressed', 'true');
    const couleurChoisie = (await couleurs.nth(3).getAttribute('aria-label'))?.replace('Couleur ', '');
    await p.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(p).toHaveTitle(/Ce soir/);

    // La couleur est bien enregistrée sur le compte.
    const moi = await (await p.request.get('/api/compte')).json() as { prenom: string; couleur: string; role: string };
    expect(moi.prenom).toBe('Jade');
    expect(moi.couleur).toBe(couleurChoisie);
    expect(moi.role).toBe('viewer');
    await invite.close();
  });

  test("un viewer n'a pas accès à /admin", async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.viewer);
    await page.goto('/admin');
    await expect(page.getByText('Cette partie est réservée aux administrateurs.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0);
    const r = await page.request.get('/api/admin/utilisateurs');
    expect(r.status()).toBe(403);
  });

  test("un visiteur sans compte est renvoyé vers la connexion", async ({ browser, monde }) => {
    const ctx = await browser.newContext({ baseURL: monde.serveur.url });
    const p = await ctx.newPage();
    await p.goto('/galerie');
    await expect(p).toHaveURL(/\/connexion/);
    await ctx.close();
  });
});
