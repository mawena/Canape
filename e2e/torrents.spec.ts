import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test as base, expect, creerCompte, requeteConnectee, unique, type Monde } from './support/fixtures.ts';
import { demarrerServeur } from './support/serveur.ts';
import { fabriquerSources, semer, type PairLocal, type SourcesTorrents } from './support/torrents.ts';

interface Options { debitMax: string }
interface Worker { pair: PairLocal; sources: SourcesTorrents }

// Un pair local pour tout le worker ; chaque essai a son serveur Canapé, isolé d'Internet et qui connaît ce pair.
const test = base.extend<Options, { reseau: Worker }>({
  debitMax: ['0', { option: true }],
  reseau: [async ({}, use) => {
    const dossier = mkdtempSync(path.join(process.env['CANAPE_E2E_RACINE'] ?? os.tmpdir(), 'torrents-'));
    const sources = fabriquerSources(dossier);
    const pair = await semer([sources.simple, sources.double, sources.gros]);
    await use({ pair, sources });
    await pair.fermer();
    rmSync(dossier, { recursive: true, force: true });
  }, { scope: 'worker', timeout: 120_000 }],

  monde: async ({ reseau, debitMax }, use) => {
    const serveur = await demarrerServeur({
      CANAPE_TORRENT_ISOLE: '1',
      CANAPE_TORRENT_PAIRS: `127.0.0.1:${reseau.pair.port}`,
      CANAPE_TORRENT_DEBIT_MAX: debitMax,
    });
    const admin = await creerCompte(serveur, { role: 'admin', prenom: 'Alix', identifiant: unique('alix') });
    const requeteAdmin = await requeteConnectee(serveur, admin);
    const viewer = await creerCompte(serveur, { role: 'viewer', prenom: 'Camille', identifiant: unique('camille'), requeteAdmin });
    const monde: Monde = { serveur, admin, viewer, requeteAdmin, nouveauViewer: (prenom) => creerCompte(serveur, { role: 'viewer', prenom, requeteAdmin }) };
    await use(monde);
    await requeteAdmin.dispose();
    await serveur.arreter();
  },
});

const ligne = (page: Page) => page.getByTestId('telechargement');
const etats = (page: Page) => ligne(page).evaluateAll((l) => l.map((x) => (x as HTMLElement).dataset['etat']));

async function ouvrirModaleTorrent(page: Page): Promise<void> {
  await page.getByTestId('ajouter-film').click();
  await page.getByTestId('ajouter-torrent').click();
  await expect(page.getByRole('dialog', { name: 'Ajouter par torrent' })).toBeVisible();
}

test.describe('Torrents', () => {
  test('lien magnet : métadonnées, téléchargement, import, toast et carte dans la galerie', async ({ ouvrir, monde, reseau }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/galerie');
    await ouvrirModaleTorrent(page);
    await page.getByTestId('champ-magnet').fill(reseau.pair.magnet(reseau.sources.simple));
    await page.getByTestId('envoyer-torrent').click();

    await expect(ligne(page)).toHaveCount(1);
    await expect(ligne(page).first()).toHaveAttribute('data-etat', /metadonnees|telechargement|import|termine/);
    await expect(ligne(page).first()).toHaveAttribute('data-etat', 'termine', { timeout: 60_000 });
    await expect(page.getByText('Mon.Film.2020 est dans ta galerie.').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Mon.Film|Mon Film/i }).first()).toBeVisible({ timeout: 30_000 });
    // Le lien vers la fiche est dans la ligne finie.
    await ligne(page).first().getByTestId('voir-film').click();
    await expect(page).toHaveURL(/\/galerie\/[\w-]+/);
  });

  test('fichier .torrent choisi dans la modale', async ({ ouvrir, monde, reseau }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/galerie');
    await ouvrirModaleTorrent(page);
    await page.getByTestId('fichier-torrent').setInputFiles({ name: 'Mon.Film.2020.torrent', mimeType: 'application/x-bittorrent', buffer: reseau.pair.fichierTorrent(reseau.sources.simple) });
    await expect(page.getByText('Mon.Film.2020.torrent')).toBeVisible();
    await page.getByTestId('envoyer-torrent').click();
    await expect(ligne(page).first()).toHaveAttribute('data-etat', 'termine', { timeout: 60_000 });
    await expect(page.getByRole('link', { name: /Mon.Film|Mon Film/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  // Débit limité côté serveur : le temps de mettre en pause, d'annuler ou de changer le choix des fichiers.
  test.describe('débit limité', () => {
  test.use({ debitMax: '60K' });
  test('pause, reprise puis annulation avec confirmation', async ({ ouvrir, monde, reseau }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/galerie');
    await ouvrirModaleTorrent(page);
    await page.getByTestId('champ-magnet').fill(reseau.pair.magnet(reseau.sources.gros));
    await page.getByTestId('envoyer-torrent').click();

    const l = ligne(page).first();
    await expect(l).toHaveAttribute('data-etat', /metadonnees|telechargement/);
    await expect(l).toHaveAttribute('data-etat', 'telechargement', { timeout: 30_000 });
    await l.getByTestId('pause-torrent').click();
    await expect(l).toHaveAttribute('data-etat', 'pause');
    await expect(l.getByRole('progressbar')).toHaveAttribute('aria-valuenow', /\d+/);
    await expect(l.getByTestId('reprendre-torrent')).toBeVisible();
    await l.getByTestId('reprendre-torrent').click();
    await expect(l).toHaveAttribute('data-etat', /metadonnees|telechargement/);

    // Annuler : on peut garder (rien ne change), puis confirmer (la ligne disparaît).
    await l.getByTestId('annuler-torrent').click();
    const confirmation = page.getByRole('dialog', { name: 'Annuler ce téléchargement ?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Garder' }).click();
    await expect(ligne(page)).toHaveCount(1);
    await l.getByTestId('annuler-torrent').click();
    await confirmation.getByRole('button', { name: 'Annuler le téléchargement' }).click();
    await expect(ligne(page)).toHaveCount(0);
    const r = await monde.requeteAdmin.get(`${monde.serveur.url}/api/torrents`);
    expect(((await r.json()) as { telechargements: unknown[] }).telechargements).toHaveLength(0);
  });

  });

  test.describe('débit limité à 250 Ko/s', () => {
  test.use({ debitMax: '250K' });
  test('choix des fichiers : une autre vidéo que celle choisie d’office', async ({ ouvrir, monde, reseau }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/galerie');
    await ouvrirModaleTorrent(page);
    await page.getByTestId('champ-magnet').fill(reseau.pair.magnet(reseau.sources.double));
    await page.getByTestId('envoyer-torrent').click();

    const l = ligne(page).first();
    const bouton = l.getByTestId('choisir-fichiers');
    await expect(bouton).toBeVisible({ timeout: 20_000 });
    // On met en pause le temps de choisir (le débit est limité, mais le choix reste refusé une fois le torrent fini).
    await l.getByTestId('pause-torrent').click();
    await expect(l).toHaveAttribute('data-etat', 'pause');
    await bouton.click();
    const modale = page.getByRole('dialog', { name: 'Choisir les fichiers' });
    await expect(modale).toBeVisible();
    const premier = modale.getByRole('checkbox', { name: /Premier\.Film/ });
    const second = modale.getByRole('checkbox', { name: /Second\.Film/ });
    // La plus grosse vidéo est cochée d'office ; sans aucune vidéo, on ne peut pas enregistrer.
    await expect(premier).toBeChecked();
    await expect(second).not.toBeChecked();
    await premier.uncheck();
    await expect(modale.getByText('Coche au moins une vidéo.')).toBeVisible();
    await expect(modale.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await second.check();
    await modale.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(modale).toBeHidden();
    await l.getByTestId('reprendre-torrent').click();

    await expect(l).toHaveAttribute('data-etat', 'termine', { timeout: 60_000 });
    // Un seul film dans la galerie : celui qui a été choisi (pas la plus grosse vidéo).
    await expect.poll(async () => {
      const films = (await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/films?vue=miens`)).json()) as Array<{ titre: string }>;
      return films.map((f) => f.titre).join('|');
    }, { timeout: 30_000 }).toMatch(/^Second/i);
  });

  });

  test.describe('débit limité à 60 Ko/s (le premier ajout reste en cours)', () => {
  test.use({ debitMax: '60K' });
  test('erreurs : lien invalide côté client, même torrent deux fois', async ({ ouvrir, monde, reseau }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/galerie');
    await ouvrirModaleTorrent(page);
    await page.getByTestId('champ-magnet').fill('https://exemple.fr/film');
    await page.getByTestId('envoyer-torrent').click();
    await expect(page.getByText(/Ce n’est pas un lien magnet/)).toBeVisible();
    expect(await etats(page)).toEqual([]);

    await page.getByTestId('champ-magnet').fill(reseau.pair.magnet(reseau.sources.gros));
    await page.getByTestId('envoyer-torrent').click();
    await expect(ligne(page)).toHaveCount(1);

    await ouvrirModaleTorrent(page);
    await page.getByTestId('champ-magnet').fill(reseau.pair.magnet(reseau.sources.gros));
    await page.getByTestId('envoyer-torrent').click();
    await expect(page.getByText('Ce torrent est déjà en cours.')).toBeVisible();
    await expect(ligne(page)).toHaveCount(1);
  });
  });

  test('un compte sans droit de téléverser ne voit pas « Par torrent »', async ({ ouvrir, monde }) => {
    const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/admin/utilisateurs/${monde.viewer.id}`, { headers: { Origin: monde.serveur.url }, data: { peutTeleverser: false } });
    expect(r.status(), await r.text()).toBeLessThan(300);
    const { page } = await ouvrir(monde.viewer);
    await page.goto('/galerie');
    await expect(page.getByRole('heading', { name: 'Films' })).toBeVisible();
    await expect(page.getByTestId('ajouter-torrent')).toHaveCount(0);
    // Le bouton ouvre directement le sélecteur de fichiers, sans choix.
    const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('ajouter-film').click()]);
    expect(selecteur.isMultiple()).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
