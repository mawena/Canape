// Types du module comptes (contrat : docs/CONCEPTION.md, « Interface HTTP / Comptes »).

export type Role = 'admin' | 'viewer';

/** Compte complet, tel que le voit son propriétaire (et l'admin). Jamais de mot de passe. */
export interface Utilisateur {
  id: number;
  prenom: string;
  identifiant: string;
  role: Role;
  peutTeleverser: boolean;
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
}

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
