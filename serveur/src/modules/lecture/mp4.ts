// Outils minimaux sur les boîtes MP4 (ISO BMFF).

const CONTENEURS = new Set(['moov', 'trak']);

function lireBoites(buf: Buffer, debut: number, fin: number, retirer: Set<string>): Buffer {
  const morceaux: Buffer[] = [];
  let i = debut;
  while (i + 8 <= fin) {
    const taille = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    if (taille < 8 || i + taille > fin) {
      morceaux.push(buf.subarray(i, fin));
      break;
    }
    if (retirer.has(type)) {
      i += taille;
      continue;
    }
    if (CONTENEURS.has(type)) {
      const interieur = lireBoites(buf, i + 8, i + taille, retirer);
      const entete = Buffer.alloc(8);
      entete.writeUInt32BE(8 + interieur.length, 0);
      entete.write(type, 4, 'latin1');
      morceaux.push(entete, interieur);
    } else {
      morceaux.push(buf.subarray(i, i + taille));
    }
    i += taille;
  }
  return Buffer.concat(morceaux);
}

/**
 * Retire les listes d'édition (`edts`) d'un segment d'initialisation : ffmpeg y inscrit le décalage de départ du
 * lancement, qui serait appliqué en double puisque les segments portent déjà des horodatages absolus.
 */
export function retirerListesEdition(init: Buffer): Buffer {
  return lireBoites(init, 0, init.length, new Set(['edts']));
}

export interface DecalagePiste {
  /** Unités par seconde de la piste (`mdhd`). */
  echelle: number;
  /** Début de la piste dans le temps du film, en unités de la piste (durée de la première édition vide). */
  decalage: number;
}

function enfants(buf: Buffer, debut: number, fin: number): Array<{ type: string; debut: number; fin: number }> {
  const r: Array<{ type: string; debut: number; fin: number }> = [];
  let i = debut;
  while (i + 8 <= fin) {
    const taille = buf.readUInt32BE(i);
    if (taille < 8 || i + taille > fin) break;
    r.push({ type: buf.toString('latin1', i + 4, i + 8), debut: i + 8, fin: i + taille });
    i += taille;
  }
  return r;
}

/**
 * Lit, dans le segment d'initialisation d'un lancement de ffmpeg, le début de chaque piste (première édition vide de
 * `elst`) : ffmpeg écrit des `tfdt` relatifs au lancement et met le décalage `-ss` / `-output_ts_offset` dans cette liste.
 */
export function lireDecalages(init: Buffer): Map<number, DecalagePiste> {
  const r = new Map<number, DecalagePiste>();
  const moov = enfants(init, 0, init.length).find((b) => b.type === 'moov');
  if (!moov) return r;
  const filsMoov = enfants(init, moov.debut, moov.fin);
  const mvhd = filsMoov.find((b) => b.type === 'mvhd');
  const echelleFilm = mvhd ? init.readUInt32BE(mvhd.debut + (init[mvhd.debut] === 1 ? 20 : 12)) : 1000;
  for (const trak of filsMoov.filter((b) => b.type === 'trak')) {
    const fils = enfants(init, trak.debut, trak.fin);
    const tkhd = fils.find((b) => b.type === 'tkhd');
    const mdia = fils.find((b) => b.type === 'mdia');
    if (!tkhd || !mdia) continue;
    const id = init.readUInt32BE(tkhd.debut + (init[tkhd.debut] === 1 ? 20 : 12));
    const mdhd = enfants(init, mdia.debut, mdia.fin).find((b) => b.type === 'mdhd');
    if (!mdhd) continue;
    const echelle = init.readUInt32BE(mdhd.debut + (init[mdhd.debut] === 1 ? 20 : 12));
    let decalage = 0;
    const edts = fils.find((b) => b.type === 'edts');
    const elst = edts ? enfants(init, edts.debut, edts.fin).find((b) => b.type === 'elst') : undefined;
    if (elst && init.readUInt32BE(elst.debut + 4) > 0) {
      const v = init[elst.debut]!;
      const duree = v === 1 ? Number(init.readBigUInt64BE(elst.debut + 8)) : init.readUInt32BE(elst.debut + 8);
      const mediaTime = v === 1 ? Number(init.readBigInt64BE(elst.debut + 16)) : init.readInt32BE(elst.debut + 12);
      if (mediaTime === -1) decalage = Math.round((duree / echelleFilm) * echelle);
    }
    r.set(id, { echelle, decalage });
  }
  return r;
}

/** Ajoute à chaque `tfdt` du segment le décalage de sa piste (copie). */
export function decalerSegment(segment: Buffer, decalages: Map<number, DecalagePiste>): Buffer {
  const sortie = Buffer.from(segment);
  for (const moof of enfants(sortie, 0, sortie.length).filter((b) => b.type === 'moof')) {
    for (const traf of enfants(sortie, moof.debut, moof.fin).filter((b) => b.type === 'traf')) {
      const fils = enfants(sortie, traf.debut, traf.fin);
      const tfhd = fils.find((b) => b.type === 'tfhd');
      const tfdt = fils.find((b) => b.type === 'tfdt');
      if (!tfhd || !tfdt) continue;
      const d = decalages.get(sortie.readUInt32BE(tfhd.debut + 4));
      if (!d || d.decalage === 0) continue;
      if (sortie[tfdt.debut] === 1) sortie.writeBigUInt64BE(sortie.readBigUInt64BE(tfdt.debut + 4) + BigInt(d.decalage), tfdt.debut + 4);
      else sortie.writeUInt32BE(sortie.readUInt32BE(tfdt.debut + 4) + d.decalage, tfdt.debut + 4);
    }
  }
  return sortie;
}
