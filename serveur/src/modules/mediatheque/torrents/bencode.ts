// Bencode minimal pour réécrire un `.torrent` : l'empreinte reste intacte, car le dictionnaire `info` est recopié
// octet pour octet ; le reste est ré-encodé (clés triées, comme l'exige le format).

export type ValeurBencode = Buffer | number | bigint | ValeurBencode[] | Map<string, ValeurBencode>;

const PROFONDEUR_MAX = 32;

export interface Decode {
  valeur: ValeurBencode;
  /** Octets d'origine de chaque dictionnaire lu (pour recopier `info` tel quel). */
  brut: WeakMap<Map<string, ValeurBencode>, Buffer>;
}

export function decoder(octets: Buffer): Decode {
  const brut = new WeakMap<Map<string, ValeurBencode>, Buffer>();
  let i = 0;
  const erreur = (m: string): never => { throw new Error(`bencode invalide (${m} à l'octet ${i})`); };

  function entier(): number | bigint {
    const fin = octets.indexOf(0x65, i);
    if (fin < 0) return erreur('entier non terminé');
    const t = octets.toString('latin1', i + 1, fin);
    if (!/^-?\d+$/.test(t)) return erreur('entier illisible');
    i = fin + 1;
    const n = BigInt(t);
    return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;
  }

  function chaine(): Buffer {
    const deux = octets.indexOf(0x3a, i);
    if (deux < 0) return erreur('chaîne sans longueur');
    const t = octets.toString('latin1', i, deux);
    if (!/^\d+$/.test(t)) return erreur('longueur illisible');
    const n = Number(t);
    const debut = deux + 1;
    if (debut + n > octets.length) return erreur('chaîne tronquée');
    i = debut + n;
    return octets.subarray(debut, debut + n);
  }

  function lire(profondeur: number): ValeurBencode {
    if (profondeur > PROFONDEUR_MAX) return erreur('trop profond');
    const c = octets[i];
    if (c === 0x69) return entier();
    if (c === 0x6c) {
      i++;
      const l: ValeurBencode[] = [];
      while (octets[i] !== 0x65) { if (i >= octets.length) return erreur('liste non terminée'); l.push(lire(profondeur + 1)); }
      i++;
      return l;
    }
    if (c === 0x64) {
      const debut = i;
      i++;
      const d = new Map<string, ValeurBencode>();
      while (octets[i] !== 0x65) {
        if (i >= octets.length) return erreur('dictionnaire non terminé');
        d.set(chaine().toString('latin1'), lire(profondeur + 1));
      }
      i++;
      brut.set(d, octets.subarray(debut, i));
      return d;
    }
    if (c !== undefined && c >= 0x30 && c <= 0x39) return chaine();
    return erreur('octet inattendu');
  }

  const valeur = lire(0);
  if (i !== octets.length) erreur('octets en trop');
  return { valeur, brut };
}

export function encoder(v: ValeurBencode, brut?: WeakMap<Map<string, ValeurBencode>, Buffer>, cle?: string): Buffer {
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(`${v.length}:`), v]);
  if (typeof v === 'number' || typeof v === 'bigint') return Buffer.from(`i${v}e`);
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('l'), ...v.map((x) => encoder(x, brut)), Buffer.from('e')]);
  if (cle === 'info' && brut?.has(v)) return brut.get(v)!;
  const cles = [...v.keys()].sort((a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1')));
  return Buffer.concat([Buffer.from('d'), ...cles.map((k) => Buffer.concat([encoder(Buffer.from(k, 'latin1')), encoder(v.get(k)!, brut, k)])), Buffer.from('e')]);
}
