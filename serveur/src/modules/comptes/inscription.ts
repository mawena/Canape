// Inscription libre (phase 15) : jeton anti-robot, validation, limites. Sans HTTP sauf `enregistrerInscription`.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { COULEURS_AVATAR, MOT_DE_PASSE_MIN_INSCRIPTION, type EtatInscription } from '@canape/partage';
import { ErreurHttp, requeteInvalide } from '../../commun/erreurs.ts';
import { maintenantIso } from '../../commun/identifiants.ts';
import type { Config } from '../../config.ts';
import type { Base } from '../../db/index.ts';
import { lireReglages } from './service.ts';
import { validerPrenom } from './validation.ts';

export const JETON_AGE_MIN_MS = 3_000;
export const JETON_AGE_MAX_MS = 2 * 3_600_000;
export const INSCRIPTIONS_PAR_HEURE_ET_IP = 3;
export const INSCRIPTIONS_PAR_JOUR = 30;
/** Tentatives (réussies ou non) par IP et par 10 minutes : freine le sondage d'identifiants. */
export const TENTATIVES_PAR_IP = 20;

const CLE_SECRET = 'secret_inscription';

/** Clé HMAC du serveur : générée au premier besoin, gardée en base (`reglages`, ignorée par la liste blanche). */
export function secretInscription(db: Base): Buffer {
  const l = db.prepare('SELECT valeur FROM reglages WHERE cle = ?').get(CLE_SECRET) as { valeur: string } | undefined;
  if (l) return Buffer.from(JSON.parse(l.valeur) as string, 'base64url');
  const cle = randomBytes(32);
  db.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO NOTHING').run(CLE_SECRET, JSON.stringify(cle.toString('base64url')));
  const relu = db.prepare('SELECT valeur FROM reglages WHERE cle = ?').get(CLE_SECRET) as { valeur: string };
  return Buffer.from(JSON.parse(relu.valeur) as string, 'base64url');
}

const signer = (cle: Buffer, corps: string): string => createHmac('sha256', cle).update(`inscription:${corps}`).digest('base64url');

/** Jeton `<horodatage base36>.<aléa>.<signature>` ; sans état : réutilisable pendant 2 h, d'où les limites par IP. */
export function creerJeton(db: Base, maintenant = Date.now()): string {
  const corps = `${maintenant.toString(36)}.${randomBytes(9).toString('base64url')}`;
  return `${corps}.${signer(secretInscription(db), corps)}`;
}

/** `null` si le jeton est bon ; sinon le message de refus. */
export function verifierJeton(db: Base, jeton: unknown, maintenant = Date.now()): string | null {
  const invalide = 'Le formulaire a expiré ou est invalide. Recharge la page et réessaie.';
  if (typeof jeton !== 'string' || jeton.length > 200) return invalide;
  const p = jeton.split('.');
  if (p.length !== 3) return invalide;
  const [h, alea, sig] = p as [string, string, string];
  const attendu = Buffer.from(signer(secretInscription(db), `${h}.${alea}`));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return invalide;
  const age = maintenant - parseInt(h, 36);
  if (!Number.isFinite(age) || age < 0) return invalide;
  if (age < JETON_AGE_MIN_MS) return 'Tu as été un peu rapide. Attends un instant et réessaie.';
  if (age > JETON_AGE_MAX_MS) return 'Le formulaire a expiré. Recharge la page et réessaie.';
  return null;
}

export function comptesInscrits(db: Base): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE origine = 'inscription'").get() as { n: number }).n;
}

/** Raison de fermeture (en français) ou `null` si les inscriptions sont ouvertes. */
export function raisonFermeture(db: Base, config: Config): string | null {
  const r = lireReglages(db, config);
  if (!r.inscriptionsOuvertes) return 'Les inscriptions sont fermées pour le moment.';
  if (comptesInscrits(db) >= r.maxComptesInscrits) return 'Les inscriptions sont complètes.';
  return null;
}

export function etatInscription(db: Base, config: Config): EtatInscription {
  const raison = raisonFermeture(db, config);
  return { ouverte: raison === null, raison, jeton: raison === null ? creerJeton(db) : null };
}

/** Identifiant choisi à l'inscription : 3 à 32 caractères (lettres, chiffres, `.`, `_`, `-`) ou une adresse e-mail (≤ 64). */
export function validerIdentifiantInscription(brut: string): string {
  const s = brut.trim();
  const longueur = [...s].length;
  if (s.includes('@')) {
    if (longueur > 64 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/u.test(s)) throw requeteInvalide("Cette adresse e-mail n'est pas valide.");
    return s;
  }
  if (longueur < 3 || longueur > 32) throw requeteInvalide("L'identifiant doit faire entre 3 et 32 caractères.");
  if (!/^[\p{L}\p{N}._-]+$/u.test(s)) throw requeteInvalide("L'identifiant ne peut contenir que des lettres, des chiffres, « . », « _ » et « - ».");
  return s;
}

export function validerMotDePasseInscription(mdp: string, identifiant: string): string {
  if ([...mdp].length < MOT_DE_PASSE_MIN_INSCRIPTION) {
    throw requeteInvalide(`Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN_INSCRIPTION} caractères.`);
  }
  if (mdp.length > 256) throw requeteInvalide('Le mot de passe est trop long.');
  if (mdp.toLowerCase() === identifiant.toLowerCase()) throw requeteInvalide("Le mot de passe ne peut pas être ton identifiant.");
  return mdp;
}

export interface ChampsInscription { prenom: string; identifiant: string; motDePasse: string; couleur: string }

/** Contrôle le corps (hors jeton et limites) : rend les champs propres ou lève 400. */
export function validerCorps(corps: Record<string, unknown>): ChampsInscription {
  if (corps['accepteRegles'] !== true) throw requeteInvalide("Tu dois accepter les règles d'usage pour créer un compte.");
  for (const c of ['prenom', 'identifiant', 'motDePasse'] as const) {
    if (typeof corps[c] !== 'string') throw requeteInvalide(c === 'prenom' ? 'Indique ton prénom.' : c === 'identifiant' ? 'Indique un identifiant.' : 'Indique un mot de passe.');
  }
  const prenom = validerPrenom(corps['prenom'] as string);
  const identifiant = validerIdentifiantInscription(corps['identifiant'] as string);
  const motDePasse = validerMotDePasseInscription(corps['motDePasse'] as string, identifiant);
  const c = corps['couleur'];
  if (c !== undefined && (typeof c !== 'string' || !(COULEURS_AVATAR as readonly string[]).includes(c))) throw requeteInvalide("Cette couleur d'avatar n'existe pas.");
  const couleur = (c as string | undefined) ?? COULEURS_AVATAR[Math.floor(Math.random() * COULEURS_AVATAR.length)] as string;
  return { prenom, identifiant, motDePasse, couleur };
}

/** Comptes créés par inscription dans les dernières 24 h. */
export function inscriptionsDuJour(db: Base): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE origine = 'inscription' AND cree_le > ?")
    .get(maintenantIso(new Date(Date.now() - 86_400_000))) as { n: number }).n;
}

/** Insère le compte (transaction faite par l'appelant) ; revérifie unicité et plafond. Rend l'id. */
export function insererInscrit(db: Base, config: Config, c: ChampsInscription, hachage: string): number {
  const raison = raisonFermeture(db, config);
  if (raison) throw new ErreurHttp(403, 'inscriptions_fermees', raison);
  if (db.prepare('SELECT 1 FROM utilisateurs WHERE identifiant = ?').get(c.identifiant)) {
    throw new ErreurHttp(409, 'identifiant_pris', 'Cet identifiant est déjà pris. Choisis-en un autre.');
  }
  const r = lireReglages(db, config);
  const maintenant = maintenantIso();
  const ins = db.prepare(
    `INSERT INTO utilisateurs (prenom, identifiant, mot_de_passe, role, peut_televerser, peut_torrent, origine, quota_octets, actif, couleur, cree_le, derniere_connexion)
     VALUES (?, ?, ?, 'viewer', 1, ?, 'inscription', ?, 1, ?, ?, ?)`,
  ).run(c.prenom, c.identifiant, hachage, r.torrentsInscrits ? 1 : 0, r.quotaInscriptionOctets, c.couleur, maintenant, maintenant);
  return Number(ins.lastInsertRowid);
}
