// Aides des tests de notifications : faux service de notifications local (serveur HTTP) et abonné de test (clés, déchiffrement).
import { createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';

export interface Recu {
  chemin: string;
  entetes: IncomingHttpHeaders;
  corps: Buffer;
}

export interface FauxService {
  /** Adresse d'un abonnement valide sur ce faux service. */
  url(nom?: string): string;
  recus: Recu[];
  /** Statut rendu aux prochains envois (201 par défaut) ; fonction : décidé par chemin. */
  statut: number | ((chemin: string) => number);
  /** Retard avant de répondre (essai du délai d'attente). */
  retardMs: number;
  attendre(n: number, ms?: number): Promise<void>;
  fermer(): Promise<void>;
}

export async function creerFauxService(): Promise<FauxService> {
  const recus: Recu[] = [];
  const f: FauxService = {
    recus, statut: 201, retardMs: 0,
    url: (nom = 'abonne') => `http://127.0.0.1:${(serveur.address() as { port: number }).port}/push/${nom}`,
    attendre: async (n, ms = 3000) => {
      const debut = Date.now();
      while (recus.length < n) {
        if (Date.now() - debut > ms) throw new Error(`${n} envoi(s) attendu(s), ${recus.length} reçu(s)`);
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    fermer: () => new Promise((r) => { serveur.closeAllConnections(); serveur.close(() => r()); }),
  };
  const serveur: Server = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on('data', (d: Buffer) => morceaux.push(d));
    req.on('end', () => {
      recus.push({ chemin: req.url ?? '', entetes: req.headers, corps: Buffer.concat(morceaux) });
      const statut = typeof f.statut === 'function' ? f.statut(req.url ?? '') : f.statut;
      setTimeout(() => { res.statusCode = statut; res.end(); }, f.retardMs);
    });
  });
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()));
  return f;
}

export interface AbonneTest {
  p256dh: string;
  auth: string;
  /** Corps JSON d'un `POST /api/notifications/abonnements`. */
  corps(endpoint: string, appareil?: string): Record<string, unknown>;
  dechiffrer(corps: Buffer): Buffer;
}

/** Un navigateur de test : sa paire de clés et son secret d'authentification. */
export function creerAbonneTest(): AbonneTest {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const clePublique = ecdh.getPublicKey();
  const auth = Buffer.from('0123456789abcdef');
  return {
    p256dh: clePublique.toString('base64url'),
    auth: auth.toString('base64url'),
    corps: (endpoint, appareil) => ({ endpoint, keys: { p256dh: clePublique.toString('base64url'), auth: auth.toString('base64url') }, ...(appareil ? { appareil } : {}) }),
    dechiffrer(corps) {
      const sel = corps.subarray(0, 16);
      const longueurCle = corps.readUInt8(20);
      const cleServeur = corps.subarray(21, 21 + longueurCle);
      const chiffre = corps.subarray(21 + longueurCle);
      const secret = ecdh.computeSecret(cleServeur);
      const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), clePublique, cleServeur]), 32));
      const cle = Buffer.from(hkdfSync('sha256', ikm, sel, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
      const nonce = Buffer.from(hkdfSync('sha256', ikm, sel, Buffer.from('Content-Encoding: nonce\0'), 12));
      const d = createDecipheriv('aes-128-gcm', cle, nonce);
      d.setAuthTag(chiffre.subarray(chiffre.length - 16));
      const clair = Buffer.concat([d.update(chiffre.subarray(0, chiffre.length - 16)), d.final()]);
      // Délimiteur 0x02 (dernier enregistrement), éventuellement précédé de zéros de remplissage.
      let fin = clair.length - 1;
      while (fin >= 0 && clair[fin] === 0) fin--;
      if (clair[fin] !== 2) throw new Error('délimiteur de fin absent');
      return clair.subarray(0, fin);
    },
  };
}

/** Vérifie la signature ES256 d'un JWT avec la clé publique VAPID (65 octets, base64url) ; rend l'en-tête et la charge. */
export function verifierJwt(jwt: string, clePublique: string): { entete: Record<string, unknown>; charge: Record<string, unknown>; valide: boolean } {
  const [e, c, s] = jwt.split('.') as [string, string, string];
  const pub = Buffer.from(clePublique, 'base64url');
  const cle = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') }, format: 'jwk' });
  const valide = createVerify('SHA256').update(`${e}.${c}`).verify({ key: cle, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return {
    entete: JSON.parse(Buffer.from(e, 'base64url').toString()) as Record<string, unknown>,
    charge: JSON.parse(Buffer.from(c, 'base64url').toString()) as Record<string, unknown>,
    valide,
  };
}
