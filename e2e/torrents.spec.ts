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

// Phase 16 : torrents privés, partage après la fin, réponse du tracker. Le serveur n'envoie pas encore ces champs partout :
// la liste est simulée (page.route), seul le DELETE est intercepté de la même façon.
base.describe('Torrents : partage et trackers privés (réponses simulées)', () => {
  const ligneSimulee = (p: Record<string, unknown>) => ({
    id: 'x', proprietaireId: 1, proprietairePrenom: 'Alix', nom: 'Film', infoHash: 'a'.repeat(40), etat: 'telechargement', progression: 0.4,
    octetsRecus: 400_000_000, octetsTotal: 1_000_000_000, debit: 3_200_000, debitEnvoi: 0, pairs: 8, resteSecondes: 300, fichiers: [], filmIds: [],
    erreur: null, prive: false, enPartage: false, ratio: null, messageTracker: null, moteur: 'transmission', creeLe: '2026-11-12T10:00:00Z', termineLe: null, ...p,
  });
  const LIGNES = () => [
    ligneSimulee({ id: 'prive-en-cours', nom: 'Les.Nuits.de.Lisbonne.2019.1080p', prive: true, etat: 'metadonnees', progression: 0, octetsRecus: 0, octetsTotal: null, debit: 0, pairs: 0, resteSecondes: null,
      messageTracker: 'Le tracker a refusé : client non autorisé.' }),
    ligneSimulee({ id: 'public', nom: 'Pique-nique.a.Marseille.2016.720p', progression: 0.62, octetsRecus: 620_000_000 }),
    ligneSimulee({ id: 'prive-partage', nom: 'Le.Phare.du.bout.du.monde.2022.1080p', prive: true, etat: 'termine', progression: 1, octetsRecus: 1_000_000_000, debit: 0, debitEnvoi: 480_000, pairs: 5,
      resteSecondes: null, filmIds: ['film-1'], enPartage: true, ratio: 1.236, termineLe: '2026-11-12T11:00:00Z' }),
  ];

  async function simuler(page: Page, lignes: Array<Record<string, unknown>>): Promise<string[]> {
    const supprimes: string[] = [];
    await page.route('**/api/torrents', async (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      await r.fulfill({ json: { peutAjouter: true, telechargements: lignes } });
    });
    await page.route('**/api/torrents/*', async (r) => {
      if (r.request().method() !== 'DELETE') return r.fallback();
      const id = r.request().url().split('/').pop() ?? '';
      supprimes.push(id);
      const i = lignes.findIndex((l) => l['id'] === id);
      if (i >= 0) lignes.splice(i, 1);
      await r.fulfill({ status: 204, body: '' });
    });
    return supprimes;
  }

  base('pastille Privé, partage avec ratio, arrêt du partage et réponse du tracker', async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.admin);
    const supprimes = await simuler(page, LIGNES());
    await page.goto('/galerie');
    await expect(ligne(page)).toHaveCount(3);

    // Pastille Privé (deux lignes privées, aucune sur la publique) avec son aide.
    await expect(page.getByTestId('pastille-prive')).toHaveCount(2);
    const publique = ligne(page).filter({ hasText: 'Pique-nique' });
    await expect(publique.getByTestId('pastille-prive')).toHaveCount(0);
    const partagee = ligne(page).filter({ hasText: 'Le.Phare' });
    await partagee.getByTestId('pastille-prive').click();
    await expect(partagee.getByTestId('aide-prive')).toHaveText(/seuls ses trackers donnent des pairs.*comme le demande ton tracker/);

    // Réponse du tracker, et attente des pairs plutôt que « Récupération » quand le tracker a répondu.
    const attente = ligne(page).filter({ hasText: 'Les.Nuits' });
    await expect(attente.getByTestId('message-tracker')).toHaveText('Le tracker a refusé : client non autorisé.');
    await expect(attente).toContainText('En attente des pairs…');
    await expect(publique.getByTestId('message-tracker')).toHaveCount(0);

    // En partage : section à part, sous les téléchargements en cours.
    await expect(partagee.getByTestId('detail-partage')).toHaveText('En partage · ratio 1,24 · 480 Ko/s envoyés');
    await expect(page.getByTestId('telechargements-en-partage').getByTestId('telechargement')).toHaveCount(1);
    await expect(page.getByTestId('telechargements-en-cours').getByTestId('telechargement')).toHaveCount(2);

    // Arrêter de partager : confirmation courte, DELETE, la ligne disparaît, le film reste (bouton « Voir le film » avant l'arrêt).
    await expect(partagee.getByTestId('voir-film')).toBeVisible();
    await partagee.getByTestId('arreter-partage').click();
    const confirmation = page.getByRole('dialog', { name: 'Arrêter de partager ?' });
    await expect(confirmation).toContainText('Le film reste dans ta galerie.');
    await confirmation.getByRole('button', { name: 'Continuer' }).click();
    expect(supprimes).toEqual([]);
    await partagee.getByTestId('arreter-partage').click();
    await page.getByTestId('confirmer-arret-partage').click();
    await expect(ligne(page)).toHaveCount(2);
    await expect(page.getByTestId('section-partage')).toHaveCount(0);
    expect(supprimes).toEqual(['prive-partage']);
  });

  base('ratio inconnu et serveur sans les nouveaux champs', async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.admin);
    const ancienne = ligneSimulee({ id: 'ancien', nom: 'Ancien.Format', etat: 'termine', progression: 1, filmIds: ['f'] }) as Record<string, unknown>;
    for (const k of ['prive', 'enPartage', 'ratio', 'messageTracker', 'moteur']) delete ancienne[k];
    await simuler(page, [ligneSimulee({ id: 'sans-ratio', nom: 'Sans.Ratio', etat: 'termine', progression: 1, enPartage: true, ratio: null, filmIds: ['g'] }), ancienne]);
    await page.goto('/galerie');
    await expect(ligne(page)).toHaveCount(2);
    await expect(page.getByTestId('detail-partage')).toHaveText('En partage · ratio —');
    await expect(page.getByTestId('pastille-prive')).toHaveCount(0);
    await expect(page.getByTestId('message-tracker')).toHaveCount(0);
    // Sans `enPartage`, le film fini n'est pas partagé : « Dans ta galerie » et bouton Retirer comme avant.
    await expect(ligne(page).filter({ hasText: 'Ancien.Format' })).toContainText('Dans ta galerie');
    await expect(ligne(page).filter({ hasText: 'Ancien.Format' }).getByTestId('annuler-torrent')).toBeVisible();
  });

  // Captures : CANAPE_E2E_CAPTURES_TORRENTS=/dossier npx playwright test torrents --project=chromium -g captures
  const dossier = process.env['CANAPE_E2E_CAPTURES_TORRENTS'];
  base('captures du panneau (ordinateur et téléphone, clair et sombre)', async ({ ouvrir, monde }) => {
    base.skip(!dossier, 'CANAPE_E2E_CAPTURES_TORRENTS non défini : pas de captures.');
    const { contexte, page } = await ouvrir(monde.admin);
    await simuler(page, LIGNES());
    for (const theme of ['clair', 'sombre'] as const) {
      await contexte.addInitScript((t) => { try { localStorage.setItem('canape.theme', t); } catch { /* sans stockage */ } }, theme);
      for (const [nom, taille] of [['ordinateur', { width: 1440, height: 900 }], ['telephone', { width: 390, height: 844 }]] as const) {
        await page.setViewportSize(taille);
        await page.goto('/galerie');
        await expect(ligne(page)).toHaveCount(3);
        if (nom === 'telephone') await page.getByRole('button', { name: /téléchargement/ }).click();
        await page.getByTestId('pastille-prive').last().click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(dossier ?? '', `panneau-${nom}-${theme}.png`) });
        await page.getByTestId('pastille-prive').last().click();
      }
    }
  });
});
