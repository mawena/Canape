// Recaler des sous-titres en avance ou en retard, rien que pour soi (depuis 1.13.0).
// Le décalage est retenu par l'appareil, pour chaque film et chaque piste de sous-titres.
// Positif : les sous-titres arrivent plus tard ; négatif : plus tôt.

export const PAS_DECALAGE = 0.5;
export const LIMITE_DECALAGE = 60;
/** Au-delà, on oublie les films les plus anciens. */
const MAX_RETENUS = 100;
const CLE = 'canape.sous-titres.decalages';

type Stock = Pick<Storage, 'getItem' | 'setItem'> | null;
const stockParDefaut = (): Stock => (typeof localStorage === 'undefined' ? null : localStorage);

/** Arrondi au dixième, borné à ± 60 s ; tout ce qui n'est pas un nombre vaut 0. */
export function bornerDecalage(d: unknown): number {
  if (typeof d !== 'number' || !Number.isFinite(d)) return 0;
  const r = Math.round(Math.max(-LIMITE_DECALAGE, Math.min(LIMITE_DECALAGE, d)) * 10) / 10;
  return r === 0 ? 0 : r;
}

/** 0 → « 0 s », 1.5 → « +1,5 s », -0.5 → « −0,5 s ». */
export function texteDecalage(d: number): string {
  if (d === 0) return '0 s';
  const n = Math.abs(d).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `${d > 0 ? '+' : '−'}${n} s`;
}

function cleDe(filmId: string, piste: string): string {
  return `${filmId}:${piste}`;
}

function lireTout(stock: Stock): Record<string, number> {
  try {
    const brut = stock?.getItem(CLE);
    const o: unknown = brut ? JSON.parse(brut) : null;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function lireDecalage(filmId: string | null | undefined, piste: string | null | undefined, stock: Stock = stockParDefaut()): number {
  if (!filmId || !piste) return 0;
  return bornerDecalage(lireTout(stock)[cleDe(filmId, piste)]);
}

/** Retient le décalage (0 l'oublie) ; le plus récent passe en dernier, les plus anciens sont oubliés. */
export function retenirDecalage(filmId: string, piste: string, d: number, stock: Stock = stockParDefaut()): void {
  const tout = lireTout(stock);
  const cle = cleDe(filmId, piste);
  delete tout[cle];
  const v = bornerDecalage(d);
  if (v !== 0) tout[cle] = v;
  const cles = Object.keys(tout);
  for (const c of cles.slice(0, Math.max(0, cles.length - MAX_RETENUS))) delete tout[c];
  try {
    stock?.setItem(CLE, JSON.stringify(tout));
  } catch {
    /* stockage indisponible */
  }
}

// ---- Application aux pistes du lecteur ---------------------------------------------------------------------

interface Repere { debut: number; fin: number }
type Cue = Pick<TextTrackCue, 'startTime' | 'endTime'>;
/** Ce qu'il faut d'un `<track>` : sa piste (et ses repères) et l'évènement « chargé ». */
export type PisteDecalable = { track: { cues: ArrayLike<Cue> | null }; addEventListener(t: 'load', f: () => void): void };

const origines = new WeakMap<Cue, Repere>();
const decalages = new WeakMap<PisteDecalable, number>();

function appliquer(piste: PisteDecalable): void {
  const d = decalages.get(piste) ?? 0;
  const cues = piste.track.cues;
  if (!cues) return;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    let o = origines.get(c);
    if (!o) {
      o = { debut: c.startTime, fin: c.endTime };
      origines.set(c, o);
    }
    c.startTime = Math.max(0, o.debut + d);
    c.endTime = Math.max(0, o.fin + d);
  }
}

/** Décale les repères de la piste, maintenant et quand elle finit de se charger (les horaires d'origine sont gardés). */
export function decalerPiste(piste: PisteDecalable, d: number): void {
  if (!decalages.has(piste)) piste.addEventListener('load', () => appliquer(piste));
  decalages.set(piste, bornerDecalage(d));
  appliquer(piste);
}
