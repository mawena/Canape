// Soirée à plusieurs films : entracte et enchaînement (logique pure de la salle, puis salle réelle en WebSocket).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ENTRACTE_MAX_SECONDES, LIMITES_WS } from '@canape/partage';
import { Salle } from '../../src/modules/seances/salle.ts';
import { creerUtilisateur, type UtilisateurTest } from '../aides.ts';
import { connecter, creerEnv, insererFilm, inserer, type Env } from './aides-seances.ts';

const u = (id: number, prenom: string) => ({ id, prenom, couleur: null });

function salle() {
  let t = 1_000_000;
  const s = new Salle({ filmId: 'f1', position: 0, pisteAudio: null, sousTitres: null }, () => t);
  s.ajouter('a', u(1, 'Ana'));
  s.ajouter('b', u(2, 'Ben'));
  return { s, avancer: (ms: number) => { t += ms; }, maintenant: () => t };
}

describe('soirée : salle (logique pure)', () => {
  test('la fin d\'un film avec un film suivant ouvre un entracte à heure fixe', () => {
    const { s, maintenant } = salle();
    s.lire('a', 5990);
    assert.equal(s.pause('a', 6000, true, 300_000), 'entracte');
    const e = s.instantane();
    assert.equal(e.entracteFin, maintenant() + 300_000);
    assert.equal(e.lecture, false);
    assert.equal(e.position, 6000);
    assert.equal(s.enEntracte, true);
  });

  test('sans film suivant, la fin du film reste la fin de la séance', () => {
    const { s } = salle();
    assert.equal(s.pause('a', 6000, true, null), 'fin');
    assert.equal(s.instantane().entracteFin, null);
  });

  test('pendant l\'entracte, plus rien ne bouge le film fini ; une deuxième fin est ignorée', () => {
    const { s, avancer } = salle();
    s.pause('a', 6000, true, 300_000);
    const fin = s.instantane().entracteFin;
    avancer(1000);
    assert.equal(s.pause('b', 6000, true, 300_000), null);
    assert.equal(s.lire('a', 0), null);
    assert.equal(s.aller('a', 10), null);
    assert.equal(s.audio('a', 1), null);
    assert.equal(s.sousTitresChoix('a', 'p1'), null);
    assert.equal(s.demarrerCompteARebours('a'), null);
    assert.equal(s.instantane().entracteFin, fin);
    assert.equal(s.instantane().position, 6000);
  });

  test('« +5 min » rallonge l\'entracte, sans dépasser le plafond', () => {
    const { s, maintenant } = salle();
    assert.equal(s.prolongerEntracte(300_000), null, 'pas d\'entracte : rien à rallonger');
    s.pause('a', 6000, true, 300_000);
    assert.equal(s.prolongerEntracte(300_000), 'entracte');
    assert.equal(s.instantane().entracteFin, maintenant() + 600_000);
    for (let i = 0; i < 30; i++) s.prolongerEntracte(300_000);
    assert.equal(s.instantane().entracteFin, maintenant() + ENTRACTE_MAX_SECONDES * 1000);
  });

  test('passer au film suivant : tout le monde au début, sans pistes, compte à rebours pour la reprise', () => {
    const { s } = salle();
    s.lire('a', 10); s.audio('a', 2); s.sousTitresChoix('a', 'p1');
    s.pause('a', 6000, true, 300_000);
    assert.equal(s.enchainer('f2', true), 'film');
    const e = s.instantane();
    assert.deepEqual([e.filmId, e.lecture, e.position, e.pisteAudio, e.sousTitres, e.entracteFin], ['f2', false, 0, null, null, null]);
    assert.equal(e.compteARebours, LIMITES_WS.compteARebours);
    assert.equal(s.compteEnCours, true);
  });

  test('sans compte à rebours (salle vide), le film suivant attend simplement', () => {
    const { s } = salle();
    s.pause('a', 6000, true, 300_000);
    s.enchainer('f2', false);
    assert.equal(s.instantane().compteARebours, null);
    assert.equal(s.instantane().filmId, 'f2');
  });

  test('l\'entracte finit en fin de séance si plus aucun film ne suit', () => {
    const { s } = salle();
    s.pause('a', 6000, true, 300_000);
    assert.equal(s.finirEntracte(), 'fin');
    assert.equal(s.instantane().entracteFin, null);
    assert.equal(s.finirEntracte(), null);
  });

  test('changer de film à la main annule l\'entracte', () => {
    const { s } = salle();
    s.pause('a', 6000, true, 300_000);
    s.film('a', 'f3');
    assert.equal(s.instantane().entracteFin, null);
    assert.equal(s.instantane().filmId, 'f3');
  });
});

describe('soirée : salle réelle (entracte de 1 s)', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest;
  let f1: string, f2: string;
  before(async () => {
    env = await creerEnv({ CANAPE_ENTRACTE_SECONDES: '1' });
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    f1 = insererFilm(env, hote, { duree: 1000 });
    f2 = insererFilm(env, hote, { duree: 1000, visibilite: 'prive' });
  });
  after(() => env.fermer());

  test('fin du premier film : entracte chez tous, puis le second film pour tous, puis fin de séance normale', async () => {
    const id = inserer(env, hote, f1, [invite], [f2]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'lecture', position: 990 });
    await b.attendre('etat', (m) => m.raison === 'lecture');
    b.envoyer({ t: 'pause', position: 1000, fin: true });
    const ea = await a.attendre('etat', (m) => m.raison === 'entracte');
    const eb = await b.attendre('etat', (m) => m.raison === 'entracte');
    assert.equal(ea.etat.entracteFin, eb.etat.entracteFin);
    assert.ok(ea.etat.entracteFin !== null && ea.etat.entracteFin - ea.etat.serveur <= 1000);
    assert.equal(ea.etat.filmId, f1);
    // Chacun envoie la fin : la deuxième est ignorée, l'entracte ne change pas.
    await a.attendre('etat', (m) => m.raison === 'lecture');
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    assert.equal(await a.aucun('etat', 200), true);
    // Une arrivée en cours d'entracte voit la même heure de fin.
    const tard = await connecter(env, id, hote);
    const bienvenue = tard.recus[0] as Extract<(typeof tard.recus)[number], { t: 'bienvenue' }>;
    assert.equal(bienvenue.etat.entracteFin, ea.etat.entracteFin);
    tard.fermer();
    // Chaque personne présente a vu le film : il est dans son historique.
    const vus = env.db.prepare('SELECT utilisateur_id FROM progression WHERE film_id = ? AND termine = 1').all(f1);
    assert.equal(vus.length, 2);

    const suivant = await a.attendre('etat', (m) => m.raison === 'film', 4000);
    assert.equal(suivant.par, null);
    assert.deepEqual([suivant.etat.filmId, suivant.etat.position, suivant.etat.lecture, suivant.etat.entracteFin], [f2, 0, false, null]);
    assert.equal(suivant.etat.compteARebours, LIMITES_WS.compteARebours);
    const prog = await b.attendre('programme');
    assert.equal(prog.rangCourant, 1);
    assert.deepEqual(prog.programme.map((p) => p.filmId), [f1, f2]);
    const l = env.db.prepare('SELECT film_id, rang_courant FROM seances WHERE id = ?').get(id) as { film_id: string; rang_courant: number };
    assert.deepEqual([l.film_id, l.rang_courant], [f2, 1]);

    // La lecture repart avec le compte à rebours.
    const lance = await b.attendre('etat', (m) => m.raison === 'compte_a_rebours' && m.par === null, 5000);
    assert.equal(lance.etat.lecture, true);

    // Dernier film : fin de séance, comme avant.
    b.envoyer({ t: 'pause', position: 1000, fin: true });
    const fin = await a.attendre('etat', (m) => m.raison === 'fin');
    assert.equal(fin.etat.entracteFin, null);
    a.fermer(); b.fermer();
  });

  test('tout le monde parti pendant l\'entracte : la séance garde le film suivant', async () => {
    const id = inserer(env, hote, f1, [], [f2]);
    const a = await connecter(env, id, hote);
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    await a.attendre('etat', (m) => m.raison === 'entracte');
    a.fermer();
    await a.fermeture;
    await new Promise((r) => setTimeout(r, 200));
    const l = env.db.prepare('SELECT film_id, rang_courant, position FROM seances WHERE id = ?').get(id) as { film_id: string; rang_courant: number; position: number };
    assert.deepEqual([l.film_id, l.rang_courant, l.position], [f2, 1, 0]);
  });
});

describe('soirée : actions de l\'hôte (entracte long)', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest;
  let f1: string, f2: string, f3: string;
  before(async () => {
    env = await creerEnv({ CANAPE_ENTRACTE_SECONDES: '60' });
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    f1 = insererFilm(env, hote, { duree: 1000 });
    f2 = insererFilm(env, hote, { duree: 1000 });
    f3 = insererFilm(env, hote, { duree: 1000 });
  });
  after(() => env.fermer());

  test('« +5 min » et « Lancer maintenant » : l\'hôte seulement', async () => {
    const id = inserer(env, hote, f1, [invite], [f2]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    const debut = await b.attendre('etat', (m) => m.raison === 'entracte');
    assert.ok(debut.etat.entracteFin !== null && debut.etat.entracteFin - debut.etat.serveur > 55_000);

    b.envoyer({ t: 'entracte_lancer' });
    assert.equal((await b.attendre('erreur')).code, 'interdit');
    b.envoyer({ t: 'entracte_prolonger' });
    assert.equal((await b.attendre('erreur')).code, 'interdit');
    b.envoyer({ t: 'film_suivant' });
    assert.equal((await b.attendre('erreur')).code, 'interdit');

    a.envoyer({ t: 'entracte_prolonger' });
    const plus = await b.attendre('etat', (m) => m.raison === 'entracte');
    assert.equal(plus.etat.entracteFin! - debut.etat.entracteFin!, 60_000);

    a.envoyer({ t: 'entracte_lancer' });
    const film = await b.attendre('etat', (m) => m.raison === 'film');
    assert.equal(film.etat.filmId, f2);
    assert.equal(film.etat.entracteFin, null);
    a.fermer(); b.fermer();
  });

  test('« Passer au film suivant » en plein film ; sans film suivant : refus clair', async () => {
    const id = inserer(env, hote, f1, [invite], [f2, f3]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'lecture', position: 100 });
    await b.attendre('etat', (m) => m.raison === 'lecture');
    a.envoyer({ t: 'film_suivant' });
    const e = await b.attendre('etat', (m) => m.raison === 'film');
    assert.deepEqual([e.etat.filmId, e.etat.position, e.etat.lecture], [f2, 0, false]);
    assert.equal(e.par, (a.recus[0] as { moi: { cid: string } }).moi.cid);
    // « Lancer maintenant » hors entracte ne fait rien.
    a.envoyer({ t: 'entracte_lancer' });
    assert.equal(await b.aucun('etat', 200), true);
    a.envoyer({ t: 'film_suivant' });
    assert.equal((await b.attendre('etat', (m) => m.raison === 'film')).etat.filmId, f3);
    a.envoyer({ t: 'film_suivant' });
    assert.equal((await a.attendre('erreur')).code, 'film_inconnu');
    a.fermer(); b.fermer();
  });

  test('programme modifié par l\'hôte : la salle le reçoit, et la fin du film en tient compte', async () => {
    const id = inserer(env, hote, f1, [invite]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    // Sans film suivant : la fin du film est la fin de séance.
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    assert.equal((await b.attendre('etat', (m) => m.raison === 'fin')).etat.entracteFin, null);
    // L'hôte ajoute un film : le programme est rediffusé.
    const { put } = await import('../aides.ts');
    const r = await put(env.app, `/api/seances/${id}/programme`, { filmIds: [f2] }, hote);
    assert.equal(r.statusCode, 200);
    const prog = await b.attendre('programme');
    assert.deepEqual(prog.programme.map((p) => p.filmId), [f1, f2]);
    a.envoyer({ t: 'film', filmId: f1 });
    await b.attendre('etat', (m) => m.raison === 'film');
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    assert.ok((await b.attendre('etat', (m) => m.raison === 'entracte')).etat.entracteFin !== null);
    // L'hôte retire le film pendant l'entracte : « Lancer maintenant » termine la séance.
    await put(env.app, `/api/seances/${id}/programme`, { filmIds: [] }, hote);
    a.envoyer({ t: 'entracte_lancer' });
    assert.equal((await b.attendre('etat', (m) => m.raison === 'fin')).etat.entracteFin, null);
    a.fermer(); b.fermer();
  });
});

describe('programme ajouté à une séance d\'un seul film', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest;
  let f1: string, f2: string, f3: string;
  before(async () => {
    env = await creerEnv({ CANAPE_ENTRACTE_SECONDES: '60' });
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    f1 = insererFilm(env, hote, { duree: 1000 });
    f2 = insererFilm(env, hote, { duree: 1000 });
    f3 = insererFilm(env, hote, { duree: 1000 });
  });
  after(() => env.fermer());

  test('pendant la lecture du premier film : le film ajouté est diffusé, puis l\'entracte s\'enclenche et le film suivant se lance', async () => {
    const { put } = await import('../aides.ts');
    const id = inserer(env, hote, f1, [invite]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'lecture', position: 100 });
    await b.attendre('etat', (m) => m.raison === 'lecture');
    const r = await put(env.app, `/api/seances/${id}/programme`, { filmIds: [f2] }, hote);
    assert.equal(r.statusCode, 200);
    const prog = await b.attendre('programme');
    assert.deepEqual([prog.programme.map((p) => p.filmId), prog.rangCourant], [[f1, f2], 0]);
    // Le film continue de jouer : l'ajout ne le touche pas.
    assert.equal(await b.aucun('etat', 200), true);
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    const entracte = await b.attendre('etat', (m) => m.raison === 'entracte');
    assert.equal(entracte.etat.filmId, f1);
    a.envoyer({ t: 'entracte_lancer' });
    const film = await b.attendre('etat', (m) => m.raison === 'film');
    assert.deepEqual([film.etat.filmId, film.etat.entracteFin], [f2, null]);
    a.fermer(); b.fermer();
  });

  test('dernier film du programme déjà en cours : en ajouter un fait apparaître un film suivant', async () => {
    const { put } = await import('../aides.ts');
    const id = inserer(env, hote, f1, [invite], [f2]);
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'film_suivant' });
    await b.attendre('etat', (m) => m.raison === 'film');
    // Plus de film suivant : « Passer au film suivant » est refusé.
    a.envoyer({ t: 'film_suivant' });
    assert.equal((await a.attendre('erreur')).code, 'film_inconnu');
    const r = await put(env.app, `/api/seances/${id}/programme`, { filmIds: [f3] }, hote);
    assert.equal(r.statusCode, 200);
    const prog = await b.attendre('programme', (m) => m.programme.length === 3);
    assert.deepEqual([prog.programme.map((p) => p.filmId), prog.rangCourant], [[f1, f2, f3], 1]);
    // La fin du film en cours ouvre maintenant un entracte au lieu de terminer la séance.
    a.envoyer({ t: 'pause', position: 1000, fin: true });
    assert.ok((await b.attendre('etat', (m) => m.raison === 'entracte')).etat.entracteFin !== null);
    a.fermer(); b.fermer();
  });

  test('seul l\'hôte ajoute des films ; l\'invité reçoit un refus', async () => {
    const { put } = await import('../aides.ts');
    const id = inserer(env, hote, f1, [invite]);
    const r = await put(env.app, `/api/seances/${id}/programme`, { filmIds: [f2] }, invite);
    assert.equal(r.statusCode, 403);
    const l = env.db.prepare('SELECT COUNT(*) AS n FROM seances_programme WHERE seance_id = ?').get(id) as { n: number };
    assert.equal(l.n, 1);
  });
});
