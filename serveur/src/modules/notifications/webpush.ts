// Web Push sans dépendance : VAPID (RFC 8292, JWT ES256) et chiffrement du message (RFC 8291, aes128gcm de la RFC 8188).
import {
  createCipheriv, createECDH, createPrivateKey, createSign, hkdfSync, randomBytes, type KeyObject,
} from 'node:crypto';

export interface ClesVapid {
  /** Clé publique, point non compressé (65 octets) en base64url : valeur de `applicationServerKey` et de `k=`. */
  publique: string;
  /** Clé privée P-256 brute (32 octets) en base64url. */
  privee: string;
}

/** Nouvelle paire de clés VAPID. */
export function genererClesVapid(): ClesVapid {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publique: ecdh.getPublicKey().toString('base64url'), privee: ecdh.getPrivateKey().toString('base64url') };
}

function cleDepuis(cles: ClesVapid): KeyObject {
  const pub = Buffer.from(cles.publique, 'base64url');
  return createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: cles.privee, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') },
    format: 'jwk',
  });
}

/** JWT VAPID signé ES256 (signature brute r||s, 64 octets). `sub` est une adresse https, jamais une adresse e-mail. */
export function jetonVapid(cles: ClesVapid, audience: string, sujet: string, expireA: number): string {
  const entete = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const charge = Buffer.from(JSON.stringify({ aud: audience, exp: expireA, sub: sujet })).toString('base64url');
  const signature = createSign('SHA256').update(`${entete}.${charge}`).sign({ key: cleDepuis(cles), dsaEncoding: 'ieee-p1363' });
  return `${entete}.${charge}.${signature.toString('base64url')}`;
}

/** En-tête `Authorization` d'un envoi : `vapid t=<jwt>, k=<clé publique>`. */
export function enteteVapid(cles: ClesVapid, endpoint: string, sujet: string, maintenant: number = Date.now()): string {
  const audience = new URL(endpoint).origin;
  const jeton = jetonVapid(cles, audience, sujet, Math.floor(maintenant / 1000) + 12 * 3600);
  return `vapid t=${jeton}, k=${cles.publique}`;
}

export interface EntreeChiffrement {
  charge: Buffer;
  /** Clé publique de l'abonné (`p256dh`, 65 octets). */
  clePubliqueAbonne: Buffer;
  /** Secret d'authentification de l'abonné (`auth`, 16 octets). */
  auth: Buffer;
  /** Pour les essais seulement : paire éphémère et sel imposés (annexe A de la RFC 8291). */
  fixe?: { clePrivee: Buffer; clePublique: Buffer; sel: Buffer };
  /** Taille d'enregistrement annoncée (4096 par défaut). */
  tailleEnregistrement?: number;
}

const hkdf = (ikm: Buffer, sel: Buffer, info: Buffer, longueur: number): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, sel, info, longueur));

/** Corps d'un envoi : en-tête aes128gcm (sel, taille, clé publique du serveur) suivi du seul enregistrement chiffré. */
export function chiffrerAes128gcm(e: EntreeChiffrement): Buffer {
  const rs = e.tailleEnregistrement ?? 4096;
  if (e.charge.length > rs - 18) throw new Error('Charge trop grande pour un enregistrement.');
  let clePubliqueServeur: Buffer;
  let secret: Buffer;
  let sel: Buffer;
  const ecdh = createECDH('prime256v1');
  if (e.fixe) {
    ecdh.setPrivateKey(e.fixe.clePrivee);
    clePubliqueServeur = e.fixe.clePublique;
    sel = e.fixe.sel;
  } else {
    ecdh.generateKeys();
    clePubliqueServeur = ecdh.getPublicKey();
    sel = randomBytes(16);
  }
  secret = ecdh.computeSecret(e.clePubliqueAbonne);
  const ikm = hkdf(secret, e.auth, Buffer.concat([Buffer.from('WebPush: info\0'), e.clePubliqueAbonne, clePubliqueServeur]), 32);
  const cle = hkdf(ikm, sel, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, sel, Buffer.from('Content-Encoding: nonce\0'), 12);
  const chiffre = createCipheriv('aes-128-gcm', cle, nonce);
  // Dernier (et seul) enregistrement : délimiteur 0x02 après les données.
  const chiffrees = Buffer.concat([chiffre.update(Buffer.concat([e.charge, Buffer.from([2])])), chiffre.final(), chiffre.getAuthTag()]);
  const entete = Buffer.alloc(21);
  sel.copy(entete, 0);
  entete.writeUInt32BE(rs, 16);
  entete.writeUInt8(clePubliqueServeur.length, 20);
  return Buffer.concat([entete, clePubliqueServeur, chiffrees]);
}

export interface Abonnement {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type ResultatEnvoi = { ok: true } | { ok: false; statut: number | null; expire: boolean; raison: string };

export interface OptionsEnvoi {
  cles: ClesVapid;
  sujet: string;
  ttlSecondes?: number;
  delaiMs?: number;
  maintenant?: number;
  /** Remplaçable en test. */
  fetcher?: typeof fetch;
}

/**
 * Envoie une notification. Ne lève jamais : un échec réseau ou un refus se lit dans le résultat.
 * 404 et 410 (`expire`) : l'abonnement n'existe plus, à supprimer.
 */
export async function envoyerNotification(a: Abonnement, charge: Buffer, o: OptionsEnvoi): Promise<ResultatEnvoi> {
  try {
    const corps = chiffrerAes128gcm({ charge, clePubliqueAbonne: Buffer.from(a.p256dh, 'base64url'), auth: Buffer.from(a.auth, 'base64url') });
    const reponse = await (o.fetcher ?? fetch)(a.endpoint, {
      method: 'POST',
      headers: {
        Authorization: enteteVapid(o.cles, a.endpoint, o.sujet, o.maintenant),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(corps.length),
        TTL: String(o.ttlSecondes ?? 3600),
        Urgency: 'normal',
      },
      body: corps,
      redirect: 'error',
      signal: AbortSignal.timeout(o.delaiMs ?? 8000),
    });
    await reponse.arrayBuffer().catch(() => undefined);
    if (reponse.status >= 200 && reponse.status < 300) return { ok: true };
    return { ok: false, statut: reponse.status, expire: reponse.status === 404 || reponse.status === 410, raison: `HTTP ${reponse.status}` };
  } catch (err) {
    return { ok: false, statut: null, expire: false, raison: err instanceof Error ? err.name : 'erreur' };
  }
}
