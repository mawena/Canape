import { hash, verify } from '@node-rs/argon2';

/** Hache en Argon2id (format PHC). */
export function hasherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse);
}

/** Vérifie un mot de passe ; `false` (jamais d'exception) si le hachage est invalide. */
export async function verifierMotDePasse(hachage: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(hachage, motDePasse);
  } catch {
    return false;
  }
}
