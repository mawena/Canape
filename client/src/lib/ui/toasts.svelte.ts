// Petit magasin de notifications (Svelte 5 runes) : `toast.ok('Enregistré')`, affichées par <Toasts />.
export type TypeToast = 'info' | 'ok' | 'erreur';
export interface MessageToast {
  id: number;
  type: TypeToast;
  texte: string;
}

let suivant = 1;
export const toasts: { liste: MessageToast[] } = $state({ liste: [] });

export function retirerToast(id: number): void {
  toasts.liste = toasts.liste.filter((t) => t.id !== id);
}

function afficher(type: TypeToast, texte: string, dureeMs = 5000): number {
  const id = suivant++;
  toasts.liste = [...toasts.liste, { id, type, texte }];
  if (dureeMs > 0) setTimeout(() => retirerToast(id), dureeMs);
  return id;
}

export const toast = {
  info: (texte: string, dureeMs?: number) => afficher('info', texte, dureeMs),
  ok: (texte: string, dureeMs?: number) => afficher('ok', texte, dureeMs),
  erreur: (texte: string, dureeMs?: number) => afficher('erreur', texte, dureeMs ?? 8000),
};
