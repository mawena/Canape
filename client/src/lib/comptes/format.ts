// Logique pure du module comptes (testée sans navigateur).

const UNITES = ['o', 'Ko', 'Mo', 'Go', 'To'] as const;

/** 1536 → « 1,5 Ko » (base 1024, virgule française). */
export function formaterOctets(octets: number): string {
  let v = Math.max(0, octets);
  let i = 0;
  while (v >= 1024 && i < UNITES.length - 1) { v /= 1024; i++; }
  const texte = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${texte} ${UNITES[i]}`;
}

const FACTEURS: Record<string, number> = { O: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

/** « 100 Go », « 1,5G », « 512 » (octets) → octets ; `null` si illisible. */
export function analyserTaille(texte: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)\s*$/.exec(texte);
  if (!m) return null;
  const nombre = Number((m[1] as string).replace(',', '.'));
  const lettres = (m[2] as string).toUpperCase().replace(/(IB|B|O)$/, '');
  const facteur = lettres === '' ? 1 : FACTEURS[lettres];
  if (facteur === undefined) return null;
  const octets = Math.round(nombre * facteur);
  return Number.isSafeInteger(octets) ? octets : null;
}

/** Adresse de retour après connexion : uniquement un chemin interne (pas d'adresse externe ni de `//`). */
export function retourSur(retour: string | null | undefined): string {
  if (!retour || !retour.startsWith('/') || retour.startsWith('//') || retour.startsWith('/\\') || /[\r\n]/.test(retour)) return '/';
  if (retour.startsWith('/connexion') || retour.startsWith('/invitation')) return '/';
  return retour;
}

export const MOT_DE_PASSE_MIN = 10;

/** Aide pour le mot de passe : « Encore 4 caractères. » ou `null` quand c'est assez long. */
export function aideMotDePasse(mdp: string): string | null {
  const manque = MOT_DE_PASSE_MIN - [...mdp].length;
  if (manque <= 0) return null;
  return `${MOT_DE_PASSE_MIN} caractères au minimum. Il en manque ${manque}.`;
}

/** Progression de la jauge de longueur, entre 0 et 1 (pleine à 16 caractères). */
export function jaugeMotDePasse(mdp: string): number {
  return Math.min(1, [...mdp].length / 16);
}

/** Date lisible : « 12 nov. 2026 ». */
export function dateCourte(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** « dans 6 jours », « demain », « aujourd'hui », « expiré ». */
export function expireDans(iso: string, maintenant = Date.now()): string {
  const ms = Date.parse(iso) - maintenant;
  if (ms <= 0) return 'expiré';
  const jours = Math.ceil(ms / 86_400_000);
  if (jours <= 1) return "expire aujourd'hui";
  return `expire dans ${jours} jours`;
}

/** Pourcentage d'occupation (0-100) ; 0 si le total est inconnu. */
export function pourcentage(valeur: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((valeur / total) * 100)) : 0;
}
