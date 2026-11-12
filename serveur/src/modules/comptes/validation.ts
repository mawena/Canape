// Règles de saisie des comptes (pures, testées) et messages d'erreur de validation en français.
import type { FastifySchemaValidationError } from 'fastify';
import { ErreurHttp, requeteInvalide } from '../../commun/erreurs.ts';

export const IDENTIFIANT_MIN = 3;
export const IDENTIFIANT_MAX = 64;
export const PRENOM_MIN = 1;
export const PRENOM_MAX = 40;
export const MOT_DE_PASSE_MIN = 10;
export const MOT_DE_PASSE_MAX = 256;

const longueur = (s: string): number => [...s].length;

/** Prénom : 1 à 40 caractères une fois les espaces retirés, sans caractère de contrôle. */
export function validerPrenom(brut: string): string {
  const s = brut.trim();
  if (longueur(s) < PRENOM_MIN || longueur(s) > PRENOM_MAX || /\p{Cc}/u.test(s)) {
    throw requeteInvalide(`Le prénom doit faire entre ${PRENOM_MIN} et ${PRENOM_MAX} caractères.`);
  }
  return s;
}

/** Identifiant (pseudo ou e-mail) : 3 à 64 caractères, sans espace. */
export function validerIdentifiant(brut: string): string {
  const s = brut.trim();
  if (longueur(s) < IDENTIFIANT_MIN || longueur(s) > IDENTIFIANT_MAX) {
    throw requeteInvalide(`L'identifiant doit faire entre ${IDENTIFIANT_MIN} et ${IDENTIFIANT_MAX} caractères.`);
  }
  if (/[\s\p{Cc}]/u.test(s)) throw requeteInvalide("L'identifiant ne peut pas contenir d'espace.");
  return s;
}

/** Mot de passe : au moins 10 caractères (aucune règle de composition). */
export function validerMotDePasse(s: string): string {
  if (longueur(s) < MOT_DE_PASSE_MIN) {
    throw requeteInvalide(`Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`);
  }
  if (s.length > MOT_DE_PASSE_MAX) throw requeteInvalide('Le mot de passe est trop long.');
  return s;
}

const LIBELLES: Record<string, string> = {
  identifiant: `L'identifiant doit faire entre ${IDENTIFIANT_MIN} et ${IDENTIFIANT_MAX} caractères.`,
  prenom: `Le prénom doit faire entre ${PRENOM_MIN} et ${PRENOM_MAX} caractères.`,
  prenomSuggere: `Le prénom suggéré doit faire entre ${PRENOM_MIN} et ${PRENOM_MAX} caractères.`,
  motDePasse: `Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`,
  nouveau: `Le nouveau mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`,
  actuel: 'Saisis ton mot de passe actuel.',
  couleur: "Cette couleur d'avatar n'existe pas.",
  role: 'Le rôle doit être « admin » ou « viewer ».',
  dureeJours: 'La durée doit être comprise entre 1 et 90 jours.',
  quotaOctets: 'Le quota doit être un nombre d’octets positif, ou vide pour illimité.',
  peutTeleverser: 'Valeur invalide pour le droit de téléverser.',
  actif: 'Valeur invalide pour l’état du compte.',
  preparationAuto: 'La préparation automatique doit valoir oui ou non.',
  quotaDefautOctets: 'Le quota par défaut doit être un nombre d’octets positif.',
};

/** Formateur d'erreurs de schéma Fastify : un message français précis par champ. */
export function formaterErreursSchema(erreurs: FastifySchemaValidationError[]): Error {
  const e = erreurs[0] as (FastifySchemaValidationError & { params?: { missingProperty?: string } }) | undefined;
  if (e) {
    const champ = e.keyword === 'required'
      ? e.params?.missingProperty
      : (e.instancePath ?? '').split('/').filter(Boolean).pop();
    if (champ && LIBELLES[champ]) return new ErreurHttp(400, 'requete_invalide', LIBELLES[champ]);
  }
  return new ErreurHttp(400, 'requete_invalide', 'Requête invalide.');
}
