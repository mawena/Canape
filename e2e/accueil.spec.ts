import path from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, televerser, FILM_WEBM, type Monde } from './support/fixtures.ts';
import { creerSeance } from './support/salle.ts';

// Phase 18 : l'accueil va droit au but. Les torrents et la présence dans la salle sont simulés (page.route) : aucun vrai torrent.
const ORIGINE = (m: Monde) => ({ Origin: m.serveur.url });

async function ajouterFilm(monde: Monde, titre: string): Promise<string> {
  return televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM, `${titre} (2020).webm`);
}

async function simulerPresence(page: Page, presents: number): Promise<void> {
  await page.route('**/api/seances', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const reponse = await r.fetch();
    const liste = (await reponse.json()) as { enCours: Array<Record<string, unknown>>; aVenir: Array<Record<string, unknown>>; recentes: unknown[] };
    const toutes = [...liste.enCours, ...liste.aVenir].map((s) => ({ ...s, presents }));
    await r.fulfill({ json: { enCours: toutes, aVenir: [], recentes: liste.recentes } });
  });
}

const ligneSimulee = (p: Record<string, unknown>) => ({
  id: 'x', proprietaireId: 1, proprietairePrenom: 'Alix', nom: 'Film', infoHash: 'a'.repeat(40), etat: 'telechargement', progression: 0.4,
  octetsRecus: 400_000_000, octetsTotal: 1_000_000_000, debit: 3_200_000, debitEnvoi: 0, pairs: 8, resteSecondes: 300, fichiers: [], filmIds: [],
  erreur: null, prive: false, enPartage: false, ratio: null, messageTracker: null, moteur: 'transmission', creeLe: '2026-11-12T10:00:00Z', termineLe: null, ...p,
});

async function simulerTorrents(page: Page, lignes: Array<Record<string, unknown>>): Promise<void> {
  await page.route('**/api/torrents', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    await r.fulfill({ json: { peutAjouter: true, telechargements: lignes } });
  });
}

async function simulerReprises(page: Page, monde: Monde, filmId: string): Promise<void> {
  const films = (await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/films?vue=tous`)).json()) as Array<{ id: string }>;
  const film = films.find((f) => f.id === filmId);
  await page.route('**/api/reprendre', (r) => r.fulfill({ json: [{ film, position: 1520, duree: 3600, seanceId: null, termine: false, vuLe: new Date().toISOString() }] }));
}

test.describe('Accueil', () => {
  test('compte neuf : démarrage guidé, sans séance ni lancement rapide', async ({ ouvrir, monde }) => {
    const { page } = await ouvrir(monde.admin);
    await page.goto('/');
    await expect(page.getByTestId('premiers-pas')).toBeVisible();
    await expect(page.getByTestId('lancement-rapide')).toHaveCount(0);
  });

  test('sans séance : le lancement rapide crée la séance en deux clics et montre le lien', async ({ ouvrir, monde }) => {
    await ajouterFilm(monde, 'Les Nuits de Lisbonne');
    const { page } = await ouvrir(monde.admin);
    await page.goto('/');
    await expect(page.getByTestId('seance-hero')).toHaveCount(0);
    await page.getByTestId('lancement-film').first().click();                       // clic 1 : le film
    await expect(page.getByTestId('lancement-lancer')).toBeEnabled();
    await page.getByTestId('lancement-lancer').click();                             // clic 2 : lancer
    await expect(page.getByTestId('lancement-cree')).toBeVisible();
    await expect(page.getByTestId('lancement-lien')).toHaveValue(/\/rejoindre\//);

    const liste = (await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/seances`)).json()) as { aVenir: Array<{ filmTitre: string; prevueLe: string | null }>; enCours: unknown[] };
    const seances = [...liste.aVenir, ...(liste.enCours as Array<{ filmTitre: string; prevueLe: string | null }>)];
    expect(seances).toHaveLength(1);
    expect(seances[0]?.prevueLe).toBeNull();

    await expect(page.getByTestId('seance-hero')).toBeVisible();                   // l'accueil a suivi : la séance est en avant
    await page.getByTestId('lancement-entrer').click();
    await expect(page).toHaveURL(/\/seances\/[\w-]+/);
  });

  test('séance en cours : en avant, avec « Rejoindre »', async ({ ouvrir, monde }) => {
    const film = await ajouterFilm(monde, 'Le Phare du bout du monde');
    await creerSeance(monde.serveur, monde.requeteAdmin, film, [monde.viewer.id], 'Soirée phare');
    const { page } = await ouvrir(monde.viewer);
    await simulerPresence(page, 1);
    await page.goto('/');
    const hero = page.getByTestId('seance-hero');
    await expect(hero).toHaveAttribute('data-etat', 'en-cours');
    await expect(hero).toContainText('Séance en cours');
    await expect(hero.getByTestId('rejoindre')).toHaveText(/Rejoindre/);
    await expect(hero.getByTestId('rejoindre')).toHaveAttribute('href', /\/seances\//);
    await expect(hero.getByTestId('copier-lien-hero')).toBeVisible();
  });

  test('prochaine séance : en avant, salle fermée avant l’heure', async ({ ouvrir, monde }) => {
    const film = await ajouterFilm(monde, 'Pique-nique à Marseille');
    const dans3h = new Date(Date.now() + 3 * 3600_000).toISOString();
    const r = await monde.requeteAdmin.post(`${monde.serveur.url}/api/seances`, { headers: ORIGINE(monde), data: { filmId: film, prevueLe: dans3h, invites: [monde.viewer.id] } });
    expect(r.status(), await r.text()).toBeLessThan(300);
    const { page } = await ouvrir(monde.admin);
    await page.goto('/');
    const hero = page.getByTestId('seance-hero');
    await expect(hero).toHaveAttribute('data-etat', 'prevue');
    await expect(hero).toContainText('Pique-nique à Marseille');
    await expect(hero.getByTestId('rejoindre')).toBeDisabled();
    await expect(hero).toContainText('La salle ouvre à');
  });

  test('Reprendre : un lien direct vers le film commencé', async ({ ouvrir, monde }) => {
    const film = await ajouterFilm(monde, 'La Dernière Séance');
    const { page } = await ouvrir(monde.admin);
    await simulerReprises(page, monde, film);
    await page.goto('/');
    const reprise = page.getByTestId('reprendre-film');
    await expect(reprise).toHaveCount(1);
    await expect(reprise).toContainText('Arrêté à');
    await reprise.click();
    await expect(page).toHaveURL(/\/seances\/nouvelle\?film=/);
  });

  test('téléchargements en cours : nom, avancement, aucun vrai torrent', async ({ ouvrir, monde }) => {
    await ajouterFilm(monde, 'Les Nuits de Lisbonne');
    const { page } = await ouvrir(monde.admin);
    await simulerTorrents(page, [
      ligneSimulee({ id: 'a', nom: 'Pique-nique.a.Marseille.2016.720p', progression: 0.62, octetsRecus: 620_000_000 }),
      ligneSimulee({ id: 'b', nom: 'Deja.Fini', etat: 'termine', progression: 1, filmIds: ['f'] }),
    ]);
    await page.goto('/');
    const bloc = page.getByTestId('accueil-telechargements');
    await expect(bloc).toContainText('1 téléchargement en cours');
    await expect(page.getByTestId('accueil-telechargement')).toHaveCount(1);
    await expect(page.getByTestId('accueil-telechargement')).toContainText('Pique-nique.a.Marseille');
    await expect(bloc.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
  });

  test('sans téléchargement, le bloc n’existe pas', async ({ ouvrir, monde }) => {
    await ajouterFilm(monde, 'Les Nuits de Lisbonne');
    const { page } = await ouvrir(monde.admin);
    await simulerTorrents(page, []);
    await page.goto('/');
    await expect(page.getByTestId('lancement-rapide')).toBeVisible();
    await expect(page.getByTestId('accueil-telechargements')).toHaveCount(0);
  });

  test('téléphone : rien de coupé, le bouton principal reste atteignable', async ({ ouvrir, monde }) => {
    const film = await ajouterFilm(monde, 'Les Nuits de Lisbonne');
    await creerSeance(monde.serveur, monde.requeteAdmin, film, [monde.viewer.id]);
    const { page } = await ouvrir(monde.admin);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const rejoindre = page.getByTestId('rejoindre');
    await expect(rejoindre).toBeVisible();
    const boite = await rejoindre.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((boite?.y ?? 9999) + (boite?.height ?? 0)).toBeLessThan(844 - 70);       // au-dessus de la barre du bas, sans défiler
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// Captures : CANAPE_E2E_CAPTURES=/dossier npx playwright test accueil --project=chromium -g captures
test.describe('Accueil : captures', () => {
  const dossier = process.env['CANAPE_E2E_CAPTURES'];
  test.skip(!dossier, 'CANAPE_E2E_CAPTURES non défini : pas de captures.');

  const TAILLES = { ordinateur: { width: 1440, height: 900 }, telephone: { width: 390, height: 844 } };
  async function photos(page: Page, etat: string): Promise<void> {
    mkdirSync(dossier ?? '', { recursive: true });
    for (const [nomTaille, taille] of Object.entries(TAILLES)) {
      for (const theme of ['clair', 'sombre']) {
        await page.setViewportSize(taille);
        await page.evaluate((t) => { localStorage.setItem('canape.theme', t); document.documentElement.setAttribute('data-theme', t); }, theme);
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(dossier ?? '', `${etat}-${nomTaille}-${theme}.png`), fullPage: true });
      }
    }
  }

  test('captures des états', async ({ ouvrir, monde }) => {
    test.setTimeout(240_000);
    const { page } = await ouvrir(monde.admin);
    await page.goto('/');
    await photos(page, '1-compte-neuf');

    const f1 = await ajouterFilm(monde, 'Les Nuits de Lisbonne');
    const f2 = await ajouterFilm(monde, 'Le Phare du bout du monde');
    await ajouterFilm(monde, 'Pique-nique à Marseille');
    await page.goto('/');
    await photos(page, '2-films-sans-seance');

    await simulerReprises(page, monde, f2);
    await simulerTorrents(page, [
      ligneSimulee({ id: 'a', nom: 'Pique-nique.a.Marseille.2016.720p', progression: 0.62, octetsRecus: 620_000_000 }),
      ligneSimulee({ id: 'b', nom: 'La.Derniere.Seance.1998.1080p', etat: 'metadonnees', progression: 0, octetsRecus: 0, octetsTotal: null, debit: 0, pairs: 0, resteSecondes: null }),
    ]);
    await page.goto('/');
    await photos(page, '3-reprendre-et-torrents');

    await creerSeance(monde.serveur, monde.requeteAdmin, f1, [monde.viewer.id], 'Soirée pop-corn');
    await page.goto('/');
    await photos(page, '4-seance-prete');
    await simulerPresence(page, 1);
    await page.goto('/');
    await photos(page, '5-seance-en-cours');
  });
});
