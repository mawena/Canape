// Sous-titres choisis par chacun (depuis 1.12.0) : rien n'est partagé avec la salle, l'appareil retient le choix.
import type { PlanDeLecture, SousTitresPlan } from '@canape/partage';

/**
 * Choix retenu par l'appareil, valable d'un film à l'autre :
 * - `auto` : jamais choisi → les sous-titres « forcés » de la langue du film s'il y en a, sinon rien ;
 * - `aucun` : pas de sous-titres ;
 * - une langue et sa variante, retrouvées dans chaque film.
 */
export type ChoixSousTitres = 'auto' | 'aucun' | { langue: string | null; force: boolean; sdh: boolean };

export type TailleSousTitres = 'petite' | 'normale' | 'grande';
export const TAILLES_SOUS_TITRES: Array<{ taille: TailleSousTitres; libelle: string }> = [
  { taille: 'petite', libelle: 'Petits' },
  { taille: 'normale', libelle: 'Normaux' },
  { taille: 'grande', libelle: 'Grands' },
];

type Plan = Pick<PlanDeLecture, 'sousTitres' | 'pistesAudio'>;

/** « fre », « fra », « FR » → « fr » ; `null` si la langue est inconnue. */
export function langueCommune(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toLowerCase();
  if (!c || c === 'und') return null;
  try {
    return Intl.getCanonicalLocales(c)[0]?.toLowerCase() ?? c;
  } catch {
    return c;
  }
}

/** Langue de la piste audio en cours (choisie, sinon celle par défaut, sinon la première). */
export function langueAudio(plan: Pick<PlanDeLecture, 'pistesAudio'> | null, pisteAudio: number | null): string | null {
  if (!plan) return null;
  const p = plan.pistesAudio.find((a) => a.index === pisteAudio) ?? plan.pistesAudio.find((a) => a.parDefaut) ?? plan.pistesAudio[0];
  return langueCommune(p?.langue);
}

/** Clé des sous-titres à afficher pour ce film d'après le choix de l'appareil, ou `null`. */
export function choisirSousTitres(plan: Plan | null, choix: ChoixSousTitres, pisteAudio: number | null): string | null {
  if (!plan || choix === 'aucun') return null;
  if (choix !== 'auto') {
    const langue = langueCommune(choix.langue);
    let meilleure: SousTitresPlan | null = null;
    let score = -1;
    for (const s of plan.sousTitres) {
      if (langueCommune(s.langue) !== langue) continue;
      const n = (s.force === choix.force ? 2 : 0) + (s.sdh === choix.sdh ? 1 : 0);
      if (n > score) { meilleure = s; score = n; }
    }
    if (meilleure) return meilleure.cle;
  }
  const langue = langueAudio(plan, pisteAudio);
  if (!langue) return null;
  return plan.sousTitres.find((s) => s.force && langueCommune(s.langue) === langue)?.cle ?? null;
}

/** Ce que l'appareil retient quand on choisit `cle` (ou « Aucun » avec `null`). */
export function decrireChoix(plan: Pick<PlanDeLecture, 'sousTitres'> | null, cle: string | null): ChoixSousTitres {
  if (cle === null) return 'aucun';
  const s = plan?.sousTitres.find((x) => x.cle === cle);
  return s ? { langue: langueCommune(s.langue), force: s.force, sdh: s.sdh } : 'auto';
}

/** Préférence lue dans le stockage : tout ce qui n'a pas la bonne forme redevient `auto`. */
export function choixValide(v: unknown): ChoixSousTitres {
  if (v === 'auto' || v === 'aucun') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ((o['langue'] === null || typeof o['langue'] === 'string') && typeof o['force'] === 'boolean' && typeof o['sdh'] === 'boolean') {
      return { langue: o['langue'] as string | null, force: o['force'], sdh: o['sdh'] };
    }
  }
  return 'auto';
}

export function tailleValide(v: unknown): TailleSousTitres {
  return v === 'petite' || v === 'grande' ? v : 'normale';
}
