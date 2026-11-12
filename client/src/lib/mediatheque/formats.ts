// Mise en forme française des tailles, durées, débits et teintes (sans dépendance).

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** 1 288 490 188 → « 1,2 Go ». */
export function formaterTaille(octets: number): string {
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = Math.max(0, octets);
  let i = 0;
  while (v >= 1000 && i < unites.length - 1) { v /= 1000; i++; }
  return `${i === 0 ? Math.round(v) : NOMBRE.format(v)} ${unites[i]}`;
}

/** 6720 → « 1 h 52 » ; 540 → « 9 min ». */
export function formaterDuree(secondes: number | null | undefined): string {
  if (!secondes || secondes <= 0) return '';
  const minutes = Math.round(secondes / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Octets par seconde → « 12 Mo/s ». */
export function formaterDebit(octetsParSeconde: number): string {
  return `${formaterTaille(octetsParSeconde)}/s`;
}

/** Temps restant en secondes → « il reste 2 min ». */
export function formaterReste(secondes: number | null): string {
  if (secondes === null || !Number.isFinite(secondes)) return '';
  if (secondes < 10) return 'presque fini';
  if (secondes < 60) return `il reste ${Math.round(secondes / 10) * 10} s`;
  if (secondes < 3600) return `il reste ${Math.round(secondes / 60)} min`;
  const h = Math.floor(secondes / 3600);
  return `il reste ${h} h ${String(Math.round((secondes % 3600) / 60)).padStart(2, '0')}`;
}

/** Teinte stable (0-359) dérivée d'un titre, pour les cartes sans affiche. */
export function teinteTitre(titre: string): number {
  let h = 0;
  for (let i = 0; i < titre.length; i++) h = (h * 31 + titre.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Nom raccourci au milieu en gardant l'extension. */
export function raccourcirNom(nom: string, max = 48): string {
  if (nom.length <= max) return nom;
  const point = nom.lastIndexOf('.');
  const ext = point > 0 && nom.length - point <= 6 ? nom.slice(point) : '';
  const corps = nom.slice(0, nom.length - ext.length);
  const garde = max - ext.length - 1;
  const debut = Math.ceil(garde * 0.65);
  return `${corps.slice(0, debut)}…${corps.slice(corps.length - (garde - debut))}${ext}`;
}

const LANGUES: Record<string, string> = {
  fre: 'Français', fra: 'Français', fr: 'Français', eng: 'Anglais', en: 'Anglais', spa: 'Espagnol', es: 'Espagnol',
  ger: 'Allemand', deu: 'Allemand', de: 'Allemand', ita: 'Italien', it: 'Italien', por: 'Portugais', pt: 'Portugais',
  jpn: 'Japonais', ja: 'Japonais', kor: 'Coréen', ko: 'Coréen', rus: 'Russe', ru: 'Russe', chi: 'Chinois', zho: 'Chinois',
  ara: 'Arabe', ar: 'Arabe', nld: 'Néerlandais', dut: 'Néerlandais', pol: 'Polonais', tur: 'Turc',
};

export function nomLangue(code: string | null): string {
  if (!code) return 'Langue inconnue';
  return LANGUES[code.toLowerCase()] ?? code.toUpperCase();
}

export function libelleCanaux(canaux: number): string {
  if (canaux === 1) return 'mono';
  if (canaux === 2) return 'stéréo';
  if (canaux === 6) return '5.1';
  if (canaux === 8) return '7.1';
  return `${canaux} canaux`;
}
