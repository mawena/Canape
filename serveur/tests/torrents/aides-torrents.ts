// Aides des essais des torrents : source fabriquée par ffmpeg, pair local (seconde instance WebTorrent sur 127.0.0.1),
// corps multipart, attente active. Aucun trafic vers Internet : ni DHT, ni trackers, ni découverte locale, ni UPnP.
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebTorrent, { type TorrentWebTorrent } from 'webtorrent';
import type { FastifyInstance } from 'fastify';
import type { ListeTelechargements, Telechargement } from '@canape/partage';
import { ffmpegSync } from '../lecture/aides-lecture.ts';
import { get, type AppTest, type UtilisateurTest } from '../aides.ts';

export const SRT_ESSAI = fileURLToPath(new URL('../mediatheque/fixtures/essai.srt', import.meta.url));
export const MKV_ESSAI = fileURLToPath(new URL('../mediatheque/fixtures/essai.mkv', import.meta.url));

export interface SourceFabriquee {
  /** Dossier qui contient la racine du torrent. */
  parent: string;
  /** Racine du torrent (`Mon.Film.2020.720p`). */
  racine: string;
  video: string;
  sousTitres: string;
  echantillon: string;
  tailleVideo: number;
  tailleSousTitres: number;
  tailleEchantillon: number;
}

/** Un petit dossier de « release » : vidéo faite par ffmpeg, sous-titres français, `sample.mkv` volumineux, un `.nfo`. */
export function fabriquerSource(parent: string): SourceFabriquee {
  const racine = path.join(parent, 'Mon.Film.2020.720p');
  mkdirSync(racine, { recursive: true });
  const video = path.join(racine, 'Mon.Film.2020.mkv');
  ffmpegSync([
    '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video,
  ]);
  const sousTitres = path.join(racine, 'Mon.Film.2020.fr.srt');
  copyFileSync(SRT_ESSAI, sousTitres);
  const echantillon = path.join(racine, 'sample.mkv');
  writeFileSync(echantillon, randomBytes(3 * 1024 * 1024));
  writeFileSync(path.join(racine, 'info.nfo'), 'Infos du film\n');
  return {
    parent, racine, video, sousTitres, echantillon,
    tailleVideo: statSync(video).size, tailleSousTitres: statSync(sousTitres).size, tailleEchantillon: statSync(echantillon).size,
  };
}

/** Une seconde source, minuscule (autre empreinte) : `Autre.Film.2019/Autre.Film.2019.mkv`. */
export function fabriquerAutreSource(parent: string): string {
  const racine = path.join(parent, 'Autre.Film.2019');
  mkdirSync(racine, { recursive: true });
  copyFileSync(MKV_ESSAI, path.join(racine, 'Autre.Film.2019.mkv'));
  return racine;
}

export interface Pair {
  client: WebTorrent;
  torrent: TorrentWebTorrent;
  port: number;
  infoHash: string;
  /** Contenu du fichier `.torrent`. */
  fichierTorrent: Buffer;
  /** Lien magnet avec l'adresse du pair local. */
  magnet: string;
  fermer: () => Promise<void>;
}

/** Sème un dossier depuis 127.0.0.1, sans DHT, sans tracker, sans LSD, sans UPnP/NAT-PMP. */
export async function semer(racine: string): Promise<Pair> {
  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false, webSeeds: false });
  const torrent = await new Promise<TorrentWebTorrent>((resolve, reject) => {
    client.once('error', reject);
    client.seed(racine, { announce: [], createdBy: 'essais Canapé' }, resolve);
  });
  await attendre(() => client.torrentPort > 0 || undefined, 10_000, 20, "le pair local n'écoute pas");
  const port = client.torrentPort;
  const infoHash = torrent.infoHash;
  const fichierTorrent = Buffer.from((torrent as unknown as { torrentFile: Uint8Array }).torrentFile);
  return {
    client, torrent, port, infoHash, fichierTorrent,
    magnet: `magnet:?xt=urn:btih:${infoHash}&x.pe=127.0.0.1:${port}`,
    fermer: () => new Promise<void>((resolve) => { if (client.destroyed) resolve(); else client.destroy(() => resolve()); }),
  };
}

/** Corps multipart avec un fichier (`fichier`) pour `app.inject`. */
export function multipart(nomFichier: string, octets: Buffer, champs: Record<string, string> = {}): { payload: Buffer; headers: Record<string, string> } {
  const b = `----canape${randomBytes(8).toString('hex')}`;
  const morceaux: Buffer[] = [];
  for (const [k, v] of Object.entries(champs)) morceaux.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  morceaux.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="fichier"; filename="${nomFichier}"\r\nContent-Type: application/x-bittorrent\r\n\r\n`), octets, Buffer.from(`\r\n--${b}--\r\n`));
  return { payload: Buffer.concat(morceaux), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

export function posterTorrent(app: FastifyInstance, u: UtilisateurTest, nomFichier: string, octets: Buffer) {
  const { payload, headers } = multipart(nomFichier, octets);
  return app.inject({ method: 'POST', url: '/api/torrents', payload, headers: { ...u.entetes, ...headers } });
}

/** Attend qu'une fonction rende une valeur (ni `undefined`, ni `false`) ; sinon échoue avec `message`. */
export async function attendre<T>(fn: () => T | Promise<T>, delaiMs = 30_000, pasMs = 100, message = 'condition non atteinte'): Promise<Exclude<T, undefined | false>> {
  const fin = Date.now() + delaiMs;
  for (;;) {
    const v = await fn();
    if (v !== undefined && v !== false) return v as Exclude<T, undefined | false>;
    if (Date.now() > fin) throw new Error(`${message} (après ${delaiMs} ms)`);
    await new Promise((r) => setTimeout(r, pasMs));
  }
}

export async function liste(t: Pick<AppTest, 'app'>, u: UtilisateurTest): Promise<ListeTelechargements> {
  return (await get(t.app, '/api/torrents', u)).json() as ListeTelechargements;
}

export async function telechargement(t: Pick<AppTest, 'app'>, u: UtilisateurTest, id: string): Promise<Telechargement | undefined> {
  return (await liste(t, u)).telechargements.find((x) => x.id === id);
}

export async function attendreEtat(t: Pick<AppTest, 'app'>, u: UtilisateurTest, id: string, etat: string, delaiMs = 40_000): Promise<Telechargement> {
  let dernier = '';
  try {
    return await attendre(async () => {
      const x = await telechargement(t, u, id);
      dernier = x ? `${x.etat}${x.erreur ? ` (${x.erreur})` : ''}` : 'absent';
      return x && x.etat === etat ? x : undefined;
    }, delaiMs, 50);
  } catch (e) {
    throw new Error(`${(e as Error).message} : « ${etat} » attendu, dernier état « ${dernier} »`);
  }
}

/** Le processus existe-t-il encore ? */
export function vivant(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Trace chaque état pris par les lignes `telechargements` (déclencheurs SQLite propres à l'essai). */
export function tracerEtats(t: Pick<AppTest, 'db'>): (id: string) => string[] {
  t.db.exec(`
    CREATE TABLE essai_etats (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, etat TEXT);
    CREATE TRIGGER essai_ajout AFTER INSERT ON telechargements BEGIN INSERT INTO essai_etats (id, etat) VALUES (NEW.id, NEW.etat); END;
    CREATE TRIGGER essai_maj AFTER UPDATE OF etat ON telechargements WHEN OLD.etat <> NEW.etat BEGIN INSERT INTO essai_etats (id, etat) VALUES (NEW.id, NEW.etat); END;
  `);
  return (id) => (t.db.prepare('SELECT etat FROM essai_etats WHERE id = ? ORDER BY n').all(id) as Array<{ etat: string }>).map((l) => l.etat);
}
