// Faux serveur RPC Transmission, en mémoire, sans réseau (127.0.0.1) : session 409, authentification, torrent-add / get /
// set / start / stop / remove, erreurs, tracker qui refuse. Les essais pilotent son « réseau » (métadonnées, progression,
// refus d'un tracker, panne) et il écrit de vrais fichiers dans le dossier de téléchargement pour que l'import marche.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export interface FichierFaux { name: string; length: number; contenu?: Buffer }
export interface TorrentFaux {
  hashString: string;
  name: string;
  status: number;
  files: FichierFaux[];
  wanted: boolean[];
  downloadDir: string;
  /** Octets reçus par fichier. */
  recus: number[];
  paused: boolean;
  isPrivate: boolean;
  error: number;
  errorString: string;
  uploadRatio: number;
  seedRatioMode: number;
  seedRatioLimit: number | null;
  seedIdleMode: number | null;
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  trackerStats: Array<{ lastAnnounceResult: string; lastAnnounceSucceeded: boolean; lastAnnounceTime: number }>;
  isFinished: boolean;
  /** Pas de métadonnées (lien magnet) tant que `donnerMetadonnees` n'est pas appelé. */
  sansMeta: boolean;
  metainfo: Buffer | null;
  magnet: string | null;
  trackers: string[];
}

export interface AppelRpc { methode: string; args: Record<string, unknown> }

export class FauxTransmission {
  readonly torrents = new Map<string, TorrentFaux>();
  readonly appels: AppelRpc[] = [];
  readonly sessionSet: Array<Record<string, unknown>> = [];
  session = randomBytes(8).toString('hex');
  utilisateur = '';
  motDePasse = '';
  /** Nombre de requêtes refusées pour identifiant de session périmé. */
  n409 = 0;
  /** Latence ajoutée à chaque réponse (ms). */
  latence = 0;
  private serveur: http.Server | null = null;
  port = 0;

  get url(): string { return `http://127.0.0.1:${this.port}/transmission/rpc`; }

  async demarrer(port = 0): Promise<void> {
    this.serveur = http.createServer((req, rep) => { void this.traiter(req, rep); });
    await new Promise<void>((r) => this.serveur!.listen(port, '127.0.0.1', r));
    this.port = (this.serveur.address() as AddressInfo).port;
  }

  async arreter(): Promise<void> {
    const s = this.serveur;
    this.serveur = null;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }

  renouvelerSession(): void { this.session = randomBytes(8).toString('hex'); }
  appelsDe(methode: string): AppelRpc[] { return this.appels.filter((a) => a.methode === methode); }

  private async traiter(req: http.IncomingMessage, rep: http.ServerResponse): Promise<void> {
    const morceaux: Buffer[] = [];
    for await (const m of req) morceaux.push(m as Buffer);
    if (this.latence) await new Promise((r) => setTimeout(r, this.latence));
    if (this.utilisateur) {
      const attendu = `Basic ${Buffer.from(`${this.utilisateur}:${this.motDePasse}`).toString('base64')}`;
      if (req.headers['authorization'] !== attendu) { rep.statusCode = 401; rep.setHeader('www-authenticate', 'Basic realm="Transmission"'); rep.end('401: Unauthorized'); return; }
    }
    if (req.headers['x-transmission-session-id'] !== this.session) {
      this.n409++;
      rep.statusCode = 409;
      rep.setHeader('x-transmission-session-id', this.session);
      rep.end('409: Conflict');
      return;
    }
    let corps: { method: string; arguments?: Record<string, unknown> };
    try { corps = JSON.parse(Buffer.concat(morceaux).toString('utf8')); } catch { rep.statusCode = 400; rep.end('bad'); return; }
    const args = corps.arguments ?? {};
    this.appels.push({ methode: corps.method, args });
    let resultat = 'success';
    let sortie: Record<string, unknown> = {};
    try { sortie = this.methode(corps.method, args); } catch (e) { resultat = (e as Error).message; }
    rep.setHeader('content-type', 'application/json');
    rep.end(JSON.stringify({ result: resultat, arguments: sortie }));
  }

  private cibles(args: Record<string, unknown>): TorrentFaux[] {
    const ids = (args['ids'] as string[] | undefined) ?? [...this.torrents.keys()];
    return ids.map((i) => this.torrents.get(String(i).toLowerCase())).filter((t): t is TorrentFaux => !!t);
  }

  private methode(nom: string, args: Record<string, unknown>): Record<string, unknown> {
    switch (nom) {
      case 'session-get': return { version: '4.0.5 (faux)', 'rpc-version': 17 };
      case 'session-set': this.sessionSet.push(args); return {};
      case 'torrent-add': return this.ajouter(args);
      case 'torrent-get': return { torrents: this.cibles(args).map((t) => this.vue(t, (args['fields'] as string[] | undefined) ?? [])) };
      case 'torrent-set': {
        for (const t of this.cibles(args)) {
          for (const i of (args['files-wanted'] as number[] | undefined) ?? []) t.wanted[i] = true;
          for (const i of (args['files-unwanted'] as number[] | undefined) ?? []) t.wanted[i] = false;
          if (args['seedRatioMode'] !== undefined) t.seedRatioMode = args['seedRatioMode'] as number;
          if (args['seedRatioLimit'] !== undefined) t.seedRatioLimit = args['seedRatioLimit'] as number;
          if (args['seedIdleMode'] !== undefined) t.seedIdleMode = args['seedIdleMode'] as number;
        }
        return {};
      }
      case 'torrent-start': for (const t of this.cibles(args)) { t.paused = false; this.recalculer(t); } return {};
      case 'torrent-stop': for (const t of this.cibles(args)) { t.paused = true; t.status = 0; } return {};
      case 'torrent-remove': {
        for (const t of this.cibles(args)) {
          if (args['delete-local-data']) for (const f of t.files) rmSync(path.join(t.downloadDir, f.name), { force: true });
          this.torrents.delete(t.hashString);
        }
        return {};
      }
      default: throw new Error(`method not recognized (${nom})`);
    }
  }

  private ajouter(args: Record<string, unknown>): Record<string, unknown> {
    let hash: string;
    let nom = '';
    let fichiers: FichierFaux[] = [];
    let sansMeta = true;
    let metainfo: Buffer | null = null;
    let magnet: string | null = null;
    let prive = false;
    let trackers: string[] = [];
    if (typeof args['metainfo'] === 'string') {
      metainfo = Buffer.from(args['metainfo'], 'base64');
      const info = this.lireTorrent(metainfo);
      hash = info.hash; nom = info.nom; fichiers = info.fichiers; sansMeta = false; prive = info.prive; trackers = info.trackers;
    } else if (typeof args['filename'] === 'string') {
      magnet = args['filename'];
      const m = /btih:([0-9a-f]{40})/i.exec(magnet);
      if (!m) throw new Error('invalid or corrupt torrent file');
      hash = m[1]!.toLowerCase();
      trackers = [...new URL(magnet).searchParams.getAll('tr')];
    } else throw new Error('no filename or metainfo specified');
    if (this.torrents.has(hash)) return { 'torrent-duplicate': { hashString: hash, id: 1, name: this.torrents.get(hash)!.name } };
    const t: TorrentFaux = {
      hashString: hash, name: nom, status: 0, files: fichiers, wanted: fichiers.map(() => true), downloadDir: String(args['download-dir']),
      recus: fichiers.map(() => 0), paused: !!args['paused'], isPrivate: prive, error: 0, errorString: '', uploadRatio: 0, seedRatioMode: 0,
      seedRatioLimit: null, seedIdleMode: null, rateDownload: 0, rateUpload: 0, peersConnected: 0, trackerStats: [], isFinished: false,
      sansMeta, metainfo, magnet, trackers,
    };
    this.torrents.set(hash, t);
    this.recalculer(t);
    return { 'torrent-added': { hashString: hash, id: this.torrents.size, name: nom } };
  }

  /** Lit un `.torrent` (bencode) : nom, fichiers, drapeau privé. */
  private lireTorrent(octets: Buffer): { hash: string; nom: string; fichiers: FichierFaux[]; prive: boolean; trackers: string[] } {
    const decode = this.decoderBencode(octets);
    const racine = decode.valeur as Map<string, unknown>;
    const info = racine.get('info') as Map<string, unknown>;
    const nom = (info.get('name') as Buffer).toString('utf8');
    const liste = info.get('files') as Array<Map<string, unknown>> | undefined;
    const fichiers: FichierFaux[] = liste
      ? liste.map((f) => ({ name: `${nom}/${(f.get('path') as Buffer[]).map((p) => p.toString('utf8')).join('/')}`, length: Number(f.get('length')) }))
      : [{ name: nom, length: Number(info.get('length')) }];
    const trackers: string[] = [];
    const a = racine.get('announce'); if (Buffer.isBuffer(a)) trackers.push(a.toString());
    for (const p of (racine.get('announce-list') as Buffer[][] | undefined) ?? []) for (const u of p) trackers.push(u.toString());
    return { hash: decode.hash, nom, fichiers, prive: Number(info.get('private') ?? 0) === 1, trackers };
  }

  private decoderBencode(b: Buffer): { valeur: unknown; hash: string } {
    // Décodeur autonome (le faux ne dépend pas du code testé) ; l'empreinte est le SHA-1 des octets de `info`.
    let i = 0;
    let debutInfo = -1; let finInfo = -1;
    const lire = (cle?: string): unknown => {
      const c = b[i]!;
      if (c === 0x69) { const f = b.indexOf(0x65, i); const n = Number(b.toString('latin1', i + 1, f)); i = f + 1; return n; }
      if (c === 0x6c) { i++; const l: unknown[] = []; while (b[i] !== 0x65) l.push(lire()); i++; return l; }
      if (c === 0x64) {
        const debut = i; i++;
        const d = new Map<string, unknown>();
        while (b[i] !== 0x65) { const k = (lire() as Buffer).toString('latin1'); d.set(k, lire(k)); }
        i++;
        if (cle === 'info') { debutInfo = debut; finInfo = i; }
        return d;
      }
      const deux = b.indexOf(0x3a, i); const n = Number(b.toString('latin1', i, deux)); const d = deux + 1; i = d + n;
      return b.subarray(d, d + n);
    };
    const valeur = lire();
    return { valeur, hash: createHash('sha1').update(b.subarray(debutInfo, finInfo)).digest('hex') };
  }

  private recalculer(t: TorrentFaux): void {
    if (t.paused) { t.status = 0; return; }
    if (t.sansMeta) { t.status = 4; return; }
    const reste = t.files.some((f, i) => t.wanted[i] && (t.recus[i] ?? 0) < f.length);
    t.status = reste ? 4 : 6;
  }

  private vue(t: TorrentFaux, champs: string[]): Record<string, unknown> {
    const voulus = t.files.map((f, i) => (t.wanted[i] ? f.length : 0));
    const sizeWhenDone = voulus.reduce((a, b) => a + b, 0);
    const recu = t.files.reduce((n, f, i) => n + (t.wanted[i] ? Math.min(f.length, t.recus[i] ?? 0) : 0), 0);
    const tout: Record<string, unknown> = {
      hashString: t.hashString, name: t.name, status: t.status, error: t.error, errorString: t.errorString,
      files: t.files.map((f) => ({ name: f.name, length: f.length })), metadataPercentComplete: t.sansMeta ? 0 : 1,
      sizeWhenDone, leftUntilDone: sizeWhenDone - recu, rateDownload: t.rateDownload, rateUpload: t.rateUpload,
      peersConnected: t.peersConnected, isPrivate: t.isPrivate, isFinished: t.isFinished, uploadRatio: t.uploadRatio,
      downloadDir: t.downloadDir, trackerStats: t.trackerStats, trackers: t.trackers.map((a) => ({ announce: a })),
      webseeds: [], webseedsSendingToUs: 0,
    };
    if (!champs.length) return tout;
    return Object.fromEntries(champs.map((c) => [c, tout[c]]));
  }

  // ----- Le « réseau » : piloté par les essais -----

  torrent(hash: string): TorrentFaux {
    const t = this.torrents.get(hash.toLowerCase());
    if (!t) throw new Error(`le faux Transmission ne connaît pas ${hash}`);
    return t;
  }

  /** Un magnet reçoit enfin ses métadonnées. */
  donnerMetadonnees(hash: string, o: { nom: string; fichiers: FichierFaux[]; prive?: boolean }): void {
    const t = this.torrent(hash);
    t.name = o.nom; t.files = o.fichiers; t.wanted = o.fichiers.map(() => true); t.recus = o.fichiers.map(() => 0);
    t.isPrivate = !!o.prive; t.sansMeta = false;
    this.recalculer(t);
  }

  /** Les fichiers voulus arrivent (écrits sur le disque) : `fraction` de 0 à 1 ; 1 = tout reçu. */
  recevoir(hash: string, fraction: number): void {
    const t = this.torrent(hash);
    t.files.forEach((f, i) => {
      if (!t.wanted[i]) return;
      const n = Math.floor(f.length * fraction);
      t.recus[i] = n;
      if (n >= f.length) {
        const chemin = path.join(t.downloadDir, f.name);
        mkdirSync(path.dirname(chemin), { recursive: true, mode: 0o775 });
        writeFileSync(chemin, f.contenu ?? Buffer.alloc(f.length, 7), { mode: 0o664 });
      }
    });
    t.rateDownload = fraction < 1 ? 1000 : 0;
    t.peersConnected = fraction < 1 ? 3 : 1;
    this.recalculer(t);
  }

  /** Le tracker répond par un refus. */
  refuserTracker(hash: string, message: string): void {
    this.torrent(hash).trackerStats = [{ lastAnnounceResult: message, lastAnnounceSucceeded: false, lastAnnounceTime: Math.floor(Date.now() / 1000) }];
  }

  /** Le torrent est en partage : le ratio monte. */
  fixerRatio(hash: string, ratio: number): void {
    const t = this.torrent(hash);
    t.uploadRatio = ratio;
    t.rateUpload = 500;
    if (t.seedRatioMode === 1 && t.seedRatioLimit !== null && ratio >= t.seedRatioLimit) { t.status = 0; t.isFinished = true; }
  }
}
