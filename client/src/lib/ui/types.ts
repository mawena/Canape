// Types partagés du kit d'interface.
import type { NomIcone } from './Icone.svelte';

/** Ligne d'un `<Menu>`. */
export interface ElementMenu {
  libelle: string;
  icone?: NomIcone;
  href?: string;
  surClic?: () => void;
  danger?: boolean;
  separateurAvant?: boolean;
  desactive?: boolean;
}
