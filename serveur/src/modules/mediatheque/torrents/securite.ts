// Sécurité des torrents : le serveur est sur Internet et n'importe quel utilisateur peut envoyer un `.torrent` ou un
// lien magnet. Transmission irait sinon chercher des sources web et parler à des trackers que l'utilisateur choisit :
// on retire tout ce qui mène vers le serveur lui-même ou son réseau (SSRF), et on masque les clés personnelles
// (`passkey`) des trackers privés dans tout ce qui est journalisé ou montré.
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { decoder, encoder, type ValeurBencode } from './bencode.ts';

const NON_ROUTABLES = new BlockList();
for (const [a, n] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) NON_ROUTABLES.addSubnet(a, n, 'ipv4');
for (const [a, n] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) NON_ROUTABLES.addSubnet(a, n, 'ipv6');

const SUFFIXES_INTERNES = ['.localhost', '.local', '.localdomain', '.internal', '.intranet', '.lan', '.home', '.home.arpa', '.corp', '.private'];

/** Adresse IP (v4 ou v6) de bouclage, privée, lien local ou non routable ? */
export function ipInterdite(ip: string): boolean {
  const type = isIP(ip);
  return type === 0 ? false : NON_ROUTABLES.check(ip, type === 4 ? 'ipv4' : 'ipv6');
}

/** Hôte (sans crochets ni point final) qui ne doit jamais être contacté : localhost, noms internes, IP non routable. */
export function hoteInterdit(hote: string): boolean {
  const h = hote.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (isIP(h)) return ipInterdite(h);
  if (h === 'localhost' || SUFFIXES_INTERNES.some((s) => h.endsWith(s))) return true;
  return !h.includes('.'); // un nom sans point ne se résout que sur le réseau interne (Docker, intranet…)
}

/** URL d'annonce acceptable : `http`, `https` ou `udp`, vers un hôte public. */
export function trackerAdmis(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (!['http:', 'https:', 'udp:'].includes(u.protocol)) return false;
  return !hoteInterdit(u.hostname);
}

/** Retire les URL dont le nom de domaine se résout vers une adresse interne (best effort : une erreur DNS ne retire rien). */
export async function filtrerParDns(urls: string[]): Promise<string[]> {
  const rejetes = new Set<string>();
  await Promise.all([...new Set(urls)].map(async (url) => {
    let hote: string;
    try { hote = new URL(url).hostname.replace(/^\[|\]$/g, ''); } catch { return; }
    if (isIP(hote)) return;
    try {
      const adresses = await Promise.race([
        lookup(hote, { all: true }),
        new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error('délai')), 3000).unref()),
      ]);
      if (adresses.some((a) => ipInterdite(a.address))) rejetes.add(url);
    } catch { /* inconnu ou injoignable : Transmission échouera de lui-même */ }
  }));
  return urls.filter((u) => !rejetes.has(u));
}

/**
 * Prépare un `.torrent` pour Transmission : plus de sources web (`url-list`, `httpseeds`), plus de noeuds DHT
 * imposés, et seulement des trackers publics. L'empreinte (`info`) est inchangée.
 */
export async function securiserTorrent(octets: Uint8Array): Promise<Buffer> {
  const { valeur, brut } = decoder(Buffer.from(octets));
  if (!(valeur instanceof Map)) throw new Error('ce fichier n\'est pas un torrent');
  for (const cle of ['url-list', 'httpseeds', 'nodes']) valeur.delete(cle);
  const texte = (b: ValeurBencode): string | null => (Buffer.isBuffer(b) ? b.toString('utf8') : null);
  const annonces: string[] = [];
  const a = valeur.get('announce');
  const unique = a === undefined ? null : texte(a);
  if (unique) annonces.push(unique);
  const liste = valeur.get('announce-list');
  const paliers = Array.isArray(liste) ? liste : [];
  for (const p of paliers) for (const t of Array.isArray(p) ? p : []) { const u = texte(t); if (u) annonces.push(u); }
  const admis = new Set(await filtrerParDns(annonces.filter(trackerAdmis)));
  if (unique && admis.has(unique)) valeur.set('announce', Buffer.from(unique, 'utf8')); else valeur.delete('announce');
  const nouveaux = paliers
    .map((p) => (Array.isArray(p) ? p.filter((t) => { const u = texte(t); return u !== null && admis.has(u); }) : []))
    .filter((p) => p.length > 0);
  if (nouveaux.length) valeur.set('announce-list', nouveaux); else valeur.delete('announce-list');
  return encoder(valeur, brut);
}

/** Retire d'un lien magnet les trackers non publics (`tr`) ; `xs`/`as`/`ws` sont déjà absents (`analyserMagnet`). */
export async function securiserMagnet(magnet: string): Promise<string> {
  const u = new URL(magnet);
  const trs = u.searchParams.getAll('tr');
  if (!trs.length) return magnet;
  const admis = new Set(await filtrerParDns(trs.filter(trackerAdmis)));
  const paires = magnet.slice(magnet.indexOf('?') + 1).split('&').filter((p) => {
    if (!/^tr=/i.test(p)) return true;
    let d = p.slice(3);
    try { d = decodeURIComponent(d); } catch { /* tel quel */ }
    return admis.has(d);
  });
  return `magnet:?${paires.join('&')}`;
}

const CLES = 'passkey|pass|pid|key|apikey|api_key|token|auth|authkey|torrent_pass|secret|uid|user|id|hash';

/**
 * Masque dans un texte les adresses de trackers (clé dans le chemin ou la requête) et les clés personnelles :
 * `https://t.exemple/abc123def456/announce?passkey=XYZ` devient `https://t.exemple/…`.
 */
export function masquer(texte: string): string {
  return texte
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/?#]+)[^\s"'<>)\]]*/gi, (_t, schema: string, hote: string) => `${schema}${hote.replace(/^[^@]*@/, '')}/…`)
    .replace(new RegExp(`\\b(${CLES})=[^&\\s"']+`, 'gi'), '$1=…')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '…');
}
