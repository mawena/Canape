// Magasin des téléchargements par torrent (runes). Le suivi ne tourne que tant qu'un téléchargement est actif
// et que l'onglet est visible ; il s'arrête tout seul ensuite.
import { INTERVALLE_SUIVI_TORRENTS, type CorpsModifTorrent, type Telechargement } from '@canape/partage';
import { ErreurApi } from '$lib/api/client.ts';
import * as appel from './api.ts';
import { doitRafraichir, estActif, estEnPartage, messageAjout, nouvellementTermines, nouvellesErreurs, suivreInactivite, enAttentePlace, metadonneesLongues } from './logique.ts';

class MagasinTelechargements {
  liste: Telechargement[] = $state([]);
  /** `null` tant que `GET /api/torrents` n'a pas répondu. */
  peutAjouter: boolean | null = $state(null);
  /** Dernier message d'annonce polie (fin, erreur) pour la zone `aria-live`. */
  annonce = $state('');
  /** Horodatage du dernier rafraîchissement : fait réévaluer « en attente d'une place ». */
  maintenant = $state(Date.now());

  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private inactif = new Map<string, number>();
  private enVol = false;
  private auTermine: Array<(t: Telechargement) => void> = [];
  private auxErreurs: Array<(t: Telechargement) => void> = [];
  private ecoute = false;

  get actifs(): Telechargement[] { return this.liste.filter(estActif); }
  get nbEnCours(): number { return this.liste.filter((t) => !['termine', 'erreur', 'annule'].includes(t.etat)).length; }
  get nbEnPartage(): number { return this.liste.filter(estEnPartage).length; }

  attentePlace(t: Telechargement): boolean { return enAttentePlace(t, this.inactif.get(t.id) ?? null, this.maintenant); }
  metaLongue(t: Telechargement): boolean { return metadonneesLongues(t, this.inactif.get(t.id) ?? null, this.maintenant); }

  /** Appelé à chaque téléchargement qui vient de se terminer (la galerie rafraîchit sa grille). */
  surTermine(cb: (t: Telechargement) => void): () => void {
    this.auTermine.push(cb);
    return () => { this.auTermine = this.auTermine.filter((c) => c !== cb); };
  }
  surErreur(cb: (t: Telechargement) => void): () => void {
    this.auxErreurs.push(cb);
    return () => { this.auxErreurs = this.auxErreurs.filter((c) => c !== cb); };
  }

  /** Charge la liste puis (re)programme le suivi. Appelé par la galerie à l'ouverture. */
  async charger(): Promise<void> {
    if (this.enVol) return;
    this.enVol = true;
    try {
      const r = await appel.listerTelechargements();
      const avant = this.liste;
      this.maintenant = Date.now();
      this.inactif = suivreInactivite(this.inactif, r.telechargements, this.maintenant);
      this.peutAjouter = r.peutAjouter;
      this.liste = r.telechargements;
      for (const t of nouvellementTermines(avant, r.telechargements)) {
        this.annonce = `${t.nom ?? 'Le film'} est dans ta galerie.`;
        for (const cb of this.auTermine) cb(t);
      }
      for (const t of nouvellesErreurs(avant, r.telechargements)) {
        this.annonce = `Le téléchargement de ${t.nom ?? 'ce torrent'} a échoué : ${t.erreur ?? 'erreur inconnue'}`;
        for (const cb of this.auxErreurs) cb(t);
      }
    } catch (e) {
      // Torrents indisponibles ou serveur injoignable : on garde l'état connu, sans bruit.
      if (e instanceof ErreurApi && (e.statut === 403 || e.statut === 404)) this.peutAjouter = false;
      else if (this.peutAjouter === null) this.peutAjouter = false;
    } finally {
      this.enVol = false;
      this.programmer();
    }
  }

  private visible(): boolean { return typeof document === 'undefined' || document.visibilityState === 'visible'; }

  private programmer(): void {
    if (this.minuteur) { clearTimeout(this.minuteur); this.minuteur = null; }
    if (typeof window === 'undefined') return;
    if (!this.ecoute) {
      this.ecoute = true;
      document.addEventListener('visibilitychange', () => { if (this.visible()) void this.reveiller(); });
    }
    if (doitRafraichir(this.liste, this.visible())) {
      this.minuteur = setTimeout(() => { this.minuteur = null; void this.charger(); }, INTERVALLE_SUIVI_TORRENTS);
    }
  }

  /** Reprend le suivi si quelque chose est actif (onglet de nouveau visible, ajout…). */
  private async reveiller(): Promise<void> {
    if (this.liste.some((t) => estActif(t) || estEnPartage(t))) await this.charger();
  }

  /** Arrête le suivi (quitter la galerie). La liste reste en mémoire. */
  arreter(): void {
    if (this.minuteur) { clearTimeout(this.minuteur); this.minuteur = null; }
  }

  private integrer(t: Telechargement): void {
    const i = this.liste.findIndex((x) => x.id === t.id);
    if (i >= 0) this.liste[i] = t; else this.liste = [t, ...this.liste];
    this.inactif = suivreInactivite(this.inactif, this.liste, Date.now());
    this.programmer();
  }

  /** Ajoute un torrent ; lève une `Error` au message en clair. */
  async ajouter(source: { magnet: string } | { fichier: File }): Promise<Telechargement> {
    try {
      const t = 'magnet' in source ? await appel.ajouterParMagnet(source.magnet.trim()) : await appel.ajouterParFichier(source.fichier);
      this.integrer(t);
      return t;
    } catch (e) {
      if (e instanceof ErreurApi) throw new Error(messageAjout(e.statut, e.statut === 400 ? e.message : ''));
      throw e;
    }
  }

  private async modifier(id: string, corps: CorpsModifTorrent): Promise<void> {
    try { this.integrer(await appel.modifierTelechargement(id, corps)); }
    catch (e) { await this.charger(); throw e instanceof ErreurApi ? new Error(e.message) : e; }
  }
  pause = (id: string) => this.modifier(id, { pause: true });
  reprendre = (id: string) => this.modifier(id, { pause: false });
  choisirFichiers = (id: string, fichiers: number[]) => this.modifier(id, { fichiers });

  /** Annule un téléchargement en cours, ou retire de la liste une ligne finie. */
  async retirer(id: string): Promise<void> {
    const etait = this.liste.find((t) => t.id === id);
    try {
      await appel.supprimerTelechargement(id);
      // Le serveur garde une ligne « annulé » après l'annulation d'un téléchargement en cours : un second appel la retire.
      if (etait && !['termine', 'erreur', 'annule'].includes(etait.etat)) {
        await appel.supprimerTelechargement(id).catch((e: unknown) => { if (!(e instanceof ErreurApi && (e.statut === 404 || e.statut === 409))) throw e; });
      }
    }
    catch (e) { if (!(e instanceof ErreurApi && e.statut === 404)) throw e instanceof ErreurApi ? new Error(e.message) : e; }
    this.liste = this.liste.filter((t) => t.id !== id);
    this.inactif.delete(id);
    this.programmer();
  }
}

export const telechargements = new MagasinTelechargements();
