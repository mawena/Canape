// Aides des essais du moteur Transmission : fabrication d'un `.torrent` (sans réseau) et d'une application branchée
// sur le faux serveur RPC.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { encoder, type ValeurBencode } from '../../src/modules/mediatheque/torrents/bencode.ts';
import { creerAppTest, creerUtilisateur, type AppTest, type UtilisateurTest } from '../aides.ts';
import { MKV_ESSAI, SRT_ESSAI } from './aides-torrents.ts';
import { FauxTransmission, type FichierFaux } from './faux-transmission.ts';

export interface OptionsTorrentFabrique {
  nom?: string;
  fichiers?: Array<{ chemin: string; taille: number }>;
  prive?: boolean;
  announce?: string;
  announceList?: string[][];
  urlList?: string[];
  httpseeds?: string[];
  nodes?: Array<[string, number]>;
}

export interface TorrentFabrique { octets: Buffer; infoHash: string; nom: string }

const b = (t: string): Buffer => Buffer.from(t, 'utf8');

/** Un `.torrent` valide en bencode (pièces au hasard : personne ne le télécharge vraiment). */
export function fabriquerTorrent(o: OptionsTorrentFabrique = {}): TorrentFabrique {
  const nom = o.nom ?? `Film.${randomBytes(3).toString('hex')}.2020`;
  const fichiers = o.fichiers ?? [{ chemin: `${nom}.mkv`, taille: 5000 }];
  const info = new Map<string, ValeurBencode>([
    ['name', b(nom)], ['piece length', 16384], ['pieces', randomBytes(20 * 2)],
  ]);
  if (fichiers.length === 1 && o.fichiers === undefined) info.set('length', fichiers[0]!.taille);
  else info.set('files', fichiers.map((f) => new Map<string, ValeurBencode>([['length', f.taille], ['path', f.chemin.split('/').map(b)]])));
  if (o.prive) info.set('private', 1);
  const racine = new Map<string, ValeurBencode>([['info', info], ['created by', b('essais Canapé')]]);
  if (o.announce) racine.set('announce', b(o.announce));
  if (o.announceList) racine.set('announce-list', o.announceList.map((p) => p.map(b)));
  if (o.urlList) racine.set('url-list', o.urlList.map(b));
  if (o.httpseeds) racine.set('httpseeds', o.httpseeds.map(b));
  if (o.nodes) racine.set('nodes', o.nodes.map(([h, p]) => [b(h), p]));
  const infoHash = createHash('sha1').update(encoder(info)).digest('hex');
  return { octets: encoder(racine), infoHash, nom };
}

export const magnetDe = (hash: string, extra = ''): string => `magnet:?xt=urn:btih:${hash}${extra}`;
export const hashAuHasard = (): string => randomBytes(20).toString('hex');

export const VIDEO = readFileSync(MKV_ESSAI);
export const SOUS_TITRES = readFileSync(SRT_ESSAI);

/** Les fichiers d'une « release » : vidéo réelle, sous-titres, échantillon et .nfo (non choisis par défaut). */
export function fichiersRelease(nom = 'Mon.Film.2020'): FichierFaux[] {
  return [
    { name: `${nom}/${nom}.mkv`, length: VIDEO.length, contenu: VIDEO },
    { name: `${nom}/${nom}.fr.srt`, length: SOUS_TITRES.length, contenu: SOUS_TITRES },
    { name: `${nom}/sample.mkv`, length: 4000 },
    { name: `${nom}/info.nfo`, length: 50 },
  ];
}

/** `.torrent` correspondant à `fichiersRelease`. */
export function torrentRelease(o: Omit<OptionsTorrentFabrique, 'nom' | 'fichiers'> = {}, nom = 'Mon.Film.2020'): TorrentFabrique {
  return fabriquerTorrent({
    ...o, nom, fichiers: fichiersRelease(nom).map((f) => ({ chemin: f.name.slice(nom.length + 1), taille: f.length })),
  });
}

export interface AppTransmission extends AppTest {
  faux: FauxTransmission;
  admin: UtilisateurTest;
  alice: UtilisateurTest;
}

/** Application dont le moteur Transmission parle à un faux RPC (en mémoire). */
export async function creerAppTransmission(env: Record<string, string> = {}, o: { fauxArrete?: boolean; utilisateur?: string; motDePasse?: string } = {}): Promise<AppTransmission> {
  const faux = new FauxTransmission();
  faux.utilisateur = o.utilisateur ?? '';
  faux.motDePasse = o.motDePasse ?? '';
  await faux.demarrer();
  const port = faux.port;
  if (o.fauxArrete) await faux.arreter();
  const t = await creerAppTest({
    env: {
      CANAPE_TORRENT_MOTEUR: 'transmission', CANAPE_TORRENT_ISOLE: '1', CANAPE_TRANSMISSION_URL: `http://127.0.0.1:${port}/transmission/rpc`,
      ...(o.utilisateur ? { CANAPE_TRANSMISSION_UTILISATEUR: o.utilisateur, CANAPE_TRANSMISSION_MOT_DE_PASSE: o.motDePasse ?? '' } : {}),
      ...env,
    },
  });
  faux.port = port;
  const admin = await creerUtilisateur(t, { role: 'admin' });
  const alice = await creerUtilisateur(t, { prenom: 'Alice' });
  const ferme = t.fermer;
  return { ...t, faux, admin, alice, fermer: async () => { await ferme(); await faux.arreter(); } };
}
