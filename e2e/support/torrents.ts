// Aides des essais des torrents : sources fabriquées par ffmpeg (`lavfi`) et pair local (WebTorrent sur 127.0.0.1).
// Aucun trafic vers Internet : ni DHT, ni trackers, ni découverte locale, ni UPnP (et le serveur tourne avec CANAPE_TORRENT_ISOLE=1).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import WebTorrent from 'webtorrent';

function ffmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg a échoué (${r.status ?? r.error?.message})`);
}

function webm(sortie: string, source: string, secondes: number, hz: number, debit = '100k'): void {
  ffmpeg([
    '-f', 'lavfi', '-i', `${source}=size=320x180:rate=15`, '-f', 'lavfi', '-i', `sine=frequency=${hz}:sample_rate=48000`,
    '-t', String(secondes), '-c:v', 'libvpx-vp9', '-b:v', debit, '-minrate', debit, '-maxrate', debit, '-deadline', 'realtime', '-cpu-used', '8',
    '-c:a', 'libopus', '-b:a', '32k', '-shortest', sortie,
  ]);
}

const SRT = '1\n00:00:00,000 --> 00:00:02,000\nBonsoir\n\n';

export interface SourcesTorrents {
  /** Un film et ses sous-titres. */
  simple: string;
  /** Deux vidéos : la plus grosse est choisie d'office. */
  double: string;
  /** Une grosse « vidéo » (aléatoire), pour avoir le temps de mettre en pause. */
  gros: string;
}

export function fabriquerSources(parent: string): SourcesTorrents {
  const simple = path.join(parent, 'Mon.Film.2020');
  mkdirSync(simple, { recursive: true });
  webm(path.join(simple, 'Mon.Film.2020.webm'), 'testsrc2', 3, 440);
  writeFileSync(path.join(simple, 'Mon.Film.2020.fr.srt'), SRT);

  const double = path.join(parent, 'Double.Programme');
  mkdirSync(double, { recursive: true });
  webm(path.join(double, 'Premier.Film.webm'), 'testsrc2', 20, 330, '2M');
  webm(path.join(double, 'Second.Film.webm'), 'smptebars', 10, 550, '2M');

  const gros = path.join(parent, 'Gros.Torrent');
  mkdirSync(gros, { recursive: true });
  writeFileSync(path.join(gros, 'gros.mkv'), randomBytes(24 * 1024 * 1024));
  return { simple, double, gros };
}

export interface PairLocal {
  port: number;
  /** Lien magnet (avec l'adresse du pair local) et fichier `.torrent` de chaque source. */
  magnet: (racine: string) => string;
  fichierTorrent: (racine: string) => Buffer;
  fermer: () => Promise<void>;
}

/** Sème des dossiers depuis 127.0.0.1 (un seul client, un seul port). */
export async function semer(racines: string[]): Promise<PairLocal> {
  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false, webSeeds: false });
  const infos = new Map<string, { infoHash: string; fichier: Buffer }>();
  for (const racine of racines) {
    const t = await new Promise<{ infoHash: string; torrentFile: Uint8Array }>((resolve, reject) => {
      client.once('error', reject);
      client.seed(racine, { announce: [], createdBy: 'essais Canapé' }, resolve as never);
    });
    infos.set(racine, { infoHash: t.infoHash, fichier: Buffer.from(t.torrentFile) });
  }
  const debut = Date.now();
  while (!(client.torrentPort > 0)) {
    if (Date.now() - debut > 10_000) throw new Error("Le pair local n'écoute pas.");
    await new Promise((r) => setTimeout(r, 20));
  }
  const port = client.torrentPort;
  const info = (r: string) => infos.get(r) ?? (() => { throw new Error(`Source inconnue : ${r}`); })();
  return {
    port,
    magnet: (r) => `magnet:?xt=urn:btih:${info(r).infoHash}&x.pe=127.0.0.1:${port}`,
    fichierTorrent: (r) => info(r).fichier,
    fermer: () => new Promise<void>((resolve) => { if (client.destroyed) resolve(); else client.destroy(() => resolve()); }),
  };
}
