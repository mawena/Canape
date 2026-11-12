import type { Config } from '../../config.ts';
import type { Base } from '../../db/index.ts';
import { creerInvitation, nombreComptes } from './service.ts';

export interface ContexteCli {
  config: Config;
  /** Base ouverte et migrée. */
  db: Base;
}

/**
 * `canape admin inviter [--role admin|viewer] [--jours 7]` : rend le lien d'invitation.
 * Tant qu'aucun compte n'existe, un nouveau lien administrateur remplace le précédent (un seul valide à la fois).
 */
export async function inviterCli(ctx: ContexteCli, options: { role: 'admin' | 'viewer'; jours: number }): Promise<string> {
  const { lien } = creerInvitation(ctx.db, ctx.config, {
    type: 'compte', role: options.role, jours: options.jours,
    remplacerSysteme: options.role === 'admin' && nombreComptes(ctx.db) === 0,
  });
  return lien;
}

/** `canape admin reinitialiser <identifiant>` : rend le lien de réinitialisation (7 jours, usage unique). */
export async function reinitialiserCli(ctx: ContexteCli, identifiant: string): Promise<string> {
  const u = ctx.db.prepare('SELECT id FROM utilisateurs WHERE identifiant = ?').get(identifiant) as { id: number } | undefined;
  if (!u) throw new Error(`Aucun compte avec l'identifiant « ${identifiant} ».`);
  return creerInvitation(ctx.db, ctx.config, { type: 'reinitialisation', utilisateurId: u.id }).lien;
}
