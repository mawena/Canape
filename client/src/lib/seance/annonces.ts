// Textes des gestes partagés : chaque geste nomme son auteur (« Léa a mis en pause »). TS pur.
import type { PlanDeLecture } from '@canape/partage';
import { dureeCourte } from './programme.ts';
import { formaterDuree } from './synchro.ts';
import type { EtatSeance, RaisonEtat } from './types.ts';

export interface ContexteAnnonce {
  raison: RaisonEtat;
  /** Prénom de l'auteur (`null` : le serveur, ou la personne est inconnue). Pour `depart`, c'est déjà un prénom. */
  nom: string | null;
  etat: EtatSeance;
  /** Position attendue juste avant ce changement (pour « avancé » / « reculé »). */
  avant: number | null;
  plan: Pick<PlanDeLecture, 'pistesAudio' | 'sousTitres'> | null;
  /** Prénoms des personnes retirées de l'attente (`attente-ignoree`). */
  retires?: string[];
  /** `film` : titre du film suivant du programme quand c'est un enchaînement (fin de l'entracte, « Passer au film suivant »). */
  suite?: string;
  /** `entracte` : secondes ajoutées par l'hôte (« +5 min ») ; absent à l'ouverture de l'entracte. */
  ajout?: number;
}

export function libelleLangue(plan: ContexteAnnonce['plan'], piste: number | null): string | null {
  if (piste === null) return null;
  const p = plan?.pistesAudio.find((x) => x.index === piste);
  return p ? p.libelle : null;
}

export function libelleSousTitres(plan: ContexteAnnonce['plan'], cle: string | null): string | null {
  if (cle === null) return null;
  return plan?.sousTitres.find((x) => x.cle === cle)?.libelle ?? null;
}

/** Texte de l'annonce, ou `null` si ce changement ne mérite pas d'annonce. */
export function texteAnnonce(c: ContexteAnnonce): string | null {
  const nom = c.nom ?? 'Quelqu’un';
  switch (c.raison) {
    case 'lecture': return `${nom} a lancé la lecture`;
    case 'pause': return `${nom} a mis en pause`;
    case 'aller': {
      const sens = c.avant !== null && c.etat.position < c.avant ? 'reculé' : 'avancé';
      return `${nom} a ${sens} à ${formaterDuree(c.etat.position)}`;
    }
    case 'film':
      if (c.suite !== undefined) return c.nom ? `${c.nom} a lancé le film suivant : ${c.suite}` : `Fin de l’entracte : place à ${c.suite}`;
      return `${nom} a changé de film. Tout le monde est en pause.`;
    case 'audio': {
      const l = libelleLangue(c.plan, c.etat.pisteAudio);
      return `${nom} a changé la langue${l ? ` : ${l}` : ''}. Tout le monde est en pause.`;
    }
    case 'sous_titres': {
      if (c.etat.sousTitres === null) return `${nom} a retiré les sous-titres`;
      const l = libelleSousTitres(c.plan, c.etat.sousTitres);
      return `${nom} a mis les sous-titres${l ? ` : ${l}` : ''}`;
    }
    case 'compte_a_rebours': return c.nom ? `${nom} a lancé le compte à rebours.` : null;
    case 'reprise': return 'Tout le monde est prêt, on reprend';
    case 'depart': return c.nom ? `${c.nom} a perdu la connexion. Tout le monde est en pause.` : null;
    case 'attente-ignoree': return c.retires?.length ? `On n’attend plus ${c.retires.join(', ')}.` : null;
    // L'ouverture de l'entracte a son propre voile ; « +5 min » est annoncé.
    case 'entracte': return c.ajout ? `${nom} a rallongé l’entracte de ${dureeCourte(c.ajout)}` : null;
    case 'tampon':
    case 'fin':
      return null;
  }
}

/** Phrase de l'attente mutuelle : « Sam charge le film… ». */
export function phraseAttente(noms: string[]): string {
  if (!noms.length) return '';
  if (noms.length === 1) return `On attend ${noms[0]}…`;
  return `On attend ${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}…`;
}

/** Quelles personnes ont été retirées de l'attente entre deux états. */
export function retiresAttente(avant: string[], apres: string[]): string[] {
  return avant.filter((c) => !apres.includes(c));
}

export type NiveauSynchro = 'ok' | 'moyen' | 'mal' | 'neutre';

export interface EtatSynchro {
  niveau: NiveauSynchro;
  texte: string;
}

/**
 * Indicateur de synchro. Le protocole ne donne pas la position des autres : l'écart est celui de cette personne face à
 * la position du groupe (la même pour tous). Rouge : liaison coupée ou écart de plus de 3 s qui ne se résorbe pas.
 */
export function etatSynchro(o: { ouvert: boolean; filmId: string | null; lecture: boolean; attente: boolean; ecart: number; vitesse: number }): EtatSynchro {
  if (!o.ouvert) return { niveau: 'mal', texte: 'Synchro perdue — hors ligne' };
  if (!o.filmId) return { niveau: 'neutre', texte: 'Aucun film' };
  if (o.attente) return { niveau: 'moyen', texte: 'On attend le chargement' };
  if (!o.lecture) return { niveau: 'ok', texte: 'En pause, tout le monde au même point' };
  const a = Math.abs(o.ecart);
  if (a < 0.3) return { niveau: 'ok', texte: 'Tout le monde est au même point' };
  if (a <= 3) {
    const sens = o.ecart > 0 ? 'en retard' : 'en avance';
    const rattrapage = o.vitesse !== 1 ? ` · rattrapage à ${String(o.vitesse).replace('.', ',')}×` : '';
    return { niveau: 'moyen', texte: `Tu es ${a.toFixed(1).replace('.', ',')} s ${sens}${rattrapage}` };
  }
  return { niveau: 'mal', texte: 'Synchro perdue — Resynchroniser' };
}

/** Choisit la piste de texte du lecteur qui correspond à la clé partagée (identifiant, libellé, puis ordre du plan). */
export function indexPisteTexte(
  pistes: Array<{ id: string; label: string }>,
  plan: Pick<PlanDeLecture, 'sousTitres'> | null,
  cle: string | null,
): number {
  if (cle === null || !plan) return -1;
  const st = plan.sousTitres.find((s) => s.cle === cle);
  if (!st) return -1;
  const parId = pistes.findIndex((p) => p.id === cle);
  if (parId >= 0) return parId;
  const parLibelle = pistes.findIndex((p) => p.label === st.libelle);
  if (parLibelle >= 0) return parLibelle;
  const rang = plan.sousTitres.indexOf(st);
  return rang < pistes.length ? rang : -1;
}
