import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { test, expect, televerser, FILM_WEBM, type Monde } from './support/fixtures.ts';

// Phase 23 : films « à voir ensemble ». Aucun torrent ni service externe : des films téléversés, deux comptes.
// Captures seulement si CANAPE_E2E_CAPTURES_AVOIR (dossier) est défini.
const dossierCaptures = process.env['CANAPE_E2E_CAPTURES_AVOIR'];
const PREMIER = 'Les Nuits de Lisbonne';
const SECOND = 'Le Dernier Tramway';

/** Capture ordinateur et téléphone ; `cible` : l'élément à amener en haut de l'écran avant la capture. */
async function capturer(page: Page, nom: string, cible?: Locator): Promise<void> {
  if (!dossierCaptures) return;
  mkdirSync(dossierCaptures, { recursive: true });
  const depart = page.viewportSize();
  for (const [suffixe, largeur, hauteur] of [['ordinateur', 1440, 900], ['telephone', 390, 844]] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    if (cible) await cible.evaluate((el) => { window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(dossierCaptures, `${nom}-${suffixe}.png`) });
  }
  if (depart) await page.setViewportSize(depart);
  await page.waitForTimeout(300);
}

async function filmPartage(monde: Monde, titre: string): Promise<string> {
  const id = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM, `${titre} (2020).webm`);
  const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/films/${id}`, {
    headers: { Origin: monde.serveur.url }, data: { visibilite: 'partage', partages: [monde.viewer.id] },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return id;
}

/** Le cœur « J'ai envie de le voir » posé sur l'affiche d'un film de la galerie. */
const coeur = (page: Page, titre: string) => page.getByRole('button', { name: new RegExp(`^J’ai envie de voir ${titre}`) });
/** La carte d'un film dans « À voir ensemble », sur l'accueil. */
const carteAccueil = (page: Page, filmId: string) => page.locator(`[data-test="a-voir-film"][data-film="${filmId}"]`);

test.describe('Films à voir ensemble', () => {
  test('deux personnes marquent des films (galerie, fiche), l\'accueil les montre, la séance se lance avec les deux, l\'envie se retire', async ({ ouvrir, monde }) => {
    const film = await filmPartage(monde, PREMIER);
    const autre = await filmPartage(monde, SECOND);
    const admin = await ouvrir(monde.admin);
    const viewer = await ouvrir(monde.viewer);

    // Accueil sans envie : un état vide qui renvoie vers la galerie (des films existent, donc ce n'est pas un compte neuf).
    await admin.page.goto('/');
    await expect(admin.page.getByTestId('a-voir-vide')).toBeVisible();
    await capturer(admin.page, 'accueil-sans-envie', admin.page.getByTestId('a-voir-ensemble'));

    // Galerie : le cœur de l'affiche marque le film sans ouvrir la fiche.
    await admin.page.goto('/galerie');
    const coeurAdmin = coeur(admin.page, PREMIER);
    await expect(coeurAdmin).toHaveAttribute('aria-pressed', 'false');
    await coeurAdmin.click();
    await expect(coeurAdmin).toHaveAttribute('aria-pressed', 'true');
    await expect(coeurAdmin).toHaveText('1');
    await expect(admin.page).toHaveURL(/\/galerie(\?.*)?$/);

    // Fiche : bouton à bascule, avec le nombre de personnes qui en ont envie.
    await viewer.page.goto(`/galerie/${film}`);
    const bouton = viewer.page.getByTestId('bouton-envie');
    await expect(bouton).toHaveAttribute('aria-pressed', 'false');
    await expect(bouton).toContainText('1');
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    await expect(bouton).toContainText('2');
    await capturer(viewer.page, 'fiche-envie');

    // Camille a aussi envie d'un film qu'elle est seule à vouloir.
    await viewer.page.goto('/galerie');
    await coeur(viewer.page, SECOND).click();
    await expect(coeur(viewer.page, SECOND)).toHaveAttribute('aria-pressed', 'true');

    // La galerie de l'hôte : son cœur plein avec les deux envies, un cœur vide avec l'envie de Camille.
    await admin.page.reload();
    await expect(coeurAdmin).toHaveAttribute('aria-pressed', 'true');
    await expect(coeurAdmin).toHaveText('2');
    await expect(coeur(admin.page, SECOND)).toHaveAttribute('aria-pressed', 'false');
    await expect(coeur(admin.page, SECOND)).toHaveText('1');
    await capturer(admin.page, 'galerie-coeurs');

    // L'accueil montre d'abord le film voulu par les deux, avec les deux prénoms, puis celui de Camille.
    await admin.page.goto('/');
    await expect(admin.page.getByTestId('a-voir-film')).toHaveCount(2);
    await expect(admin.page.getByTestId('a-voir-film').first()).toHaveAttribute('data-film', film);
    const carte = carteAccueil(admin.page, film);
    await expect(carte).toHaveAttribute('data-envieux', '2');
    await expect(carte).toContainText(PREMIER);
    await expect(carte.getByTestId('a-voir-phrase')).toHaveText(`Toi et ${monde.viewer.prenom}, vous avez envie de le voir.`);
    await expect(carteAccueil(admin.page, autre).getByTestId('a-voir-phrase')).toHaveText(`${monde.viewer.prenom} a envie de le voir.`);
    await capturer(admin.page, 'accueil-a-voir-ensemble', admin.page.getByTestId('a-voir-ensemble'));

    // Lancer la séance : la page de création est pré-remplie avec le film et la personne intéressée.
    await carte.getByTestId('a-voir-lancer').click();
    await expect(admin.page).toHaveURL(/\/seances\/nouvelle\?film=.*&invites=\d+/);
    await expect(admin.page.getByTestId(`film-${film}`)).toBeChecked();
    await expect(admin.page.getByRole('checkbox', { name: new RegExp(monde.viewer.prenom) })).toBeChecked();
    await capturer(admin.page, 'seance-pre-remplie');
    await admin.page.getByTestId('creer-seance').click();
    await expect(admin.page.getByTestId('seance-creee')).toBeVisible();
    const liste = (await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/seances`)).json()) as { aVenir: Array<{ invites: Array<{ id: number }> }> };
    expect(liste.aVenir).toHaveLength(1);
    expect(liste.aVenir[0]?.invites.map((i) => i.id)).toEqual([monde.viewer.id]);

    // Retrait depuis l'accueil : l'envie de l'hôte part, celle de l'autre reste.
    await admin.page.goto('/');
    await carte.getByTestId('bouton-envie').click();
    await expect(carte.getByTestId('a-voir-phrase')).toHaveText(`${monde.viewer.prenom} a envie de le voir.`);
    // « Annuler » dans le toast remet l'envie.
    await admin.page.getByRole('button', { name: 'Annuler' }).click();
    await expect(carte.getByTestId('a-voir-phrase')).toHaveText(`Toi et ${monde.viewer.prenom}, vous avez envie de le voir.`);
    await carte.getByTestId('bouton-envie').click();
    await expect(carte.getByTestId('a-voir-phrase')).toHaveText(`${monde.viewer.prenom} a envie de le voir.`);
    await expect(carte).toHaveAttribute('data-envieux', '1');
    // Camille retire ses deux envies : plus rien à voir ensemble.
    await viewer.page.goto('/');
    await carteAccueil(viewer.page, film).getByTestId('bouton-envie').click();
    await expect(carteAccueil(viewer.page, film)).toHaveCount(0);
    await carteAccueil(viewer.page, autre).getByTestId('bouton-envie').click();
    await expect(viewer.page.getByTestId('a-voir-vide')).toBeVisible();
    await expect(viewer.page.getByTestId('a-voir-film')).toHaveCount(0);
  });

  test('un film privé n\'apparaît pas chez les autres', async ({ ouvrir, monde }) => {
    const prive = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM, 'Film secret (2021).webm');
    const admin = await ouvrir(monde.admin);
    await admin.page.goto(`/galerie/${prive}`);
    await admin.page.getByTestId('bouton-envie').click();
    await expect(admin.page.getByTestId('bouton-envie')).toHaveAttribute('aria-pressed', 'true');
    const viewer = await ouvrir(monde.viewer);
    await viewer.page.goto('/');
    await expect(viewer.page.getByTestId('a-voir-film')).toHaveCount(0);
    await expect(viewer.page.getByText('Film secret')).toHaveCount(0);
    const r = await viewer.contexte.request.put(`${monde.serveur.url}/api/films/${prive}/envie`, { headers: { Origin: monde.serveur.url } });
    expect(r.status()).toBe(404);
  });
});
