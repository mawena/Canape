// Petit magasin de notifications (Svelte 5 runes) : `toast.ok('Lien copié.')`, affichées par <Toasts />.
// Une action facultative (« Annuler », « Recharger ») prolonge le toast à 6 s : `toast.ok('Film retiré.', 0, { libelle: 'Annuler', surClic })`.
export type TypeToast = 'info' | 'ok' | 'erreur';
export interface ActionToast {
  libelle: string;
  surClic: () => void;
}
export interface MessageToast {
  id: number;
  type: TypeToast;
  texte: string;
  action?: ActionToast;
}

const MAX_VISIBLES = 3;
let suivant = 1;
export const toasts: { liste: MessageToast[] } = $state({ liste: [] });

export function retirerToast(id: number): void {
  toasts.liste = toasts.liste.filter((t) => t.id !== id);
}

/** `dureeMs` : 0 ou absent = durée par défaut (4 s, 6 s avec action, 8 s pour une erreur) ; négatif = reste affiché. */
function afficher(type: TypeToast, texte: string, dureeMs?: number, action?: ActionToast): number {
  const id = suivant++;
  const msg: MessageToast = action ? { id, type, texte, action } : { id, type, texte };
  toasts.liste = [...toasts.liste, msg].slice(-MAX_VISIBLES);
  const duree = dureeMs && dureeMs !== 0 ? dureeMs : type === 'erreur' ? 8000 : action ? 6000 : 4000;
  if (duree > 0) setTimeout(() => retirerToast(id), duree);
  return id;
}

export const toast = {
  info: (texte: string, dureeMs?: number, action?: ActionToast) => afficher('info', texte, dureeMs, action),
  ok: (texte: string, dureeMs?: number, action?: ActionToast) => afficher('ok', texte, dureeMs, action),
  erreur: (texte: string, dureeMs?: number, action?: ActionToast) => afficher('erreur', texte, dureeMs, action),
};
