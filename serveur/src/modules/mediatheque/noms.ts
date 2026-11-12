// Titre et année tirés d'un nom de fichier (noms de « release » ou noms écrits à la main).

export interface NomAnalyse {
  titre: string;
  annee: number | null;
}

const ANNEE = /^[([]?((?:19|20)\d{2})[)\]]?$/;
const MOTS_TECHNIQUES = new RegExp(
  '^(?:\\d{3,4}[pi]|[248]k|uhd|blu-?ray|bdrip|brrip|bdremux|remux|webrip|web-?dl|webdl|hdtv|hdrip|dvdrip|dvdscr|' +
    'multi[a-z]*|vff|vfq|vfi|vf2|vof|vostfr|vo|truefrench|subfrench|x26[45]|h\\.?26[45]|hevc|avc|av1|xvid|divx|' +
    'hdr\\d*\\+?|hdr10\\+?|dv|dovi|sdr|10bits?|8bits?|nf|amzn|dsnp|hmax|atvp|proper|repack|imax|' +
    'dts(?:-?hd)?|ddp?\\+?|dd\\+?|ddp\\d*|aac\\d*|ac3|eac3|atmos|truehd|flac|4klight|hdlight|mhd|dual|hybrid)$',
  'i',
);
const EXTENSIONS_VIDEO = /\.(mkv|mp4|m4v|mov|avi|webm|ts|m2ts|mts|wmv|flv|mpe?g|ogv|3gp|divx|vob)$/i;

function estTechnique(jetons: string[], i: number): boolean {
  const j = jetons[i] ?? '';
  if (MOTS_TECHNIQUES.test(j)) return true;
  if (/^web$/i.test(j)) return /^(dl|rip|\d{3,4}p|h\.?26[45]|x26[45])$/i.test(jetons[i + 1] ?? '') || i + 1 >= jetons.length;
  return false;
}

/** « Tell.Me.What.You.Want.2024.MULTi.1080p…mkv » → { titre: « Tell Me What You Want », annee: 2024 }. */
export function analyserNomFichier(nom: string): NomAnalyse {
  let base = nom.replace(/^.*[\\/]/, '').replace(EXTENSIONS_VIDEO, '').trim();
  // Étiquette de groupe en tête : « [Groupe] Titre … ».
  base = base.replace(/^\s*\[[^\]]{1,30}\]\s*(?=\S)/, '');
  if (!/\s/.test(base)) base = base.replace(/\./g, ' ');
  base = base.replace(/_/g, ' ');
  if (!/\s/.test(base.trim())) base = base.replace(/-/g, ' ');
  const jetons = base.split(/\s+/).filter(Boolean);

  const anneeMax = new Date().getFullYear() + 2;
  const valeurAnnee = (j: string): number | null => {
    const m = ANNEE.exec(j);
    const n = m ? Number(m[1]) : NaN;
    return n >= 1888 && n <= anneeMax ? n : null;
  };

  let coupure = jetons.length;
  for (let i = 1; i < jetons.length; i++) {
    if (estTechnique(jetons, i) || /^\[.*\]$/.test(jetons[i] ?? '')) { coupure = i; break; }
  }
  let indexAnnee = -1;
  for (let i = coupure - 1; i >= 1; i--) {
    if (valeurAnnee(jetons[i] ?? '') !== null) { indexAnnee = i; break; }
  }
  if (indexAnnee < 0) {
    for (let i = coupure; i < jetons.length; i++) {
      if (i > 0 && valeurAnnee(jetons[i] ?? '') !== null) { indexAnnee = i; break; }
    }
  }
  const finTitre = indexAnnee >= 0 && indexAnnee < coupure ? indexAnnee : coupure;
  let titre = jetons.slice(0, finTitre).join(' ');
  titre = titre.replace(/[\s\-–:,.([]+$/, '').replace(/^[\s\-–]+/, '').trim();
  if (!titre) titre = jetons.join(' ').trim() || nom;
  return { titre, annee: indexAnnee >= 0 ? valeurAnnee(jetons[indexAnnee] ?? '') : null };
}

export function extensionVideoPlausible(nom: string): boolean {
  return EXTENSIONS_VIDEO.test(nom);
}

/** Extension (avec le point, minuscule) d'un nom de fichier vidéo. */
export function extensionDe(nom: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nom);
  return m ? `.${(m[1] ?? '').toLowerCase()}` : '.bin';
}
