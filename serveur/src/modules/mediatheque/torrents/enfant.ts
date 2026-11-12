// Processus enfant : possède le client WebTorrent. Lancé par `moteur.ts` (child_process.fork) avec le même Node.
// Il ne touche ni la base ni l'API : il reçoit des ordres du serveur et lui rend des états.
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { setPriority } from 'node:os';
import WebTorrent, { type OptionsClientWebTorrent, type TorrentWebTorrent } from 'webtorrent';
import type { DeEnfant, EtatTorrentEnfant, OptionsEnfant, VersEnfant } from './protocole.ts';

const envoyerAuParent = process.send?.bind(process);
if (!envoyerAuParent) throw new Error('enfant.ts doit être lancé par child_process.fork.');
const envoyer = (m: DeEnfant): void => { try { envoyerAuParent(m); } catch { /* parent parti : `disconnect` suit */ } };

const options = JSON.parse(process.argv[2] ?? '{}') as OptionsEnfant;
try { setPriority(0, options.priorite); } catch { /* priorité non modifiable : tant pis */ }
// Fichiers et dossiers ouverts au groupe canape (660 / 770) : si Transmission reprend ce téléchargement, il doit
// pouvoir écrire dans ce que WebTorrent a commencé (le service, lui, tourne avec UMask=0027).
process.umask(0o007);

// Plus de parent : plus de raison de vivre (jamais de processus orphelin).
process.on('disconnect', () => process.exit(0));
process.on('uncaughtException', (err) => { console.error('[torrents] erreur fatale du moteur :', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('[torrents] promesse rejetée :', err); process.exit(1); });

const optionsClient: OptionsClientWebTorrent = {
  torrentPort: options.port,
  downloadLimit: options.debitMax > 0 ? options.debitMax : -1,
  uploadLimit: options.envoiMax > 0 ? options.envoiMax : -1,
  // Le serveur ne va jamais chercher une adresse donnée par un torrent (web seeds).
  webSeeds: false,
  ...(options.isole ? { dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false } : {}),
};
const client = new WebTorrent(optionsClient);
client.on('error', (err) => console.error('[torrents] erreur du client :', err));

interface Entree {
  id: string;
  dossier: string;
  torrent: TorrentWebTorrent;
  /** Fichiers voulus (`null` : pas encore choisis). */
  choix: Set<number> | null;
  /** Fichiers réellement sélectionnés dans WebTorrent. */
  selectionnes: Set<number>;
  termine: boolean;
  partage: { ratio: number; limite: number } | null;
}
const entrees = new Map<string, Entree>();

function appliquerChoix(e: Entree): void {
  const t = e.torrent;
  if (!e.choix || !t.files.length) return;
  const voulus = [...e.choix].filter((i) => i >= 0 && i < t.files.length).sort((x, y) => x - y);
  const deja = [...e.selectionnes].sort((x, y) => x - y);
  if (voulus.length === deja.length && voulus.every((v, i) => v === deja[i])) return;
  // Un fichier ne se désélectionne pas seul : ses morceaux de bordure sont partagés avec ses voisins, et WebTorrent
  // rogne alors leurs sélections. On repart donc de zéro et on sélectionne les fichiers voulus.
  if (t.pieces.length > 0) t.deselect(0, t.pieces.length - 1);
  e.selectionnes.clear();
  for (const i of voulus) {
    const f = t.files[i];
    if (f && f.length > 0) f.select();
    e.selectionnes.add(i);
  }
  e.termine = false;
}

function ajouter(m: Extract<VersEnfant, { t: 'ajouter' }>): void {
  if (entrees.has(m.id)) return;
  let torrent: TorrentWebTorrent;
  try {
    const source = m.fichier ? readFileSync(m.fichier) : (m.magnet ?? '');
    torrent = client.add(source, { path: m.dossier, deselect: true });
  } catch (err) {
    envoyer({ t: 'erreur', id: m.id, message: (err as Error).message });
    return;
  }
  const e: Entree = { id: m.id, dossier: m.dossier, torrent, choix: m.choix ? new Set(m.choix) : null, selectionnes: new Set(), termine: false, partage: null };
  entrees.set(m.id, e);
  if (options.pairs?.length) {
    torrent.once('infoHash', () => { for (const pair of options.pairs) { try { torrent.addPeer(pair); } catch { /* torrent arrêté */ } } });
  }
  torrent.on('metadata', () => {
    envoyer({
      t: 'metadonnees', id: m.id, infoHash: torrent.infoHash, nom: torrent.name,
      fichiers: torrent.files.map((f, index) => ({ index, chemin: f.path, taille: f.length })),
    });
    appliquerChoix(e);
  });
  torrent.on('error', (err: Error) => {
    if (entrees.get(m.id) === e) entrees.delete(m.id);
    envoyer({ t: 'erreur', id: m.id, message: err.message });
  });
}

function retirer(id: string, effacer: boolean): void {
  const e = entrees.get(id);
  entrees.delete(id);
  const fini = async (): Promise<void> => {
    if (effacer && e) await rm(e.dossier, { recursive: true, force: true }).catch(() => undefined);
    envoyer({ t: 'retire', id });
  };
  if (!e) { void fini(); return; }
  let fait = false;
  const une = (): void => { if (!fait) { fait = true; void fini(); } };
  try { e.torrent.destroy({ destroyStore: false }, une); } catch { une(); }
  setTimeout(une, 5000).unref();
}

function etat(e: Entree): EtatTorrentEnfant {
  const t = e.torrent;
  let octetsRecus = 0;
  let octetsTotal = 0;
  if (e.choix) {
    for (const i of e.choix) {
      const f = t.files[i];
      if (!f) continue;
      octetsTotal += f.length;
      octetsRecus += f.done ? f.length : Math.min(f.length, f.downloaded);
    }
  }
  return { id: e.id, octetsRecus, octetsTotal, debit: Math.round(t.downloadSpeed), debitEnvoi: Math.round(t.uploadSpeed), pairs: t.numPeers };
}

function surTic(): void {
  const liste: EtatTorrentEnfant[] = [];
  for (const e of [...entrees.values()]) {
    const t = e.torrent;
    if (t.destroyed) continue;
    liste.push(etat(e));
    if (e.choix && t.ready && !e.termine) {
      const voulus = [...e.choix].map((i) => t.files[i]);
      if (voulus.length > 0 && voulus.every((f) => f && (f.done || f.length === 0))) {
        e.termine = true;
        envoyer({ t: 'termine', id: e.id });
      }
    }
    if (e.partage && e.termine) {
      const total = [...(e.choix ?? [])].reduce((n, i) => n + (t.files[i]?.length ?? 0), 0);
      if (t.uploaded >= e.partage.ratio * Math.max(1, total) || Date.now() > e.partage.limite) {
        e.partage = null;
        envoyer({ t: 'partage_fini', id: e.id });
      }
    }
  }
  envoyer({ t: 'etat', torrents: liste });
}
setInterval(surTic, options.intervalleMs).unref();

function arreter(): void {
  const sortir = (): void => process.exit(0);
  setTimeout(sortir, 3000).unref();
  try { client.destroy(sortir); } catch { sortir(); }
}

process.on('message', (m: VersEnfant) => {
  switch (m.t) {
    case 'ajouter': ajouter(m); break;
    case 'choisir': {
      const e = entrees.get(m.id);
      if (e) { e.choix = new Set(m.fichiers); appliquerChoix(e); }
      break;
    }
    case 'partager': {
      const e = entrees.get(m.id);
      if (e) e.partage = { ratio: m.ratio ?? 1, limite: Date.now() + (m.delaiMs ?? 24 * 3600_000) };
      break;
    }
    case 'retirer': retirer(m.id, m.effacer); break;
    case 'arreter': arreter(); break;
  }
});

envoyer({ t: 'pret' });
