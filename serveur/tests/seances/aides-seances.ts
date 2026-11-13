// Aides des tests de séances : faux service médiathèque, clients WebSocket réels, films et séances directement en base.
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import type { MessageClient, MessageServeur } from '@canape/partage';
import type { FilmService, RegleAcces, ServiceMediatheque } from '../../src/commun/services.ts';
import type { UtilisateurConnecte } from '../../src/commun/auth.ts';
import { idBase32 } from '../../src/commun/identifiants.ts';
import { creerAppTest, ORIGINE_TEST, type AppTest, type UtilisateurTest } from '../aides.ts';

// `ws` n'est pas déclaré dans les dépendances typées : chargé sans types.
const { WebSocket: ClientWs } = createRequire(import.meta.url)('ws') as { WebSocket: new (url: string, options?: unknown) => any };

export interface Faux {
  service: ServiceMediatheque;
  supprimer(filmId: string): void;
}

/** Faux `app.mediatheque` : lit la table `films`, règles d'accès et rappels comme le vrai service. */
export function fauxMediatheque(app: FastifyInstance): Faux {
  const regles: RegleAcces[] = [];
  const abonnesSupprime: Array<(id: string) => void> = [];
  const obtenir = (id: string): FilmService | null => {
    const l = app.db.prepare('SELECT * FROM films WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!l) return null;
    return {
      id: l.id, proprietaireId: l.proprietaire_id, titre: l.titre, annee: l.annee, duree: l.duree, fichier: l.fichier,
      cheminAbsolu: `/x/${l.fichier}`, visibilite: l.visibilite, etat: l.etat, analyse: null,
    };
  };
  const service: ServiceMediatheque = {
    obtenir,
    peutVoir(u: UtilisateurConnecte, id: string) {
      const f = obtenir(id);
      if (!f) return false;
      if (u.role === 'admin' || f.proprietaireId === u.id || f.visibilite === 'tous') return true;
      if (app.db.prepare('SELECT 1 AS x FROM films_partages WHERE film_id = ? AND utilisateur_id = ?').get(id, u.id)) return true;
      return regles.some((r) => r(u, id));
    },
    peutModifier: (u, id) => u.role === 'admin' || obtenir(id)?.proprietaireId === u.id,
    ajouterRegleAcces: (r) => { regles.push(r); },
    surFilmPret: () => {},
    surFilmSupprime: (cb) => { abonnesSupprime.push(cb); },
  };
  return {
    service,
    supprimer(filmId) {
      app.db.prepare('DELETE FROM films WHERE id = ?').run(filmId);
      for (const cb of abonnesSupprime) cb(filmId);
    },
  };
}

export interface Env extends AppTest {
  faux: Faux;
  port: number;
}

export async function creerEnv(env: Record<string, string> = {}): Promise<Env> {
  let faux!: Faux;
  const t = await creerAppTest({
    env,
    avantPret: (app) => {
      faux = fauxMediatheque(app);
      // La vraie médiathèque est déjà enregistrée par creerApp : on la remplace par le faux service.
      app.mediatheque = faux.service;
    },
  });
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (t.app.server.address() as { port: number }).port;
  return {
    ...t, faux, port,
    fermer: async () => { await t.fermer(); },
  };
}

let nFilm = 0;
export function insererFilm(t: AppTest, proprietaire: UtilisateurTest, options: { visibilite?: 'prive' | 'partage' | 'tous'; duree?: number; etat?: 'pret' | 'analyse' } = {}): string {
  const id = `film${++nFilm}`;
  t.db.prepare(
    `INSERT INTO films (id, proprietaire_id, titre, fichier, nom_origine, taille, duree, etat, visibilite, ajoute_le)
     VALUES (?, ?, ?, ?, ?, 1000, ?, ?, ?, '2026-01-01T00:00:00.000Z')`,
  ).run(id, proprietaire.id, `Film ${nFilm}`, `${id}/original.mkv`, 'f.mkv', options.duree ?? 6000, options.etat ?? 'pret', options.visibilite ?? 'prive');
  return id;
}

export interface Client {
  ws: any;
  recus: MessageServeur[];
  fermeture: Promise<number>;
  envoyer(m: MessageClient | Record<string, unknown>): void;
  attendre<T extends MessageServeur['t']>(t: T, filtre?: (m: Extract<MessageServeur, { t: T }>) => boolean, ms?: number): Promise<Extract<MessageServeur, { t: T }>>;
  aucun(t: MessageServeur['t'], ms?: number): Promise<boolean>;
  fermer(): void;
}

/** Ouvre un vrai WebSocket ; rejette avec `{ statut }` si le serveur refuse avant la poignée de main. */
export function connecter(env: Env, seanceId: string, u: UtilisateurTest | null, origine: string | null = ORIGINE_TEST): Promise<Client> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (u) headers['cookie'] = u.cookie;
    if (origine) headers['origin'] = origine;
    const ws = new ClientWs(`ws://127.0.0.1:${env.port}/ws/seances/${seanceId}`, { headers });
    const recus: MessageServeur[] = [];
    const lus = new Set<MessageServeur>();
    let ferme: (c: number) => void;
    const fermeture = new Promise<number>((r) => { ferme = r; });
    ws.on('message', (d: Buffer) => { recus.push(JSON.parse(d.toString('utf8')) as MessageServeur); });
    ws.on('close', (code: number) => ferme(code));
    ws.on('unexpected-response', (_req: unknown, res: { statusCode: number }) => reject({ statut: res.statusCode }));
    ws.on('error', () => { /* géré par unexpected-response / close */ });
    const attendre: Client['attendre'] = (t, filtre, ms = 2500) => new Promise((res, rej) => {
      const debut = Date.now();
      const boucle = () => {
        const m = recus.find((x) => !lus.has(x) && x.t === t && (!filtre || filtre(x as never)));
        if (m) { lus.add(m); res(m as never); return; }
        if (Date.now() - debut > ms) { rej(new Error(`message « ${t} » non reçu (reçus : ${recus.map((x) => x.t).join(',')})`)); return; }
        setTimeout(boucle, 10);
      };
      boucle();
    });
    const client: Client = {
      ws, recus, fermeture,
      envoyer: (m) => ws.send(JSON.stringify(m)),
      attendre,
      aucun: async (t, ms = 300) => {
        await new Promise((r) => setTimeout(r, ms));
        return !recus.some((x) => !lus.has(x) && x.t === t);
      },
      fermer: () => ws.close(),
    };
    ws.on('open', () => attendre('bienvenue').then(() => resolve(client), reject));
  });
}

/** Séance directement en base, avec son programme (le film en cours au rang 0, puis `suite`). */
export function inserer(t: AppTest, hote: UtilisateurTest, filmId: string | null, invites: UtilisateurTest[] = [], suite: string[] = []): string {
  const id = idBase32();
  t.db.prepare('INSERT INTO seances (id, hote_id, film_id, position, cree_le) VALUES (?, ?, ?, 0, ?)').run(id, hote.id, filmId, new Date().toISOString());
  [...(filmId ? [filmId] : []), ...suite].forEach((f, i) => t.db.prepare('INSERT INTO seances_programme (seance_id, rang, film_id) VALUES (?, ?, ?)').run(id, i, f));
  for (const i of invites) t.db.prepare('INSERT INTO seances_participants (seance_id, utilisateur_id) VALUES (?, ?)').run(id, i.id);
  return id;
}
