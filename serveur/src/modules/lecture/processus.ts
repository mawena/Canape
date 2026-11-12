// Processus ffmpeg : lancement sous `nice`, progression, suspension, arrêt propre, registre pour l'arrêt du serveur.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface Progression {
  /** Position atteinte dans la sortie (secondes). */
  seconde: number;
  /** Vitesse par rapport au temps réel (1 = temps réel), `null` si inconnue. */
  vitesse: number | null;
  fps: number | null;
}

export interface FinProcessus {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Dernières lignes d'erreur de ffmpeg. */
  erreur: string;
  /** Arrêté volontairement par nous. */
  arretVoulu: boolean;
}

export class Processus {
  static readonly tous = new Set<Processus>();

  readonly enfant: ChildProcess;
  readonly fini: Promise<FinProcessus>;
  suspendu = false;
  arretVoulu = false;
  termine = false;
  derniere: Progression = { seconde: 0, vitesse: null, fps: null };

  constructor(commande: string, args: string[], options: { nice?: number; surProgression?: (p: Progression) => void } = {}) {
    const [prog, argv] = options.nice !== undefined
      ? ['nice', ['-n', String(options.nice), commande, ...args]]
      : [commande, args];
    this.enfant = spawn(prog as string, argv as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
    Processus.tous.add(this);
    let erreur = '';
    this.enfant.stderr?.setEncoding('utf8').on('data', (d: string) => {
      erreur = (erreur + d).slice(-1500);
    });
    if (this.enfant.stdout) {
      createInterface({ input: this.enfant.stdout }).on('line', (ligne) => {
        const i = ligne.indexOf('=');
        if (i < 0) return;
        const cle = ligne.slice(0, i);
        const val = ligne.slice(i + 1).trim();
        if (cle === 'out_time_us') this.derniere.seconde = Math.max(0, Number(val) / 1e6) || 0;
        else if (cle === 'speed') this.derniere.vitesse = /^[\d.]+x$/.test(val) ? Number(val.slice(0, -1)) : null;
        else if (cle === 'fps') this.derniere.fps = Number(val) || null;
        else if (cle === 'progress') options.surProgression?.(this.derniere);
      });
    }
    this.fini = new Promise<FinProcessus>((resolve) => {
      this.enfant.on('error', (e) => {
        this.termine = true;
        Processus.tous.delete(this);
        resolve({ code: -1, signal: null, erreur: e.message, arretVoulu: this.arretVoulu });
      });
      this.enfant.on('close', (code, signal) => {
        this.termine = true;
        Processus.tous.delete(this);
        resolve({ code, signal, erreur: erreur.trim(), arretVoulu: this.arretVoulu });
      });
    });
  }

  suspendre(): void {
    if (this.termine || this.suspendu) return;
    this.suspendu = true;
    this.enfant.kill('SIGSTOP');
  }

  reprendre(): void {
    if (this.termine || !this.suspendu) return;
    this.suspendu = false;
    this.enfant.kill('SIGCONT');
  }

  /** SIGTERM (après SIGCONT : un processus suspendu ne reçoit pas SIGTERM), puis SIGKILL au bout de 3 s. */
  async arreter(): Promise<void> {
    if (this.termine) return;
    this.arretVoulu = true;
    this.suspendu = false;
    this.enfant.kill('SIGCONT');
    this.enfant.kill('SIGTERM');
    const minuteur = setTimeout(() => this.enfant.kill('SIGKILL'), 3000);
    await this.fini;
    clearTimeout(minuteur);
  }

  static async arreterTous(): Promise<void> {
    await Promise.all([...Processus.tous].map((p) => p.arreter()));
  }
}
