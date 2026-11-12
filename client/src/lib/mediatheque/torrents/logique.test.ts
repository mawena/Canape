import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Telechargement } from '@canape/partage';
import { choixValide, detailChiffres, detailPartage, doitRafraichir, enAttentePlace, erreurFichierTorrent, erreurMagnet, estEnPartage, estPrive, formaterRatio, libelleEtat, messageAjout, messageTrackerAffiche, metadonneesLongues, nomAffiche, nouvellementTermines, repartir, resumePanneau, suivreInactivite, totalChoisi } from './logique.ts';

const sp = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');
const t = (p: Partial<Telechargement> = {}): Telechargement => ({
  id: 'a', proprietaireId: 1, proprietairePrenom: 'Lou', nom: 'Film', infoHash: 'x', etat: 'telechargement', progression: 0.5,
  octetsRecus: 500_000_000, octetsTotal: 1_000_000_000, debit: 4_100_000, debitEnvoi: 0, pairs: 12, resteSecondes: 120,
  fichiers: [], filmIds: [], erreur: null, prive: false, enPartage: false, ratio: null, messageTracker: null, moteur: 'transmission', creeLe: '', termineLe: null, ...p,
});

test('validation du lien magnet', () => {
  const h = 'c12fe1c06bba254a9dc9f519b335aa7c1367a88a';
  assert.equal(erreurMagnet(`magnet:?xt=urn:btih:${h}&dn=Film`), null);
  assert.equal(erreurMagnet(` magnet:?dn=Film&xt=urn:btih:${h} `), null);
  assert.equal(erreurMagnet('magnet:?xt=urn:btih:' + 'A'.repeat(32)), null);
  assert.match(erreurMagnet('')!, /Colle/);
  assert.match(erreurMagnet('https://exemple.fr')!, /magnet:\?/);
  assert.match(erreurMagnet('magnet:?dn=Film')!, /incomplet/);
  assert.match(erreurMagnet('magnet:?xt=urn:btih:zzz')!, /illisible/);
});

test('fichier .torrent', () => {
  assert.equal(erreurFichierTorrent('a.torrent', 5000), null);
  assert.match(erreurFichierTorrent('a.mkv', 5000)!, /torrent/);
  assert.match(erreurFichierTorrent('a.torrent', 2 * 1024 * 1024)!, /1 Mo/);
  assert.match(erreurFichierTorrent('a.torrent', 0)!, /vide/);
});

test('états en clair', () => {
  assert.equal(nomAffiche({ nom: null }), 'Récupération des informations…');
  assert.equal(libelleEtat(t({ etat: 'import' })), 'Ajout à ta galerie…');
  assert.equal(libelleEtat(t({ etat: 'erreur', erreur: 'Ton espace est plein' })), 'Ton espace est plein');
  assert.equal(libelleEtat(t(), true), 'En attente d’une place');
  assert.equal(libelleEtat(t({ etat: 'pause' })), 'En pause');
});

test('détail chiffré', () => {
  assert.equal(sp(detailChiffres(t())), '50 % · 500 Mo sur 1 Go · 4,1 Mo/s · il reste 2 min · 12 pairs');
  assert.equal(sp(detailChiffres(t({ octetsTotal: null, pairs: 3 }))), '3 pairs');
  assert.equal(sp(detailChiffres(t({ etat: 'pause' }))), '50 % · 500 Mo sur 1 Go');
});

test('attente d’une place', () => {
  const vide = t({ pairs: 0, debit: 0 });
  assert.equal(enAttentePlace(vide, null, 1000), false);
  assert.equal(enAttentePlace(vide, 0, 3000), false);
  assert.equal(enAttentePlace(vide, 0, 9000), true);
  assert.equal(enAttentePlace(t(), 0, 99999), false);
  const m = suivreInactivite(new Map(), [vide, t({ id: 'b' })], 100);
  assert.deepEqual([...m], [['a', 100]]);
  assert.equal(suivreInactivite(m, [vide], 500).get('a'), 100);
  assert.equal(suivreInactivite(m, [t()], 500).size, 0);
});

test('rafraîchissement', () => {
  assert.equal(doitRafraichir([t()], true), true);
  assert.equal(doitRafraichir([t()], false), false);
  assert.equal(doitRafraichir([t({ etat: 'pause' }), t({ etat: 'termine' })], true), false);
  assert.equal(doitRafraichir([t({ etat: 'metadonnees' })], true), true);
  assert.equal(doitRafraichir([], true), false);
});

test('choix de fichiers', () => {
  const f = [
    { index: 0, chemin: 'a.mkv', taille: 100, video: true, sousTitres: false, choisi: true },
    { index: 1, chemin: 'a.srt', taille: 1, video: false, sousTitres: true, choisi: true },
  ];
  assert.equal(totalChoisi(f, new Set([0, 1])), 101);
  assert.equal(choixValide(f, new Set([1])), false);
  assert.equal(choixValide(f, new Set([0])), true);
});

test('fins détectées et messages d’ajout', () => {
  assert.equal(nouvellementTermines([t()], [t({ etat: 'termine' })]).length, 1);
  assert.equal(nouvellementTermines([], [t({ etat: 'termine' })]).length, 0);
  assert.equal(nouvellementTermines([t({ etat: 'termine' })], [t({ etat: 'termine' })]).length, 0);
  assert.match(messageAjout(409), /déjà en cours/);
  assert.match(messageAjout(429), /minute/);
  assert.equal(messageAjout(400, 'Lien illisible.'), 'Lien illisible.');
});

test('ratio en français', () => {
  assert.equal(formaterRatio(1.236), '1,24');
  assert.equal(formaterRatio(0), '0,00');
  assert.equal(formaterRatio(12), '12,00');
  assert.equal(formaterRatio(null), '—');
  assert.equal(formaterRatio(undefined), '—');
  assert.equal(formaterRatio(Number.NaN), '—');
});

test('en partage : texte, tri et champs absents', () => {
  assert.equal(detailPartage({ ratio: 1.24 }), 'En partage · ratio 1,24');
  assert.equal(detailPartage({ ratio: null }), 'En partage · ratio —');
  assert.equal(sp(detailPartage({ ratio: 0.5, debitEnvoi: 120_000 })), 'En partage · ratio 0,50 · 120 Ko/s envoyés');
  assert.equal(libelleEtat(t({ etat: 'termine', enPartage: true })), 'En partage');
  assert.equal(libelleEtat(t({ etat: 'termine' })), 'Dans ta galerie');
  const ancien = { ...t({ etat: 'termine' }) } as Partial<Telechargement>;
  delete ancien.enPartage; delete ancien.prive; delete ancien.messageTracker;
  assert.equal(estEnPartage(ancien as Telechargement), false);
  assert.equal(estPrive(ancien as Telechargement), false);
  assert.equal(messageTrackerAffiche(ancien as Telechargement), null);
  assert.equal(estEnPartage(t({ etat: 'telechargement', enPartage: true })), false);
  const r = repartir([t({ id: 'f', etat: 'termine' }), t({ id: 'p', etat: 'termine', enPartage: true }), t({ id: 'c' })]);
  assert.deepEqual(r.enCours.map((x) => x.id), ['c', 'f']);
  assert.deepEqual(r.enPartage.map((x) => x.id), ['p']);
  assert.equal(resumePanneau(2, 1), '2 téléchargements en cours');
  assert.equal(resumePanneau(0, 3), '3 en partage');
  assert.equal(resumePanneau(0, 0), 'Téléchargements');
  assert.equal(doitRafraichir([t({ etat: 'termine', enPartage: true })], true), true);
});

test('réponse du tracker et attente des pairs', () => {
  assert.equal(messageTrackerAffiche(t({ messageTracker: '  Le tracker a refusé : client inconnu  ' })), 'Le tracker a refusé : client inconnu');
  assert.equal(messageTrackerAffiche(t({ messageTracker: '' })), null);
  assert.equal(libelleEtat(t({ etat: 'metadonnees' })), 'Récupération des informations…');
  assert.equal(libelleEtat(t({ etat: 'metadonnees' }), false, true), 'En attente des pairs…');
  assert.equal(libelleEtat(t({ etat: 'metadonnees', messageTracker: 'refusé' })), 'En attente des pairs…');
  const meta = t({ etat: 'metadonnees', pairs: 0, debit: 0 });
  assert.equal(metadonneesLongues(meta, 0, 3000), false);
  assert.equal(metadonneesLongues(meta, 0, 9000), true);
  assert.equal(metadonneesLongues(t({ etat: 'metadonnees', pairs: 2 }), 0, 99999), false);
  assert.equal(suivreInactivite(new Map(), [meta], 100).get('a'), 100);
});
