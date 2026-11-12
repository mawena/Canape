/**
 * Thème de l'interface : « clair » (défaut), « sombre » ou « auto » (celui de l'appareil).
 * Le choix est gardé dans localStorage (`canape.theme`) ; `app.html` pose `data-theme` avant le premier rendu,
 * ce module ne fait que le relire, le changer et suivre l'appareil en mode « auto ».
 */
export type PreferenceTheme = 'clair' | 'sombre' | 'auto';

const CLE = 'canape.theme';
const COULEUR_CLAIR = '#f5f7fb';
const COULEUR_SOMBRE = '#0b1220';

function lire(): PreferenceTheme {
  try {
    const v = localStorage.getItem(CLE);
    if (v === 'sombre' || v === 'auto') return v;
  } catch { /* stockage indisponible */ }
  return 'clair';
}

function appareilSombre(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function appliquer(p: PreferenceTheme): void {
  if (typeof document === 'undefined') return;
  const sombre = p === 'sombre' || (p === 'auto' && appareilSombre());
  const r = document.documentElement;
  r.setAttribute('data-theme', sombre ? 'sombre' : 'clair');
  r.setAttribute('data-preference', p);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sombre ? COULEUR_SOMBRE : COULEUR_CLAIR);
}

let preference = $state<PreferenceTheme>('clair');
let suivi = false;

export const theme = {
  get preference(): PreferenceTheme { return preference; },
  /** À appeler une fois côté navigateur : relit le choix et suit l'appareil en mode « auto ». */
  init(): void {
    preference = lire();
    appliquer(preference);
    if (!suivi && typeof matchMedia === 'function') {
      suivi = true;
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (preference === 'auto') appliquer('auto'); });
    }
  },
  choisir(p: PreferenceTheme): void {
    preference = p;
    try { localStorage.setItem(CLE, p); } catch { /* stockage indisponible */ }
    appliquer(p);
  },
};

export const LIBELLES_THEME: Record<PreferenceTheme, string> = { clair: 'Clair', sombre: 'Sombre', auto: 'Comme mon appareil' };
