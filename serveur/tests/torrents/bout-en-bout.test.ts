// De bout en bout avec un vrai pair local : une seconde instance WebTorrent sème un dossier sur 127.0.0.1,
// le moteur de Canapé (processus enfant) le télécharge, puis les films arrivent dans la galerie.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { Film } from '@canape/partage';
import type { Mediatheque } from '../../src/modules/mediatheque/mediatheque.ts';
import { creerAppTest, creerUtilisateur, get, patch, post, supprimer, type AppTest, type UtilisateurTest } from '../aides.ts';
import {
  attendre, attendreEtat, fabriquerAutreSource, fabriquerSource, liste, posterTorrent, semer, telechargement, tracerEtats, vivant,
  type Pair, type SourceFabriquee,
} from './aides-torrents.ts';

describe('torrents : de bout en bout avec un pair local', () => {
  let travail: string;
  let source: SourceFabriquee;
  let pair: Pair;
  let autre: Pair;
  /** Octets/s : le téléchargement dure quelques secondes (pause, plantage, annulation). */
  let debit: number;
  let t: AppTest;
  let admin: UtilisateurTest;
  let alice: UtilisateurTest;
  let etats: (id: string) => string[];

  const dossierTorrent = (id: string) => path.join(t.config.telechargements, id);
  const films = async (u: UtilisateurTest) => (await get(t.app, '/api/films?vue=miens', u)).json() as Film[];

  async function creerApplication(env: Record<string, string> = {}): Promise<void> {
    t = await creerAppTest({
      env: {
        CANAPE_TORRENT_ISOLE: '1', CANAPE_TORRENT_PAIRS: `127.0.0.1:${pair.port},127.0.0.1:${autre.port}`,
        CANAPE_TORRENT_DEBIT_MAX: String(debit), ...env,
      },
    });
    admin = await creerUtilisateur(t, { role: 'admin' });
    alice = await creerUtilisateur(t, { prenom: 'Alice' });
    etats = tracerEtats(t);
  }

  before(async () => {
    travail = mkdtempSync(path.join(tmpdir(), 'canape-torrents-'));
    source = fabriquerSource(path.join(travail, 'source'));
    pair = await semer(source.racine);
    autre = await semer(fabriquerAutreSource(path.join(travail, 'autre')));
    debit = Math.max(30_000, Math.floor((source.tailleVideo + source.tailleSousTitres) / 5));
  });
  after(async () => {
    await pair.fermer();
    await autre.fermer();
    rmSync(travail, { recursive: true, force: true });
  });

  describe('fichier .torrent', () => {
    let pid = 0;
    before(creerApplication.bind(null, {}));
    after(async () => {
      pid = t.app.torrents.moteur.pid ?? pid;
      await t.fermer();
      // Aucun processus orphelin : l'enfant est parti avec le serveur.
      assert.ok(pid > 0);
      await attendre(() => !vivant(pid) || undefined, 5000, 50, `le processus enfant ${pid} tourne encore`);
    });

    test('metadonnees → telechargement → import → termine ; film et sous-titres dans la galerie, échantillon laissé', async () => {
      const r = await posterTorrent(t.app, alice, 'Mon.Film.2020.torrent', pair.fichierTorrent);
      assert.equal(r.statusCode, 201, r.body);
      const id = (r.json() as { id: string }).id;
      pid = t.app.torrents.moteur.pid ?? 0;

      const enCours = await attendreEtat(t, alice, id, 'telechargement');
      assert.equal(enCours.nom, 'Mon.Film.2020.720p');
      assert.equal(enCours.octetsTotal, source.tailleVideo + source.tailleSousTitres);
      const choisis = enCours.fichiers.filter((f) => f.choisi).map((f) => f.chemin).sort();
      assert.deepEqual(choisis, ['Mon.Film.2020.720p/Mon.Film.2020.fr.srt', 'Mon.Film.2020.720p/Mon.Film.2020.mkv']);
      assert.equal(enCours.fichiers.find((f) => f.chemin.endsWith('sample.mkv'))?.choisi, false);
      assert.equal(enCours.fichiers.find((f) => f.chemin.endsWith('sample.mkv'))?.video, true);
      assert.equal(enCours.fichiers.length, 4);

      const fini = await attendreEtat(t, alice, id, 'termine');
      assert.equal(fini.progression, 1);
      assert.equal(fini.filmIds.length, 1);
      assert.ok(fini.termineLe);
      assert.deepEqual(etats(id), ['metadonnees', 'telechargement', 'import', 'termine']);

      // Le film est dans la galerie, avec ses sous-titres.
      const liste1 = await films(alice);
      assert.equal(liste1.length, 1);
      assert.equal(liste1[0]?.id, fini.filmIds[0]);
      assert.equal(liste1[0]?.titre, 'Mon Film');
      assert.equal(liste1[0]?.annee, 2020);
      assert.equal(liste1[0]?.nomOrigine, 'Mon.Film.2020.mkv');
      const fiche = (await get(t.app, `/api/films/${fini.filmIds[0]}`, alice)).json() as Film;
      assert.equal(fiche.sousTitresExternes?.length, 1);
      assert.equal(fiche.sousTitresExternes?.[0]?.langue, 'fr');
      await (t.app.mediatheque as unknown as Mediatheque).attendreTraitements();

      // Le dossier de téléchargement est effacé, le .torrent gardé aussi.
      assert.equal(existsSync(dossierTorrent(id)), false);
      assert.deepEqual(readdirSync(path.join(t.config.telechargements, '.torrents')), []);
      // L'échantillon (3 Mo) n'a pas été téléchargé : le pair n'a presque rien envoyé de plus que les fichiers choisis.
      assert.ok(pair.torrent.uploaded < source.tailleVideo + source.tailleSousTitres + 1024 * 1024, `envoyé : ${pair.torrent.uploaded}`);
      // Le film a ses fichiers dans la galerie.
      assert.ok(existsSync(path.join(t.config.films, fini.filmIds[0]!, 'original.mkv')));
    });
  });

  describe('lien magnet, pause, plantage et annulation', () => {
    before(creerApplication.bind(null, {}));
    after(async () => { await t.fermer(); });

    test('pause puis reprise, jusqu\'à la fin', async () => {
      const r = await post(t.app, '/api/torrents', { magnet: pair.magnet }, alice);
      assert.equal(r.statusCode, 201, r.body);
      const id = (r.json() as { id: string }).id;
      await attendre(async () => ((await telechargement(t, alice, id))?.octetsRecus ?? 0) > 0 || undefined, 30_000, 50, 'rien reçu');
      const p = await patch(t.app, `/api/torrents/${id}`, { pause: true }, alice);
      assert.equal(p.json().etat, 'pause');
      assert.equal(p.json().debit, 0);
      const recus = (await telechargement(t, alice, id))!.octetsRecus;
      await new Promise((r2) => setTimeout(r2, 1200));
      assert.ok(((await telechargement(t, alice, id))!.octetsRecus) <= recus + 1, 'des octets arrivent pendant la pause');
      assert.equal((await telechargement(t, alice, id))?.etat, 'pause');
      assert.equal((await patch(t.app, `/api/torrents/${id}`, { pause: false }, alice)).json().etat, 'telechargement');
      const fini = await attendreEtat(t, alice, id, 'termine');
      assert.equal(fini.filmIds.length, 1);
      assert.deepEqual(etats(id), ['metadonnees', 'telechargement', 'pause', 'telechargement', 'import', 'termine']);
    });

    test('changer le choix des fichiers : au moins une vidéo, indices valides, refusé une fois fini', async () => {
      const r = await post(t.app, '/api/torrents', { magnet: pair.magnet }, alice);
      assert.equal(r.statusCode, 201, r.body);
      const id = (r.json() as { id: string }).id;
      const x = await attendreEtat(t, alice, id, 'telechargement');
      const idx = (fin: string) => x.fichiers.find((f) => f.chemin.endsWith(fin))!.index;
      assert.equal((await patch(t.app, `/api/torrents/${id}`, { fichiers: [idx('.srt')] }, alice)).statusCode, 400);
      assert.equal((await patch(t.app, `/api/torrents/${id}`, { fichiers: [99] }, alice)).statusCode, 400);
      assert.equal((await patch(t.app, `/api/torrents/${id}`, { fichiers: [] }, alice)).statusCode, 400);
      assert.equal((await patch(t.app, `/api/torrents/${id}`, { fichiers: [idx('Mon.Film.2020.mkv'), idx('.nfo')] }, alice)).statusCode, 200);
      const apres = (await telechargement(t, alice, id))!;
      assert.equal(apres.octetsTotal, source.tailleVideo + 'Infos du film\n'.length);
      assert.deepEqual(apres.fichiers.filter((f) => f.choisi).map((f) => f.index).sort(), [idx('Mon.Film.2020.mkv'), idx('.nfo')].sort());
      const fini = await attendreEtat(t, alice, id, 'termine');
      // Sans le sous-titre choisi : pas de sous-titres sur ce film.
      const fiche = (await get(t.app, `/api/films/${fini.filmIds[0]}`, alice)).json() as Film;
      assert.equal(fiche.sousTitresExternes?.length, 0);
      assert.equal((await patch(t.app, `/api/torrents/${id}`, { pause: true }, alice)).statusCode, 409);
    });

    test('le moteur meurt en plein téléchargement : il est relancé et le téléchargement reprend', async () => {
      const r = await post(t.app, '/api/torrents', { magnet: pair.magnet }, alice);
      const id = (r.json() as { id: string }).id;
      await attendre(async () => ((await telechargement(t, alice, id))?.octetsRecus ?? 0) > 0 || undefined, 30_000, 50, 'rien reçu');
      const ancien = t.app.torrents.moteur.pid!;
      t.app.torrents.moteur.tuer();
      await attendre(() => !vivant(ancien) || undefined, 5000, 50);
      const fini = await attendreEtat(t, alice, id, 'termine', 60_000);
      assert.equal(fini.filmIds.length, 1);
      assert.notEqual(t.app.torrents.moteur.pid, ancien);
    });

    test('annulation : données effacées, ligne « annule », puis retirée', async () => {
      const r = await post(t.app, '/api/torrents', { magnet: pair.magnet }, alice);
      const id = (r.json() as { id: string }).id;
      await attendre(async () => ((await telechargement(t, alice, id))?.octetsRecus ?? 0) > 0 || undefined, 30_000, 50, 'rien reçu');
      assert.ok(existsSync(dossierTorrent(id)));
      assert.equal((await supprimer(t.app, `/api/torrents/${id}`, alice)).statusCode, 204);
      assert.equal((await telechargement(t, alice, id))?.etat, 'annule');
      assert.equal(existsSync(dossierTorrent(id)), false);
      assert.equal((await supprimer(t.app, `/api/torrents/${id}`, alice)).statusCode, 204);
      assert.equal(await telechargement(t, alice, id), undefined);
      assert.equal((await films(alice)).length, 3, 'les films déjà créés restent');
    });
  });

  describe('quota', () => {
    let petit: UtilisateurTest;
    before(async () => {
      await creerApplication();
      petit = await creerUtilisateur(t, { prenom: 'Petit', quotaOctets: source.tailleVideo + source.tailleSousTitres + 500 });
    });
    after(async () => { await t.fermer(); });

    test('un nouveau choix qui dépasse le quota : 507 ; un torrent trop gros : erreur « Ton espace est plein »', async () => {
      const r = await post(t.app, '/api/torrents', { magnet: pair.magnet }, petit);
      const id = (r.json() as { id: string }).id;
      const x = await attendreEtat(t, petit, id, 'telechargement');
      const sample = x.fichiers.find((f) => f.chemin.endsWith('sample.mkv'))!;
      const q = await patch(t.app, `/api/torrents/${id}`, { fichiers: x.fichiers.filter((f) => f.choisi).map((f) => f.index).concat(sample.index) }, petit);
      assert.equal(q.statusCode, 507);
      assert.equal((await telechargement(t, petit, id))?.octetsTotal, source.tailleVideo + source.tailleSousTitres);
      await supprimer(t.app, `/api/torrents/${id}`, petit);

      // Les envois en cours comptent : avec 1 000 octets de quota, le torrent est refusé dès qu'on connaît sa taille.
      t.db.prepare('UPDATE utilisateurs SET quota_octets = 1000 WHERE id = ?').run(petit.id);
      const r2 = await post(t.app, '/api/torrents', { magnet: pair.magnet }, petit);
      const id2 = (r2.json() as { id: string }).id;
      const e = await attendreEtat(t, petit, id2, 'erreur');
      assert.match(e.erreur ?? '', /Ton espace est plein/);
      assert.equal(existsSync(dossierTorrent(id2)), false);
      assert.equal((await supprimer(t.app, `/api/torrents/${id2}`, petit)).statusCode, 204);
    });
  });

  describe('téléchargements simultanés', () => {
    before(creerApplication.bind(null, { CANAPE_TORRENT_SIMULTANES: '1' }));
    after(async () => { await t.fermer(); });

    test('au plus un actif : le second attend son tour puis se termine', async () => {
      const a = (await post(t.app, '/api/torrents', { magnet: pair.magnet }, alice)).json() as { id: string };
      const b = (await post(t.app, '/api/torrents', { magnet: autre.magnet }, alice)).json() as { id: string };
      await attendreEtat(t, alice, a.id, 'telechargement');
      const attente = (await telechargement(t, alice, b.id))!;
      assert.equal(attente.etat, 'telechargement');
      assert.equal(attente.nom, null);
      assert.equal(attente.pairs, 0);
      assert.equal(attente.debit, 0);
      await attendreEtat(t, alice, a.id, 'termine');
      const fini = await attendreEtat(t, alice, b.id, 'termine');
      assert.equal(fini.filmIds.length, 1);
      assert.equal((await liste(t, alice)).telechargements.length, 2);
    });
  });
});
