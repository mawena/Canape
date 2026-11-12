// Logique pure de l'accueil « Ce soir » : séance mise en avant, ouverture de la salle, phrase d'accroche.
import type { ListeSeances, ProgressionFilm, Seance, UtilisateurPublic } from '@canape/partage';
import { formaterHeure, listerNoms, salutation } from '../ui/format.ts';

/** La salle ouvre 15 minutes avant l'heure prévue. */
export const OUVERTURE_AVANT_MS = 15 * 60_000;

export function ouvertureSalle(seance: Seance): Date | null {
  return seance.prevueLe ? new Date(new Date(seance.prevueLe).getTime() - OUVERTURE_AVANT_MS) : null;
}

export function salleOuverte(seance: Seance, maintenant: Date): boolean {
  const o = ouvertureSalle(seance);
  return o === null || maintenant >= o;
}

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Séance « de ce soir » : une séance en cours, sinon la prochaine séance prévue aujourd'hui (ou dans les 12 h). */
export function seanceDeCeSoir(liste: ListeSeances | null, maintenant: Date): Seance | null {
  if (!liste) return null;
  const enCours = liste.enCours.find((s) => s.termineeLe === null);
  if (enCours) return enCours;
  const prochaines = liste.aVenir
    .filter((s) => s.prevueLe !== null && s.termineeLe === null)
    .sort((a, b) => new Date(a.prevueLe!).getTime() - new Date(b.prevueLe!).getTime());
  const prochaine = prochaines[0];
  if (!prochaine) return null;
  const quand = new Date(prochaine.prevueLe!);
  const limite = maintenant.getTime() + 12 * 3_600_000;
  return memeJour(quand, maintenant) || quand.getTime() <= limite ? prochaine : null;
}

/** Les autres personnes de la séance (hôte compris), sans l'utilisateur courant. */
export function autresPersonnes(seance: Seance, moiId: number): UtilisateurPublic[] {
  const hote: UtilisateurPublic = { id: seance.hoteId, prenom: seance.hotePrenom, couleur: null };
  const tous = [hote, ...seance.invites];
  const vus = new Set<number>();
  return tous.filter((p) => p.id !== moiId && !vus.has(p.id) && (vus.add(p.id), true));
}

export interface Accroche {
  /** Première ligne : « Bonsoir Awa, » */
  salut: string;
  /** Seconde ligne : « Léa arrive à 21 h. » */
  suite: string;
}

/** Phrase d'accueil (DESIGN.md §5.2), au tutoiement. */
export function accroche(prenom: string, seance: Seance | null, moiId: number, reprise: boolean, maintenant: Date): Accroche {
  const salut = `${salutation(maintenant)} ${prenom},`;
  if (seance) {
    const autres = autresPersonnes(seance, moiId).map((p) => p.prenom);
    const qui = autres.length ? listerNoms(autres) : null;
    if (seance.presents > 0 && qui) return { salut, suite: `${qui} ${autres.length > 1 ? 'sont' : 'est'} déjà là.` };
    if (seance.prevueLe && qui) {
      const heure = formaterHeure(new Date(seance.prevueLe));
      return { salut, suite: `${qui} ${autres.length > 1 ? 'arrivent' : 'arrive'} à ${heure}.` };
    }
    return { salut, suite: 'la salle est prête.' };
  }
  if (reprise) return { salut, suite: 'reprends où tu t’étais arrêté.' };
  return { salut, suite: 'qu’est-ce qu’on regarde\u00a0?' };
}

/** Films commencés et pas terminés, les plus récents d'abord. */
export function filmsARreprendre(liste: ProgressionFilm[]): ProgressionFilm[] {
  return liste
    .filter((p) => !p.termine && p.position > 30)
    .sort((a, b) => new Date(b.vuLe).getTime() - new Date(a.vuLe).getTime());
}
