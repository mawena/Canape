// Types du module comptes (contrat : docs/CONCEPTION.md, « Interface HTTP / Comptes »).

export type Role = 'admin' | 'viewer';

export type OrigineCompte = 'installation' | 'invitation' | 'inscription';

/** Compte complet, tel que le voit son propriétaire (et l'admin). Jamais de mot de passe. */
export interface Utilisateur {
  id: number;
  prenom: string;
  identifiant: string;
  role: Role;
  peutTeleverser: boolean;
  /** Peut ajouter des films par torrent (en plus de `peutTeleverser`). */
  peutTorrent: boolean;
  /** Comment le compte est né : premier admin, invitation, ou inscription libre (`/inscription`). */
  origine: OrigineCompte;
  /** Quota en octets ; `null` = illimité. */
  quotaOctets: number | null;
  couleur: string | null;
  creeLe: string;
  derniereConnexion: string | null;
}

/** Ce que voient les autres comptes (partage, invitations). */
export interface UtilisateurPublic {
  id: number;
  prenom: string;
  couleur: string | null;
}

/** `GET /api/etat` */
export interface EtatApi {
  version: string;
  utilisateur: Utilisateur | null;
  installationRequise: boolean;
  /** Les inscriptions libres sont ouvertes (lien « Créer un compte » sur la page de connexion). */
  inscriptionOuverte: boolean;
}

/** `GET /api/inscription` (libre) */
export interface EtatInscription {
  ouverte: boolean;
  /** Pourquoi c'est fermé, en français (`null` si ouvert) : fermées par l'admin, ou complètes. */
  raison: string | null;
  /** Jeton anti-robot signé et horodaté, à renvoyer avec le formulaire (valable de 3 s à 2 h après l'avoir reçu). */
  jeton: string | null;
}

/** `POST /api/inscription` (libre) → 201 + cookie de session + `Utilisateur`. */
export interface CorpsInscription {
  prenom: string;
  identifiant: string;
  motDePasse: string;
  couleur?: string;
  /** Case « J'accepte les règles d'usage » (`/regles`) : obligatoire. */
  accepteRegles: boolean;
  jeton: string;
  /** Champ piège invisible pour les robots : doit rester vide. */
  site?: string;
}

/** Longueur minimale d'un mot de passe choisi à l'inscription. */
export const MOT_DE_PASSE_MIN_INSCRIPTION = 10;

/** `POST /api/connexion` */
export interface CorpsConnexion {
  identifiant: string;
  motDePasse: string;
}

export type TypeInvitation = 'compte' | 'reinitialisation';

/** `GET /api/invitations/:jeton` */
export interface InvitationPublique {
  type: TypeInvitation;
  role: Role | null;
  prenomSuggere: string | null;
  valide: boolean;
  /** Prénom de la personne qui invite (ou du compte à réinitialiser) ; `null` si inconnu. Ajout au contrat. */
  invitePar?: string | null;
}

/** `POST /api/invitations/:jeton` (type compte : les trois champs ; réinitialisation : `motDePasse` seul). */
export interface CorpsAcceptationInvitation {
  prenom?: string;
  identifiant?: string;
  motDePasse: string;
  /** Couleur d'avatar parmi `COULEURS_AVATAR` (type compte ; tirée au hasard si absente). Ajout au contrat. */
  couleur?: string;
}

/** `PATCH /api/compte` */
export interface CorpsModifierCompte {
  prenom?: string;
  couleur?: string;
  motDePasse?: { actuel: string; nouveau: string };
}

/** `PATCH /api/admin/utilisateurs/:id` */
export interface CorpsModifierUtilisateurAdmin {
  prenom?: string;
  role?: Role;
  peutTeleverser?: boolean;
  quotaOctets?: number | null;
  actif?: boolean;
}

/** Ligne de `GET /api/admin/utilisateurs`. */
export interface UtilisateurAdmin extends Utilisateur {
  actif: boolean;
  /** Octets occupés par ses films. */
  octetsUtilises: number;
}

/** `POST /api/admin/invitations` */
export interface CorpsCreerInvitation {
  role: Role;
  prenomSuggere?: string;
  dureeJours?: number;
}

/** Réponse de création d'invitation ou de réinitialisation. */
export interface LienInvitation {
  lien: string;
  /** Identifiant de l'invitation et date d'expiration (ajouts au contrat). */
  id?: number;
  expireLe?: string;
}

/** `GET /api/compte` : le compte et l'espace qu'il occupe (ajout au contrat). */
export interface Compte extends Utilisateur {
  octetsUtilises: number;
}

/** `GET|PATCH /api/admin/reglages`. */
export interface Reglages {
  /** Convertir à l'avance, quand le serveur est calme, les films qui ne se lisent pas directement. */
  preparationAuto: boolean;
  /** Quota (octets) donné à un nouveau compte viewer. */
  quotaDefautOctets: number;
  /** Inscriptions libres ouvertes (`/inscription`). */
  inscriptionsOuvertes: boolean;
  /** Quota (octets) d'un compte né d'une inscription libre. */
  quotaInscriptionOctets: number;
  /** Un compte né d'une inscription libre peut ajouter des films par torrent. */
  torrentsInscrits: boolean;
  /** Nombre maximal de comptes nés d'une inscription libre (au-delà : « Les inscriptions sont complètes »). */
  maxComptesInscrits: number;
}

/** Ligne de `GET /api/admin/invitations`. */
export interface InvitationAdmin {
  id: number;
  type: TypeInvitation;
  role: Role | null;
  prenomSuggere: string | null;
  utilisateurId: number | null;
  creeLe: string;
  expireLe: string;
  utiliseeLe: string | null;
}

/** `GET /api/admin/stockage` */
export interface Stockage {
  disque: { total: number; libre: number };
  films: number;
  cache: number;
  /** Taille maximale du cache (`CANAPE_CACHE_MAX`). */
  cacheMax: number;
  parUtilisateur: Array<{ utilisateurId: number; prenom: string; octets: number; quotaOctets: number | null }>;
}

/** Couleurs d'avatar proposées à la création d'un compte. */
export const COULEURS_AVATAR = [
  '#8e2433', '#c0602d', '#e9b872', '#7fc98a', '#4f9d9a', '#5b7fc4', '#8a6cc4', '#c46c9d',
] as const;
