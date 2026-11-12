// Formats français de l'interface (DESIGN.md §6) : durées, tailles, dates, teintes. Sans dépendance, testés.

const NBSP = ' ';
const FINE = ' ';

/** `6720` → « 1 h 52 » ; `2520` → « 42 min » ; `null` → chaîne vide. */
export function formaterDuree(secondes: number | null | undefined): string {
  if (secondes === null || secondes === undefined || !Number.isFinite(secondes) || secondes < 0) return '';
  if (secondes < 59.5) return `${Math.max(1, Math.round(secondes))}${NBSP}s`; // extraits, bandes-annonces
  const minutes = Math.round(secondes / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}${NBSP}min`;
  return `${h}${NBSP}h${NBSP}${String(m).padStart(2, '0')}`;
}

/** Chrono des commandes : `4368` → « 1:12:48 », `95` → « 1:35 ». */
export function formaterChrono(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** `4_500_000_000` → « 4,5 Go » (espace fine insécable avant l'unité, unités françaises). */
export function formaterTaille(octets: number): string {
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = Math.max(0, octets);
  let i = 0;
  while (v >= 1000 && i < unites.length - 1) { v /= 1000; i++; }
  const texte = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  return `${texte}${FINE}${unites[i]}`;
}

/** « 21 h » ou « 21 h 05 ». */
export function formaterHeure(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${String(m).padStart(2, '0')}`;
}

const jourLong = new Intl.DateTimeFormat('fr', { weekday: 'long', day: 'numeric', month: 'long' });
const jourCourt = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' });
const moisAnnee = new Intl.DateTimeFormat('fr', { month: 'long', year: 'numeric' });

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** « samedi 14 novembre, 21 h » ; « Ce soir, 21 h » / « Demain, 21 h » selon la date. */
export function formaterDateSeance(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso);
  const demain = new Date(maintenant);
  demain.setDate(maintenant.getDate() + 1);
  const heure = formaterHeure(d);
  if (memeJour(d, maintenant)) return d.getHours() >= 18 ? `Ce soir, ${heure}` : `Aujourd’hui, ${heure}`;
  if (memeJour(d, demain)) return `Demain, ${heure}`;
  return `${jourLong.format(d)}, ${heure}`;
}

/** « Vendredi 13 novembre » (première lettre en capitale). */
export function formaterJourLong(date: Date = new Date()): string {
  const t = jourLong.format(date);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** « 13 nov. » */
export function formaterJourCourt(iso: string): string {
  return jourCourt.format(new Date(iso));
}

/** « novembre 2026 » (clé de regroupement de l'historique). */
export function formaterMois(iso: string): string {
  return moisAnnee.format(new Date(iso));
}

/** « dans 2 h 10 », « dans 12 min », « maintenant », « il y a 3 h ». */
export function formaterDans(iso: string, maintenant: Date = new Date()): string {
  const ecart = Math.round((new Date(iso).getTime() - maintenant.getTime()) / 60000);
  const abs = Math.abs(ecart);
  if (abs < 1) return 'maintenant';
  const texte = abs < 60 ? `${abs}${NBSP}min` : abs < 1440 ? formaterDuree(abs * 60).replace(/ 00$/, '') : `${Math.round(abs / 1440)}${NBSP}j`;
  return ecart > 0 ? `dans ${texte}` : `il y a ${texte}`;
}

/** « Bonsoir » à partir de 18 h et avant 4 h, sinon « Bonjour ». */
export function salutation(date: Date = new Date()): string {
  const h = date.getHours();
  return h >= 18 || h < 4 ? 'Bonsoir' : 'Bonjour';
}

/** Teinte stable (0–359) dérivée d'un titre, pour les affiches sans image. */
export function teinteTitre(titre: string): number {
  let h = 0;
  for (const c of titre) h = (h * 31 + c.codePointAt(0)!) % 3600;
  return h % 360;
}

/** `#rrggbb` valide (la lueur d'un film), sinon `null`. */
export function couleurValide(c: string | null | undefined): string | null {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
}

/** « Awa, Léa et 2 autres ». */
export function listerNoms(noms: string[], max = 3): string {
  if (noms.length === 0) return '';
  if (noms.length === 1) return noms[0]!;
  if (noms.length <= max) return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
  const reste = noms.length - (max - 1);
  return `${noms.slice(0, max - 1).join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`;
}

/** Couleur `#rrggbb` de « lueur » tirée de la teinte du titre (films sans affiche) : hsl(teinte, 55 %, 58 %). */
export function couleurDuTitre(titre: string): string {
  const h = teinteTitre(titre) / 360;
  const s = 0.55;
  const l = 0.58;
  const q = l + s - l * s;
  const p = 2 * l - q;
  const canal = (t0: number): number => {
    const t = (t0 + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return `#${[canal(h + 1 / 3), canal(h), canal(h - 1 / 3)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
