// Conversion HLS à la volée : une seule par film et piste audio, partagée par tous les spectateurs.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AUDIO_SANS, DUREE_SEGMENT_HLS, type Analyse, type PisteAudioAnalysee } from '@canape/partage';
import { ErreurHttp } from '../../commun/erreurs.ts';
import type { Config } from '../../config.ts';
import { argsHls, PRESETS, type Preset } from './commandes.ts';
import { debutsSegmentsCopie, dureesDepuisDebuts, dureesFixes, imagesClesEnCache, listeDeLecture } from './images-cles.ts';
import { retirerListesEdition } from './mp4.ts';
import { Processus } from './processus.ts';

export interface Cible {
  filmId: string;
  titre: string;
  entree: string;
  analyse: Analyse;
  audio: PisteAudioAnalysee | null;
  mode: 'copie' | 'conversion';
}

/** Une conversion n'a plus de spectateur après ce délai : ffmpeg est arrêté. */
export const DELAI_INACTIVITE_MS = 60_000;
const DELAI_ATTENTE_SEGMENT_MS = 50_000;
const SPECTATEUR_MS = 30_000;
/** Au-delà de ce nombre de segments après la position de ffmpeg, on relance ffmpeg à la position demandée. */
const FENETRE_ATTENTE = 4;
const AVANCE_SUSPENDRE = { conversion: 10, copie: 40 };
const AVANCE_REPRENDRE = { conversion: 5, copie: 20 };
const VITESSE_MIN = 1.15;
const VITESSE_CONFORTABLE = 4;

interface Conversion {
  cle: string;
  cible: Cible;
  dossier: string;
  durees: Promise<number[]> | null;
  proc: Processus | null;
  sequence: number;
  debut: number;
  courant: number;
  existants: Set<number>;
  lanceLe: number;
  repriseLe: number;
  presetIdx: number;
  categorie: string;
  vitesse: number | null;
  demandes: Map<number, { t: number; seg: number }>;
  derniereDemande: number;
  echecs: number;
  erreur: string;
  initEnCours: Promise<void> | null;
  relance: Promise<void> | null;
  dernierMarquage: number;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GestionnaireConversions {
  private readonly conversions = new Map<string, Conversion>();
  private readonly presetParCategorie = new Map<string, number>();
  private minuteur: NodeJS.Timeout | null = null;
  private ferme = false;

  private readonly config: Config;
  private readonly journal: { info: (m: string) => void; warn: (m: string) => void };

  constructor(config: Config, journal: { info: (m: string) => void; warn: (m: string) => void }) {
    this.config = config;
    this.journal = journal;
  }

  demarrer(): void {
    this.minuteur = setInterval(() => void this.surveiller(), 250);
    this.minuteur.unref();
  }

  async arreterTout(): Promise<void> {
    this.ferme = true;
    if (this.minuteur) clearInterval(this.minuteur);
    await Processus.arreterTous();
  }

  /** Nombre de conversions qui consomment du processeur en ce moment. */
  actives(): number {
    let n = 0;
    for (const c of this.conversions.values()) if (c.proc && !c.proc.termine && !c.proc.suspendu) n++;
    return n;
  }

  /** Dossiers du cache d'une conversion qui servent encore (ne pas purger). */
  dossiersUtilises(): Set<string> {
    const s = new Set<string>();
    const maintenant = Date.now();
    for (const c of this.conversions.values()) if (c.proc || maintenant - c.derniereDemande < 120_000) s.add(c.dossier);
    return s;
  }

  lister() {
    const r = [];
    for (const c of this.conversions.values()) {
      if (!c.proc && this.spectateurs(c) === 0) continue;
      r.push({
        filmId: c.cible.filmId,
        titre: c.cible.titre,
        pisteAudio: c.cible.audio?.index ?? -1,
        spectateurs: this.spectateurs(c),
        vitesse: c.vitesse,
        mode: c.cible.mode,
        preset: c.cible.mode === 'conversion' ? PRESETS[c.presetIdx] : 'copie',
      });
    }
    return r;
  }

  async arreterFilm(filmId: string): Promise<void> {
    const aArreter = [...this.conversions.values()].filter((c) => c.cible.filmId === filmId);
    for (const c of aArreter) this.conversions.delete(c.cle);
    await Promise.all(aArreter.map((c) => c.proc?.arreter()));
  }

  private spectateurs(c: Conversion): number {
    const m = Date.now();
    let n = 0;
    for (const d of c.demandes.values()) if (m - d.t < SPECTATEUR_MS) n++;
    return n;
  }

  private obtenir(cible: Cible): Conversion {
    const cle = `${cible.filmId}:${cible.audio?.index ?? AUDIO_SANS}`;
    let c = this.conversions.get(cle);
    if (c && c.cible.mode !== cible.mode) {
      void c.proc?.arreter();
      this.conversions.delete(cle);
      c = undefined;
    }
    if (!c) {
      const v = cible.analyse.video;
      const categorie = `${v?.hdr ? 'hdr' : 'sdr'}-${(v?.hauteur ?? 0) > 1088 ? '4k' : 'hd'}`;
      c = {
        cle, cible, categorie,
        dossier: path.join(this.config.cache, cible.filmId, 'hls', String(cible.audio?.index ?? AUDIO_SANS)),
        durees: null, proc: null, sequence: 0, debut: 0, courant: 0, existants: new Set(), lanceLe: 0, repriseLe: 0,
        presetIdx: this.presetParCategorie.get(categorie) ?? (categorie === 'hdr-4k' ? 0 : 1),
        vitesse: null, demandes: new Map(), derniereDemande: Date.now(), echecs: 0, erreur: '', initEnCours: null,
        relance: null, dernierMarquage: 0,
      };
      mkdirSync(c.dossier, { recursive: true });
      this.conversions.set(cle, c);
    }
    c.cible = cible;
    return c;
  }

  private calculerDurees(c: Conversion): Promise<number[]> {
    c.durees ??= (async () => {
      const total = c.cible.analyse.duree;
      if (c.cible.mode === 'conversion') return dureesFixes(total);
      const images = await imagesClesEnCache(
        c.cible.entree, path.join(this.config.cache, c.cible.filmId, 'images-cles.json'), this.config.transcodagePriorite,
      );
      return dureesDepuisDebuts(debutsSegmentsCopie(images), total);
    })().catch((e) => {
      c.durees = null;
      throw e;
    });
    return c.durees;
  }

  /** Liste de lecture complète (VOD). */
  async liste(cible: Cible): Promise<string> {
    const c = this.obtenir(cible);
    try {
      return listeDeLecture(await this.calculerDurees(c));
    } catch (e) {
      throw new ErreurHttp(500, 'conversion_impossible', `Impossible de préparer la lecture de ce film (${(e as Error).message}).`);
    }
  }

  /** Chemin du segment d'initialisation (fabriqué par un très court lancement de ffmpeg si besoin). */
  async init(cible: Cible): Promise<string> {
    const c = this.obtenir(cible);
    const chemin = path.join(c.dossier, 'init.mp4');
    if (existsSync(chemin)) return chemin;
    c.initEnCours ??= this.fabriquerInit(c).finally(() => {
      c.initEnCours = null;
    });
    await c.initEnCours;
    if (!existsSync(chemin)) throw new ErreurHttp(500, 'conversion_impossible', "Le segment d'initialisation n'a pas pu être produit.");
    return chemin;
  }

  private async fabriquerInit(c: Conversion): Promise<void> {
    const tmp = path.join(c.dossier, `init-tmp-${process.pid}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    try {
      const v = c.cible.analyse.video;
      if (!v) throw new Error('pas de vidéo');
      const args = argsHls({
        entree: c.cible.entree, videoIndex: v.index, audioIndex: c.cible.audio?.index ?? null, video: v, mode: c.cible.mode,
        debut: 0, preset: PRESETS[c.presetIdx] as Preset, fils: this.config.transcodageFils, dossier: tmp, sequence: 0, limite: 1,
      });
      const p = new Processus('ffmpeg', args, { nice: this.config.transcodagePriorite });
      const fin = await p.fini;
      const fichier = path.join(tmp, 'init-0.mp4');
      if (!existsSync(fichier)) throw new Error(fin.erreur || 'ffmpeg a échoué');
      let init: Buffer = readFileSync(fichier);
      if (c.cible.mode === 'conversion') init = retirerListesEdition(init);
      const dest = path.join(c.dossier, 'init.mp4');
      writeFileSync(`${dest}.tmp`, init);
      renameSync(`${dest}.tmp`, dest);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  private noter(c: Conversion, utilisateurId: number, seg: number): void {
    const t = Date.now();
    c.demandes.set(utilisateurId, { t, seg });
    c.derniereDemande = t;
    if (t - c.dernierMarquage > 30_000) {
      c.dernierMarquage = t;
      try {
        writeFileSync(path.join(c.dossier, '.utilise'), String(t));
      } catch {
        /* dossier supprimé entre-temps */
      }
    }
  }

  /** Chemin du segment `n`, produit si besoin (attend, ou relance ffmpeg à sa position). */
  async segment(cible: Cible, n: number, utilisateurId: number, signal?: AbortSignal): Promise<string> {
    const c = this.obtenir(cible);
    const durees = await this.calculerDurees(c).catch((e) => {
      throw new ErreurHttp(500, 'conversion_impossible', `Impossible de préparer la lecture de ce film (${(e as Error).message}).`);
    });
    if (!Number.isInteger(n) || n < 0 || n >= durees.length) throw new ErreurHttp(404, 'introuvable', 'Introuvable.');
    this.noter(c, utilisateurId, n);
    const fichier = path.join(c.dossier, `${n}.m4s`);
    const limite = Date.now() + DELAI_ATTENTE_SEGMENT_MS;
    while (Date.now() < limite) {
      if (signal?.aborted) throw new ErreurHttp(499, 'abandon', 'Requête abandonnée.');
      if (existsSync(fichier)) return fichier;
      if (this.ferme) throw new ErreurHttp(503, 'arret', 'Le serveur s\'arrête.');
      if (c.relance) {
        await c.relance;
        continue;
      }
      const p = c.proc;
      const conv = c.cible.mode === 'conversion';
      if (!p || p.termine) {
        if (c.echecs >= 3) throw new ErreurHttp(500, 'conversion_impossible', `La conversion de ce film échoue (${c.erreur || 'erreur inconnue'}).`);
        this.lancer(c, conv ? n : 0);
      } else if (conv && (n < c.debut || n > c.courant + FENETRE_ATTENTE)) {
        if (Date.now() - c.lanceLe > 4000) {
          c.relance = this.relancer(c, n).finally(() => {
            c.relance = null;
          });
          await c.relance;
          continue;
        }
      } else if (p.suspendu) {
        p.reprendre();
        c.repriseLe = Date.now();
      }
      await dormir(120);
    }
    throw new ErreurHttp(503, 'conversion_en_cours', 'Le segment est en cours de préparation, réessaie dans un instant.');
  }

  private async relancer(c: Conversion, seg: number): Promise<void> {
    const p = c.proc;
    if (p) await p.arreter();
    c.proc = null;
    this.lancer(c, c.cible.mode === 'conversion' ? seg : 0);
  }

  private lancer(c: Conversion, seg: number): void {
    const v = c.cible.analyse.video;
    if (!v || this.ferme) return;
    for (const f of readdirSync(c.dossier)) if (f.endsWith('.tmp')) rmSync(path.join(c.dossier, f), { force: true });
    c.existants = new Set(readdirSync(c.dossier).map((f) => /^(\d+)\.m4s$/.exec(f)?.[1]).filter((x): x is string => !!x).map(Number));
    const sequence = ++c.sequence;
    const args = argsHls({
      entree: c.cible.entree, videoIndex: v.index, audioIndex: c.cible.audio?.index ?? null, video: v, mode: c.cible.mode,
      debut: seg, preset: PRESETS[c.presetIdx] as Preset, fils: this.config.transcodageFils, dossier: c.dossier, sequence,
    });
    const proc = new Processus('ffmpeg', args, {
      nice: this.config.transcodagePriorite,
      surProgression: (p) => {
        if (!proc.suspendu && Date.now() - Math.max(c.lanceLe, c.repriseLe) > 3000) c.vitesse = p.vitesse;
      },
    });
    c.proc = proc;
    c.debut = seg;
    c.courant = seg;
    c.lanceLe = Date.now();
    c.vitesse = null;
    this.journal.info(`lecture : conversion ${c.cle} lancée au segment ${seg} (${c.cible.mode}, ${PRESETS[c.presetIdx]})`);
    void proc.fini.then((fin) => {
      for (const f of [`init-${sequence}.mp4`, `liste-${sequence}.m3u8`]) rmSync(path.join(c.dossier, f), { force: true });
      if (c.proc === proc) c.proc = null;
      if (fin.arretVoulu) return;
      if (fin.code === 0) c.echecs = 0;
      else {
        c.echecs++;
        c.erreur = fin.erreur.split('\n').slice(-1)[0] ?? '';
        this.journal.warn(`lecture : conversion ${c.cle} en échec (${fin.code}) : ${fin.erreur}`);
      }
    });
  }

  private async surveiller(): Promise<void> {
    const maintenant = Date.now();
    for (const c of this.conversions.values()) {
      const p = c.proc;
      if (!p || p.termine || c.relance) continue;
      const mode = c.cible.mode;
      if (maintenant - c.derniereDemande > DELAI_INACTIVITE_MS) {
        this.journal.info(`lecture : conversion ${c.cle} arrêtée (plus de spectateur)`);
        void p.arreter();
        continue;
      }
      let noms: string[] = [];
      try {
        noms = readdirSync(c.dossier);
      } catch {
        continue;
      }
      let tmpMax = -1;
      for (const f of noms) {
        const m = /^(\d+)\.m4s\.tmp$/.exec(f);
        if (m) tmpMax = Math.max(tmpMax, Number(m[1]));
      }
      if (tmpMax >= 0) c.courant = Math.max(c.courant, tmpMax);
      // Rattrapé : ffmpeg arrive sur un segment déjà produit par un lancement précédent.
      if (mode === 'conversion' && tmpMax > c.debut && c.existants.has(tmpMax)) {
        void p.arreter();
        continue;
      }
      let demande = 0;
      for (const d of c.demandes.values()) if (maintenant - d.t < 30_000) demande = Math.max(demande, d.seg);
      const avance = c.courant - demande;
      if (!p.suspendu && avance > AVANCE_SUSPENDRE[mode]) p.suspendre();
      else if (p.suspendu && avance <= AVANCE_REPRENDRE[mode]) {
        p.reprendre();
        c.repriseLe = maintenant;
      }
      // Vitesse : repli vers un préréglage plus rapide si la conversion passe sous le temps réel.
      if (mode === 'conversion' && !p.suspendu && c.vitesse !== null && maintenant - Math.max(c.lanceLe, c.repriseLe) > 10_000) {
        if (c.vitesse < VITESSE_MIN && c.presetIdx > 0) {
          c.presetIdx--;
          this.presetParCategorie.set(c.categorie, c.presetIdx);
          this.journal.warn(`lecture : conversion ${c.cle} trop lente (${c.vitesse}×), préréglage ${PRESETS[c.presetIdx]}`);
          const seg = c.courant;
          c.relance = this.relancer(c, seg).finally(() => {
            c.relance = null;
          });
        } else if (c.vitesse > VITESSE_CONFORTABLE && c.presetIdx < PRESETS.length - 1 && c.categorie !== 'hdr-4k') {
          c.presetIdx++; // pour le prochain lancement seulement
          this.presetParCategorie.set(c.categorie, c.presetIdx);
          c.vitesse = null;
        }
      }
    }
  }
}

export { DUREE_SEGMENT_HLS };
