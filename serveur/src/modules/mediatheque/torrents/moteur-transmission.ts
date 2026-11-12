// Moteur Transmission : pilote `transmission-daemon` (même serveur, RPC en local) pour tous les torrents.
// Il parle comme le moteur WebTorrent (mêmes messages `DeEnfant`), donc le service n'a qu'une seule logique.
// Les torrents que Transmission détient pour d'autres usages ne sont jamais touchés : seuls ceux ajoutés par Canapé
// (retrouvés par `hashString`, dans leur dossier `<telechargements>/<id>`) sont suivis.
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MoteurTorrent } from '@canape/partage';
import type { Config } from '../../../config.ts';
import type { Journal } from '../mediatheque.ts';
import type { EvenementsMoteur, MoteurTorrents } from './moteur.ts';
import type { EtatTorrentEnfant, VersEnfant } from './protocole.ts';
import { masquer } from './securite.ts';
import { ClientTransmission, ErreurTransmission } from './transmission-rpc.ts';

const CHAMPS = [
  'hashString', 'name', 'status', 'error', 'errorString', 'files', 'metadataPercentComplete', 'sizeWhenDone', 'leftUntilDone',
  'rateDownload', 'rateUpload', 'peersConnected', 'isPrivate', 'isFinished', 'uploadRatio', 'downloadDir', 'trackerStats',
];

interface TrackerStat { lastAnnounceResult?: string; lastAnnounceSucceeded?: boolean; lastAnnounceTime?: number }
interface TorrentTransmission {
  hashString: string; name: string; status: number; error: number; errorString: string; files: Array<{ name: string; length: number }>;
  metadataPercentComplete: number; sizeWhenDone: number; leftUntilDone: number; rateDownload: number; rateUpload: number;
  peersConnected: number; isPrivate: boolean; isFinished: boolean; uploadRatio: number; downloadDir: string; trackerStats: TrackerStat[];
}

interface Suivi {
  id: string;
  hash: string | null;
  dossier: string;
  magnet: string | null;
  fichier: string | null;
  choix: number[] | null;
  choixApplique: boolean;
  meta: boolean;
  nbFichiers: number;
  /** Ajouté dans Transmission. */
  ajoute: boolean;
  pausee: boolean;
  termine: boolean;
  /** Une erreur a été signalée au service : plus rien à faire sur ce torrent. */
  erreur: boolean;
  /** Torrent déjà présent dans Transmission hors de Canapé : on n'y touche pas. */
  etranger: boolean;
  dirVerifie: boolean;
  partage: { ratio: number | null; limite: number | null } | null;
  partageFini: boolean;
}

const ECHECS_AVANT_MORT = 3;
const RE_RESEAU = /could not connect|connection|timed? ?out|unreachable|no response|resolve|dns|refused to connect|délai/i;

const dossierEgal = (a: string, b: string): boolean => path.resolve(a) === path.resolve(b);

export class MoteurTransmission extends EventEmitter<EvenementsMoteur> implements MoteurTorrents {
  readonly nom: MoteurTorrent = 'transmission';
  private readonly client: ClientTransmission;
  private readonly suivis = new Map<string, Suivi>();
  private readonly aRetirer: Array<{ hash: string; effacer: boolean }> = [];
  private pret = false;
  private voulu = false;
  private arrete = false;
  private echecs = 0;
  private minuteur: NodeJS.Timeout | null = null;
  private enCours = false;
  private reveil = false;
  private resoudrePremiere: () => void = () => undefined;
  /** Résolue après la première tentative de connexion (réussie ou non). */
  readonly premiereReponse: Promise<void>;
  /** Dernière erreur de connexion (`null` tant que Transmission répond). */
  derniereErreur: string | null = null;
  /** Version de Transmission, une fois connecté. */
  version: string | null = null;

  private readonly config: Config;
  private readonly journal: Journal;
  private readonly intervalleMs: number;

  constructor(config: Config, journal: Journal) {
    super();
    this.config = config;
    this.journal = journal;
    this.intervalleMs = config.torrentIsole ? 200 : 1000;
    this.client = new ClientTransmission({ url: config.transmissionUrl, utilisateur: config.transmissionUtilisateur, motDePasse: config.transmissionMotDePasse });
    this.premiereReponse = new Promise<void>((r) => { this.resoudrePremiere = r; });
  }

  get actif(): boolean { return this.pret; }

  /** Début du suivi : la première tentative de connexion part tout de suite. */
  demarrer(): void {
    this.voulu = true;
    if (!this.minuteur && !this.enCours && !this.arrete) this.planifier(0);
  }

  private planifier(delai: number): void {
    if (this.arrete) return;
    this.minuteur = setTimeout(() => { this.minuteur = null; void this.tic(); }, delai);
    this.minuteur.unref();
  }

  private reveiller(): void {
    if (this.enCours) { this.reveil = true; return; }
    if (this.minuteur && this.voulu && !this.arrete) { clearTimeout(this.minuteur); this.minuteur = null; this.planifier(0); }
  }

  // ----- Boucle -----

  private async tic(): Promise<void> {
    this.enCours = true;
    try {
      if (!this.pret) await this.connecter();
      await this.rafraichir();
      this.echecs = 0;
    } catch (e) {
      this.surEchec(e as Error);
    } finally {
      this.enCours = false;
      this.resoudrePremiere();
      const delai = this.reveil ? 0 : this.pret ? this.intervalleMs : Math.max(this.intervalleMs * 3, 600);
      this.reveil = false;
      this.planifier(delai);
    }
  }

  private surEchec(e: Error): void {
    const message = e instanceof ErreurTransmission ? e.message : `Erreur avec Transmission : ${masquer(e.message)}`;
    this.echecs++;
    if (this.pret && this.echecs >= ECHECS_AVANT_MORT) {
      this.pret = false;
      this.derniereErreur = message;
      this.journal.warn({ err: message }, "Transmission ne répond plus : les torrents attendent, nouvel essai régulier");
      this.emit('mort', message);
    } else if (!this.pret && this.derniereErreur !== message) {
      this.derniereErreur = message;
      const grave = e instanceof ErreurTransmission && ['authentification', 'interdit', 'reponse'].includes(e.code);
      // Appels directs : une méthode de pino détachée de son objet (`(a ? j.error : j.info)(…)`) plante.
      if (grave) this.journal.error({ err: message }, 'Transmission ne répond pas');
      else this.journal.info({ err: message }, 'Transmission ne répond pas');
    }
  }

  /** Connexion : réglages de session (débits, port, file), puis annonce que le moteur est prêt. */
  private async connecter(): Promise<void> {
    const infos = await this.client.appeler<{ version?: string }>('session-get', { fields: ['version'] });
    const c = this.config;
    const reglages: Record<string, unknown> = {
      'download-queue-enabled': true, 'download-queue-size': c.torrentSimultanes, 'queue-stalled-enabled': false, 'seed-queue-enabled': false,
      'speed-limit-down-enabled': c.torrentDebitMax > 0, 'speed-limit-up-enabled': c.torrentEnvoiMax > 0,
    };
    if (c.torrentDebitMax > 0) reglages['speed-limit-down'] = Math.max(1, Math.ceil(c.torrentDebitMax / 1000));
    if (c.torrentEnvoiMax > 0) reglages['speed-limit-up'] = Math.max(1, Math.ceil(c.torrentEnvoiMax / 1000));
    if (c.torrentPort > 0) { reglages['peer-port'] = c.torrentPort; reglages['peer-port-random-on-start'] = false; }
    await this.client.appeler('session-set', reglages);
    this.version = infos.version ?? null;
    this.derniereErreur = null;
    this.pret = true;
    this.journal.info({ version: this.version }, 'Transmission répond');
    for (const s of this.suivis.values()) if (s.ajoute && !s.termine) s.ajoute = false; // retrouvés par `hashString`
    this.emit('demarre');
  }

  private async rafraichir(): Promise<void> {
    for (const r of [...this.aRetirer]) {
      await this.client.appeler('torrent-remove', { ids: [r.hash], 'delete-local-data': r.effacer });
      this.aRetirer.splice(this.aRetirer.indexOf(r), 1);
    }
    for (const s of [...this.suivis.values()]) {
      if (!s.ajoute && !s.erreur && this.suivis.get(s.id) === s) await this.ajouterTorrent(s);
    }
    const lus = [...this.suivis.values()].filter((s) => s.ajoute && s.hash && !s.erreur);
    if (!lus.length) { await this.client.appeler('session-get', { fields: ['version'] }); return; }
    const { torrents } = await this.client.appeler<{ torrents: TorrentTransmission[] }>('torrent-get', { ids: lus.map((s) => s.hash), fields: CHAMPS });
    const parHash = new Map(torrents.map((t) => [t.hashString.toLowerCase(), t]));
    const etats: EtatTorrentEnfant[] = [];
    for (const s of lus) {
      if (this.suivis.get(s.id) !== s) continue;
      const t = parHash.get(s.hash!);
      if (!t) await this.manquant(s);
      else await this.traiter(s, t, etats);
    }
    if (etats.length) this.emit('message', { t: 'etat', torrents: etats });
  }

  /** Ajoute le torrent dans Transmission (ou le retrouve s'il y est déjà, dans le même dossier). */
  private async ajouterTorrent(s: Suivi): Promise<void> {
    const args: Record<string, unknown> = { 'download-dir': s.dossier, paused: s.fichier !== null || s.pausee };
    try {
      if (s.fichier) args['metainfo'] = (await readFile(s.fichier)).toString('base64');
      else args['filename'] = s.magnet;
    } catch (e) {
      return this.signaler(s, `Le fichier .torrent est illisible : ${(e as Error).message}`);
    }
    try {
      const r = await this.client.appeler<Record<string, { hashString?: string } | undefined>>('torrent-add', args);
      const t = r['torrent-added'] ?? r['torrent-duplicate'];
      if (!t?.hashString) return this.signaler(s, "Transmission n'a pas dit quel torrent il a ajouté.");
      s.hash = t.hashString.toLowerCase();
      s.ajoute = true;
      s.dirVerifie = false;
      s.meta = false;
      s.choixApplique = false;
    } catch (e) {
      if (e instanceof ErreurTransmission && e.code === 'refus') return this.signaler(s, `Transmission refuse ce torrent : ${e.message.replace(/^.*?: /, '')}`);
      throw e;
    }
  }

  private signaler(s: Suivi, message: string): void {
    s.erreur = true;
    this.emit('message', { t: 'erreur', id: s.id, message });
  }

  /** Le torrent a disparu de Transmission (retiré à la main, réinstallation…). */
  private async manquant(s: Suivi): Promise<void> {
    if (s.termine) {
      if (s.partage) this.emit('message', { t: 'partage_fini', id: s.id });
      this.suivis.delete(s.id);
      return;
    }
    this.journal.warn({ id: s.id }, 'un torrent a disparu de Transmission : il est rajouté');
    s.ajoute = false;
    s.meta = false;
    s.choixApplique = false;
    await this.ajouterTorrent(s);
  }

  private async traiter(s: Suivi, t: TorrentTransmission, etats: EtatTorrentEnfant[]): Promise<void> {
    if (!s.dirVerifie) {
      s.dirVerifie = true;
      if (!dossierEgal(t.downloadDir, s.dossier)) {
        s.etranger = true;
        return this.signaler(s, `Ce torrent est déjà dans Transmission, dans un autre dossier (${masquer(t.downloadDir)}) : Canapé n'y touche pas. Retire-le de Transmission puis ajoute-le de nouveau.`);
      }
    }
    if (t.error === 3) return this.signaler(s, this.messageLocal(t.errorString));
    const fichiers = t.files ?? [];
    if (!s.meta && fichiers.length > 0 && t.metadataPercentComplete >= 1) {
      s.nbFichiers = fichiers.length;
      // Rien n'est téléchargé tant que le choix n'est pas fait : tout est d'abord décoché (sauf reprise avec choix).
      // `meta` ne passe à vrai qu'après cet appel : un choix reçu pendant ce temps est seulement retenu, puis appliqué
      // juste après, jamais en parallèle (sinon « tout décocher » pourrait arriver à Transmission après le choix).
      if (!s.choix) await this.client.appeler('torrent-set', { ids: [s.hash], 'files-unwanted': fichiers.map((_f, i) => i) });
      s.meta = true;
      if (s.choix) await this.appliquerChoix(s);
      if (!s.pausee && t.status === 0) await this.client.appeler('torrent-start', { ids: [s.hash] });
      this.emit('message', {
        t: 'metadonnees', id: s.id, infoHash: s.hash!, nom: t.name, prive: !!t.isPrivate,
        fichiers: fichiers.map((f, i) => ({ index: i, chemin: f.name, taille: f.length })),
      });
    } else if (s.meta && !s.pausee && !s.termine && t.status === 0 && s.choixApplique) {
      await this.client.appeler('torrent-start', { ids: [s.hash] }); // arrêté par quelqu'un d'autre
    }
    const total = s.choixApplique ? t.sizeWhenDone : 0;
    const recu = s.choixApplique ? Math.max(0, t.sizeWhenDone - t.leftUntilDone) : 0;
    etats.push({
      id: s.id, octetsRecus: recu, octetsTotal: total, debit: t.rateDownload, debitEnvoi: t.rateUpload, pairs: t.peersConnected,
      prive: !!t.isPrivate, ratio: t.uploadRatio >= 0 ? Math.round(t.uploadRatio * 100) / 100 : null, messageTracker: this.messageTracker(t),
    });
    if (s.choixApplique && !s.termine && !s.pausee && total > 0 && t.leftUntilDone === 0 && t.status !== 1 && t.status !== 2) {
      s.termine = true;
      this.emit('message', { t: 'etat', torrents: etats.splice(0) });
      this.emit('message', { t: 'termine', id: s.id });
      if (s.partage) await this.reglerPartage(s);
    }
    if (s.termine && s.partage && !s.partageFini) {
      const { ratio, limite } = s.partage;
      const atteint = (t.status === 0 && t.isFinished) || (ratio !== null && t.uploadRatio >= ratio) || (limite !== null && Date.now() > limite);
      if (atteint) { s.partageFini = true; this.emit('message', { t: 'partage_fini', id: s.id }); }
    }
  }

  /** Dernière réponse d'un tracker qui refuse ou échoue, en clair et sans clé ; `null` si un tracker répond bien. */
  private messageTracker(t: TorrentTransmission): string | null {
    const stats = (t.trackerStats ?? []).filter((x) => (x.lastAnnounceTime ?? 0) > 0);
    if (stats.some((x) => x.lastAnnounceSucceeded)) return null;
    const echec = stats.filter((x) => x.lastAnnounceResult).sort((a, b) => (b.lastAnnounceTime ?? 0) - (a.lastAnnounceTime ?? 0))[0];
    const brut = echec?.lastAnnounceResult ?? ((t.error === 1 || t.error === 2) ? t.errorString : '');
    if (!brut) return null;
    const texte = masquer(brut).replace(/^tracker (gave|returned) (an )?(error|warning)\s*:?\s*/i, '').trim();
    return `${RE_RESEAU.test(brut) ? "Le tracker n'a pas répondu" : 'Le tracker a refusé'} : ${texte}`;
  }

  private messageLocal(brut: string): string {
    const m = masquer(brut || 'erreur inconnue');
    if (/permission denied/i.test(m)) return `Transmission n'a pas le droit d'écrire dans le dossier des téléchargements (${m}). Vérifie que debian-transmission est dans le groupe canape et que le dossier est en 2770.`;
    if (/no space left/i.test(m)) return `Le disque du serveur est plein (${m}).`;
    return `Transmission signale une erreur : ${m}`;
  }

  // ----- Ordres du service -----

  envoyer(m: VersEnfant): boolean {
    switch (m.t) {
      case 'ajouter': this.ajouter(m); break;
      case 'choisir': {
        const s = this.suivis.get(m.id);
        if (s) { s.choix = m.fichiers; s.choixApplique = false; if (s.meta) this.fond(this.appliquerChoix(s)); }
        break;
      }
      case 'partager': {
        const s = this.suivis.get(m.id);
        if (s) {
          s.partage = { ratio: m.ratio, limite: m.delaiMs === null ? null : Date.now() + m.delaiMs };
          s.partageFini = false;
          if (s.hash && s.ajoute) this.fond(this.reglerPartage(s));
        }
        break;
      }
      case 'retirer': void this.retirer(m.id, m.effacer); break;
      case 'arreter': void this.arreter(); break;
    }
    return this.pret;
  }

  private ajouter(m: Extract<VersEnfant, { t: 'ajouter' }>): void {
    const existant = this.suivis.get(m.id);
    if (existant) {
      existant.pausee = false;
      if (m.choix) { existant.choix = m.choix; existant.choixApplique = false; }
      if (existant.hash && existant.ajoute && !existant.erreur) {
        this.fond((async () => {
          if (existant.meta && m.choix) await this.appliquerChoix(existant);
          await this.client.appeler('torrent-start', { ids: [existant.hash] });
        })());
      }
      return;
    }
    this.suivis.set(m.id, {
      id: m.id, hash: m.infoHash?.toLowerCase() ?? null, dossier: m.dossier, magnet: m.magnet ?? null, fichier: m.fichier ?? null,
      choix: m.choix ?? null, choixApplique: false, meta: false, nbFichiers: 0, ajoute: false, pausee: false, termine: false,
      erreur: false, etranger: false, dirVerifie: false, partage: null, partageFini: false,
    });
    this.reveiller();
  }

  /** Les ordres envoyés en tâche de fond : un échec réseau est rattrapé par la boucle, pas par l'appelant. */
  private fond(p: Promise<unknown>): void {
    p.catch((e: Error) => this.journal.warn({ err: masquer(e.message) }, 'ordre à Transmission non transmis'));
  }

  private async appliquerChoix(s: Suivi): Promise<void> {
    if (!s.hash || !s.choix || !s.meta) return;
    const voulus = new Set(s.choix.filter((i) => i >= 0 && i < s.nbFichiers));
    const oui: number[] = [];
    const non: number[] = [];
    for (let i = 0; i < s.nbFichiers; i++) (voulus.has(i) ? oui : non).push(i);
    // Une liste vide voudrait dire « tous les fichiers » pour Transmission : on ne l'envoie pas.
    await this.client.appeler('torrent-set', { ids: [s.hash], ...(oui.length ? { 'files-wanted': oui } : {}), ...(non.length ? { 'files-unwanted': non } : {}) });
    s.choixApplique = true;
    if (!s.pausee) await this.client.appeler('torrent-start', { ids: [s.hash] });
  }

  /** `seedRatioMode` 2 = sans limite, 1 = jusqu'au ratio ; jamais d'arrêt par inactivité. */
  private async reglerPartage(s: Suivi): Promise<void> {
    if (!s.hash || !s.partage) return;
    const { ratio } = s.partage;
    await this.client.appeler('torrent-set', {
      ids: [s.hash], seedRatioMode: ratio === null ? 2 : 1, ...(ratio === null ? {} : { seedRatioLimit: ratio }), seedIdleMode: 2,
    });
  }

  async pause(id: string): Promise<void> {
    const s = this.suivis.get(id);
    if (!s) return;
    s.pausee = true;
    if (s.hash && s.ajoute && this.pret) await this.client.appeler('torrent-stop', { ids: [s.hash] }).catch((e: Error) => this.journal.warn({ err: masquer(e.message) }, 'pause non transmise à Transmission'));
  }

  async retirer(id: string, effacer: boolean): Promise<void> {
    const s = this.suivis.get(id);
    this.suivis.delete(id);
    if (!s?.hash || !s.ajoute || s.etranger) return;
    try {
      await this.client.appeler('torrent-remove', { ids: [s.hash], 'delete-local-data': effacer });
    } catch (e) {
      // Transmission ne répond pas : le retrait est refait dès qu'il revient.
      this.aRetirer.push({ hash: s.hash, effacer });
      this.journal.warn({ err: masquer((e as Error).message) }, 'retrait en attente : Transmission ne répond pas');
    }
  }

  /** Canapé s'arrête : Transmission, lui, continue (partage des privés). */
  async arreter(): Promise<void> {
    this.arrete = true;
    if (this.minuteur) { clearTimeout(this.minuteur); this.minuteur = null; }
  }

  /** Essais : l'état d'un torrent tel que Transmission le voit. */
  async lire(id: string): Promise<TorrentTransmission | null> {
    const s = this.suivis.get(id);
    if (!s?.hash) return null;
    const { torrents } = await this.client.appeler<{ torrents: TorrentTransmission[] }>('torrent-get', { ids: [s.hash], fields: [...CHAMPS, 'trackers', 'webseeds', 'webseedsSendingToUs'] });
    return torrents[0] ?? null;
  }
}
