import { createHmac } from 'node:crypto';
import type { ServeurIce } from '../../config.ts';

/** Identifiants temporaires façon coturn `use-auth-secret` : utilisateur = expiration (s), mot de passe = base64(HMAC-SHA1). */
export function identifiantsTurn(secret: string, maintenant = Date.now(), dureeS = 12 * 3600): { username: string; credential: string } {
  const username = String(Math.floor(maintenant / 1000) + dureeS);
  return { username, credential: createHmac('sha1', secret).update(username).digest('base64') };
}

export function serveursIce(
  config: { ice: ServeurIce[]; turnUrls: string[]; turnSecret: string },
  maintenant = Date.now(),
): ServeurIce[] {
  const liste = [...config.ice];
  if (config.turnUrls.length > 0 && config.turnSecret) {
    liste.push({ urls: config.turnUrls, ...identifiantsTurn(config.turnSecret, maintenant) });
  }
  return liste;
}
