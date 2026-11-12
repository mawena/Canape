import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { demarrerServeur, type ServeurCanape } from './serveur.ts';

export { expect };

export interface Compte {
  prenom: string;
  identifiant: string;
  motDePasse: string;
  id: number;
}

export const MOT_DE_PASSE = 'MotDePasse-e2e-2026';
export const FILM_WEBM = 'Mire de test (2026).webm';
export const FILM_MKV = 'Mire convertie (2026).mkv';

export function cheminMedia(nom: string): string {
  return path.join(process.env['CANAPE_E2E_MEDIAS'] ?? '', nom);
}

let compteur = 0;
/** Identifiant unique pour un essai (les serveurs sont isolés, mais pas les relances d'un même worker). */
export function unique(prefixe: string): string {
  compteur += 1;
  return `${prefixe}${Date.now().toString(36)}${compteur}`;
}

/** En-têtes des requêtes qui modifient : l'`Origin` doit être celle du serveur. */
function entetes(s: ServeurCanape): Record<string, string> {
  return { Origin: s.url };
}

/**
 * Crée un compte par un lien d'invitation. Admin : lien de la ligne de commande (premier compte) ; viewer : lien créé
 * par l'API admin avec `requeteAdmin`. Rend les identifiants du nouveau compte.
 */
export async function creerCompte(
  s: ServeurCanape,
  options: { role: 'admin' | 'viewer'; prenom?: string; identifiant?: string; couleur?: string; requeteAdmin?: APIRequestContext },
): Promise<Compte> {
  let lien: string;
  if (options.role === 'admin') lien = s.inviter('admin');
  else {
    if (!options.requeteAdmin) throw new Error('creerCompte(viewer) demande requeteAdmin.');
    const r = await options.requeteAdmin.post(`${s.url}/api/admin/invitations`, { headers: entetes(s), data: { role: 'viewer', dureeJours: 7 } });
    expect(r.status(), await r.text()).toBeLessThan(300);
    lien = ((await r.json()) as { lien: string }).lien;
  }
  const jeton = lien.split('/').pop() ?? '';
  const prenom = options.prenom ?? (options.role === 'admin' ? 'Alix' : 'Camille');
  const identifiant = options.identifiant ?? unique(options.role === 'admin' ? 'admin' : 'viewer');
  const neuf = await request.newContext();
  const r = await neuf.post(`${s.url}/api/invitations/${jeton}`, {
    headers: entetes(s), data: { prenom, identifiant, motDePasse: MOT_DE_PASSE, couleur: options.couleur },
  });
  expect(r.status(), await r.text()).toBe(201);
  const moi = (await (await neuf.get(`${s.url}/api/compte`)).json()) as { id: number };
  await neuf.dispose();
  return { prenom, identifiant, motDePasse: MOT_DE_PASSE, id: moi.id };
}

/** Contexte d'API connecté (cookie de session) au nom de `compte`. */
export async function requeteConnectee(s: ServeurCanape, compte: Compte): Promise<APIRequestContext> {
  const ctx = await request.newContext();
  const r = await ctx.post(`${s.url}/api/connexion`, { headers: entetes(s), data: { identifiant: compte.identifiant, motDePasse: compte.motDePasse } });
  expect(r.status(), await r.text()).toBe(204);
  return ctx;
}

/** Connecte un contexte de navigateur (cookie de session) sans passer par le formulaire. */
export async function connecter(contexte: BrowserContext, s: ServeurCanape, compte: Compte): Promise<void> {
  const r = await contexte.request.post(`${s.url}/api/connexion`, {
    headers: entetes(s), data: { identifiant: compte.identifiant, motDePasse: compte.motDePasse },
  });
  expect(r.status(), await r.text()).toBe(204);
}

/** Téléverse un fichier par tus (un seul morceau) pour le compte du contexte ; rend l'identifiant du film. */
export async function televerser(s: ServeurCanape, requete: APIRequestContext, nom: string, nomEnvoye = nom): Promise<number> {
  const chemin = cheminMedia(nom);
  const octets = readFileSync(chemin);
  const b64 = Buffer.from(nomEnvoye).toString('base64');
  const creation = await requete.post(`${s.url}/api/televersement`, {
    headers: {
      ...entetes(s), 'Tus-Resumable': '1.0.0', 'Upload-Length': String(octets.length), 'Upload-Metadata': `filename ${b64}`,
    },
  });
  expect(creation.status(), await creation.text()).toBe(201);
  const lieu = creation.headers()['location'] ?? '';
  const envoi = await requete.patch(new URL(lieu, s.url).toString(), {
    headers: { ...entetes(s), 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
    data: octets,
  });
  expect(envoi.status(), await envoi.text()).toBeLessThan(300);
  return await attendreFilmPret(s, requete);
}

/** Attend que le film le plus récent de l'utilisateur soit prêt ; rend son identifiant. */
export async function attendreFilmPret(s: ServeurCanape, requete: APIRequestContext): Promise<number> {
  let id = 0;
  await expect.poll(async () => {
    const r = await requete.get(`${s.url}/api/films?vue=miens`);
    const films = (await r.json()) as Array<{ id: number; etat: string }>;
    const f = films.reduce<{ id: number; etat: string } | undefined>((m, x) => (!m || x.id > m.id ? x : m), undefined);
    if (f?.etat === 'erreur') throw new Error('Le film est passé en erreur.');
    id = f?.id ?? 0;
    return f?.etat;
  }, { timeout: 60_000, intervals: [500] }).toBe('pret');
  return id;
}

export interface Monde {
  serveur: ServeurCanape;
  admin: Compte;
  viewer: Compte;
  requeteAdmin: APIRequestContext;
  nouveauViewer: (prenom: string) => Promise<Compte>;
}

interface FixturesTest {
  /** Un serveur Canapé neuf pour l'essai, avec un compte admin et un viewer créés par l'API (rien n'est partagé entre essais). */
  monde: Monde;
  /** Un serveur Canapé neuf pour l'essai, sans aucun compte. */
  serveurVierge: ServeurCanape;
  /** Ouvre un contexte (et sa page) connecté en tant que `compte`. */
  ouvrir: (compte: Compte, options?: { serveur?: ServeurCanape }) => Promise<{ contexte: BrowserContext; page: Page }>;
}

export const test = base.extend<FixturesTest>({
  monde: async ({}, use) => {
    const serveur = await demarrerServeur();
    const admin = await creerCompte(serveur, { role: 'admin', prenom: 'Alix', identifiant: unique('alix') });
    const requeteAdmin = await requeteConnectee(serveur, admin);
    const viewer = await creerCompte(serveur, { role: 'viewer', prenom: 'Camille', identifiant: unique('camille'), requeteAdmin });
    await use({
      serveur, admin, viewer, requeteAdmin,
      nouveauViewer: (prenom) => creerCompte(serveur, { role: 'viewer', prenom, requeteAdmin }),
    });
    await requeteAdmin.dispose();
    await serveur.arreter();
  },

  serveurVierge: async ({}, use) => {
    const serveur = await demarrerServeur();
    await use(serveur);
    await serveur.arreter();
  },

  ouvrir: async ({ browser, monde }, use) => {
    const ouverts: BrowserContext[] = [];
    await use(async (compte, options) => {
      const serveur = options?.serveur ?? monde.serveur;
      const contexte = await nouveauContexte(browser, serveur);
      ouverts.push(contexte);
      await connecter(contexte, serveur, compte);
      return { contexte, page: await contexte.newPage() };
    });
    for (const c of ouverts) await c.close();
  },
});

/** Contexte avec `baseURL` du serveur ; hérite de `use` du projet (permissions, user-agent…) via browser.newContext. */
export async function nouveauContexte(browser: Browser, s: ServeurCanape): Promise<BrowserContext> {
  const info = test.info();
  const use = info.project.use;
  return browser.newContext({
    baseURL: s.url,
    locale: 'fr-FR',
    permissions: use.permissions,
    viewport: use.viewport ?? undefined,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    serviceWorkers: 'allow',
  });
}
