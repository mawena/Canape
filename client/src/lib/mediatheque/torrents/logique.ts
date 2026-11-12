// Logique pure des téléchargements par torrent (testée sous Node : logique.test.ts).
import { TAILLE_MAX_FICHIER_TORRENT, type EtatTorrent, type FichierTorrent, type Telechargement } from '@canape/partage';
import { formaterDebit, formaterReste, formaterTaille } from '../formats.ts';

/** Délai (ms) sans pair ni débit avant d'écrire « En attente d'une place ». */
export const DELAI_ATTENTE_PLACE = 8000;

const ACTIFS: EtatTorrent[] = ['metadonnees', 'telechargement', 'import'];
const FINIS: EtatTorrent[] = ['termine', 'erreur', 'annule'];

/** Le téléchargement avance (ou va avancer) tout seul : on le suit. La pause n'est pas active. */
export const estActif = (t: Pick<Telechargement, 'etat'>): boolean => ACTIFS.includes(t.etat);
export const estFini = (t: Pick<Telechargement, 'etat'>): boolean => FINIS.includes(t.etat);
/** Les fichiers ne se changent plus une fois l'import commencé. */
export const fichiersModifiables = (t: Pick<Telechargement, 'etat'>): boolean => t.etat === 'telechargement' || t.etat === 'pause' || t.etat === 'metadonnees';

/** Faut-il continuer à interroger le serveur ? Oui s'il y a un téléchargement actif et que l'onglet est visible. */
export function doitRafraichir(liste: Array<Pick<Telechargement, 'etat'>>, ongletVisible: boolean): boolean {
  return ongletVisible && liste.some(estActif);
}

/**
 * Un téléchargement est « en attente d'une place » quand il est en `telechargement` sans pair ni débit depuis un moment
 * (le serveur limite les téléchargements simultanés). `sansPairDepuis` : horodatage (ms) du début de cette situation.
 */
export function enAttentePlace(t: Pick<Telechargement, 'etat' | 'pairs' | 'debit'>, sansPairDepuis: number | null, maintenant: number): boolean {
  if (t.etat !== 'telechargement' || t.pairs > 0 || t.debit > 0) return false;
  return sansPairDepuis !== null && maintenant - sansPairDepuis >= DELAI_ATTENTE_PLACE;
}

/** Met à jour la mémoire « depuis quand sans pair ni débit » (une entrée par id). */
export function suivreInactivite(anciens: Map<string, number>, liste: Telechargement[], maintenant: number): Map<string, number> {
  const neuf = new Map<string, number>();
  for (const t of liste) {
    if (t.etat === 'telechargement' && t.pairs === 0 && t.debit === 0) neuf.set(t.id, anciens.get(t.id) ?? maintenant);
  }
  return neuf;
}

export function nomAffiche(t: Pick<Telechargement, 'nom'>): string {
  return t.nom?.trim() || 'Récupération des informations…';
}

/** État en clair. */
export function libelleEtat(t: Pick<Telechargement, 'etat' | 'erreur'>, attentePlace = false): string {
  switch (t.etat) {
    case 'metadonnees': return 'Récupération des informations…';
    case 'telechargement': return attentePlace ? 'En attente d’une place' : 'Téléchargement';
    case 'pause': return 'En pause';
    case 'import': return 'Ajout à ta galerie…';
    case 'termine': return 'Dans ta galerie';
    case 'erreur': return t.erreur?.trim() || 'Le téléchargement a échoué.';
    case 'annule': return 'Annulé';
  }
}

/** « 42 % · 1,2 Go sur 3 Go · 4,1 Mo/s · il reste 2 min · 12 pairs ». */
export function detailChiffres(t: Telechargement, attentePlace = false): string {
  if (t.octetsTotal === null) return t.pairs > 0 ? `${pairsTexte(t.pairs)}` : '';
  const parts = [`${Math.round(t.progression * 100)} %`, `${formaterTaille(t.octetsRecus)} sur ${formaterTaille(t.octetsTotal)}`];
  if (t.etat === 'telechargement' && !attentePlace) {
    if (t.debit > 0) parts.push(formaterDebit(t.debit));
    const reste = formaterReste(t.resteSecondes);
    if (reste && t.debit > 0) parts.push(reste);
    parts.push(pairsTexte(t.pairs));
  }
  return parts.join(' · ');
}

export const pairsTexte = (n: number): string => (n === 0 ? 'aucun pair' : n === 1 ? '1 pair' : `${n} pairs`);

/** Validation simple d'un lien magnet (le serveur reste juge). Rend le message d'erreur, ou `null` si c'est bon. */
export function erreurMagnet(texte: string): string | null {
  const t = texte.trim();
  if (!t) return 'Colle un lien magnet.';
  if (!/^magnet:\?/i.test(t)) return 'Ce n’est pas un lien magnet : il commence par « magnet:? ».';
  const xt = /(?:^|[?&])xt=urn:(?:btih|btmh):([^&]+)/i.exec(t);
  if (!xt) return 'Ce lien magnet est incomplet : il manque l’identifiant du torrent (xt=urn:btih:…).';
  const h = xt[1]!;
  const valide = /^[0-9a-f]{40}$/i.test(h) || /^[A-Z2-7]{32}$/i.test(h) || /^1220[0-9a-f]{64}$/i.test(h);
  return valide ? null : 'L’identifiant de ce lien magnet est illisible : vérifie qu’il est complet.';
}

/** Fichier `.torrent` acceptable ? Rend le message d'erreur ou `null`. */
export function erreurFichierTorrent(nom: string, taille: number): string | null {
  if (!/\.torrent$/i.test(nom)) return 'Ce fichier n’est pas un « .torrent ».';
  if (taille <= 0) return 'Ce fichier est vide.';
  if (taille > TAILLE_MAX_FICHIER_TORRENT) return 'Ce fichier .torrent dépasse 1 Mo : ce n’est sans doute pas le bon.';
  return null;
}

/** Message en clair pour une erreur de l'API à l'ajout. */
export function messageAjout(statut: number, messageServeur = ''): string {
  switch (statut) {
    case 400: return messageServeur.trim() || 'Ce lien ou ce fichier est illisible.';
    case 401: return 'Ta session a expiré : reconnecte-toi puis réessaie.';
    case 403: return 'Tu n’as pas le droit d’ajouter des films par torrent, ou ils sont désactivés sur ce serveur.';
    case 409: return 'Ce torrent est déjà en cours.';
    case 429: return 'Trop d’ajouts d’un coup : patiente une minute, puis réessaie.';
    case 0: return 'Impossible de joindre le serveur. Vérifie ta connexion.';
    default: return `Le serveur a rencontré un problème (${statut}). Réessaie dans un instant.`;
  }
}

/** Total des fichiers cochés. */
export const totalChoisi = (fichiers: FichierTorrent[], choix: Set<number>): number =>
  fichiers.filter((f) => choix.has(f.index)).reduce((s, f) => s + f.taille, 0);

/** Le choix est valable s'il contient au moins une vidéo. */
export const choixValide = (fichiers: FichierTorrent[], choix: Set<number>): boolean =>
  fichiers.some((f) => f.video && choix.has(f.index));

/** Un fichier qu'on peut cocher : vidéos et sous-titres seulement. */
export const fichierChoisissable = (f: FichierTorrent): boolean => f.video || f.sousTitres;

/** Nouveaux téléchargements finis depuis la liste précédente (pour le toast et le rafraîchissement de la grille). */
export function nouvellementTermines(avant: Telechargement[], apres: Telechargement[]): Telechargement[] {
  const etatAvant = new Map(avant.map((t) => [t.id, t.etat]));
  return apres.filter((t) => t.etat === 'termine' && etatAvant.has(t.id) && etatAvant.get(t.id) !== 'termine');
}

/** Erreurs apparues depuis la liste précédente. */
export function nouvellesErreurs(avant: Telechargement[], apres: Telechargement[]): Telechargement[] {
  const etatAvant = new Map(avant.map((t) => [t.id, t.etat]));
  return apres.filter((t) => t.etat === 'erreur' && etatAvant.has(t.id) && etatAvant.get(t.id) !== 'erreur');
}
