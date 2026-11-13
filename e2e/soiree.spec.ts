import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { test, expect, connecter, creerCompte, nouveauContexte, requeteConnectee, televerser, unique, FILM_WEBM, type Compte } from './support/fixtures.ts';
import { demarrerServeur } from './support/serveur.ts';

// Phase 21 : une soirée de plusieurs films, avec un entracte entre deux. Le serveur de cet essai a un entracte court
// (`CANAPE_ENTRACTE_SECONDES`, réservé aux essais) pour ne pas attendre 5 minutes ; « +5 min » ajoute la même durée.
// Captures (création, panneau du programme, entracte, fin) seulement si CANAPE_E2E_CAPTURES_SOIREE (dossier) est défini.
const ENTRACTE = 60;
const dossierCaptures = process.env['CANAPE_E2E_CAPTURES_SOIREE'];
const PREMIER = 'La Première Mire';
const SECOND = 'Le Retour de la mire';

/** Deux captures (ordinateur 1440×900 et téléphone 390×844) ; la page revient en 1440×900. */
async function capturer(page: Page, nom: string, pleinePage = false): Promise<void> {
  if (!dossierCaptures) return;
  mkdirSync(dossierCaptures, { recursive: true });
  for (const [suffixe, largeur, hauteur] of [['ordinateur', 1440, 900], ['telephone', 390, 844]] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(dossierCaptures, `${nom}-${suffixe}.png`), fullPage: pleinePage });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
}

/** Secondes restantes affichées par le minuteur de l'entracte. */
async function restant(p: Page): Promise<number> {
  return Number(await p.getByTestId('entracte-temps').getAttribute('data-secondes'));
}

async function entrer(p: Page, seanceId: string): Promise<void> {
  await p.goto(`/seances/${seanceId}`);
  await expect(p.getByTestId('sas')).toBeVisible();
  await expect(p.getByTestId('resume-programme')).toHaveText(`2 films : ${PREMIER}, ${SECOND}`);
  await p.getByTestId('entrer-salle').click();
  await expect(p.getByTestId('salle')).toHaveAttribute('data-liaison', 'ouvert');
}

test.describe('Soirée à plusieurs films', () => {
  test('deux films : création, entracte au même temps chez tous, « +5 min », « Lancer maintenant », fin de soirée', async ({ browser }) => {
    test.setTimeout(240_000);
    const serveur = await demarrerServeur({ CANAPE_ENTRACTE_SECONDES: String(ENTRACTE) });
    const contextes: BrowserContext[] = [];
    let requeteAdmin: APIRequestContext | null = null;
    try {
      const admin = await creerCompte(serveur, { role: 'admin', prenom: 'Alix', identifiant: unique('alix') });
      requeteAdmin = await requeteConnectee(serveur, admin);
      const viewer = await creerCompte(serveur, { role: 'viewer', prenom: 'Camille', identifiant: unique('camille'), requeteAdmin });
      const premier = await televerser(serveur, requeteAdmin, FILM_WEBM, `${PREMIER} (2024).webm`);
      const second = await televerser(serveur, requeteAdmin, FILM_WEBM, `${SECOND} (2025).webm`);
      const ouvrir = async (c: Compte): Promise<Page> => {
        const ctx = await nouveauContexte(browser, serveur);
        contextes.push(ctx);
        await connecter(ctx, serveur, c);
        return ctx.newPage();
      };
      const a = await ouvrir(admin);
      const b = await ouvrir(viewer);

      // ---- Création : « Ajouter un autre film », ordre réglé au clavier, invitée ----
      await a.goto('/seances/nouvelle');
      await expect(a.getByTestId('page-nouvelle-seance')).toBeVisible();
      await a.getByTestId(`film-${premier}`).check({ force: true });
      await expect(a.getByTestId('programme')).toHaveCount(0);
      await a.getByTestId('ajouter-film-programme').click();
      await a.getByTestId(`film-${second}`).check({ force: true });
      const lignes = a.getByTestId('programme').getByTestId('programme-film');
      await expect(lignes).toHaveCount(2);
      await expect(lignes.first()).toContainText(PREMIER);
      await lignes.nth(1).getByTestId('programme-monter').click();
      await expect(lignes.first()).toContainText(SECOND);
      // Le focus a suivi le film : il est en tête, « Monter » est inactif, le focus est sur « Descendre ».
      await expect(lignes.first().getByTestId('programme-descendre')).toBeFocused();
      await a.keyboard.press('Enter');
      await expect(lignes.first()).toContainText(PREMIER);
      await a.getByRole('checkbox', { name: new RegExp(viewer.prenom) }).check();
      await expect(a.getByTestId('creer-seance')).toHaveText('Créer la soirée');
      await capturer(a, 'creation', true);
      await a.getByTestId('creer-seance').click();
      await expect(a.getByTestId('seance-creee')).toBeVisible();
      await expect(a.getByTestId('resume-programme')).toHaveText(`2 films : ${PREMIER}, ${SECOND}`);
      const id = ((await a.getByTestId('entrer-salle-creee').getAttribute('href')) ?? '').split('/').pop() ?? '';
      expect(id).toMatch(/^[a-z2-7]{12}$/);

      // La liste des séances et la carte de l'accueil de l'invitée citent le programme.
      await b.goto('/seances');
      await expect(b.getByTestId('seance').first().getByTestId('resume-programme')).toHaveText(`2 films : ${PREMIER}, ${SECOND}`);
      await b.goto('/');
      await expect(b.getByTestId('seance-hero').getByTestId('resume-programme')).toHaveText(`2 films : ${PREMIER}, ${SECOND}`);

      // ---- Salle : le programme, en lecture seule pour l'invitée ----
      await entrer(a, id);
      await entrer(b, id);
      await expect(a.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');
      await b.getByTestId('bouton-programme').click();
      const progB = b.getByTestId('programme');
      await expect(progB).toBeVisible();
      await expect(progB.getByTestId('programme-film')).toHaveCount(2);
      await expect(progB.getByTestId('programme-film').first()).toHaveAttribute('data-etat', 'en-cours');
      await expect(progB.getByTestId('programme-film').nth(1)).toHaveAttribute('data-etat', 'a-venir');
      for (const t of ['film-suivant', 'ajouter-film-programme', 'programme-retirer', 'programme-monter']) await expect(progB.getByTestId(t)).toHaveCount(0);
      await b.keyboard.press('Escape');
      await expect(progB).toHaveCount(0);
      // Ouvrir le programme ne met pas en pause et ne bouge rien chez l'autre.
      await a.getByTestId('bouton-programme').click();
      await expect(a.getByTestId('programme').getByTestId('film-suivant')).toBeVisible();
      await expect(a.getByTestId('programme').getByTestId('ajouter-film-programme')).toBeVisible();
      await expect(a.getByTestId('programme').getByTestId('programme-retirer')).toHaveCount(1);
      await capturer(a, 'salle-programme');
      await a.keyboard.press('Escape');
      await expect(a.getByTestId('programme')).toHaveCount(0);

      // ---- Fin du premier film : entracte chez les deux, même temps, pas d'écran de fin ----
      await a.getByTestId('lecture').click();
      await expect(b.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
      await a.keyboard.press('Shift+ArrowRight');
      for (const p of [a, b]) {
        await expect(p.getByTestId('entracte')).toBeVisible({ timeout: 40_000 });
        await expect(p.getByTestId('salle')).toHaveAttribute('data-entracte', 'true');
        await expect(p.getByTestId('entracte-film')).toHaveText(SECOND);
        await expect(p.getByTestId('fin-seance')).toHaveCount(0);
      }
      const [ta, tb] = [await restant(a), await restant(b)];
      expect(Math.abs(ta - tb)).toBeLessThanOrEqual(1);
      expect(ta).toBeGreaterThan(ENTRACTE - 20);
      expect(ta).toBeLessThanOrEqual(ENTRACTE);
      await expect(b.getByTestId('entracte-lancer')).toHaveCount(0);
      await expect(b.getByTestId('entracte-prolonger')).toHaveCount(0);
      // Les réactions continuent pendant l'entracte.
      await b.getByTestId('reaction-1').click();
      await expect(a.getByTestId('reaction').first()).toBeVisible();

      // « +5 min » (ici + ENTRACTE s) : le minuteur avance chez les deux.
      const avant = await restant(a);
      await a.getByTestId('entracte-prolonger').click();
      await expect.poll(() => restant(b)).toBeGreaterThan(avant + ENTRACTE - 10);

      // Arrivée pendant l'entracte (rechargement) : même voile, même temps.
      await b.reload();
      await expect(b.getByTestId('sas')).toBeVisible();
      await b.getByTestId('entrer-salle').click();
      await expect(b.getByTestId('entracte')).toBeVisible();
      await expect(b.getByTestId('reprise')).toHaveCount(0);
      await expect.poll(async () => Math.abs((await restant(a)) - (await restant(b)))).toBeLessThanOrEqual(1);
      await capturer(a, 'entracte-hote');
      await capturer(b, 'entracte-invitee');

      // ---- « Lancer maintenant » : le second film démarre chez les deux ----
      await a.getByTestId('entracte-lancer').click();
      for (const p of [a, b]) await expect(p.getByTestId('entracte')).toHaveCount(0);
      for (const p of [a, b]) await expect(p.getByTestId('salle')).toHaveAttribute('data-lecture', 'true', { timeout: 30_000 });
      await expect(b.getByTestId('titre-seance')).toBeVisible();
      await b.getByTestId('bouton-programme').click();
      await expect(b.getByTestId('programme').getByTestId('programme-film').first()).toHaveAttribute('data-etat', 'vu');
      await expect(b.getByTestId('programme').getByTestId('programme-film').nth(1)).toHaveAttribute('data-etat', 'en-cours');
      await b.keyboard.press('Escape');

      // ---- Fin du second (dernier) film : l'écran de fin parle de la soirée ----
      await a.keyboard.press('Shift+ArrowRight');
      for (const p of [a, b]) {
        await expect(p.getByTestId('fin-seance')).toBeVisible({ timeout: 40_000 });
        await expect(p.getByTestId('invite-note')).toHaveText('Un mot sur cette soirée ?');
        await expect(p.getByTestId('temps-ensemble')).toHaveAttribute('data-films', '2');
        await expect(p.getByTestId('temps-ensemble')).toContainText('2 films');
        await expect(p.getByTestId('entracte')).toHaveCount(0);
      }
      await capturer(b, 'fin-soiree');
    } finally {
      for (const c of contextes) await c.close();
      await requeteAdmin?.dispose();
      await serveur.arreter();
    }
  });
});
