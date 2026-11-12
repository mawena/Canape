// Dates des séances en français, en toutes lettres.
const jours = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const heures = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit' });

/** « samedi 14 novembre, 21 h » ; chaîne vide si la date est absente ou illisible. */
export function dateEnLettres(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = heures.format(d).replace(':00', '').replace(/\s?h\s?/, ' h ').trim().replace(/ h$/, ' h');
  return `${jours.format(d)}, ${h}`;
}

/** Valeur par défaut d'un `datetime-local` : ce soir à 21 h (demain si c'est déjà passé). */
export function ceSoir21h(maintenant = new Date()): string {
  const d = new Date(maintenant);
  d.setHours(21, 0, 0, 0);
  if (d.getTime() <= maintenant.getTime()) d.setDate(d.getDate() + 1);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** `datetime-local` (heure locale) vers ISO UTC pour l'API. */
export function versIso(local: string): string {
  return new Date(local).toISOString();
}

/** Message à coller dans une conversation. */
export function messageInvitation(titreFilm: string, prevueLe: string | null, lien: string): string {
  const quand = prevueLe ? dateEnLettres(prevueLe) : 'Ce soir';
  return `${quand}, on regarde ${titreFilm}. Voici le lien : ${lien}`;
}
