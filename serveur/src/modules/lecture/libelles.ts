// Libellés en français des pistes (langue, canaux, « forcés », « sourds et malentendants »).
import type { PisteAudioAnalysee, PisteSousTitresAnalysee } from '@canape/partage';

/** Codes ISO 639-2/B (ou autres) que `Intl` ne connaît pas → code à deux lettres. */
const ALIAS: Record<string, string> = {
  fre: 'fr', ger: 'de', chi: 'zh', dut: 'nl', gre: 'el', ice: 'is', cze: 'cs', slo: 'sk', per: 'fa', rum: 'ro',
  baq: 'eu', wel: 'cy', mac: 'mk', alb: 'sq', arm: 'hy', geo: 'ka', bur: 'my', may: 'ms', fra: 'fr', deu: 'de',
};

let noms: Intl.DisplayNames | null = null;

/** « fra » → « Français ». `null` si la langue est inconnue. */
export function nomLangue(code: string | null): string | null {
  if (!code) return null;
  const c = (ALIAS[code.toLowerCase()] ?? code).toLowerCase();
  try {
    noms ??= new Intl.DisplayNames(['fr'], { type: 'language', fallback: 'none' });
    const n = noms.of(c);
    if (n) return n.charAt(0).toUpperCase() + n.slice(1);
  } catch {
    /* code invalide */
  }
  return c.toUpperCase();
}

export function texteCanaux(n: number): string {
  if (n <= 1) return 'mono';
  if (n === 2) return 'stéréo';
  if (n === 6) return '5.1';
  if (n === 8) return '7.1';
  return `${n} canaux`;
}

export function libelleAudio(p: PisteAudioAnalysee): string {
  const base = `${nomLangue(p.langue) ?? 'Langue inconnue'} · ${texteCanaux(p.canaux)}`;
  const titre = p.titre?.trim();
  if (titre && !base.toLowerCase().includes(titre.toLowerCase()) && titre.length <= 40) return `${base} — ${titre}`;
  return base;
}

export function libelleSousTitres(langue: string | null, force: boolean, sdh: boolean): string {
  let l = nomLangue(langue) ?? 'Langue inconnue';
  if (force) l += ' (forcés)';
  if (sdh) l += ' (sourds et malentendants)';
  return l;
}

/** « Français (SDH) » écrit par une ancienne version ou par la personne qui a déposé le fichier → mots en clair. */
export function sdhEnClair(libelle: string): string {
  return libelle.replace(/\(\s*SDH\s*\)|\bSDH\b/g, '(sourds et malentendants)');
}

/** Libellés identiques (deux pistes « Français ») → « Français 1 », « Français 2 », dans l'ordre. */
export function numeroterDoublons<T extends { libelle: string }>(pistes: T[]): T[] {
  const total = new Map<string, number>();
  for (const p of pistes) total.set(p.libelle, (total.get(p.libelle) ?? 0) + 1);
  const vus = new Map<string, number>();
  return pistes.map((p) => {
    if ((total.get(p.libelle) ?? 0) < 2) return p;
    const n = (vus.get(p.libelle) ?? 0) + 1;
    vus.set(p.libelle, n);
    return { ...p, libelle: `${p.libelle} ${n}` };
  });
}

export function libelleSousTitresPiste(p: PisteSousTitresAnalysee): string {
  return libelleSousTitres(p.langue, p.force, p.sdh);
}
