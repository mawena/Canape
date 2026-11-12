import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** Identifiant aléatoire en base32 minuscule (12 caractères par défaut : films, séances). */
export function idBase32(longueur = 12): string {
  const octets = randomBytes(longueur);
  let s = '';
  for (let i = 0; i < longueur; i++) s += ALPHABET[(octets[i] ?? 0) & 31];
  return s;
}

/** Jeton aléatoire (base64url) : sessions, invitations, liens de séance. À ne stocker que par `sha256Hex`. */
export function jetonAleatoire(octets = 32): string {
  return randomBytes(octets).toString('base64url');
}

export function sha256Hex(texte: string): string {
  return createHash('sha256').update(texte).digest('hex');
}

/** Date courante en ISO 8601 UTC. */
export function maintenantIso(date: Date = new Date()): string {
  return date.toISOString();
}
