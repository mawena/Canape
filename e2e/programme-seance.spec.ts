import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { test, expect, connecter, creerCompte, nouveauContexte, requeteConnectee, televerser, unique, FILM_WEBM, type Compte } from './support/fixtures.ts';
import { demarrerServeur } from './support/serveur.ts';

// Phase 22 : une séance créée avec un seul film reçoit un programme depuis la salle (l'hôte y ajoute un film, l'invitée voit
// le programme apparaître, entracte puis film suivant). Entracte court (`CANAPE_ENTRACTE_SECONDES`, réservé aux essais).
// Captures seulement si CANAPE_E2E_CAPTURES_PROGRAMME (dossier) est défini.
const dossierCaptures = process.env['CANAPE_E2E_CAPTURES_PROGRAMME'];
const PREMIER = 'La Première Mire';
const SECOND = 'Le Retour de la mire';

async function capturer(page: Page, nom: string): Promise<void> {
  if (!dossierCaptures) return;
  mkdirSync(dossierCaptures, { recursive: true });
  for (const [suffixe, largeur, hauteur] of [['ordinateur', 1440, 900], ['telephone', 390, 844]] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(dossierCaptures, `${nom}-${suffixe}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
}

async function entrer(p: Page, seanceId: string): Promise<void> {
  await p.goto(`/seances/${seanceId}`);
  await expect(p.getByTestId('sas')).toBeVisible();
  await p.getByTestId('entrer-salle').click();
  await expect(p.getByTestId('salle')).toHaveAttribute('data-liaison', 'ouvert');
}

test.describe('Programme ajouté à une séance d’un seul film', () => {
  test('l’hôte ajoute un film depuis la salle ; l’invitée le voit ; entracte puis film suivant', async ({ browser }) => {
    test.setTimeout(240_000);
    const serveur = await demarrerServeur({ CANAPE_ENTRACTE_SECONDES: '60' });
    const contextes: BrowserContext[] = [];
    let requeteAdmin: APIRequestContext | null = null;
    try {
      const admin = await creerCompte(serveur, { role: 'admin', prenom: 'Alix', identifiant: unique('alix') });
      requeteAdmin = await requeteConnectee(serveur, admin);
      const viewer = await creerCompte(serveur, { role: 'viewer', prenom: 'Camille', identifiant: unique('camille'), requeteAdmin });
      const premier = await televerser(serveur, requeteAdmin, FILM_WEBM, `${PREMIER} (2024).webm`);
      await televerser(serveur, requeteAdmin, FILM_WEBM, `${SECOND} (2025).webm`);
      const ouvrir = async (c: Compte): Promise<Page> => {
        const ctx = await nouveauContexte(browser, serveur);
        contextes.push(ctx);
        await connecter(ctx, serveur, c);
        return ctx.newPage();
      };
      const a = await ouvrir(admin);
      const b = await ouvrir(viewer);

      // Séance d'un seul film, créée par l'API (comme le fait le formulaire quand un seul film est choisi).
      const r = await requeteAdmin.post(`${serveur.url}/api/seances`, {
        headers: { origin: serveur.url }, data: { filmId: premier, invites: [viewer.id] },
      });
      expect(r.status(), await r.text()).toBe(201);
      const id = ((await r.json()) as { id: string }).id;

      await entrer(a, id);
      await entrer(b, id);
      await expect(a.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');

      // Un seul film : l'invitée n'a pas le bouton, l'hôte l'a.
      await expect(b.getByTestId('bouton-programme')).toHaveCount(0);
      await a.getByTestId('bouton-programme').click();
      const progA = a.getByTestId('programme');
      await expect(progA).toBeVisible();
      await expect(progA.getByTestId('programme-film')).toHaveCount(1);
      await expect(progA.getByTestId('programme-retirer')).toHaveCount(0);
      await expect(progA.getByTestId('film-suivant')).toHaveCount(0);
      await capturer(a, 'programme-un-film');

      // L'hôte ajoute le second film.
      await progA.getByTestId('ajouter-film-programme').click();
      await progA.getByTestId('programme-recherche').fill('Retour');
      await progA.getByTestId('programme-choix').filter({ hasText: SECOND }).click();
      await expect(progA.getByTestId('programme-film')).toHaveCount(2);
      await expect(progA.getByTestId('programme-film').nth(1)).toHaveAttribute('data-etat', 'a-venir');
      await capturer(a, 'programme-deux-films');

      // L'invitée voit le bouton apparaître, puis le programme en lecture seule.
      await expect(b.getByTestId('bouton-programme')).toBeVisible();
      await b.getByTestId('bouton-programme').click();
      const progB = b.getByTestId('programme');
      await expect(progB.getByTestId('programme-film')).toHaveCount(2);
      for (const t of ['film-suivant', 'ajouter-film-programme', 'programme-retirer']) await expect(progB.getByTestId(t)).toHaveCount(0);
      await b.keyboard.press('Escape');

      // L'hôte retire le film ajouté : son bouton reste, celui de l'invitée disparaît.
      await progA.getByTestId('programme-retirer').click();
      await expect(progA.getByTestId('programme-film')).toHaveCount(1);
      await expect(b.getByTestId('bouton-programme')).toHaveCount(0);
      await expect(a.getByTestId('bouton-programme')).toBeVisible();

      // Il le rajoute, puis passe au film suivant en plein film.
      await progA.getByTestId('ajouter-film-programme').click();
      await progA.getByTestId('programme-choix').filter({ hasText: SECOND }).click();
      await expect(progA.getByTestId('programme-film')).toHaveCount(2);
      await progA.getByTestId('film-suivant').click();
      await progA.getByTestId('confirmer-film-suivant').click();
      for (const p of [a, b]) {
        await expect(p.getByTestId('salle')).toHaveAttribute('data-lecture', 'true', { timeout: 30_000 });
      }
      await b.getByTestId('bouton-programme').click();
      await expect(b.getByTestId('programme').getByTestId('programme-film').first()).toHaveAttribute('data-etat', 'vu');
      await expect(b.getByTestId('programme').getByTestId('programme-film').nth(1)).toHaveAttribute('data-etat', 'en-cours');
    } finally {
      for (const c of contextes) await c.close();
      await requeteAdmin?.dispose();
      await serveur.arreter();
    }
  });
});
