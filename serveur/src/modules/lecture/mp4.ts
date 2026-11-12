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
