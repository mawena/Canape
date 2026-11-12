import type { Config } from '../../config.ts';
import type { Base } from '../../db/index.ts';

export interface ContexteCli {
  config: Config;
  /** Base ouverte et migrée. */
  db: Base;
}

/** `canape admin inviter [--role admin|viewer] [--jours 7]` : rend le lien d'invitation. À implémenter (comptes). */
export async function inviterCli(_ctx: ContexteCli, _options: { role: 'admin' | 'viewer'; jours: number }): Promise<string> {
  throw new Error('canape admin inviter : pas encore implémenté (module comptes).');
}

/** `canape admin reinitialiser <identifiant>` : rend le lien de réinitialisation. À implémenter (comptes). */
export async function reinitialiserCli(_ctx: ContexteCli, _identifiant: string): Promise<string> {
  throw new Error('canape admin reinitialiser : pas encore implémenté (module comptes).');
}
