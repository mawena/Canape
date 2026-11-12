// Gestionnaire global des téléversements (tus) : les envois continuent quand on change de page.
import { Upload, type DetailedError } from 'tus-js-client';
import { TAILLE_MORCEAU_TUS } from '@canape/partage';

export type EtatEnvoi = 'attente' | 'envoi' | 'pause' | 'reessai' | 'termine' | 'erreur' | 'interrompu';

export interface Envoi {
  id: number;
  nom: string;
  taille: number;
  octets: number;
  etat: EtatEnvoi;
  /** Octets par seconde (lissé). */
  debit: number;
  /** Secondes restantes, `null` tant que le débit est inconnu. */
  reste: number | null;
  message: string | null;
}

interface Memorise { nom: string; taille: number }
const CLE_MEMOIRE = 'canape.envois-interrompus';
const EXTENSIONS = /\.(mkv|mp4|m4v|mov|avi|webm|ts|m2ts|mts|wmv|flv|mpe?g|ogv|3gp|divx|vob)$/i;
export const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000];

/** Message d'erreur français selon la réponse du serveur. */
export function messageErreur(statut: number | null, pourcent: number, texteServeur = ''): string {
  switch (statut) {
    case 401: return 'Ta session a expiré : reconnecte-toi puis reprends l’envoi.';
    case 403: return 'Tu n’as pas le droit d’ajouter des films.';
    case 413: return 'Ce fichier est plus lourd que ce que le serveur accepte.';
    case 415: return 'Ce fichier n’est pas une vidéo.';
    case 507: return 'Il n’y a pas assez de place dans ton espace pour ce fichier : libère de l’espace ou demande plus de quota.';
    case 400: return texteServeur.trim() || 'Le serveur a refusé ce fichier.';
    default:
      if (statut === null || statut === 0) return `Connexion perdue à ${pourcent} %. Rien n’est perdu : reprends quand elle revient.`;
      return `Le serveur a rencontré un problème (${statut}). Réessaie dans un instant.`;
  }
}

function lireMemoire(): Memorise[] {
  try { return JSON.parse(localStorage.getItem(CLE_MEMOIRE) ?? '[]') as Memorise[]; } catch { return []; }
}
function ecrireMemoire(l: Memorise[]): void {
  try { localStorage.setItem(CLE_MEMOIRE, JSON.stringify(l)); } catch { /* stockage indisponible */ }
}

class GestionnaireTeleversements {
  envois: Envoi[] = $state([]);
  private fichiers = new Map<number, File>();
  private tus = new Map<number, Upload>();
  private dernier = new Map<number, { t: number; octets: number }>();
  private suivant = 1;
  private auTermine: Array<(envoi: Envoi) => void> = [];

  constructor() {
    if (typeof localStorage === 'undefined') return;
    // Envois interrompus par un rechargement : le navigateur ne garde pas le fichier, on demande de le choisir à nouveau.
    for (const m of lireMemoire()) {
      this.envois.push({ id: this.suivant++, nom: m.nom, taille: m.taille, octets: 0, etat: 'interrompu', debit: 0, reste: null,
        message: 'Envoi interrompu : choisis de nouveau le même fichier, on reprend où on s’était arrêté.' });
    }
  }

  get actifs(): Envoi[] { return this.envois.filter((e) => ['attente', 'envoi', 'pause', 'reessai'].includes(e.etat)); }
  get enCours(): number { return this.actifs.length; }
  /** Progression globale 0-100 des envois actifs. */
  get pourcentGlobal(): number {
    const a = this.actifs;
    const total = a.reduce((s, e) => s + e.taille, 0);
    return total ? Math.round((a.reduce((s, e) => s + e.octets, 0) / total) * 100) : 0;
  }

  /** Prévenu à chaque envoi terminé (la galerie rafraîchit sa grille). */
  surTermine(cb: (envoi: Envoi) => void): () => void {
    this.auTermine.push(cb);
    return () => { this.auTermine = this.auTermine.filter((c) => c !== cb); };
  }

  /** Ajoute des fichiers (glisser-déposer ou sélecteur). Les non-vidéos sont refusées tout de suite. */
  ajouter(fichiers: Iterable<File>): { refuses: string[] } {
    const refuses: string[] = [];
    for (const f of fichiers) {
      if (!EXTENSIONS.test(f.name) && !f.type.startsWith('video/')) { refuses.push(f.name); continue; }
      // Reprise d'un envoi interrompu par un rechargement : même nom, même taille.
      const ancien = this.envois.find((e) => e.etat === 'interrompu' && e.nom === f.name && e.taille === f.size);
      const envoi: Envoi = ancien ?? { id: this.suivant++, nom: f.name, taille: f.size, octets: 0, etat: 'attente', debit: 0, reste: null, message: null };
      envoi.etat = 'attente'; envoi.message = null;
      if (!ancien) this.envois.push(envoi);
      this.fichiers.set(envoi.id, f);
      this.memoriser();
    }
    this.avancer();
    return { refuses };
  }

  private trouver(id: number): Envoi | undefined { return this.envois.find((e) => e.id === id); }

  private memoriser(): void {
    ecrireMemoire(this.envois.filter((e) => ['attente', 'envoi', 'pause', 'reessai', 'erreur', 'interrompu'].includes(e.etat)).map((e) => ({ nom: e.nom, taille: e.taille })));
  }

  /** Envois en série : un seul à la fois, les autres attendent leur tour. */
  private avancer(): void {
    if (this.envois.some((e) => e.etat === 'envoi' || e.etat === 'reessai')) return;
    const prochain = this.envois.find((e) => e.etat === 'attente' && this.fichiers.has(e.id));
    if (prochain) this.demarrer(prochain);
  }

  private demarrer(envoi: Envoi): void {
    const fichier = this.fichiers.get(envoi.id);
    if (!fichier) return;
    envoi.etat = 'envoi'; envoi.message = null;
    const up = new Upload(fichier, {
      endpoint: '/api/televersement',
      chunkSize: TAILLE_MORCEAU_TUS,
      retryDelays: RETRY_DELAYS,
      metadata: { filename: fichier.name, filetype: fichier.type || 'application/octet-stream' },
      removeFingerprintOnSuccess: true,
      onShouldRetry: (err, nb, options) => {
        const statut = err.originalResponse?.getStatus() ?? 0;
        if (statut >= 400 && statut < 500 && ![404, 408, 409, 423, 429].includes(statut)) return false;
        const ok = nb < (options.retryDelays?.length ?? 0);
        if (ok) { envoi.etat = 'reessai'; envoi.message = 'Connexion perdue. Nouvel essai en cours…'; }
        return ok;
      },
      onProgress: (octets, total) => this.progres(envoi, octets, total),
      onChunkComplete: () => { if (envoi.etat === 'reessai') { envoi.etat = 'envoi'; envoi.message = null; } },
      onSuccess: () => {
        envoi.octets = envoi.taille; envoi.etat = 'termine'; envoi.reste = 0; envoi.message = 'Reçu. Préparation de la fiche…';
        this.fichiers.delete(envoi.id); this.tus.delete(envoi.id); this.memoriser();
        for (const cb of this.auTermine) cb(envoi);
        this.avancer();
      },
      onError: (err) => this.echec(envoi, err),
    });
    this.tus.set(envoi.id, up);
    up.findPreviousUploads().then((precedents) => {
      const dernier = precedents[0];
      if (dernier) up.resumeFromPreviousUpload(dernier);
      up.start();
    }, () => up.start());
  }

  private progres(envoi: Envoi, octets: number, total: number): void {
    const maintenant = performance.now();
    const d = this.dernier.get(envoi.id);
    if (d && maintenant - d.t >= 500) {
      const instant = ((octets - d.octets) / (maintenant - d.t)) * 1000;
      envoi.debit = envoi.debit ? envoi.debit * 0.7 + instant * 0.3 : instant;
      this.dernier.set(envoi.id, { t: maintenant, octets });
    } else if (!d) this.dernier.set(envoi.id, { t: maintenant, octets });
    envoi.octets = octets;
    envoi.reste = envoi.debit > 0 ? (total - octets) / envoi.debit : null;
    if (envoi.etat === 'reessai') { envoi.etat = 'envoi'; envoi.message = null; }
  }

  private echec(envoi: Envoi, err: Error): void {
    const statut = (err as DetailedError).originalResponse?.getStatus() ?? null;
    const pourcent = envoi.taille ? Math.round((envoi.octets / envoi.taille) * 100) : 0;
    envoi.etat = 'erreur';
    envoi.message = messageErreur(statut, pourcent, (err as DetailedError).originalResponse?.getBody() ?? '');
    envoi.debit = 0; envoi.reste = null;
    this.tus.delete(envoi.id);
    this.avancer();
  }

  pause(id: number): void {
    const e = this.trouver(id);
    const up = this.tus.get(id);
    if (!e || !up || !['envoi', 'reessai'].includes(e.etat)) return;
    void up.abort(false);
    e.etat = 'pause'; e.debit = 0; e.reste = null;
    e.message = `En pause à ${Math.round((e.octets / e.taille) * 100)} % : on reprend où on s’est arrêté.`;
    this.dernier.delete(id);
    this.avancer();
  }

  reprendre(id: number): void {
    const e = this.trouver(id);
    if (!e || !this.fichiers.has(id)) return;
    if (!['pause', 'erreur'].includes(e.etat)) return;
    e.etat = 'attente'; e.message = null;
    this.avancer();
  }

  /** Abandonne l'envoi (et supprime ce qui a déjà été reçu côté serveur si possible). */
  annuler(id: number): void {
    const e = this.trouver(id);
    if (!e) return;
    const up = this.tus.get(id);
    if (up) void up.abort(true).catch(() => undefined);
    this.tus.delete(id); this.fichiers.delete(id); this.dernier.delete(id);
    this.envois = this.envois.filter((x) => x.id !== id);
    this.memoriser();
    this.avancer();
  }

  /** Retire de la liste les envois terminés ou en erreur. */
  nettoyer(): void {
    this.envois = this.envois.filter((e) => e.etat !== 'termine');
  }
}

export const televersements = new GestionnaireTeleversements();
