import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racineDepot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ffmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg a échoué (${r.status ?? r.error?.message}) : ffmpeg est-il installé ?`);
}

/** Construit le client s'il manque, fabrique les films d'essai, et expose leur dossier aux workers. */
export default async function globalSetup(): Promise<() => void> {
  if (!existsSync(path.join(racineDepot, 'client/build/index.html'))) {
    console.log('[e2e] client/build absent : npm run build');
    const r = spawnSync('npm', ['run', 'build'], { cwd: racineDepot, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('La construction du client a échoué.');
  }

  const racine = mkdtempSync(path.join(os.tmpdir(), 'canape-e2e-'));
  const medias = path.join(racine, 'medias');
  mkdirSync(medias, { recursive: true });

  // WebM VP9 + Opus, 25 s, 320×180 : lisible par le Chromium et le Firefox de Playwright (pas de H.264 ni d'AAC).
  ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15:duration=25',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=25',
    '-c:v', 'libvpx-vp9', '-b:v', '120k', '-deadline', 'realtime', '-cpu-used', '8', '-g', '30',
    '-c:a', 'libopus', '-b:a', '48k', '-shortest', path.join(medias, 'Mire de test (2026).webm'),
  ]);
  // MKV H.264 + AAC : pour les essais de lecture convertie (après l'arrivée de la lecture universelle).
  ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15:duration=25',
    '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=25',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '30',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', path.join(medias, 'Mire convertie (2026).mkv'),
  ]);

  process.env['CANAPE_E2E_RACINE'] = racine;
  process.env['CANAPE_E2E_MEDIAS'] = medias;
  return () => { rmSync(racine, { recursive: true, force: true }); };
}
