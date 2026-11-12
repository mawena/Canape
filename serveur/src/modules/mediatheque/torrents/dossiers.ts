// Dossiers de téléchargement ouverts au groupe `canape` : Transmission (membre du groupe) y écrit, Canapé y lit et y
// fait ses liens physiques vers la galerie.
//
// En production, le service tourne avec `UMask=0027` et `RestrictSUIDSGID=true` (deploiement/canape.service). Le
// second refuse (EPERM) tout chmod qui pose le bit setgid : un `chmod 2770` y échoue, et le dossier reste en 2750,
// fermé en écriture à Transmission (« Permission denied »). On ne fait donc pas de chmod : le dossier est créé sous
// un umask 007, le temps d'un appel synchrone. Il naît en 0770, et le bit setgid vient du dossier parent (posé en
// 2770 par l'installateur) : c'est le noyau qui le transmet, systemd ne l'interdit pas. Les fichiers que Transmission
// y écrit appartiennent ainsi au groupe canape.
import { chmodSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Le mode d'un dossier ou d'un fichier laisse-t-il le groupe lire et écrire (et traverser, pour un dossier) ? */
export function ouvertAuGroupe(mode: number, dossier: boolean): boolean {
  const voulu = dossier ? 0o070 : 0o060;
  return (mode & voulu) === voulu;
}

/** Crée `dossier` (et ses parents manquants) en 0770, quel que soit l'umask du processus. */
export function creerDossierGroupe(dossier: string): void {
  // process.umask() change l'umask de tout le processus : l'appel qui suit est synchrone, aucun autre code JavaScript
  // ne passe entre les deux. (Un fichier créé au même instant par un fil de libuv recevrait au pire le droit
  // d'écriture pour le groupe canape, qui ne contient que Canapé et Transmission.)
  const avant = process.umask(0o007);
  try {
    mkdirSync(dossier, { recursive: true, mode: 0o770 });
  } finally {
    process.umask(avant);
  }
}

/**
 * Ouvre au groupe un dossier qui existe déjà et tout son contenu (dossier créé avant la 1.4.1, ou par WebTorrent avant
 * le passage à Transmission) : dossiers en 2770 (0770 si le bit setgid est refusé), fichiers avec lecture et écriture
 * pour le groupe. Les liens symboliques sont ignorés ; ce qui n'appartient pas à Canapé est laissé tel quel.
 * Rend le nombre d'entrées changées.
 */
export function ouvrirAuGroupe(racine: string): number {
  const uid = process.getuid?.();
  let changees = 0;
  const visiter = (p: string): void => {
    const s = lstatSync(p);
    if (s.isSymbolicLink()) return;
    const estDossier = s.isDirectory();
    if (!ouvertAuGroupe(s.mode, estDossier) && (uid === undefined || s.uid === uid)) {
      try {
        if (estDossier) {
          try { chmodSync(p, 0o2770); } catch { chmodSync(p, 0o770); }
        } else {
          chmodSync(p, (s.mode & 0o777) | 0o060);
        }
        changees++;
      } catch {
        // Pas le droit (autre propriétaire) : Transmission dira ce qui bloque.
      }
    }
    if (estDossier) for (const e of readdirSync(p)) visiter(path.join(p, e));
  };
  visiter(racine);
  return changees;
}
