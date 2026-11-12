import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, expect, televerser, FILM_WEBM, type Monde } from './support/fixtures.ts';
import { creerSeance, entrerDansLaSalle } from './support/salle.ts';

// Captures d'écran des écrans principaux avec des données réalistes. Sans CANAPE_E2E_CAPTURES (dossier), rien n'est fait.
//   CANAPE_E2E_CAPTURES=/chemin/captures npx playwright test captures --project=chromium --project=telephone
const dossier = process.env['CANAPE_E2E_CAPTURES'];
test.skip(!dossier, 'CANAPE_E2E_CAPTURES non défini : pas de captures.');

const FILMS: Array<{ titre: string; annee: number; resume: string }> = [
  { titre: 'Les Nuits de Lisbonne', annee: 2019, resume: 'Deux amis d’enfance se retrouvent le temps d’une nuit dans une ville qui ne dort jamais.' },
  { titre: 'Le Phare du bout du monde', annee: 2022, resume: 'Une gardienne de phare reçoit un message qui ne devrait pas exister.' },
  { titre: 'Pique-nique à Marseille', annee: 2016, resume: 'Une comédie de famille un dimanche de mistral.' },
  { titre: 'La Dernière Séance', annee: 1998, resume: 'Le dernier soir d’un cinéma de quartier.' },
];

async function peupler(monde: Monde): Promise<{ premier: string; seanceId: string }> {
  const ids: string[] = [];
  for (const f of FILMS) {
    const id = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM, `${f.titre} (${f.annee}).webm`);
    const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/films/${id}`, {
      headers: { Origin: monde.serveur.url }, data: { resume: f.resume, visibilite: 'partage', partages: [monde.viewer.id] },
    });
    expect(r.status(), await r.text()).toBeLessThan(300);
    ids.push(id);
  }
  const seanceId = await creerSeance(monde.serveur, monde.requeteAdmin, ids[0] ?? '', [monde.viewer.id], 'Soirée pop-corn');
  const demain = new Date(Date.now() + 26 * 3600_000).toISOString();
  const r = await monde.requeteAdmin.post(`${monde.serveur.url}/api/seances`, {
    headers: { Origin: monde.serveur.url }, data: { filmId: ids[1], titre: 'Dimanche au phare', prevueLe: demain, invites: [monde.viewer.id] },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return { premier: ids[0] ?? '', seanceId };
}

test('captures des écrans principaux', async ({ ouvrir, monde }, info) => {
  test.setTimeout(240_000);
  const sortie = dossier ?? '';
  mkdirSync(sortie, { recursive: true });
  const nom = info.project.name;
  const { premier, seanceId } = await peupler(monde);
  const { page } = await ouvrir(monde.admin);

  async function photo(chemin: string, fichier: string, avant?: () => Promise<void>): Promise<void> {
    await page.goto(chemin);
    await page.waitForLoadState('networkidle');
    await avant?.();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(sortie, `${nom}-${fichier}.png`), fullPage: true });
  }

  await photo('/', 'accueil');
  await photo('/galerie', 'galerie');
  await photo(`/galerie/${premier}`, 'fiche');
  await photo('/seances', 'seances');
  await photo('/seances/nouvelle', 'nouvelle-seance');
  await photo('/compte', 'compte');
  await photo('/admin', 'admin');
  await photo('/admin/utilisateurs', 'admin-comptes');
  await photo('/admin/invitations', 'admin-invitations');
  await photo('/admin/lecture', 'admin-conversions');
  await photo(`/galerie/${premier}`, 'fiche-lecteur', async () => {
    await page.getByRole('button', { name: 'Regarder seul' }).click();
    await page.locator('[data-test="lecteur-seul"] video').evaluate((v: HTMLVideoElement) => { v.muted = true; v.currentTime = 6; return v.play(); });
  });

  // Salle à deux : sas, puis la salle avec les deux vignettes et un échange de messages.
  await page.goto(`/seances/${seanceId}`);
  await expect(page.getByTestId('sas')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(sortie, `${nom}-sas.png`) });
  const b = await ouvrir(monde.viewer);
  await entrerDansLaSalle(page, seanceId);
  await entrerDansLaSalle(b.page, seanceId);
  await expect(page.locator('[data-test="vignette"][data-moi="false"]')).toHaveAttribute('data-pair', 'connected', { timeout: 30_000 });
  await page.getByTestId('bouton-chat').click();
  await b.page.getByTestId('bouton-chat').click();
  await b.page.getByTestId('saisie-chat').fill('Tu as le pop-corn ?');
  await b.page.getByTestId('saisie-chat').press('Enter');
  await page.getByTestId('saisie-chat').fill('Oui, on lance quand tu veux !');
  await page.getByTestId('saisie-chat').press('Enter');
  if (nom === 'telephone') {
    // Sur téléphone la discussion est un tiroir qui recouvre les commandes : photo avec, puis sans.
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(sortie, `${nom}-salle-chat.png`) });
    await page.getByRole('button', { name: /Fermer/ }).first().click().catch(() => page.getByTestId('bouton-chat').click({ force: true }));
  }
  await page.getByTestId('reaction-1').click();
  await page.getByTestId('lecture').click();
  await expect(b.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
  await expect.poll(() => b.page.getByTestId('film').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(3);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(sortie, `${nom}-salle.png`) });
  await b.page.screenshot({ path: path.join(sortie, `${nom}-salle-viewer.png`) });
});
