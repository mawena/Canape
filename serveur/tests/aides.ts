// Aides de test : application sur dossiers et base temporaires, comptes et sessions créés directement.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { COOKIE_SESSION, type Role } from '@canape/partage';
import { creerApp, type OptionsApp } from '../src/app.ts';
import { jetonAleatoire, maintenantIso, sha256Hex } from '../src/commun/identifiants.ts';
import { hasherMotDePasse } from '../src/commun/motdepasse.ts';
import { chargerConfig, type Config } from '../src/config.ts';
import { migrer, ouvrirBase, type Base } from '../src/db/index.ts';

export const MOT_DE_PASSE_TEST = 'motdepasse-de-test';
export const ORIGINE_TEST = 'http://localhost:8080';

export interface AppTest {
  app: FastifyInstance;
  config: Config;
  db: Base;
  /** Dossier temporaire racine (donnees, films, cache, televersements, telechargements, client). */
  dossier: string;
  /** Dossier d'une application construite factice (index.html) si `avecClient`. */
  clientBuild: string | null;
  /** Ferme l'app et supprime les dossiers temporaires. */
  fermer: () => Promise<void>;
}

export interface OptionsAppTest {
  /** Surcharges de variables CANAPE_* (ex. `{ CANAPE_URL_PUBLIQUE: 'https://x.test' }`). */
  env?: Record<string, string>;
  /** Crée un `client/build` factice avec un `index.html` (script en ligne inclus). */
  avecClient?: boolean;
  app?: Partial<OptionsApp>;
  /** Appelé avant `app.ready()` : permet d'ajouter des routes de test (par ex. protégées par `exigerConnexion`). */
  avantPret?: (app: FastifyInstance) => void | Promise<void>;
}

/** Construit l'application sur des dossiers et une base temporaires (prête pour `app.inject`). */
export async function creerAppTest(options: OptionsAppTest = {}): Promise<AppTest> {
  const dossier = mkdtempSync(path.join(tmpdir(), 'canape-test-'));
  const env: Record<string, string> = {
    CANAPE_DONNEES: path.join(dossier, 'donnees'),
    CANAPE_FILMS: path.join(dossier, 'films'),
    CANAPE_CACHE: path.join(dossier, 'cache'),
    CANAPE_TELEVERSEMENTS: path.join(dossier, 'televersements'),
    CANAPE_TELECHARGEMENTS: path.join(dossier, 'telechargements'),
    CANAPE_URL_PUBLIQUE: ORIGINE_TEST,
    // Les essais ne dépendent jamais d'un Transmission présent sur le poste : WebTorrent, sauf demande contraire.
    CANAPE_TORRENT_MOTEUR: 'webtorrent',
    ...options.env,
  };
  const config = chargerConfig(env);
  let clientBuild: string | null = null;
  if (options.avecClient) {
    clientBuild = path.join(dossier, 'client');
    mkdirSync(path.join(clientBuild, '_app', 'immutable'), { recursive: true });
    writeFileSync(
      path.join(clientBuild, 'index.html'),
      '<!doctype html><html><head><title>Canapé</title></head><body><script>window.__canape = 1;</script><div id="app">Canapé test</div></body></html>',
    );
    writeFileSync(path.join(clientBuild, '_app', 'immutable', 'a.js'), 'export {};');
    writeFileSync(path.join(clientBuild, 'robots.txt'), 'User-agent: *');
  }
  const db = ouvrirBase(':memory:');
  migrer(db);
  const app = await creerApp(config, {
    db, journal: 'silent', ...(clientBuild ? { clientBuild } : { clientBuild: path.join(dossier, 'absent') }), ...options.app,
  });
  await options.avantPret?.(app);
  await app.ready();
  return {
    app, config, db, dossier, clientBuild,
    fermer: async () => {
      await app.close();
      db.close();
      rmSync(dossier, { recursive: true, force: true });
    },
  };
}

export interface OptionsUtilisateurTest {
  role?: Role;
  prenom?: string;
  identifiant?: string;
  /** Si absent : un hachage commun pour `MOT_DE_PASSE_TEST` (calculé une fois). */
  motDePasse?: string;
  peutTeleverser?: boolean;
  quotaOctets?: number | null;
  actif?: boolean;
  couleur?: string | null;
}

export interface UtilisateurTest {
  id: number;
  prenom: string;
  identifiant: string;
  role: Role;
  motDePasse: string;
  /** Jeton de session en clair. */
  jeton: string;
  /** `canape_session=<jeton>` : valeur de l'en-tête `cookie`. */
  cookie: string;
  /** En-têtes prêts à passer à `inject` (cookie + origin). */
  entetes: { cookie: string; origin: string };
}

let compteur = 0;
let hachageParDefaut: Promise<string> | null = null;

/** Insère directement un compte et une session ; rend le cookie. */
export async function creerUtilisateur(t: Pick<AppTest, 'db'> | { db: Base }, options: OptionsUtilisateurTest = {}): Promise<UtilisateurTest> {
  const n = ++compteur;
  const role = options.role ?? 'viewer';
  const motDePasse = options.motDePasse ?? MOT_DE_PASSE_TEST;
  const hachage = options.motDePasse === undefined
    ? await (hachageParDefaut ??= hasherMotDePasse(MOT_DE_PASSE_TEST))
    : await hasherMotDePasse(motDePasse);
  const prenom = options.prenom ?? `${role}${n}`;
  const identifiant = options.identifiant ?? `${prenom.toLowerCase()}-${n}`;
  const maintenant = new Date();
  const r = t.db.prepare(
    `INSERT INTO utilisateurs (prenom, identifiant, mot_de_passe, role, peut_televerser, quota_octets, actif, couleur, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    prenom, identifiant, hachage, role, options.peutTeleverser === false ? 0 : 1,
    options.quotaOctets === undefined ? null : options.quotaOctets, options.actif === false ? 0 : 1,
    options.couleur ?? null, maintenantIso(maintenant),
  );
  const id = Number(r.lastInsertRowid);
  const jeton = jetonAleatoire();
  t.db.prepare('INSERT INTO sessions (id, utilisateur_id, cree_le, expire_le, vu_le) VALUES (?, ?, ?, ?, ?)').run(
    sha256Hex(jeton), id, maintenantIso(maintenant), maintenantIso(new Date(maintenant.getTime() + 30 * 86_400_000)), maintenantIso(maintenant),
  );
  const cookie = `${COOKIE_SESSION}=${jeton}`;
  return { id, prenom, identifiant, role, motDePasse, jeton, cookie, entetes: { cookie, origin: ORIGINE_TEST } };
}

export type Corps = Record<string, unknown> | unknown[] | string | null;

/** Raccourci d'`inject` : cookie et `Origin` de l'utilisateur, corps JSON. */
export function requete(
  app: FastifyInstance,
  methode: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  options: { utilisateur?: Pick<UtilisateurTest, 'entetes'> | null; corps?: Corps; entetes?: Record<string, string> } = {},
): Promise<LightMyRequestResponse> {
  const init: InjectOptions = {
    method: methode,
    url,
    headers: { ...(options.utilisateur?.entetes ?? { origin: ORIGINE_TEST }), ...options.entetes },
  };
  if (options.corps !== undefined && options.corps !== null) init.payload = options.corps as InjectOptions['payload'];
  return app.inject(init);
}

export const get = (app: FastifyInstance, url: string, utilisateur?: UtilisateurTest | null) =>
  requete(app, 'GET', url, { utilisateur });
export const post = (app: FastifyInstance, url: string, corps?: Corps, utilisateur?: UtilisateurTest | null) =>
  requete(app, 'POST', url, { utilisateur, corps: corps ?? null });
export const patch = (app: FastifyInstance, url: string, corps: Corps, utilisateur?: UtilisateurTest | null) =>
  requete(app, 'PATCH', url, { utilisateur, corps });
export const supprimer = (app: FastifyInstance, url: string, utilisateur?: UtilisateurTest | null) =>
  requete(app, 'DELETE', url, { utilisateur });
