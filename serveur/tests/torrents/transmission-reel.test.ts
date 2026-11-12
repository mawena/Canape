// Essais avec un VRAI Transmission, en local, sans root : le binaire (`CANAPE_ESSAI_TRANSMISSION`, par exemple extrait
// d'un .deb avec `dpkg -x`) est lancé avec un dossier de réglages temporaire, RPC sur un port libre de 127.0.0.1,
// DHT/LPD/PEX/uTP/UPnP coupés. Le seul pair est un client WebTorrent local qui vient se connecter au port des pairs de
// Transmission (`addPeer`) : aucun trafic vers Internet, aucun tracker, aucune DHT. Sautés sans `CANAPE_ESSAI_TRANSMISSION`.
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import WebTorrent, { type TorrentWebTorrent } from 'webtorrent';
import type { Film, Telechargement } from '@canape/partage';
import { decoder, encoder, type ValeurBencode } from '../../src/modules/mediatheque/torrents/bencode.ts';
import { ClientTransmission } from '../../src/modules/mediatheque/torrents/transmission-rpc.ts';
import { creerAppTest, creerUtilisateur, get, patch, post, supprimer, type AppTest, type UtilisateurTest } from '../aides.ts';
import { attendre, attendreEtat, liste, MKV_ESSAI, posterTorrent, SRT_ESSAI, telechargement } from './aides-torrents.ts';
import { magnetDe } from './aides-transmission.ts';

const BINAIRE = process.env['CANAPE_ESSAI_TRANSMISSION'] ?? '';

async function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
  });
}

interface Semeur { client: WebTorrent; torrent: TorrentWebTorrent; infoHash: string; fichierTorrent: Buffer; arreter: () => Promise<void> }

/** Un client WebTorrent local qui sème `racine`, sans DHT, tracker, LSD ni UPnP. */
async function semer(racine: string, prive = false): Promise<Semeur> {
  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false, webSeeds: false });
  const torrent = await new Promise<TorrentWebTorrent>((resolve, reject) => {
    client.once('error', reject);
    client.seed(racine, { announce: [], private: prive, createdBy: 'essais Canapé' }, resolve);
  });
  return {
    client, torrent, infoHash: torrent.infoHash, fichierTorrent: Buffer.from((torrent as unknown as { torrentFile: Uint8Array }).torrentFile),
    arreter: () => new Promise<void>((r) => { if (client.destroyed) r(); else client.destroy(() => r()); }),
  };
}

function fabriquerDossier(parent: string, nom: string): string {
  const racine = path.join(parent, nom);
  mkdirSync(racine, { recursive: true });
  copyFileSync(MKV_ESSAI, path.join(racine, `${nom}.mkv`));
  copyFileSync(SRT_ESSAI, path.join(racine, `${nom}.fr.srt`));
  writeFileSync(path.join(racine, 'sample.mkv'), randomBytes(200_000));
  writeFileSync(path.join(racine, 'info.nfo'), 'infos\n');
  return racine;
}

describe('vrai Transmission en local', { skip: BINAIRE ? false : 'CANAPE_ESSAI_TRANSMISSION non défini' }, () => {
  let travail: string;
  let daemon: ChildProcess;
  let rpcPort = 0;
  let portPairs = 0;
  let client: ClientTransmission;
  const semeurs: Semeur[] = [];
  const minuteurs: NodeJS.Timeout[] = [];
  let t: AppTest;
  let alice: UtilisateurTest;
  let admin: UtilisateurTest;

  /** Le pair local va frapper à la porte de Transmission jusqu'à ce que le téléchargement soit fini. */
  function pousserPair(s: Semeur): void {
    const m = setInterval(() => { try { s.torrent.addPeer(`127.0.0.1:${portPairs}`); } catch { /* pair en cours de fermeture */ } }, 400);
    m.unref();
    minuteurs.push(m);
  }
  const films = async () => (await get(t.app, '/api/films?vue=miens', alice)).json() as Film[];

  before(async () => {
    travail = mkdtempSync(path.join(tmpdir(), 'canape-reel-'));
    rpcPort = await portLibre();
    portPairs = await portLibre();
    const conf = path.join(travail, 'conf');
    mkdirSync(conf, { recursive: true });
    writeFileSync(path.join(conf, 'settings.json'), JSON.stringify({
      'rpc-enabled': true, 'rpc-bind-address': '127.0.0.1', 'rpc-port': rpcPort, 'rpc-authentication-required': false,
      'rpc-whitelist-enabled': false, 'rpc-host-whitelist-enabled': false, 'dht-enabled': false, 'lpd-enabled': false, 'pex-enabled': false,
      'utp-enabled': false, 'port-forwarding-enabled': false, 'peer-port': portPairs, 'peer-port-random-on-start': false,
      'download-dir': path.join(travail, 'telechargements-transmission'), umask: 2, 'blocklist-enabled': false, 'message-level': 1,
      'incomplete-dir-enabled': false, 'ratio-limit-enabled': false, 'idle-seeding-limit-enabled': false, 'rename-partial-files': false,
    }));
    daemon = spawn(BINAIRE, ['-f', '--config-dir', conf, '--log-level=error'], { stdio: 'ignore' });
    client = new ClientTransmission({ url: `http://127.0.0.1:${rpcPort}/transmission/rpc` });
    await attendre(async () => { try { await client.appeler('session-get'); return true; } catch { return false; } }, 20_000, 200, 'Transmission ne répond pas');
    for (const [nom, prive] of [['Public.Film.2020', false], ['Prive.Film.2021', true], ['Magnet.Film.2022', false], ['Lent.Film.2023', false]] as const) {
      semeurs.push(await semer(fabriquerDossier(path.join(travail, 'sources'), nom), prive));
    }
    t = await creerAppTest({
      env: {
        CANAPE_TORRENT_MOTEUR: 'transmission', CANAPE_TRANSMISSION_URL: `http://127.0.0.1:${rpcPort}/transmission/rpc`,
        CANAPE_TORRENT_PORT: String(portPairs), CANAPE_TORRENT_ISOLE: '1', CANAPE_TORRENT_DEBIT_MAX: '4000',
      },
    });
    admin = await creerUtilisateur(t, { role: 'admin' });
    void admin;
    alice = await creerUtilisateur(t, { prenom: 'Alice' });
  });

  after(async () => {
    for (const m of minuteurs) clearInterval(m);
    await t?.fermer();
    await Promise.all(semeurs.map((s) => s.arreter()));
    daemon?.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    rmSync(travail, { recursive: true, force: true });
  });

  test('Canapé règle la session de Transmission (file, débit d\'envoi, port des pairs)', async () => {
    await attendre(() => t.app.torrents.transmission.actif, 15_000, 100, 'Canapé ne voit pas Transmission');
    const s = await client.appeler<Record<string, unknown>>('session-get', { fields: ['download-queue-size', 'speed-limit-up', 'speed-limit-up-enabled', 'peer-port', 'version'] });
    assert.equal(s['download-queue-size'], 2);
    assert.equal(s['speed-limit-up-enabled'], true);
    assert.equal(s['peer-port'], portPairs);
    assert.ok(t.app.torrents.transmission.version);
  });

  test('.torrent : sources web et trackers internes retirés, seuls les fichiers choisis téléchargés, fin, lien, retrait (public)', async () => {
    const s = semeurs[0]!;
    // Le .torrent du pair, auquel on ajoute ce qu'un utilisateur malveillant pourrait y glisser.
    const { valeur, brut } = decoder(s.fichierTorrent);
    const racine = valeur as Map<string, ValeurBencode>;
    racine.set('url-list', [Buffer.from('http://127.0.0.1:9/web')]);
    racine.set('httpseeds', [Buffer.from('http://10.0.0.1:9/seed')]);
    racine.set('announce', Buffer.from('http://127.0.0.1:9/announce'));
    racine.set('announce-list', [[Buffer.from('http://localhost:9/a')], [Buffer.from('udp://192.168.0.5:6969')]]);
    const piege = encoder(racine, brut);
    const r = await posterTorrent(t.app, alice, 'public.torrent', piege);
    assert.equal(r.statusCode, 201, r.body);
    const tel = r.json() as Telechargement;
    pousserPair(s);
    // Dans Transmission : aucun tracker, aucune source web.
    const vu = await attendre(async () => { const x = await tgetOuNul(s.infoHash); return x ?? undefined; }, 15_000, 100, 'torrent absent de Transmission');
    assert.deepEqual(vu['trackers'], []);
    assert.deepEqual(vu['webseeds'], []);
    const x = await attendre(async () => { const y = await telechargement(t, alice, tel.id); return y && y.fichiers.length ? y : undefined; }, 30_000, 100, 'métadonnées jamais reçues');
    assert.deepEqual(x.fichiers.filter((f) => f.choisi).map((f) => path.posix.basename(f.chemin)), ['Public.Film.2020.mkv', 'Public.Film.2020.fr.srt']);
    const fin = await attendreEtat(t, alice, tel.id, 'termine', 60_000);
    assert.equal(fin.moteur, 'transmission');
    assert.equal(fin.enPartage, false);
    assert.equal(fin.filmIds.length, 1);
    const [film] = (await films()).filter((f) => f.id === fin.filmIds[0]);
    const fichierFilm = path.join(t.config.films, film!.id, 'original.mkv');
    assert.equal(readFileSync(fichierFilm).equals(readFileSync(MKV_ESSAI)), true);
    // Public sans partage : retiré de Transmission avec ses données, le film reste (lien physique) ; sample et .nfo jamais reçus.
    await attendre(async () => (await tgetOuNul(s.infoHash)) === null, 15_000, 100, 'torrent jamais retiré de Transmission');
    assert.equal(existsSync(path.join(t.config.telechargements, tel.id)), false);
    assert.equal(statSync(fichierFilm).nlink, 1);
  });

  test('privé : partagé jusqu\'au retrait, film = même inode que le fichier de Transmission, DELETE garde le film', async () => {
    const s = semeurs[1]!;
    const r = await posterTorrent(t.app, alice, 'prive.torrent', s.fichierTorrent);
    assert.equal(r.statusCode, 201, r.body);
    const tel = r.json() as Telechargement;
    pousserPair(s);
    const fin = await attendreEtat(t, alice, tel.id, 'termine', 60_000);
    assert.equal(fin.prive, true);
    assert.equal(fin.enPartage, true);
    const dossier = path.join(t.config.telechargements, tel.id);
    const [film] = (await films()).filter((f) => f.id === fin.filmIds[0]);
    const fichierFilm = path.join(t.config.films, film!.id, 'original.mkv');
    const fichierTorrent = path.join(dossier, 'Prive.Film.2021', 'Prive.Film.2021.mkv');
    assert.equal(statSync(fichierFilm).ino, statSync(fichierTorrent).ino);
    assert.equal(statSync(fichierFilm).nlink, 2);
    const ft = await tget(s.infoHash, ['seedRatioMode', 'status', 'isPrivate']);
    assert.equal(ft['seedRatioMode'], 2);
    assert.equal(ft['isPrivate'], true);
    assert.ok([5, 6].includes(ft['status'] as number), `statut ${String(ft['status'])}`);
    // La ligne est suivie pendant le partage (état et ratio connus).
    const suivi = await attendre(async () => { const y = await telechargement(t, alice, tel.id); return y && y.ratio !== null ? y : undefined; }, 10_000, 100, 'ratio jamais suivi');
    assert.equal(suivi.enPartage, true);
    // DELETE : une seule requête arrête le partage, efface les données, retire la ligne ; le film reste.
    assert.equal((await supprimer(t.app, `/api/torrents/${tel.id}`, alice)).statusCode, 204);
    assert.equal((await liste(t, alice)).telechargements.some((l) => l.id === tel.id), false);
    await attendre(async () => (await tgetOuNul(s.infoHash)) === null, 15_000, 100, 'torrent jamais retiré de Transmission');
    assert.equal(existsSync(dossier), false);
    assert.equal(statSync(fichierFilm).nlink, 1);
    assert.equal(statSync(fichierFilm).size, statSync(MKV_ESSAI).size);
  });

  test('lien magnet : métadonnées reçues du pair, choix des fichiers, fin, retrait', async () => {
    const s = semeurs[2]!;
    const r = await post(t.app, '/api/torrents', { magnet: magnetDe(s.infoHash, '&dn=Magnet.Film.2022') }, alice);
    assert.equal(r.statusCode, 201, r.body);
    const tel = r.json() as Telechargement;
    pousserPair(s);
    const x = await attendre(async () => { const y = await telechargement(t, alice, tel.id); return y && y.fichiers.length ? y : undefined; }, 40_000, 100, 'métadonnées du magnet jamais reçues');
    assert.deepEqual(x.fichiers.filter((f) => f.choisi).map((f) => path.posix.basename(f.chemin)), ['Magnet.Film.2022.mkv', 'Magnet.Film.2022.fr.srt']);
    const fin = await attendreEtat(t, alice, tel.id, 'termine', 60_000);
    assert.equal(fin.filmIds.length, 1);
    await attendre(async () => (await tgetOuNul(s.infoHash)) === null, 15_000, 100);
  });

  test('pause et reprise : Transmission s\'arrête puis repart, le film arrive à la fin', async () => {
    const s = semeurs[3]!;
    const r = await posterTorrent(t.app, alice, 'lent.torrent', s.fichierTorrent);
    assert.equal(r.statusCode, 201, r.body);
    const tel = r.json() as Telechargement;
    await attendre(async () => (await tgetOuNul(s.infoHash)) !== null, 15_000, 100);
    await attendre(async () => { const y = await telechargement(t, alice, tel.id); return y && y.fichiers.length ? y : undefined; }, 15_000, 100);
    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, { pause: true }, alice)).json().etat, 'pause');
    await attendre(async () => (await tget(s.infoHash, ['status']))['status'] === 0, 10_000, 100, 'Transmission jamais arrêté');
    await new Promise((res) => setTimeout(res, 1500));
    assert.equal((await telechargement(t, alice, tel.id))!.etat, 'pause'); // reste en pause, même avec un pair qui frappe
    assert.equal((await patch(t.app, `/api/torrents/${tel.id}`, { pause: false }, alice)).json().etat, 'telechargement');
    pousserPair(s);
    await attendreEtat(t, alice, tel.id, 'termine', 60_000);
  });

  /** Un torrent tel que Transmission le voit (`undefined` s'il n'y est plus). */
  async function tgetBrut(hash: string, champs: string[]): Promise<Record<string, unknown> | undefined> {
    return (await client.appeler<{ torrents: Array<Record<string, unknown>> }>('torrent-get', { ids: [hash], fields: champs })).torrents[0];
  }
  async function tgetOuNul(hash: string): Promise<Record<string, unknown> | null> { return (await tgetBrut(hash, ['hashString', 'trackers', 'webseeds'])) ?? null; }
  async function tget(hash: string, champs: string[]): Promise<Record<string, unknown>> { return (await tgetBrut(hash, champs)) ?? {}; }
});
