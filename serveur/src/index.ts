import { parseArgs } from 'node:util';
import { creerApp } from './app.ts';
import { version } from './commun/version.ts';
import { chargerConfig } from './config.ts';
import { migrer, ouvrirBase } from './db/index.ts';
import { inviterCli, reinitialiserCli, type ContexteCli } from './modules/comptes/cli.ts';
import { importerFilmsCli } from './modules/mediatheque/cli.ts';
import path from 'node:path';

const AIDE = `Canapé ${version} : regarder un film à deux, chacun chez soi.

Utilisation : canape [--config <fichier>] <commande>

Commandes :
  serve                                       démarre le serveur
  admin inviter [--role admin|viewer] [--jours 7]   crée un lien d'invitation
  admin reinitialiser <identifiant>           crée un lien de réinitialisation de mot de passe
  films importer <dossier> --proprietaire <identifiant>   importe des films existants
  --version, --aide

Réglages : variables CANAPE_* ou fichier --config / CANAPE_CONFIG (voir docs/CONCEPTION.md).
`;

function ouvrirContexte(configFichier: string | undefined): ContexteCli {
  const config = chargerConfig(process.env, configFichier ?? null);
  const db = ouvrirBase(path.join(config.donnees, 'canape.sqlite'));
  migrer(db);
  return { config, db };
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      config: { type: 'string' },
      version: { type: 'boolean' },
      aide: { type: 'boolean' },
      help: { type: 'boolean' },
      role: { type: 'string' },
      jours: { type: 'string' },
      proprietaire: { type: 'string' },
    },
  });
  const configFichier = typeof values.config === 'string' ? values.config : undefined;
  if (values.version) { console.log(version); return 0; }
  const [commande, sous, ...reste] = positionals;
  if (values.aide || values.help || !commande) { console.log(AIDE); return commande || values.aide || values.help ? 0 : 1; }

  if (commande === 'serve') {
    const config = chargerConfig(process.env, configFichier ?? null);
    const app = await creerApp(config);
    const arreter = (): void => { app.close().finally(() => process.exit(0)); };
    process.once('SIGTERM', arreter);
    process.once('SIGINT', arreter);
    await app.listen({ host: config.hote, port: config.port });
    return -1; // le serveur tourne
  }

  if (commande === 'admin' && sous === 'inviter') {
    const role = typeof values.role === 'string' ? values.role : 'viewer';
    if (role !== 'admin' && role !== 'viewer') throw new Error('--role doit valoir admin ou viewer.');
    const jours = typeof values.jours === 'string' ? Number(values.jours) : 7;
    if (!Number.isFinite(jours) || jours <= 0) throw new Error('--jours doit être un nombre positif.');
    console.log(await inviterCli(ouvrirContexte(configFichier), { role, jours }));
    return 0;
  }
  if (commande === 'admin' && sous === 'reinitialiser') {
    const [identifiant] = reste;
    if (!identifiant) throw new Error('Utilisation : canape admin reinitialiser <identifiant>');
    console.log(await reinitialiserCli(ouvrirContexte(configFichier), identifiant));
    return 0;
  }
  if (commande === 'films' && sous === 'importer') {
    const [dossier] = reste;
    const proprietaire = typeof values.proprietaire === 'string' ? values.proprietaire : '';
    if (!dossier || !proprietaire) throw new Error('Utilisation : canape films importer <dossier> --proprietaire <identifiant>');
    const n = await importerFilmsCli(ouvrirContexte(configFichier), { dossier, proprietaire });
    console.log(`${n} film(s) importé(s).`);
    return 0;
  }
  console.error(`Commande inconnue : ${[commande, sous].filter(Boolean).join(' ')}\n\n${AIDE}`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => { if (code >= 0) process.exit(code); },
  (e: unknown) => { console.error(`Erreur : ${(e as Error).message}`); process.exit(1); },
);
