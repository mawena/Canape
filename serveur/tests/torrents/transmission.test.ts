// Le moteur Transmission vu du service : tout le comportement de Canapé contre un faux serveur RPC en mémoire
// (identifiant de session 409, authentification, champs de torrent-get, erreurs, tracker qui refuse), sans réseau.
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { after, afterEach, describe, test } from 'node:test';
import parseTorrent from 'parse-torrent';
import type { Film, Telechargement } from '@canape/partage';
import { decoder } from '../../src/modules/mediatheque/torrents/bencode.ts';
import { octetsUtilises } from '../../src/modules/mediatheque/televersement.ts';
import { get, patch, supprimer, post } from '../aides.ts';
import { attendre, attendreEtat, liste, posterTorrent, telechargement } from './aides-torrents.ts';
import { creerAppTransmission, fichiersRelease, hashAuHasard, magnetDe, torrentRelease, type AppTransmission } from './aides-transmission.ts';
import type { FichierFaux } from './faux-transmission.ts';

const PUBLIC = 'http://93.184.216.34:6969/announce';
const CLE = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

describe('moteur Transmission (faux RPC)', () => {
  let t: AppTransmission | null = null;
  afterEach(async () => { await t?.fermer(); t = null; });
  after(async () => { await t?.fermer(); });

  const dossierDe = (id: string) => path.join(t!.config.telechargements, id);
  const ligne = (id: string) => telechargement(t!, t!.alice, id);
  const films = async () => (await get(t!.app, '/api/films?vue=miens', t!.alice)).json() as Film[];
  const appelsRetrait = () => t!.faux.appelsDe('torrent-remove');

  /** Ajoute un torrent « release » complet et rend l'identifiant, l'empreinte et le faux torrent. */
  async function ajouterRelease(o: { prive?: boolean; announce?: string; nom?: string } = {}) {
    const tr = torrentRelease({ ...(o.prive ? { prive: true } : {}), ...(o.announce ? { announce: o.announce } : {}) }, o.nom);
    const r = await posterTorrent(t!.app, t!.alice, 'film.torrent', tr.octets);
    assert.equal(r.statusCode, 201, r.body);
    const tel = r.json() as Telechargement;
    await attendre(() => t!.faux.torrents.get(tr.infoHash), 10_000, 50, 'torrent-add jamais reçu');
    return { id: tel.id, hash: tr.infoHash, tr, tel };
  }

  async function jusquAuChoix(id: string): Promise<Telechargement> {
    return attendre(async () => { const x = await ligne(id); return x && x.fichiers.length ? x : undefined; }, 10_000, 50, 'métadonnées jamais reçues');
  }

  test('.torrent : sources web et trackers internes retirés, dossier 2770, choix des fichiers, démarrage après le choix', async () => {
    t = await creerAppTransmission();
    const tr = torrentRelease({
      announce: 'http://127.0.0.1:6969/announce',
      announceList: [['http://127.0.0.1:6969/announce', 'http://10.1.2.3/announce', PUBLIC], ['udp://tracker/announce']],
      urlList: ['http://127.0.0.1:9000/x'], httpseeds: ['http://169.254.169.254/'],
    });
    const r = await posterTorrent(t.app, t.alice, 'film.torrent', tr.octets);
    assert.equal(r.statusCode, 201);
    const tel = r.json() as Telechargement;
    assert.equal(tel.moteur, 'transmission');
    assert.equal(tel.prive, false);
    assert.equal(tel.enPartage, false);
    const ft = await attendre(() => t!.faux.torrents.get(tr.infoHash), 10_000, 50);
    // Ce que Transmission a reçu : ni url-list, ni httpseeds, seulement le tracker public ; même empreinte.
    const racine = decoder(ft.metainfo!).valeur as Map<string, unknown>;
    assert.equal(racine.has('url-list') || racine.has('httpseeds') || racine.has('nodes'), false);
    assert.deepEqual(ft.trackers, [PUBLIC]);
    assert.equal((await parseTorrent(ft.metainfo!)).infoHash, tr.infoHash);
    // Dossier de téléchargement : <telechargements>/<id>, ouvert au groupe.
    assert.equal(ft.downloadDir, dossierDe(tel.id));
    assert.equal(statSync(ft.downloadDir).mode & 0o770, 0o770);
    // Ajouté en pause (pour choisir avant le premier octet), puis choix : vidéo + sous-titres.
    const x = await jusquAuChoix(tel.id);
    assert.deepEqual(x.fichiers.filter((f) => f.choisi).map((f) => f.chemin), ['Mon.Film.2020/Mon.Film.2020.mkv', 'Mon.Film.2020/Mon.Film.2020.fr.srt']);
    // Le choix part en tâche de fond après les métadonnées : on attend qu'il soit appliqué, torrent démarré.
    await attendre(() => {
      const f = t!.faux.torrent(tr.infoHash);
      return !f.paused && f.wanted.join() === 'true,true,false,false';
    }, 10_000, 50, 'choix jamais appliqué ou torrent jamais démarré');
    assert.deepEqual(t.faux.torrent(tr.infoHash).wanted, [true, true, false, false]);
    assert.equal(t.faux.appels.find((a) => a.methode === 'torrent-add')!.args['paused'], true);
    // Les réglages de session : file, débit d'envoi (1M par défaut), port inchangé.
    const s = t.faux.sessionSet[0]!;
    assert.equal(s['download-queue-size'], 2);
    assert.equal(s['speed-limit-up'], 1049);
    assert.equal(s['speed-limit-up-enabled'], true);
    assert.equal(s['speed-limit-down-enabled'], false);
    assert.equal('peer-port' in s, false);
  });

  test('torrent public : fin, lien physique, retrait de Transmission avec ses données, le film reste', async () => {
    t = await creerAppTransmission();
    const { id, hash } = await ajouterRelease();
    await jusquAuChoix(id);
    t.faux.recevoir(hash, 0.5);
    const mi = await attendre(async () => { const x = await ligne(id); return x && x.progression > 0.2 ? x : undefined; }, 10_000, 50, 'pas de progression');
    assert.equal(mi.etat, 'telechargement');
    assert.ok(mi.pairs >= 1 && mi.debit > 0);
    const octetsChoisis = fichiersRelease().slice(0, 2).reduce((n, f) => n + f.length, 0);
    assert.equal(mi.octetsTotal, octetsChoisis);
    t.faux.recevoir(hash, 1);
    const fin = await attendreEtat(t, t.alice, id, 'termine');
    assert.equal(fin.filmIds.length, 1);
    assert.equal(fin.enPartage, false);
    assert.equal(fin.progression, 1);
    // Retiré de Transmission avec ses données ; le film reste (lien physique), aucun dossier ne traîne.
    const retrait = appelsRetrait().at(-1)!;
    assert.equal(retrait.args['delete-local-data'], true);
    assert.equal(t.faux.torrents.size, 0);
    assert.equal(existsSync(dossierDe(id)), false);
    const [film] = await films();
    const fichierFilm = path.join(t.config.films, film!.id, 'original.mkv');
    assert.ok(statSync(fichierFilm).size > 0);
    assert.equal(statSync(fichierFilm).nlink, 1);
    assert.equal(film!.titre.length > 0, true);
    assert.equal(octetsUtilises(t.app, t.alice.id), film!.taille);
  });

  test('torrent privé : partagé sans limite jusqu\'au retrait, même inode, quota compté une fois, DELETE garde le film', async () => {
    t = await creerAppTransmission();
    const { id, hash, tr } = await ajouterRelease({ prive: true, announce: `http://93.184.216.34:6969/${CLE}/announce?passkey=${CLE}` });
    const x = await jusquAuChoix(id);
    assert.equal(x.prive, true);
    assert.equal((await ligne(id))!.prive, true);
    t.faux.recevoir(hash, 1);
    const fin = await attendreEtat(t, t.alice, id, 'termine');
    assert.equal(fin.enPartage, true);
    assert.equal(fin.prive, true);
    assert.equal(fin.moteur, 'transmission');
    // Transmission garde le torrent, en partage illimité, jamais arrêté par inactivité.
    const ft = t.faux.torrent(hash);
    assert.equal(ft.seedRatioMode, 2);
    assert.equal(ft.seedIdleMode, 2);
    assert.equal(appelsRetrait().length, 0);
    // Le film est le même fichier que celui du torrent (lien physique).
    const [film] = await films();
    const fichierFilm = path.join(t.config.films, film!.id, 'original.mkv');
    const fichierTorrent = path.join(ft.downloadDir, 'Mon.Film.2020', 'Mon.Film.2020.mkv');
    assert.equal(statSync(fichierFilm).ino, statSync(fichierTorrent).ino);
    assert.equal(statSync(fichierFilm).nlink, 2);
    // Quota : une seule fois (le film), pas le torrent en plus.
    assert.equal(octetsUtilises(t.app, t.alice.id), film!.taille);
    // Le ratio est suivi.
    t.faux.fixerRatio(hash, 0.7);
    const avecRatio = await attendre(async () => { const y = await ligne(id); return y?.ratio === 0.7 ? y : undefined; }, 10_000, 50, 'ratio jamais vu');
    assert.ok(avecRatio.debitEnvoi > 0);
    // Même torrent : refusé tant qu'il est partagé.
    assert.equal((await posterTorrent(t.app, t.admin, 'film.torrent', tr.octets)).statusCode, 409);
    // DELETE : torrent retiré avec ses données, ligne retirée, film gardé et lisible.
    assert.equal((await supprimer(t.app, `/api/torrents/${id}`, t.alice)).statusCode, 204);
    assert.equal(appelsRetrait().at(-1)!.args['delete-local-data'], true);
    assert.equal(t.faux.torrents.has(hash), false);
    assert.equal((await liste(t, t.alice)).telechargements.some((l) => l.id === id), false);
    assert.equal(existsSync(dossierDe(id)), false);
    assert.equal(statSync(fichierFilm).nlink, 1);
    assert.equal((await films()).length, 1);
  });

  test('privé avec un ratio (CANAPE_TORRENT_PARTAGE_PRIVES=1.5) : arrêt et retrait à 1,5, le film reste', async () => {
    t = await creerAppTransmission({ CANAPE_TORRENT_PARTAGE_PRIVES: '1.5' });
    const { id, hash } = await ajouterRelease({ prive: true });
    await jusquAuChoix(id);
    t.faux.recevoir(hash, 1);
    await attendreEtat(t, t.alice, id, 'termine');
    const ft = t.faux.torrent(hash);
    assert.equal(ft.seedRatioMode, 1);
    assert.equal(ft.seedRatioLimit, 1.5);
    assert.equal((await ligne(id))!.enPartage, true);
    t.faux.fixerRatio(hash, 1.6);
    const fini = await attendre(async () => { const y = await ligne(id); return y && !y.enPartage ? y : undefined; }, 10_000, 50, 'partage jamais arrêté');
    assert.equal(fini.etat, 'termine');
    assert.equal(t.faux.torrents.has(hash), false);
    assert.equal(existsSync(dossierDe(id)), false);
    assert.equal((await films()).length, 1);
  });

  test('public avec CANAPE_TORRENT_PARTAGE=2 : partagé jusqu\'au ratio ; torrent disparu de Transmission : partage terminé, film gardé', async () => {
    t = await creerAppTransmission({ CANAPE_TORRENT_PARTAGE: '2' });
    const { id, hash } = await ajouterRelease();
    await jusquAuChoix(id);
    t.faux.recevoir(hash, 1);
    const fin = await attendreEtat(t, t.alice, id, 'termine');
    assert.equal(fin.enPartage, true);
    assert.equal(t.faux.torrent(hash).seedRatioMode, 1);
    assert.equal(t.faux.torrent(hash).seedRatioLimit, 2);
    // Retiré à la main dans Transmission : Canapé le voit et arrête le partage (le film reste).
    t.faux.torrents.delete(hash);
    await attendre(async () => { const y = await ligne(id); return y && !y.enPartage ? y : undefined; }, 10_000, 50, 'disparition jamais vue');
    assert.equal((await films()).length, 1);
    assert.equal(existsSync(dossierDe(id)), false);
  });

  test('reprise : un partage repart au démarrage de Canapé (Transmission le retrouve), sans rien retélécharger', async () => {
    t = await creerAppTransmission();
    const { id, hash } = await ajouterRelease({ prive: true });
    await jusquAuChoix(id);
    t.faux.recevoir(hash, 1);
    await attendreEtat(t, t.alice, id, 'termine');
    const internes = t.app.torrents as unknown as { reprendrePartages(): void; transmission: { suivis: Map<string, unknown> } };
    internes.transmission.suivis.clear(); // comme après un redémarrage de Canapé
    internes.reprendrePartages();
    t.faux.fixerRatio(hash, 1.2);
    await attendre(async () => (await ligne(id))?.ratio === 1.2, 10_000, 50, 'ratio jamais revu après la reprise');
    assert.equal(t.faux.appelsDe('torrent-add').length >= 2, true);
    assert.equal(t.faux.torrents.size, 1);
    assert.equal((await ligne(id))!.enPartage, true);
  });

  test('lien lu par Canapé : choix des fichiers, pause et reprise passent par torrent-set / torrent-stop / torrent-start', async () => {
    t = await creerAppTransmission();
    const { id, hash } = await ajouterRelease();
    await jusquAuChoix(id);
    await attendre(() => t!.faux.torrent(hash).paused === false, 10_000, 50);
    const p = await patch(t.app, `/api/torrents/${id}`, { pause: true }, t.alice);
    assert.equal(p.json().etat, 'pause');
    assert.equal(t.faux.torrent(hash).paused, true);
    assert.equal(t.faux.torrent(hash).status, 0);
    const c = await patch(t.app, `/api/torrents/${id}`, { fichiers: [0, 1, 3] }, t.alice);
    assert.equal(c.statusCode, 200, c.body);
    await attendre(() => t!.faux.torrent(hash).wanted[3] === true, 10_000, 50, 'choix jamais transmis');
    assert.deepEqual(t.faux.torrent(hash).wanted, [true, true, false, true]);
    // Reprise : repart dans Transmission (même dossier, rien retiré).
    const r = await patch(t.app, `/api/torrents/${id}`, { pause: false }, t.alice);
    assert.equal(r.json().etat, 'telechargement');
    await attendre(() => t!.faux.torrent(hash).paused === false, 10_000, 50, 'reprise jamais transmise');
    assert.equal(appelsRetrait().length, 0);
    // Annuler : retiré avec ses données.
    assert.equal((await supprimer(t.app, `/api/torrents/${id}`, t.alice)).statusCode, 204);
    assert.equal(t.faux.torrents.size, 0);
    assert.equal(appelsRetrait().at(-1)!.args['delete-local-data'], true);
    assert.equal(existsSync(dossierDe(id)), false);
    assert.equal((await ligne(id))!.etat, 'annule');
  });

  test('lien magnet : trackers internes retirés, métadonnées reçues plus tard, rien téléchargé avant le choix', async () => {
    t = await creerAppTransmission();
    const h = hashAuHasard();
    const r = await post(t.app, '/api/torrents', {
      magnet: magnetDe(h, `&dn=Film&tr=${encodeURIComponent('http://127.0.0.1:1/a')}&tr=${encodeURIComponent(PUBLIC)}&tr=${encodeURIComponent('http://10.0.0.9/a')}&ws=${encodeURIComponent('http://127.0.0.1/ws')}`),
    }, t.alice);
    assert.equal(r.statusCode, 201);
    const tel = r.json() as Telechargement;
    const ft = await attendre(() => t!.faux.torrents.get(h), 10_000, 50);
    assert.deepEqual(ft.trackers, [PUBLIC]);
    assert.doesNotMatch(ft.magnet!, /127\.0\.0\.1|10\.0\.0\.9|ws=/);
    assert.equal(t.faux.appels.find((a) => a.methode === 'torrent-add')!.args['paused'], false); // un magnet doit tourner pour avoir ses métadonnées
    assert.equal((await ligne(tel.id))!.etat, 'metadonnees');
    const fichiers: FichierFaux[] = fichiersRelease();
    t.faux.donnerMetadonnees(h, { nom: 'Mon.Film.2020', fichiers });
    const x = await jusquAuChoix(tel.id);
    assert.equal(x.nom, 'Mon.Film.2020');
    assert.equal(x.etat, 'telechargement');
    assert.deepEqual(t.faux.torrent(h).wanted, [true, true, false, false]);
    // Entre la réception des métadonnées et le choix, rien n'était voulu : jamais de téléchargement des autres fichiers.
    const sets = t.faux.appelsDe('torrent-set');
    assert.deepEqual(sets[0]!.args['files-unwanted'], [0, 1, 2, 3]);
  });

  test('tracker qui refuse : message en clair sans la clé ; sans informations au bout de 15 min, erreur avec ce message', async () => {
    t = await creerAppTransmission();
    const h = hashAuHasard();
    const tel = (await post(t.app, '/api/torrents', { magnet: magnetDe(h, `&tr=${encodeURIComponent(`${PUBLIC}?passkey=${CLE}`)}`) }, t.alice)).json() as Telechargement;
    await attendre(() => t!.faux.torrents.get(h), 10_000, 50);
    t.faux.refuserTracker(h, `Unregistered torrent https://93.184.216.34/${CLE}/announce?passkey=${CLE}`);
    const x = await attendre(async () => { const y = await ligne(tel.id); return y?.messageTracker ? y : undefined; }, 10_000, 50, 'message de tracker jamais vu');
    assert.match(x.messageTracker!, /^Le tracker a refusé : Unregistered torrent/);
    assert.doesNotMatch(JSON.stringify(x), new RegExp(`${CLE}|passkey=`));
    const internes = t.app.torrents as unknown as { debutMeta: Map<string, number>; verifierDelais(): void };
    internes.debutMeta.set(tel.id, 0);
    internes.verifierDelais();
    const fin = await attendreEtat(t, t.alice, tel.id, 'erreur');
    assert.match(fin.erreur!, /Aucun pair n'a répondu/);
    assert.match(fin.erreur!, /Le tracker a refusé : Unregistered torrent/);
    assert.doesNotMatch(fin.erreur!, new RegExp(CLE));
    await attendre(() => !t!.faux.torrents.has(h), 5000, 50, 'torrent jamais retiré de Transmission');
    // Un tracker injoignable n'est pas « refusé ».
    const h2 = hashAuHasard();
    const tel2 = (await post(t.app, '/api/torrents', { magnet: magnetDe(h2) }, t.alice)).json() as Telechargement;
    await attendre(() => t!.faux.torrents.get(h2), 10_000, 50);
    t.faux.refuserTracker(h2, 'Could not connect to tracker');
    const y = await attendre(async () => { const z = await ligne(tel2.id); return z?.messageTracker ? z : undefined; }, 10_000, 50);
    assert.match(y.messageTracker!, /^Le tracker n'a pas répondu : Could not connect/);
  });

  test('identifiant de session renouvelé en route et authentification : le suivi continue', async () => {
    t = await creerAppTransmission({}, { utilisateur: 'canape', motDePasse: 'tres-secret' });
    const { id, hash } = await ajouterRelease();
    await jusquAuChoix(id);
    const avant = t.faux.n409;
    t.faux.renouvelerSession();
    t.faux.recevoir(hash, 0.5);
    await attendre(async () => ((await ligne(id))?.progression ?? 0) > 0.2, 10_000, 50, 'suivi arrêté après le changement de session');
    assert.ok(t.faux.n409 > avant);
    assert.equal(t.app.torrents.transmission.actif, true);
  });

  test('mauvais mot de passe : erreur claire, sans le mot de passe, le téléchargement attend', async () => {
    t = await creerAppTransmission({ CANAPE_TRANSMISSION_MOT_DE_PASSE: 'mauvais-mdp' }, { utilisateur: 'canape', motDePasse: 'bon-mdp' });
    const tr = torrentRelease();
    const tel = (await posterTorrent(t.app, t.alice, 'f.torrent', tr.octets)).json() as Telechargement;
    const x = await attendre(async () => { const y = await ligne(tel.id); return y?.messageTracker ? y : undefined; }, 10_000, 50, 'erreur jamais montrée');
    assert.match(x.messageTracker!, /refuse l'identifiant ou le mot de passe/);
    assert.doesNotMatch(JSON.stringify(x), /mauvais-mdp|bon-mdp/);
    assert.equal(t.app.torrents.transmission.actif, false);
    assert.equal(x.etat === 'metadonnees' || x.etat === 'telechargement', true);
  });

  test('Transmission tombe en route puis revient : erreur claire, nouvel essai, pas de plantage, le téléchargement finit', async () => {
    t = await creerAppTransmission();
    const { id, hash } = await ajouterRelease();
    await jusquAuChoix(id);
    t.faux.recevoir(hash, 0.4);
    await attendre(async () => ((await ligne(id))?.progression ?? 0) > 0.2, 10_000, 50);
    const port = t.faux.port;
    await t.faux.arreter();
    const x = await attendre(async () => { const y = await ligne(id); return y?.messageTracker ? y : undefined; }, 15_000, 50, 'panne jamais signalée');
    assert.match(x.messageTracker!, /Transmission est injoignable/);
    assert.match(x.messageTracker!, /reprendra dès que Transmission répondra/);
    assert.equal(t.app.torrents.transmission.actif, false);
    assert.equal((await get(t.app, '/api/torrents', t.alice)).statusCode, 200); // Canapé répond toujours
    await t.faux.demarrer(port);
    t.faux.recevoir(hash, 1);
    await attendreEtat(t, t.alice, id, 'termine', 20_000);
    assert.equal((await films()).length, 1);
  });

  test('torrent déjà dans Transmission ailleurs (hors Canapé) : erreur, Canapé n\'y touche pas', async () => {
    t = await creerAppTransmission();
    const tr = torrentRelease();
    (t.faux as unknown as { methode(n: string, a: Record<string, unknown>): unknown }).methode('torrent-add', { metainfo: tr.octets.toString('base64'), 'download-dir': '/ailleurs/mes-films', paused: false });
    const tel = (await posterTorrent(t.app, t.alice, 'f.torrent', tr.octets)).json() as Telechargement;
    const fin = await attendreEtat(t, t.alice, tel.id, 'erreur');
    assert.match(fin.erreur!, /déjà dans Transmission/);
    assert.equal(t.faux.torrents.has(tr.infoHash), true);
    assert.equal(appelsRetrait().length, 0);
    assert.equal(t.faux.torrent(tr.infoHash).downloadDir, '/ailleurs/mes-films');
  });

  test('erreur locale de Transmission (écriture refusée) : message clair, torrent retiré', async () => {
    t = await creerAppTransmission();
    const { id, hash } = await ajouterRelease();
    await jusquAuChoix(id);
    const ft = t.faux.torrent(hash);
    ft.error = 3;
    ft.errorString = `Permission denied (${dossierDe(id)}/x)`;
    const fin = await attendreEtat(t, t.alice, id, 'erreur');
    assert.match(fin.erreur!, /n'a pas le droit d'écrire/);
    assert.match(fin.erreur!, /groupe canape/);
    await attendre(() => !t!.faux.torrents.has(hash), 5000, 50);
  });

  test('un .torrent illisible est refusé tout de suite', async () => {
    t = await creerAppTransmission();
    const r = await posterTorrent(t.app, t.alice, 'x.torrent', Buffer.from('d4:infod4:name1:aee'));
    assert.equal(r.statusCode, 400);
    assert.equal(t.faux.torrents.size, 0);
  });

  test('mode auto : WebTorrent tant que Transmission est absent, puis la ligne passe à Transmission quand il répond', async () => {
    t = await creerAppTransmission({ CANAPE_TORRENT_MOTEUR: 'auto' }, { fauxArrete: true });
    assert.equal(t.app.torrents.transmission.actif, false);
    const h = hashAuHasard();
    const tel = (await post(t.app, '/api/torrents', { magnet: magnetDe(h) }, t.alice)).json() as Telechargement;
    assert.equal(tel.moteur, 'webtorrent');
    await t.faux.demarrer(t.faux.port);
    const x = await attendre(async () => { const y = await ligne(tel.id); return y?.moteur === 'transmission' ? y : undefined; }, 15_000, 100, 'ligne jamais passée à Transmission');
    assert.equal(x.etat === 'metadonnees' || x.etat === 'telechargement', true);
    await attendre(() => t!.faux.torrents.get(h), 10_000, 50, 'torrent jamais confié à Transmission');
    // Et un nouvel ajout va directement à Transmission.
    const autre = (await post(t.app, '/api/torrents', { magnet: magnetDe(hashAuHasard()) }, t.alice)).json() as Telechargement;
    assert.equal(autre.moteur, 'transmission');
  });
});
