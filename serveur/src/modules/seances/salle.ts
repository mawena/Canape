// État d'une salle de séance : logique pure (pas de réseau, horloge injectée), portée de `salon.js` de la 0.1.
import { ENTRACTE_MAX_SECONDES, LIMITES_WS, type EtatSeance, type Participant, type RaisonEtat } from '@canape/partage';
import type { UtilisateurPublic } from '@canape/partage';

export function positionValide(p: unknown): p is number {
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p < 1e7;
}

export interface EtatInitial {
  filmId: string | null;
  position: number;
  pisteAudio: number | null;
  sousTitres: string | null;
  /** Secondes déjà passées à deux personnes ou plus (reprise après redémarrage). */
  ensemble?: number;
}

export interface ResultatDepart {
  participant: Participant | null;
  /** Changement d'état à diffuser (`par` = prénom du partant). */
  raison: RaisonEtat | null;
}

export class Salle {
  readonly participants = new Map<string, Participant>();
  readonly tampons = new Set<string>();
  private maintenant: () => number;
  private filmId: string | null;
  private lecture = false;
  private position: number;
  private instant: number;
  private version = 0;
  private pisteAudio: number | null;
  private sousTitres: string | null;
  /** La lecture reprendra quand plus personne n'attend. */
  private reprise = false;
  private compteFin: number | null = null;
  private compteId = 0;
  /** Heure de fin de l'entracte (ms), ou `null`. */
  private entracteFin: number | null = null;
  private ensemble: number;
  private dernierEnsemble: number;

  constructor(initial: EtatInitial, maintenant: () => number = Date.now) {
    this.maintenant = maintenant;
    this.filmId = initial.filmId;
    this.position = positionValide(initial.position) ? initial.position : 0;
    this.pisteAudio = initial.pisteAudio;
    this.sousTitres = initial.sousTitres;
    this.instant = maintenant();
    this.ensemble = typeof initial.ensemble === 'number' && Number.isFinite(initial.ensemble) && initial.ensemble > 0 ? initial.ensemble : 0;
    this.dernierEnsemble = this.instant;
  }

  get taille(): number { return this.participants.size; }
  get compteEnCours(): boolean { return this.compteFin !== null; }
  get idCompte(): number { return this.compteId; }
  get enEntracte(): boolean { return this.entracteFin !== null; }
  get finEntracte(): number | null { return this.entracteFin; }

  /** Personnes différentes dans la salle (plusieurs onglets d'un même compte ne comptent qu'une fois). */
  private get personnes(): number {
    return new Set([...this.participants.values()].map((p) => p.utilisateur.id)).size;
  }

  /** Cumule le temps passé à deux personnes ou plus jusqu'à maintenant (à appeler avant tout changement de présents). */
  private cumuler(): void {
    const t = this.maintenant();
    if (this.personnes >= 2) this.ensemble += Math.max(0, (t - this.dernierEnsemble) / 1000);
    this.dernierEnsemble = t;
  }

  /** Secondes passées ensemble (au moins deux personnes dans la salle en même temps), jusqu'à maintenant. */
  secondesEnsemble(): number {
    const t = this.maintenant();
    return this.ensemble + (this.personnes >= 2 ? Math.max(0, (t - this.dernierEnsemble) / 1000) : 0);
  }

  ajouter(cid: string, utilisateur: UtilisateurPublic): Participant {
    this.cumuler();
    const p: Participant = { cid, utilisateur, micro: false, camera: false, tampon: false };
    this.participants.set(cid, p);
    return p;
  }

  /** Retire une connexion. Pause si la lecture tournait (sauf autre onglet du même compte). */
  retirer(cid: string): ResultatDepart {
    const p = this.participants.get(cid) ?? null;
    if (!p) return { participant: null, raison: null };
    this.cumuler();
    this.participants.delete(cid);
    const attendait = this.tampons.delete(cid);
    const autreOnglet = [...this.participants.values()].some((q) => q.utilisateur.id === p.utilisateur.id);
    if (autreOnglet) {
      return { participant: p, raison: attendait ? this.verifierReprise() ?? this.noter('depart') : null };
    }
    if (this.lecture && this.participants.size > 0) {
      this.reprise = false;
      this.fixer({ lecture: false, position: this.positionAttendue() });
      return { participant: p, raison: 'depart' };
    }
    if (attendait) return { participant: p, raison: this.verifierReprise() ?? this.noter('depart') };
    return { participant: p, raison: null };
  }

  media(cid: string, micro: boolean, camera: boolean): Participant | null {
    const p = this.participants.get(cid);
    if (!p) return null;
    p.micro = micro; p.camera = camera;
    return p;
  }

  positionAttendue(t: number = this.maintenant()): number {
    return this.lecture ? this.position + Math.max(0, (t - this.instant) / 1000) : this.position;
  }

  instantane(): EtatSeance {
    const t = this.maintenant();
    return {
      filmId: this.filmId,
      lecture: this.lecture,
      position: this.position,
      instant: this.instant,
      version: this.version,
      attente: [...this.tampons],
      pisteAudio: this.pisteAudio,
      sousTitres: this.sousTitres,
      compteARebours: this.compteFin === null ? null : Math.max(0, Math.ceil((this.compteFin - t) / 1000)),
      entracteFin: this.entracteFin,
      serveur: t,
    };
  }

  /** Valeurs à persister dans `seances`. */
  aEnregistrer(): EtatInitial {
    return { filmId: this.filmId, position: this.positionAttendue(), pisteAudio: this.pisteAudio, sousTitres: this.sousTitres };
  }

  private fixer(changes: Partial<Pick<EtatSeance, 'filmId' | 'lecture' | 'position' | 'pisteAudio' | 'sousTitres'>>, garderCompte = false): void {
    if (!garderCompte) this.compteFin = null;
    this.filmId = changes.filmId !== undefined ? changes.filmId : this.filmId;
    this.lecture = changes.lecture ?? this.lecture;
    this.position = changes.position ?? this.position;
    this.pisteAudio = changes.pisteAudio !== undefined ? changes.pisteAudio : this.pisteAudio;
    this.sousTitres = changes.sousTitres !== undefined ? changes.sousTitres : this.sousTitres;
    this.instant = this.maintenant();
    this.version += 1;
  }

  /** Une commande d'un participant connu. Rend la raison ou `null` si rien ne change. */
  lire(cid: string, position?: unknown): RaisonEtat | null {
    if (!this.participants.has(cid) || this.entracteFin !== null) return null;
    const pos = positionValide(position) ? position : this.positionAttendue();
    if (this.tampons.size > 0) {
      this.reprise = true;
      this.fixer({ lecture: false, position: pos });
    } else {
      this.reprise = false;
      this.fixer({ lecture: true, position: pos });
    }
    return 'lecture';
  }

  /**
   * Pause. Avec `fin` : le film est fini. `entracteMs` (seulement s'il reste un film au programme) ouvre alors un entracte
   * (raison `entracte`) ; sans lui, c'est la fin de la séance (raison `fin`). Pendant un entracte, le film d'avant ne
   * bouge plus : toute pause (y compris une deuxième fin, envoyée par chaque personne présente) est ignorée.
   */
  pause(cid: string, position?: unknown, fin = false, entracteMs: number | null = null): RaisonEtat | null {
    if (!this.participants.has(cid) || this.entracteFin !== null) return null;
    const pos = positionValide(position) ? position : this.positionAttendue();
    this.reprise = false;
    this.fixer({ lecture: false, position: pos });
    if (fin && entracteMs !== null) {
      this.entracteFin = this.maintenant() + entracteMs;
      return 'entracte';
    }
    return fin ? 'fin' : 'pause';
  }

  /** Rallonge l'entracte de `ms` (jamais au-delà de `ENTRACTE_MAX_SECONDES` à partir de maintenant). */
  prolongerEntracte(ms: number): RaisonEtat | null {
    if (this.entracteFin === null) return null;
    const t = this.maintenant();
    this.entracteFin = Math.min(this.entracteFin + ms, t + ENTRACTE_MAX_SECONDES * 1000);
    this.fixer({}, true);
    return 'entracte';
  }

  /** Plus de film après l'entracte (le programme a été vidé) : c'est la fin de la séance. */
  finirEntracte(): RaisonEtat | null {
    if (this.entracteFin === null) return null;
    this.entracteFin = null;
    this.fixer({}, true);
    return 'fin';
  }

  /** Passe au film suivant pour tous : position 0, pistes par défaut, puis (`avecCompte`) compte à rebours qui lance la lecture. */
  enchainer(filmId: string, avecCompte: boolean): RaisonEtat {
    this.entracteFin = null;
    this.film(null, filmId);
    if (avecCompte) {
      this.compteFin = this.maintenant() + LIMITES_WS.compteARebours * 1000;
      this.compteId += 1;
    }
    return 'film';
  }

  aller(cid: string, position: unknown): RaisonEtat | null {
    if (!this.participants.has(cid) || this.entracteFin !== null || !positionValide(position)) return null;
    this.fixer({ position });
    return 'aller';
  }

  film(cid: string | null, filmId: string | null): RaisonEtat | null {
    if (cid !== null && !this.participants.has(cid)) return null;
    this.entracteFin = null;
    this.tampons.clear();
    this.reprise = false;
    this.fixer({ filmId, lecture: false, position: 0, pisteAudio: null, sousTitres: null });
    return 'film';
  }

  audio(cid: string, piste: number): RaisonEtat | null {
    if (!this.participants.has(cid) || this.entracteFin !== null) return null;
    this.reprise = false;
    this.fixer({ pisteAudio: piste, lecture: false, position: this.positionAttendue() });
    return 'audio';
  }

  sousTitresChoix(cid: string, cle: string | null): RaisonEtat | null {
    if (!this.participants.has(cid) || this.entracteFin !== null) return null;
    this.reprise = false;
    this.fixer({ sousTitres: cle, lecture: false, position: this.positionAttendue() });
    return 'sous_titres';
  }

  /** Pause à la position courante puis compte à rebours ; la lecture démarre à `finCompteARebours`. */
  demarrerCompteARebours(cid: string): RaisonEtat | null {
    if (!this.participants.has(cid) || this.filmId === null || this.entracteFin !== null) return null;
    this.reprise = false;
    const pos = this.positionAttendue();
    this.fixer({ lecture: false, position: pos });
    this.compteFin = this.maintenant() + LIMITES_WS.compteARebours * 1000;
    this.compteId += 1;
    return 'compte_a_rebours';
  }

  /** Fin du compte à rebours `id` (ignorée s'il a été annulé entre-temps). */
  finCompteARebours(id: number): RaisonEtat | null {
    if (this.compteFin === null || id !== this.compteId) return null;
    const pos = this.position;
    if (this.tampons.size > 0) {
      this.reprise = true;
      this.fixer({ lecture: false, position: pos });
    } else {
      this.fixer({ lecture: true, position: pos });
    }
    return 'compte_a_rebours';
  }

  tampon(cid: string, enCours: boolean): RaisonEtat | null {
    const p = this.participants.get(cid);
    if (!p) return null;
    if (enCours) {
      if (this.tampons.has(cid)) return null;
      this.tampons.add(cid);
      p.tampon = true;
      if (this.lecture) {
        this.reprise = true;
        this.fixer({ lecture: false, position: this.positionAttendue() });
      } else {
        this.fixer({}, true);
      }
      return 'tampon';
    }
    if (!this.tampons.delete(cid)) return null;
    p.tampon = false;
    return this.verifierReprise() ?? this.noter('tampon');
  }

  /** « Ne plus attendre » : retire `cible` de l'attente ; reprise si c'était le dernier. */
  ignorerAttente(cid: string, cible: string): RaisonEtat | null {
    if (!this.participants.has(cid) || !this.tampons.delete(cible)) return null;
    const p = this.participants.get(cible);
    if (p) p.tampon = false;
    const r = this.verifierReprise();
    if (r) return r;
    return this.noter('attente-ignoree');
  }

  private noter(r: RaisonEtat): RaisonEtat {
    this.fixer({}, true);
    return r;
  }

  private verifierReprise(): RaisonEtat | null {
    if (this.tampons.size === 0 && this.reprise) {
      this.reprise = false;
      this.fixer({ lecture: true }, true);
      return 'reprise';
    }
    return null;
  }
}
