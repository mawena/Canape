// Mise en forme des textes de la lecture (français, `Intl`).
import type { EtatPreparation } from '@canape/partage';

const pourcent = new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const NBSP = ' ';

export function formatPourcent(valeur: number): string {
  return pourcent.format(Math.min(1, Math.max(0, valeur))).replace(/\s/g, ' ');
}

/** 4 400 000 000 → « 4,1 Go » ; espace fine insécable avant l'unité. */
export function formatOctets(n: number): string {
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < unites.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? String(Math.round(v)) : decimal.format(v)}${NBSP}${unites[i]}`;
}

/** 1,42 → « 1,4× » ; `null` → « — ». */
export function formatVitesse(v: number | null): string {
  return v === null ? '—' : `${decimal.format(v)}${NBSP}×`;
}

export const TEXTE_ETAT: Record<EtatPreparation, string> = {
  attente: "En attente : la préparation démarrera quand le serveur sera calme.",
  encours: 'Préparation en cours',
  prete: 'Prêt : ce film se lance tout de suite.',
  erreur: "La préparation n'a pas abouti.",
};
