import { request, type Page } from '@playwright/test';
import { test, expect, cheminMedia, unique, FILM_WEBM, MOT_DE_PASSE, type Compte, type Monde } from './support/fixtures.ts';
import type { ServeurCanape } from './support/serveur.ts';

/** Remplit le formulaire d'inscription (sans l'envoyer). */
async function remplir(page: Page, c: { prenom: string; identifiant: string; motDePasse?: string }): Promise<void> {
  await page.getByTestId('champ-prenom').fill(c.prenom);
  await page.getByTestId('champ-identifiant').fill(c.identifiant);
  await page.getByTestId('champ-mot-de-passe').fill(c.motDePasse ?? MOT_DE_PASSE);
  await page.getByTestId('champ-confirmation').fill(c.motDePasse ?? MOT_DE_PASSE);
  await page.getByTestId('case-regles').check();
}

/** Inscription par l'API (jeton, 3 s d'attente, envoi) ; rend le compte créé. */
async function inscrireParApi(s: ServeurCanape, prenom: string): Promise<Compte> {
  const ctx = await request.newContext();
  const etat = (await (await ctx.get(`${s.url}/api/inscription`)).json()) as { jeton: string };
  await new Promise((r) => setTimeout(r, 3200));
  const identifiant = unique('inscrit');
  const r = await ctx.post(`${s.url}/api/inscription`, {
    headers: { Origin: s.url }, data: { prenom, identifiant, motDePasse: MOT_DE_PASSE, accepteRegles: true, jeton: etat.jeton, site: '' },
  });
  expect(r.status(), await r.text()).toBe(201);
  const moi = (await (await ctx.get(`${s.url}/api/compte`)).json()) as { id: number };
  await ctx.dispose();
  return { prenom, identifiant, motDePasse: MOT_DE_PASSE, id: moi.id };
}

async function reglage(monde: Monde, corps: Record<string, unknown>): Promise<void> {
  const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/admin/reglages`, { headers: { Origin: monde.serveur.url }, data: corps });
  expect(r.status(), await r.text()).toBeLessThan(300);
}

test.describe('Inscription libre', () => {
  test("un inconnu s'inscrit, arrive sur l'accueil avec les premiers pas et ajoute un film, sans « Par torrent »", async ({ browser, monde }) => {
    const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto('/connexion');
    await page.getByTestId('lien-inscription').click();
    await expect(page.getByTestId('page-inscription')).toBeVisible();
    await expect(page.getByText('3 à 32 caractères : lettres, chiffres, point, tiret, souligné, ou ton adresse e-mail.')).toBeVisible();
    await expect(page.getByTestId('creer-compte')).toBeDisabled();

    // Les règles s'ouvrent dans un autre onglet : le formulaire n'est pas perdu.
    await page.getByTestId('champ-prenom').fill('Inès');
    const [regles] = await Promise.all([contexte.waitForEvent('page'), page.getByRole('link', { name: "règles d'usage" }).click()]);
    await expect(regles.getByTestId('page-regles')).toBeVisible();
    await regles.close();
    await expect(page.getByTestId('champ-prenom')).toHaveValue('Inès');

    // Mot de passe trop court, puis confirmation différente.
    await page.getByTestId('champ-mot-de-passe').fill('court');
    await expect(page.getByText(/Encore \d+ caractères?\./)).toBeVisible();
    const identifiant = unique('ines');
    await remplir(page, { prenom: 'Inès', identifiant });
    await page.getByTestId('champ-confirmation').fill('autre chose');
    await expect(page.getByText('Les deux mots de passe sont différents.')).toBeVisible();
    await page.getByTestId('champ-confirmation').fill(MOT_DE_PASSE);

    await page.getByTestId('creer-compte').click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByTestId('premiers-pas')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pour bien démarrer' })).toBeVisible();

    // Elle ajoute un film : pas de choix « Par torrent », le sélecteur de fichiers s'ouvre directement.
    await page.goto('/galerie');
    await expect(page.getByRole('heading', { name: 'Films' })).toBeVisible();
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('ajouter-film').click()]);
    await expect(page.getByTestId('ajouter-torrent')).toHaveCount(0);
    await selecteur.setFiles(cheminMedia(FILM_WEBM));
    await expect(page.getByRole('link', { name: /Mire de test/ }).first()).toBeVisible({ timeout: 60_000 });
    await contexte.close();
  });

  test('inscriptions fermées par l\'admin : page fermée, pas de lien sur la connexion', async ({ browser, monde }) => {
    await reglage(monde, { inscriptionsOuvertes: false });
    const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto('/connexion');
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
    await expect(page.getByTestId('lien-inscription')).toHaveCount(0);
    await expect(page.getByText('Pas de compte ? Il faut une invitation.')).toBeVisible();
    await page.goto('/inscription');
    await expect(page.getByTestId('inscriptions-fermees')).toBeVisible();
    await expect(page.getByText('Les inscriptions sont fermées pour le moment.')).toBeVisible();
    await expect(page.getByTestId('champ-prenom')).toHaveCount(0);
    await page.getByTestId('retour-connexion').click();
    await expect(page).toHaveURL(/\/connexion/);
    await contexte.close();
  });

  test('inscriptions complètes : la raison est affichée', async ({ browser, monde }) => {
    await reglage(monde, { maxComptesInscrits: 0 });
    const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto('/inscription');
    await expect(page.getByText('Les inscriptions sont complètes.')).toBeVisible();
    await contexte.close();
  });

  test('identifiant déjà pris : message près du champ', async ({ browser, monde }) => {
    const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto('/inscription');
    await remplir(page, { prenom: 'Double', identifiant: monde.viewer.identifiant });
    await page.getByTestId('creer-compte').click();
    await expect(page.getByText('Cet identifiant est déjà pris.')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/inscription/);
    await contexte.close();
  });

  test("le champ piège est invisible pour les humains ; rempli, l'inscription est refusée", async ({ browser, monde }) => {
    const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto('/inscription');
    const piege = page.getByTestId('champ-piege');
    await expect(piege).toHaveAttribute('tabindex', '-1');
    await expect(piege).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('[aria-hidden="true"]:has([data-test="champ-piege"])')).toHaveCount(1);
    const boite = await piege.boundingBox();
    expect(boite === null || boite.x < 0 || boite.width <= 1).toBe(true);
    await remplir(page, { prenom: 'Robot', identifiant: unique('robot') });
    await piege.fill('http://spam.example');
    await page.getByTestId('creer-compte').click();
    await expect(page.getByTestId('erreur-inscription').or(page.getByRole('alert')).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/inscription/);
    await contexte.close();
  });

  test('un inscrit ne voit pas les autres comptes dans le partage, mais partage avec un identifiant exact', async ({ ouvrir, monde }) => {
    const a = await inscrireParApi(monde.serveur, 'Anaïs');
    const b = await inscrireParApi(monde.serveur, 'Basile');
    const { page } = await ouvrir(a);
    await page.goto('/galerie');
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('ajouter-film').click()]);
    await selecteur.setFiles(cheminMedia(FILM_WEBM));
    const carte = page.getByRole('link', { name: /Mire de test/ }).first();
    await expect(carte).toBeVisible({ timeout: 60_000 });
    await carte.click();
    await expect(page.getByText('Analyse du film en cours…')).toHaveCount(0, { timeout: 60_000 });

    await page.getByText('Partage', { exact: true }).click();
    await expect(page.getByLabel('Tous les inscrits')).toBeVisible();
    await page.getByLabel('Tous les inscrits').check();
    await expect(page.getByTestId('avertissement-tous')).toContainText('ne connais pas');
    await page.getByLabel('Certaines personnes').check();
    // Basile n'est pas dans la liste.
    await expect(page.getByRole('checkbox', { name: 'Basile' })).toHaveCount(0);
    // Recherche inexistante, puis exacte.
    await page.getByTestId('champ-chercher-identifiant').fill('personne-nexiste-pas');
    await page.getByTestId('chercher-identifiant').click();
    await expect(page.getByText('Personne avec cet identifiant.')).toBeVisible();
    await page.getByTestId('champ-chercher-identifiant').fill(b.identifiant);
    await page.getByTestId('chercher-identifiant').click();
    await expect(page.getByTestId('compte-trouve')).toContainText('Basile');
    await page.getByTestId('ajouter-identifiant').click();
    await expect(page.getByRole('checkbox', { name: 'Basile' })).toBeChecked();
    await page.getByRole('button', { name: 'Enregistrer le partage' }).click();
    await expect(page.getByText('Partage mis à jour.')).toBeVisible();

    const basile = await ouvrir(b);
    await basile.page.goto('/galerie?filtre=partages');
    await expect(basile.page.getByRole('link', { name: /Mire de test/ })).toBeVisible();
  });

  test('un inscrit invite quelqu\'un à une séance par son identifiant', async ({ ouvrir, monde }) => {
    const a = await inscrireParApi(monde.serveur, 'Anaïs');
    const b = await inscrireParApi(monde.serveur, 'Basile');
    const { page } = await ouvrir(a);
    await page.goto('/seances/nouvelle');
    await expect(page.getByRole('checkbox', { name: /Basile/ })).toHaveCount(0);
    await page.getByTestId('champ-chercher-identifiant').fill(b.identifiant);
    await page.getByTestId('chercher-identifiant').click();
    await page.getByTestId('ajouter-identifiant').click();
    await expect(page.getByRole('checkbox', { name: /Basile/ })).toBeChecked();
  });

  test("l'admin voit l'origine des comptes et ouvre les torrents d'un compte inscrit", async ({ ouvrir, monde }) => {
    const a = await inscrireParApi(monde.serveur, 'Anaïs');
    const { page } = await ouvrir(monde.admin);
    await page.goto('/admin/utilisateurs');
    await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible();
    const origines = page.getByTestId('origine-compte');
    await expect(origines.filter({ hasText: 'Inscrit' })).toHaveCount(1);
    await expect(origines.filter({ hasText: 'Invité' })).toHaveCount(1);
    await expect(origines.filter({ hasText: 'Premier compte' })).toHaveCount(1);

    const ligne = page.getByRole('listitem').filter({ hasText: 'Anaïs' });
    const torrent = ligne.getByTestId('torrent-compte');
    await expect(torrent).not.toBeChecked();
    await torrent.check();
    await expect(page.getByText('Enregistré.').first()).toBeVisible();

    // L'inscrit voit maintenant « Par torrent ».
    const { page: pa } = await ouvrir(a);
    await pa.goto('/galerie');
    await pa.getByTestId('ajouter-film').click();
    await expect(pa.getByTestId('ajouter-torrent')).toBeVisible();
  });

  test("réglages de l'inscription dans l'administration", async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/admin/reglages');
    await expect(page.getByRole('switch', { name: 'Inscriptions libres' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Torrents pour les inscrits' })).not.toBeChecked();
    await page.getByTestId('quota-inscrit').fill('5 Go');
    await page.getByTestId('max-inscrits').fill('7');
    await page.getByRole('button', { name: 'Enregistrer' }).last().click();
    await expect(page.getByText('Enregistré.').first()).toBeVisible();
    await page.getByRole('switch', { name: 'Inscriptions libres' }).click();
    await expect(page.getByText('Enregistré.').first()).toBeVisible();
    const r = await monde.requeteAdmin.get(`${monde.serveur.url}/api/admin/reglages`);
    expect(await r.json()).toMatchObject({ inscriptionsOuvertes: false, quotaInscriptionOctets: 5 * 1024 ** 3, maxComptesInscrits: 7 });
  });

  test('les règles sont lisibles sans être connecté', async ({ browser, monde }) => {
    const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto('/regles');
    await expect(page.getByTestId('page-regles')).toBeVisible();
    await expect(page.getByText('Tes films sont privés par défaut.')).toBeVisible();
    await expect(page).toHaveURL(/\/regles/);
    await contexte.close();
  });
});

// Captures (à la demande) : CANAPE_CAPTURES_INSCRIPTION=<dossier> npm run e2e -- inscription.spec.ts -g captures
const DOSSIER_CAPTURES = process.env['CANAPE_CAPTURES_INSCRIPTION'];
test.describe('Captures de l\'inscription', () => {
  test.skip(!DOSSIER_CAPTURES, 'CANAPE_CAPTURES_INSCRIPTION non défini');
  test('captures', async ({ browser, monde, ouvrir }) => {
    test.setTimeout(180_000);
    const tailles = { ordi: { width: 1280, height: 860 }, tel: { width: 390, height: 844 } } as const;
    const a = await inscrireParApi(monde.serveur, 'Anaïs');
    await inscrireParApi(monde.serveur, 'Basile');
    const film = await monde.requeteAdmin.get(`${monde.serveur.url}/api/films?vue=miens`);
    void film;
    for (const [nom, viewport] of Object.entries(tailles)) {
      const anonyme = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR', viewport });
      const p = await anonyme.newPage();
      const photo = async (page: Page, fichier: string) => { await page.waitForTimeout(400); await page.screenshot({ path: `${DOSSIER_CAPTURES}/${nom}-${fichier}.png`, fullPage: true }); };
      await p.goto('/connexion'); await expect(p.getByTestId('lien-inscription')).toBeVisible(); await photo(p, 'connexion');
      await p.goto('/inscription'); await expect(p.getByTestId('champ-prenom')).toBeVisible();
      await photo(p, 'inscription-vide');
      await remplir(p, { prenom: 'Inès', identifiant: 'ines.martin' });
      await p.getByTestId('champ-confirmation').fill('different');
      await photo(p, 'inscription-remplie');
      await p.goto('/regles'); await photo(p, 'regles');
      await anonyme.close();

      const admin = await nouveauContexteAdmin(browser, monde, viewport);
      await admin.page.goto('/admin/reglages'); await expect(admin.page.getByRole('switch', { name: 'Inscriptions libres' })).toBeVisible(); await photo(admin.page, 'reglages');
      await admin.page.goto('/admin/utilisateurs'); await expect(admin.page.getByTestId('origine-compte').first()).toBeVisible(); await photo(admin.page, 'comptes');
      await admin.contexte.close();

      const c = await ouvrir(a);
      await c.page.setViewportSize(viewport);
      await c.page.goto('/seances/nouvelle');
      await expect(c.page.getByTestId('chercher-identifiant')).toBeVisible();
      await photo(c.page, 'invitation-seance');
    }
  });
});

async function nouveauContexteAdmin(browser: import('@playwright/test').Browser, monde: Monde, viewport: { width: number; height: number }) {
  const contexte = await browser.newContext({ baseURL: monde.serveur.url, locale: 'fr-FR', viewport });
  const r = await contexte.request.post(`${monde.serveur.url}/api/connexion`, { headers: { Origin: monde.serveur.url }, data: { identifiant: monde.admin.identifiant, motDePasse: monde.admin.motDePasse } });
  expect(r.status()).toBe(204);
  return { contexte, page: await contexte.newPage() };
}
