import { spawn } from 'node:child_process';

export interface OptionsExecuter {
  /** Priorité `nice` (0-19) ; absent = pas de `nice`. */
  nice?: number;
  signal?: AbortSignal;
  /** Appelé à chaque morceau de sortie d'erreur (progression ffmpeg). */
  surStderr?: (morceau: string) => void;
  /** Taille maximale gardée de stdout/stderr (octets, défaut 16 Mo) : le surplus est ignoré. */
  tamponMax?: number;
}

export interface ResultatExecution {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Lance un programme (jamais par un shell) et rend sa sortie ; ne lève pas sur un code non nul. */
export function executer(commande: string, args: string[], options: OptionsExecuter = {}): Promise<ResultatExecution> {
  const { nice, signal, surStderr, tamponMax = 16 * 1024 * 1024 } = options;
  const [prog, argv] = nice !== undefined ? ['nice', ['-n', String(nice), commande, ...args]] : [commande, args];
  return new Promise((resolve, reject) => {
    const enfant = spawn(prog as string, argv as string[], { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    enfant.stdout.setEncoding('utf8').on('data', (d: string) => {
      if (stdout.length < tamponMax) stdout += d;
    });
    enfant.stderr.setEncoding('utf8').on('data', (d: string) => {
      if (stderr.length < tamponMax) stderr += d;
      surStderr?.(d);
    });
    enfant.on('error', reject);
    enfant.on('close', (code, sig) => resolve({ code, signal: sig, stdout, stderr }));
  });
}

export interface SortieFfprobe {
  format?: { format_name?: string; duration?: string; bit_rate?: string; size?: string; tags?: Record<string, string> };
  streams?: Array<Record<string, unknown> & { index: number; codec_type?: string; codec_name?: string }>;
}

/** `ffprobe -show_format -show_streams` en JSON. Lève une erreur si ce n'est pas un média lisible. */
export async function ffprobeJson(fichier: string, options: OptionsExecuter = {}): Promise<SortieFfprobe> {
  const r = await executer(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', fichier],
    options,
  );
  if (r.code !== 0) throw new Error(`ffprobe a échoué (${r.code}) : ${r.stderr.trim().split('\n')[0] ?? ''}`);
  return JSON.parse(r.stdout) as SortieFfprobe;
}
