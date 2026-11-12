import type { ContexteCli } from '../comptes/cli.ts';

/** `canape films importer <dossier> --proprietaire <identifiant>` : rend le nombre de films importés. À implémenter (mediatheque). */
export async function importerFilmsCli(
  _ctx: ContexteCli,
  _options: { dossier: string; proprietaire: string },
): Promise<number> {
  throw new Error('canape films importer : pas encore implémenté (module médiathèque).');
}
