// Préférences de la salle, mémorisées par appareil (le stockage peut être indisponible : on ne plante jamais).
export type Coin = 'haut-gauche' | 'haut-droite' | 'bas-gauche' | 'bas-droite';
export const COINS: Array<{ coin: Coin; libelle: string }> = [
  { coin: 'haut-gauche', libelle: 'en haut à gauche' },
  { coin: 'haut-droite', libelle: 'en haut à droite' },
  { coin: 'bas-gauche', libelle: 'en bas à gauche' },
  { coin: 'bas-droite', libelle: 'en bas à droite' },
];

export interface PrefsSalle {
  volFilm: number;
  volVoix: number;
  baisseFilm: boolean;
  casque: boolean;
  conseilCasqueVu: boolean;
  coin: Coin;
  rangee: boolean | null;
  vignettesMasquees: boolean;
  grandes: boolean;
  chatOuvert: boolean;
  micro: string | null;
  camera: string | null;
}

export const PREFS_DEFAUT: PrefsSalle = {
  volFilm: 0.8, volVoix: 1, baisseFilm: true, casque: false, conseilCasqueVu: false, coin: 'haut-droite',
  rangee: null, vignettesMasquees: false, grandes: false, chatOuvert: false, micro: null, camera: null,
};

const CLE = 'canape.salle.prefs';

export function lirePrefs(stock: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): PrefsSalle {
  try {
    const brut = stock?.getItem(CLE);
    if (!brut) return { ...PREFS_DEFAUT };
    return { ...PREFS_DEFAUT, ...(JSON.parse(brut) as Partial<PrefsSalle>) };
  } catch {
    return { ...PREFS_DEFAUT };
  }
}

export function ecrirePrefs(p: PrefsSalle, stock: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  try {
    stock?.setItem(CLE, JSON.stringify(p));
  } catch {
    /* stockage indisponible */
  }
}

/** Coin le plus proche d'un point (pour l'aimantation après un glisser). */
export function coinLePlusProche(x: number, y: number, largeur: number, hauteur: number): Coin {
  const v = y < hauteur / 2 ? 'haut' : 'bas';
  const h = x < largeur / 2 ? 'gauche' : 'droite';
  return `${v}-${h}`;
}

/** Coin opposé en horizontal : le chat se pose du côté opposé aux vignettes. */
export function coteChat(coin: Coin): 'gauche' | 'droite' {
  return coin.endsWith('gauche') ? 'droite' : 'gauche';
}
