// Préparation : conversion complète en MP4 lisible partout, une à la fois, à basse priorité.
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import path from 'node:path';
import { AUDIO_SANS, type Preparation } from '@canape/partage';
import { maintenantIso } from '../../commun/identifiants.ts';
import type { FilmService } from '../../commun/services.ts';
import type { Config } from '../../config.ts';
import type { Base } from '../../db/index.ts';
import { argsPreparation } from './commandes.ts';
import type { GestionnaireConversions } from './conversions.ts';
import { Processus } from './processus.ts';

interface Ligne {
  film_id: string;
  piste_audio: number;
  etat: Preparation['etat'];
  progression: number;
  fichier: string | null;
  taille: number | null;
  cree_le: string;
  termine_le: string | null;
  erreur: string | null;
}

export function versPreparation(l: Ligne): Preparation {
  return {
    filmId: l.film_id, pisteAudio: l.piste_audio, etat: l.etat, progression: l.progression, taille: l.taille,
    creeLe: l.cree_le, termineLe: l.termine_le, erreur: l.erreur,
  };
}

const nomAudio = (a: number) => (a < 0 ? AUDIO_SANS : String(a));
/** Charge (par cœur) au-delà de laquelle une préparation qui n'a pas été demandée à la main attend. */
const CHARGE_MAX = 0.8;

export class GestionnairePreparations {
  private readonly db: Base;
  private readonly config: Config;
  private readonly conversions: GestionnaireConversions;
  private readonly film: (id: string) => FilmService | null;
  private readonly journal: { info: (m: string) => void; warn: (m: string) => void };
  private minuteur: NodeJS.Timeout | null = null;
  private courante: { filmId: string; audio: number; proc: Processus; sortie: string } | null = null;
  private manuelles = new Set<string>();
  private ferme = false;

  constructor(
    db: Base, config: Config, conversions: GestionnaireConversions, film: (id: string) => FilmService | null,
    journal: { info: (m: string) => void; warn: (m: string) => void },
  ) {
    this.db = db;
    this.config = config;
    this.conversions = conversions;
    this.film = film;
    this.journal = journal;
  }

  /** Reprise propre : ce qui était en cours au dernier arrêt repart de zéro. */
  demarrer(): void {
    this.db.prepare("UPDATE preparations SET etat = 'attente', progression = 0 WHERE etat = 'encours'").run();
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = setInterval(() => this.tic(), 1000);
    this.minuteur.unref();
  }

  async arreterTout(): Promise<void> {
    this.ferme = true;
    if (this.minuteur) clearInterval(this.minuteur);
    await Processus.arreterTous();
  }

  lignes(filmId?: string): Preparation[] {
    const r = filmId
      ? this.db.prepare('SELECT * FROM preparations WHERE film_id = ? ORDER BY piste_audio').all(filmId)
      : this.db.prepare('SELECT * FROM preparations ORDER BY cree_le').all();
    return (r as unknown as Ligne[]).map(versPreparation);
  }

  ligne(filmId: string, audio: number): Preparation | null {
    const l = this.db.prepare('SELECT * FROM preparations WHERE film_id = ? AND piste_audio = ?').get(filmId, audio) as Ligne | undefined;
    return l ? versPreparation(l) : null;
  }

  /** Chemin absolu de la version préparée si elle est prête. */
  cheminPrepare(filmId: string, audio: number): string | null {
    const l = this.db.prepare("SELECT fichier FROM preparations WHERE film_id = ? AND piste_audio = ? AND etat = 'prete'").get(filmId, audio) as
      | { fichier: string | null } | undefined;
    if (!l?.fichier) return null;
    const p = path.join(this.config.films, l.fichier);
    return existsSync(p) ? p : null;
  }

  /** Met en file (ou remet en file après une erreur). `manuelle` : demandée par une personne (pas d'attente de calme). */
  mettreEnFile(filmId: string, audio: number, manuelle: boolean): Preparation {
    const existante = this.ligne(filmId, audio);
    if (existante && existante.etat !== 'erreur') return existante;
    if (manuelle) this.manuelles.add(`${filmId}:${audio}`);
    this.db.prepare(
      `INSERT INTO preparations (film_id, piste_audio, etat, progression, cree_le) VALUES (?, ?, 'attente', 0, ?)
       ON CONFLICT (film_id, piste_audio) DO UPDATE SET etat = 'attente', progression = 0, erreur = NULL, cree_le = excluded.cree_le`,
    ).run(filmId, audio, maintenantIso());
    return this.ligne(filmId, audio) as Preparation;
  }

  /** Annule et supprime une préparation (en cours, en file ou prête). */
  async retirer(filmId: string, audio: number): Promise<void> {
    if (this.courante && this.courante.filmId === filmId && this.courante.audio === audio) {
      const c = this.courante;
      this.courante = null;
      await c.proc.arreter();
      rmSync(c.sortie, { force: true });
    }
    this.db.prepare('DELETE FROM preparations WHERE film_id = ? AND piste_audio = ?').run(filmId, audio);
    this.manuelles.delete(`${filmId}:${audio}`);
    rmSync(path.join(this.config.films, filmId, 'preparations', `${nomAudio(audio)}.mp4`), { force: true });
  }

  /** Film supprimé : arrête la préparation en cours et efface les fichiers (les lignes partent avec le film). */
  async surFilmSupprime(filmId: string): Promise<void> {
    if (this.courante?.filmId === filmId) {
      const c = this.courante;
      this.courante = null;
      await c.proc.arreter();
    }
    rmSync(path.join(this.config.films, filmId, 'preparations'), { recursive: true, force: true });
  }

  /** Octets occupés par les versions préparées. */
  octets(): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(taille), 0) AS t FROM preparations').get() as { t: number };
    return r.t;
  }

  private tic(): void {
    if (this.ferme) return;
    const occupe = this.conversions.actives() > 0;
    const c = this.courante;
    if (c) {
      if (occupe && !c.proc.suspendu) c.proc.suspendre();
      else if (!occupe && c.proc.suspendu) c.proc.reprendre();
      return;
    }
    if (occupe) return;
    const suivante = this.db.prepare("SELECT * FROM preparations WHERE etat = 'attente' ORDER BY cree_le, piste_audio LIMIT 1").get() as Ligne | undefined;
    if (!suivante) return;
    const manuelle = this.manuelles.has(`${suivante.film_id}:${suivante.piste_audio}`);
    if (!manuelle && loadavg()[0]! / availableParallelism() > CHARGE_MAX) return;
    this.demarrerUne(suivante);
  }

  private erreur(l: Ligne, message: string): void {
    this.db.prepare("UPDATE preparations SET etat = 'erreur', erreur = ? WHERE film_id = ? AND piste_audio = ?").run(message, l.film_id, l.piste_audio);
  }

  private demarrerUne(l: Ligne): void {
    const film = this.film(l.film_id);
    const analyse = film?.analyse;
    if (!film || !analyse?.video) return this.erreur(l, "Ce film n'est pas prêt.");
    const piste = l.piste_audio < 0 ? null : analyse.audio.find((a) => a.index === l.piste_audio) ?? null;
    if (l.piste_audio >= 0 && !piste) return this.erreur(l, "Cette piste audio n'existe pas.");
    const dossier = path.join(this.config.films, l.film_id, 'preparations');
    mkdirSync(dossier, { recursive: true });
    const finale = path.join(dossier, `${nomAudio(l.piste_audio)}.mp4`);
    const sortie = `${finale}.partiel.mp4`;
    const v = analyse.video;
    const copie = v.codec === 'h264' && !v.hdr && v.profondeurBits <= 8 && v.largeur <= 2048 && v.hauteur <= 1088;
    const args = argsPreparation({
      entree: film.cheminAbsolu, sortie, videoIndex: v.index, audioIndex: piste?.index ?? null, video: v, copieVideo: copie,
      fils: this.config.transcodageFils,
    });
    const lastMaj = { t: 0 };
    const proc = new Processus('ffmpeg', args, {
      nice: 19,
      surProgression: (p) => {
        const maintenant = Date.now();
        if (maintenant - lastMaj.t < 1000) return;
        lastMaj.t = maintenant;
        const prog = Math.min(0.99, p.seconde / Math.max(1, analyse.duree));
        this.db.prepare('UPDATE preparations SET progression = ? WHERE film_id = ? AND piste_audio = ?').run(prog, l.film_id, l.piste_audio);
      },
    });
    this.courante = { filmId: l.film_id, audio: l.piste_audio, proc, sortie };
    this.db.prepare("UPDATE preparations SET etat = 'encours', progression = 0, erreur = NULL WHERE film_id = ? AND piste_audio = ?").run(l.film_id, l.piste_audio);
    this.journal.info(`lecture : préparation de ${l.film_id} (piste ${l.piste_audio}) démarrée`);
    void proc.fini.then((fin) => {
      if (this.courante?.proc === proc) this.courante = null;
      if (fin.arretVoulu) {
        rmSync(sortie, { force: true });
        return;
      }
      if (fin.code === 0 && existsSync(sortie)) {
        renameSync(sortie, finale);
        const rel = path.relative(this.config.films, finale);
        this.db.prepare(
          "UPDATE preparations SET etat = 'prete', progression = 1, fichier = ?, taille = ?, termine_le = ?, erreur = NULL WHERE film_id = ? AND piste_audio = ?",
        ).run(rel, statSync(finale).size, maintenantIso(), l.film_id, l.piste_audio);
        this.manuelles.delete(`${l.film_id}:${l.piste_audio}`);
        this.journal.info(`lecture : préparation de ${l.film_id} terminée`);
      } else {
        rmSync(sortie, { force: true });
        this.erreur(l, `La préparation a échoué : ${fin.erreur.split('\n').slice(-1)[0] || `code ${fin.code}`}`);
        this.journal.warn(`lecture : préparation de ${l.film_id} en échec : ${fin.erreur}`);
      }
    });
  }
}
