import type { FastifyPluginAsync } from 'fastify';

/**
 * Marque un plugin comme non encapsulé : ses décorateurs (`app.mediatheque`…) et ses hooks restent
 * visibles des modules enregistrés après lui. Utilisé par `app.ts` pour les quatre modules.
 */
export function sansEncapsulation<T extends FastifyPluginAsync>(plugin: T): T {
  (plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
  return plugin;
}
