import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racineDepot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(racineDepot, 'bin/canape');

export interface ServeurCanape {
  url: string;
  port: number;
  dossier: string;
  /** Journal du serveur (sortie standard et d'erreur). */
  journal: () => string;
  /** Lien d'invitation (`canape admin inviter`) : adresse complète. */
  inviter: (role: 'admin' | 'viewer') => string;
  arreter: () => Promise<void>;
}

function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

/** Démarre `bin/canape serve` sur un port libre, avec des dossiers temporaires neufs. */
export async function demarrerServeur(envSupplementaire: Record<string, string> = {}): Promise<ServeurCanape> {
  const port = await portLibre();
  const url = `http://127.0.0.1:${port}`;
  const dossier = mkdtempSync(path.join(process.env['CANAPE_E2E_RACINE'] ?? os.tmpdir(), 'srv-'));
  const dirs = ['donnees', 'films', 'cache', 'televersements', 'telechargements'];
  for (const d of dirs) mkdirSync(path.join(dossier, d));
  const env = {
    ...process.env,
    CANAPE_HOTE: '127.0.0.1',
    CANAPE_PORT: String(port),
    CANAPE_URL_PUBLIQUE: url,
    CANAPE_DONNEES: path.join(dossier, 'donnees'),
    CANAPE_FILMS: path.join(dossier, 'films'),
    CANAPE_CACHE: path.join(dossier, 'cache'),
    CANAPE_TELEVERSEMENTS: path.join(dossier, 'televersements'),
    CANAPE_TELECHARGEMENTS: path.join(dossier, 'telechargements'),
    CANAPE_TRANSCODAGE_FILS: '1',
    CANAPE_TMDB_CLE: '',
    // Pas de STUN public : les deux pages sont sur la même machine.
    CANAPE_ICE: '[]',
    ...envSupplementaire,
  };
  delete env['CANAPE_CONFIG'];

  let sortie = '';
  const proc: ChildProcess = spawn(BIN, ['serve'], { env, cwd: racineDepot, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout?.on('data', (b: Buffer) => { sortie += b.toString(); });
  proc.stderr?.on('data', (b: Buffer) => { sortie += b.toString(); });
  let fini = false;
  proc.once('exit', () => { fini = true; });

  const debut = Date.now();
  for (;;) {
    if (fini) throw new Error(`Le serveur Canapé s'est arrêté au démarrage :\n${sortie}`);
    try {
      const r = await fetch(`${url}/api/etat`);
      if (r.ok) break;
    } catch { /* pas encore prêt */ }
    if (Date.now() - debut > 30_000) { proc.kill('SIGKILL'); throw new Error(`Le serveur Canapé ne répond pas :\n${sortie}`); }
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    url, port, dossier,
    journal: () => sortie,
    inviter(role) {
      const r = spawnSync(BIN, ['admin', 'inviter', '--role', role], { env, cwd: racineDepot, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`canape admin inviter a échoué : ${r.stderr}`);
      return r.stdout.trim();
    },
    async arreter() {
      if (!fini) {
        proc.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 5000);
          proc.once('exit', () => { clearTimeout(t); resolve(); });
        });
      }
      rmSync(dossier, { recursive: true, force: true });
    },
  };
}
