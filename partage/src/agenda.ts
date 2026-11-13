// Agenda : fabrication d'un fichier .ics (RFC 5545) pour une séance prévue. Fonctions pures, sans dépendance.

export interface EntreeAgenda {
  /** Identifiant de la séance. */
  seanceId: string;
  /** Hôte (nom d'hôte) de l'adresse publique de Canapé : fait la deuxième moitié de l'UID. */
  hoteUid: string;
  /** Titre de la séance, sinon celui du film. */
  titre: string | null;
  filmTitre: string | null;
  /** Date prévue, ISO 8601. */
  prevueLe: string;
  /** Durée du film en secondes, si elle est connue (sinon 2 h). */
  dureeSecondes: number | null;
  /** Adresse de la séance (jamais de jeton d'invitation). */
  url: string;
  /** Instant de fabrication (DTSTAMP). */
  maintenant: Date;
}

/** Durée par défaut d'une séance dont le film n'a pas de durée connue. */
export const DUREE_AGENDA_DEFAUT_SECONDES = 7200;
/** Rappel avant la séance, en minutes. */
export const RAPPEL_AGENDA_MINUTES = 15;

const deux = (n: number): string => String(n).padStart(2, '0');

/** `20261113T203000Z` */
export function dateIcs(d: Date): string {
  return `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}${deux(d.getUTCSeconds())}Z`;
}

/** Valeur TEXT : antislash, point-virgule, virgule et retours à la ligne échappés. */
export function echapperTexteIcs(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** `PT2H`, `PT1H45M`, `PT50M` : durée arrondie à la minute supérieure (au moins une minute). */
export function dureeIcs(secondes: number | null): string {
  const s = secondes !== null && Number.isFinite(secondes) && secondes > 0 ? secondes : DUREE_AGENDA_DEFAUT_SECONDES;
  const minutes = Math.max(1, Math.ceil(s / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ''}${m > 0 || h === 0 ? `${m}M` : ''}`;
}

/** Plie une ligne à 75 octets au plus (UTF-8, sans couper un caractère) ; les suites commencent par une espace. */
export function plierLigneIcs(ligne: string): string[] {
  const encodeur = new TextEncoder();
  const lignes: string[] = [];
  let courante = '';
  let octets = 0;
  let limite = 75;
  for (const c of ligne) {
    const n = encodeur.encode(c).length;
    if (octets + n > limite) {
      lignes.push(courante);
      courante = ' ';
      octets = 1;
      limite = 75;
    }
    courante += c;
    octets += n;
  }
  lignes.push(courante);
  return lignes;
}

/** Texte complet du fichier .ics (lignes séparées par CRLF, terminé par CRLF). */
export function construireIcs(e: EntreeAgenda): string {
  const debut = new Date(e.prevueLe);
  const nom = (e.titre?.trim() || e.filmTitre?.trim() || 'séance');
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Canapé//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.seanceId}@${e.hoteUid}`,
    `DTSTAMP:${dateIcs(e.maintenant)}`,
    `DTSTART:${dateIcs(debut)}`,
    `DURATION:${dureeIcs(e.dureeSecondes)}`,
    `SUMMARY:${echapperTexteIcs(`Canapé : ${nom}`)}`,
    `DESCRIPTION:${echapperTexteIcs(`Séance Canapé : ${nom}.\nRejoins la salle : ${e.url}`)}`,
    `URL:${e.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${echapperTexteIcs(`Canapé : ${nom}`)}`,
    `TRIGGER:-PT${RAPPEL_AGENDA_MINUTES}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lignes.flatMap(plierLigneIcs).join('\r\n') + '\r\n';
}

/** Nom de fichier sûr (ASCII) pour la pièce jointe : `seance-<id>.ics`. */
export function nomFichierAgenda(seanceId: string): string {
  return `seance-${seanceId.replace(/[^a-z0-9]/gi, '')}.ics`;
}
