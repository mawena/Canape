// WebSocket de la salle : deux vrais clients sur un serveur réel (port libre).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { creerUtilisateur, type UtilisateurTest } from '../aides.ts';
import { connecter, creerEnv, insererFilm, inserer, type Env } from './aides-seances.ts';

async function refus(env: Env, id: string, u: UtilisateurTest | null, origine?: string | null): Promise<number> {
  try {
    const c = await connecter(env, id, u, origine);
    c.fermer();
    return 101;
  } catch (e) {
    return (e as { statut: number }).statut;
  }
}

describe('séances : WebSocket', () => {
  let env: Env;
  let hote: UtilisateurTest, invite: UtilisateurTest, etranger: UtilisateurTest;
  let film: string, film2: string, filmPrive: string;
  before(async () => {
    env = await creerEnv();
    hote = await creerUtilisateur(env, { prenom: 'Hana' });
    invite = await creerUtilisateur(env, { prenom: 'Ivan' });
    etranger = await creerUtilisateur(env, { prenom: 'Eli' });
    film = insererFilm(env, hote, { duree: 1000 });
    film2 = insererFilm(env, hote, { duree: 1000 });
    filmPrive = insererFilm(env, etranger);
  });
  after(() => env.fermer());

  const nouvelle = () => inserer(env, hote, film, [invite]);

  test('accès refusé avant la poignée de main', async () => {
    const id = nouvelle();
    assert.equal(await refus(env, id, null), 401);
    assert.equal(await refus(env, id, etranger), 404);
    assert.equal(await refus(env, 'zzzzzzzzzzzz', hote), 404);
    assert.equal(await refus(env, id, hote, 'http://evil.example'), 403);
    assert.equal(await refus(env, id, hote, null), 403);
    assert.equal(await refus(env, id, invite), 101);
  });

  test('bienvenue, arrivée, départ avec pause automatique', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const bienvenueA = a.recus[0] as Extract<(typeof a.recus)[number], { t: 'bienvenue' }>;
    assert.equal(bienvenueA.moi.utilisateur.prenom, 'Hana');
    assert.equal(bienvenueA.etat.filmId, film);
    assert.deepEqual(bienvenueA.participants, []);
    const b = await connecter(env, id, invite);
    const arrivee = await a.attendre('arrivee');
    assert.equal(arrivee.participant.utilisateur.prenom, 'Ivan');
    const bienvenueB = b.recus[0] as Extract<(typeof b.recus)[number], { t: 'bienvenue' }>;
    assert.equal(bienvenueB.participants.length, 1);

    a.envoyer({ t: 'lecture', position: 10 });
    const etat = await b.attendre('etat', (m) => m.raison === 'lecture');
    assert.equal(etat.etat.lecture, true);
    assert.equal(etat.par, bienvenueA.moi.cid);
    assert.equal(await a.attendre('etat', (m) => m.raison === 'lecture').then(() => true), true);

    b.fermer();
    const depart = await a.attendre('etat', (m) => m.raison === 'depart');
    assert.equal(depart.etat.lecture, false);
    assert.equal(depart.par, 'Ivan');
    await a.attendre('depart');
    a.fermer();
  });

  test('ping/pong, pause, aller, état partagé', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'ping', c: 42 });
    const pong = await a.attendre('pong');
    assert.equal(pong.c, 42);
    assert.ok(pong.s > 0);
    a.envoyer({ t: 'aller', position: 120 });
    assert.equal((await b.attendre('etat', (m) => m.raison === 'aller')).etat.position, 120);
    b.envoyer({ t: 'lecture', position: 120 });
    await a.attendre('etat', (m) => m.raison === 'lecture');
    b.envoyer({ t: 'pause', position: 130 });
    const p = await a.attendre('etat', (m) => m.raison === 'pause');
    assert.equal(p.etat.lecture, false);
    assert.equal(p.etat.position, 130);
    a.fermer(); b.fermer();
  });

  test('attente mutuelle (tampon) et « ne plus attendre »', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    const cidB = (b.recus[0] as { moi: { cid: string } }).moi.cid;
    a.envoyer({ t: 'lecture', position: 0 });
    await b.attendre('etat', (m) => m.raison === 'lecture');
    b.envoyer({ t: 'tampon', enCours: true });
    const att = await a.attendre('etat', (m) => m.raison === 'tampon');
    assert.deepEqual(att.etat.attente, [cidB]);
    assert.equal(att.etat.lecture, false);
    b.envoyer({ t: 'tampon', enCours: false });
    const rep = await a.attendre('etat', (m) => m.raison === 'reprise');
    assert.equal(rep.etat.lecture, true);
    // ne plus attendre
    b.envoyer({ t: 'tampon', enCours: true });
    await a.attendre('etat', (m) => m.raison === 'tampon');
    a.envoyer({ t: 'ignorer_attente', cid: cidB });
    const ig = await b.attendre('etat', (m) => m.raison === 'reprise');
    assert.equal(ig.etat.lecture, true);
    assert.deepEqual(ig.etat.attente, []);
    a.fermer(); b.fermer();
  });

  test('changement de film : droit vérifié, pause à 0', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'lecture', position: 50 });
    await b.attendre('etat', (m) => m.raison === 'lecture');
    b.envoyer({ t: 'film', filmId: filmPrive });
    assert.equal((await b.attendre('erreur')).code, 'film_inconnu');
    a.envoyer({ t: 'film', filmId: 'inexistant' });
    assert.equal((await a.attendre('erreur')).code, 'film_inconnu');
    a.envoyer({ t: 'film', filmId: film2 });
    const e = await b.attendre('etat', (m) => m.raison === 'film');
    assert.deepEqual([e.etat.filmId, e.etat.lecture, e.etat.position], [film2, false, 0]);
    assert.equal(env.db.prepare('SELECT film_id FROM seances WHERE id = ?').get(id)?.['film_id'], film2);
    a.fermer(); b.fermer();
  });

  test('changement de piste audio et de sous-titres : pause à la même position', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'aller', position: 75 });
    await b.attendre('etat', (m) => m.raison === 'aller');
    a.envoyer({ t: 'audio', piste: 2 });
    const e = await b.attendre('etat', (m) => m.raison === 'audio');
    assert.equal(e.etat.pisteAudio, 2);
    assert.equal(e.etat.lecture, false);
    assert.equal(e.etat.position, 75);
    a.envoyer({ t: 'audio', piste: -1 });
    assert.equal((await a.attendre('erreur')).code, 'piste_invalide');
    b.envoyer({ t: 'sous_titres', cle: 'e3' });
    assert.equal((await a.attendre('etat', (m) => m.raison === 'sous_titres')).etat.sousTitres, 'e3');
    b.envoyer({ t: 'sous_titres', cle: '../x' });
    assert.equal((await b.attendre('erreur')).code, 'piste_invalide');
    a.fermer(); b.fermer();
    await new Promise((r) => setTimeout(r, 100));
    const ligne = env.db.prepare('SELECT piste_audio, sous_titres, position FROM seances WHERE id = ?').get(id);
    assert.equal(ligne?.['piste_audio'], 2);
    assert.equal(ligne?.['sous_titres'], 'e3');
  });

  test('compte à rebours : lecture 3 s plus tard, annulable par une pause', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'compte_a_rebours' });
    const debut = Date.now();
    const e = await b.attendre('etat', (m) => m.raison === 'compte_a_rebours' && m.par !== null);
    assert.equal(e.etat.compteARebours, 3);
    assert.equal(e.etat.lecture, false);
    const fin = await b.attendre('etat', (m) => m.raison === 'compte_a_rebours' && m.par === null, 4500);
    assert.equal(fin.etat.lecture, true);
    assert.ok(Date.now() - debut >= 2800);
    // annulé par une pause
    a.envoyer({ t: 'pause', position: 9 });
    await b.attendre('etat', (m) => m.raison === 'pause');
    a.envoyer({ t: 'compte_a_rebours' });
    await b.attendre('etat', (m) => m.raison === 'compte_a_rebours' && m.par !== null);
    b.envoyer({ t: 'pause', position: 9 });
    await a.attendre('etat', (m) => m.raison === 'pause');
    await new Promise((r) => setTimeout(r, 300));
    const avant = a.recus.length;
    await new Promise((r) => setTimeout(r, 3400));
    assert.equal(a.recus.slice(avant).some((m) => m.t === 'etat'), false);
    a.fermer(); b.fermer();
  });

  test('réactions : liste fermée et débit limité', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    const cidA = (a.recus[0] as { moi: { cid: string } }).moi.cid;
    a.envoyer({ t: 'reaction', emoji: '😂' });
    const r = await b.attendre('reaction');
    assert.equal(r.cid, cidA);
    assert.equal(r.emoji, '😂');
    a.envoyer({ t: 'reaction', emoji: '💩' });
    assert.equal((await a.attendre('erreur')).code, 'message_invalide');
    for (let i = 0; i < 12; i++) a.envoyer({ t: 'reaction', emoji: '❤️' });
    assert.equal((await a.attendre('erreur', (m) => m.code === 'trop_vite')).code, 'trop_vite');
    a.fermer(); b.fermer();
  });

  test('messages : enregistré, diffusé, trop long refusé, vide refusé, débit', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'message', texte: '  Salut !  ' });
    const m = await b.attendre('message');
    assert.equal(m.message.texte, 'Salut !');
    assert.equal(m.message.prenom, 'Hana');
    await a.attendre('message');
    a.envoyer({ t: 'message', texte: 'x'.repeat(501) });
    assert.equal((await a.attendre('erreur')).code, 'texte_trop_long');
    a.envoyer({ t: 'message', texte: '   ' });
    assert.equal((await a.attendre('erreur', (e) => e.code === 'texte_invalide')).code, 'texte_invalide');
    a.envoyer({ t: 'message', texte: 'x'.repeat(500) });
    await b.attendre('message', (x) => x.message.texte.length === 500);
    assert.equal((env.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE seance_id = ?').get(id) as { n: number }).n, 2);
    // un nouvel arrivant reçoit l'historique
    const c = await connecter(env, id, hote);
    assert.equal((c.recus[0] as { messages: unknown[] }).messages.length, 2);
    a.fermer(); b.fermer(); c.fermer();
  });

  test('signal : relayé au seul destinataire', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    const c = await connecter(env, id, hote);
    const cidB = (b.recus[0] as { moi: { cid: string } }).moi.cid;
    const cidA = (a.recus[0] as { moi: { cid: string } }).moi.cid;
    a.envoyer({ t: 'signal', a: cidB, donnees: { type: 'offer', sdp: 'v=0' } });
    const s = await b.attendre('signal');
    assert.equal(s.de, cidA);
    assert.deepEqual(s.donnees, { type: 'offer', sdp: 'v=0' });
    assert.equal(await c.aucun('signal'), true);
    a.envoyer({ t: 'signal', a: 'inconnu', donnees: {} });
    assert.equal((await a.attendre('erreur')).code, 'destinataire_inconnu');
    a.fermer(); b.fermer(); c.fermer();
  });

  test('media diffusé aux autres, sans écho', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    const b = await connecter(env, id, invite);
    a.envoyer({ t: 'media', micro: true, camera: false });
    const m = await b.attendre('media');
    assert.deepEqual([m.micro, m.camera], [true, false]);
    assert.equal(await a.aucun('media'), true);
    a.fermer(); b.fermer();
  });

  test('messages invalides : JSON, type inconnu, taille', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    a.ws.send('pas du json');
    assert.equal((await a.attendre('erreur')).code, 'message_invalide');
    a.envoyer({ t: 'bizarre' });
    assert.equal((await a.attendre('erreur')).code, 'type_inconnu');
    a.ws.send(JSON.stringify({ t: 'message', texte: 'x'.repeat(70_000) }));
    assert.equal(await a.fermeture, 1009);
  });

  test('progression : reprise, terminé au-delà de 95 %, position de la séance', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    a.envoyer({ t: 'progression', position: 300 });
    await new Promise((r) => setTimeout(r, 150));
    const p = () => env.db.prepare('SELECT position, duree, termine, seance_id FROM progression WHERE utilisateur_id = ? AND film_id = ?').get(hote.id, film);
    assert.equal(p()?.['position'], 300);
    assert.equal(p()?.['termine'], 0);
    assert.equal(p()?.['seance_id'], id);
    a.envoyer({ t: 'progression', position: 960 });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(p()?.['termine'], 1);
    a.fermer();
  });

  test('9e connexion refusée (503 avant la poignée de main)', async () => {
    const id = nouvelle();
    const clients = [];
    for (let i = 0; i < 8; i++) clients.push(await connecter(env, id, i % 2 ? invite : hote));
    assert.equal(await refus(env, id, hote), 503);
    clients[0]?.fermer();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await refus(env, id, hote), 101);
    for (const c of clients) c.fermer();
  });

  test('lien retiré, séance supprimée : connexions fermées', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    env.db.prepare('DELETE FROM seances WHERE id = ?').run(id);
    a.fermer();
    assert.equal(await refus(env, id, hote), 404);
  });

  test('film supprimé : état remis à zéro pour la salle ouverte', async () => {
    const f = insererFilm(env, hote);
    const id = inserer(env, hote, f, [invite]);
    const a = await connecter(env, id, hote);
    a.envoyer({ t: 'lecture', position: 5 });
    await a.attendre('etat', (m) => m.raison === 'lecture');
    env.faux.supprimer(f);
    const e = await a.attendre('etat', (m) => m.raison === 'film');
    assert.equal(e.par, null);
    assert.equal(e.etat.filmId, null);
    assert.equal(e.etat.lecture, false);
    a.fermer();
  });

  test('reprise d\'une séance : l\'état est conservé après la fermeture de la salle', async () => {
    const id = nouvelle();
    const a = await connecter(env, id, hote);
    a.envoyer({ t: 'aller', position: 222 });
    await a.attendre('etat', (m) => m.raison === 'aller');
    a.fermer();
    await new Promise((r) => setTimeout(r, 150));
    const b = await connecter(env, id, invite);
    assert.equal((b.recus[0] as { etat: { position: number } }).etat.position, 222);
    b.fermer();
  });
});
