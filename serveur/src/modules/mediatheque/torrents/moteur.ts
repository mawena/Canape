// Côté serveur du moteur : lance le processus enfant (client WebTorrent), lui parle par messages typés,
// le relance avec un délai croissant s'il meurt, l'arrête proprement à la fermeture.
import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { Config } from '../../../config.ts';
import type { Journal } from '../mediatheque.ts';
import type { DeEnfant, OptionsEnfant, VersEnfant } from './protocole.ts';

const FICHIER_ENFANT = fileURLToPath(new URL('./enfant.ts', import.meta.url));
const DELAI_MIN_MS = 1000;
const DELAI_MAX_MS = 30_000;
/** Un enfant qui a vécu au moins ça repart sans délai accumulé. */
const VIE_STABLE_MS = 60_000;

/** Les options de Node du serveur, sans celles qui ne vont qu'au processus principal. */
function optionsNode(): string[] {
  return process.execArgv.filter((o) => !/^--(test|watch|inspect|experimental-test)/.test(o));
}

export interface EvenementsMoteur {
  message: [DeEnfant];
  /** L'enfant vient de démarrer (ou de redémarrer) : le service lui redonne les téléchargements actifs. */
  demarre: [];
  /** L'enfant est mort sans qu'on l'ait demandé. */
  mort: [string];
}

export class Moteur extends EventEmitter<EvenementsMoteur> {
  private enfant: ChildProcess | null = null;
  private arrete = false;
  private echecs = 0;
  private relance: NodeJS.Timeout | null = null;
  private lance = 0;
  private enAttente = new Map<string, Array<() => void>>();
  /** Le moteur n'est lancé qu'au premier besoin (les serveurs sans torrent n'ont pas d'enfant). */
  private voulu = false;
  private pret = false;

  private readonly config: Config;
  private readonly journal: Journal;

  constructor(config: Config, journal: Journal) {
    super();
    this.config = config;
    this.journal = journal;
  }

  get actif(): boolean { return this.enfant !== null && this.pret; }

  /** Pid de l'enfant (essais). */
  get pid(): number | null { return this.enfant?.pid ?? null; }

  /** Lance l'enfant s'il ne tourne pas. */
  demarrer(): void {
    this.voulu = true;
    if (this.enfant || this.arrete || this.relance) return;
    this.lancer();
  }

  private lancer(): void {
    const c = this.config;
    const options: OptionsEnfant = {
      priorite: c.transcodagePriorite,
      port: c.torrentPort,
      debitMax: c.torrentDebitMax,
      envoiMax: c.torrentEnvoiMax,
      isole: c.torrentIsole,
      intervalleMs: c.torrentIsole ? 200 : 1000,
    };
    const enfant = fork(FICHIER_ENFANT, [JSON.stringify(options)], {
      execPath: process.execPath,
      execArgv: optionsNode(),
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    this.enfant = enfant;
    this.pret = false;
    this.lance = Date.now();
    enfant.on('message', (m: DeEnfant) => {
      if (this.enfant !== enfant) return;
      if (m.t === 'pret') { this.pret = true; this.emit('demarre'); return; }
      if (m.t === 'retire') this.finAttente(m.id);
      this.emit('message', m);
    });
    enfant.on('error', (err) => this.journal.error({ err }, "le moteur des torrents n'a pas pu démarrer"));
    enfant.on('exit', (code, signal) => {
      if (this.enfant !== enfant) return;
      this.enfant = null;
      this.pret = false;
      for (const id of [...this.enAttente.keys()]) this.finAttente(id);
      if (this.arrete) return;
      this.echecs = Date.now() - this.lance >= VIE_STABLE_MS ? 1 : this.echecs + 1;
      const delai = Math.min(DELAI_MAX_MS, DELAI_MIN_MS * 2 ** (this.echecs - 1));
      this.journal.warn({ code, signal, delai }, 'le moteur des torrents s’est arrêté, il est relancé');
      this.emit('mort', `code ${code ?? signal}`);
      this.relance = setTimeout(() => {
        this.relance = null;
        if (!this.arrete && this.voulu) this.lancer();
      }, delai);
    });
  }

  /** Envoie un ordre ; faux si l'enfant n'est pas prêt (le service redonne tout au redémarrage). */
  envoyer(m: VersEnfant): boolean {
    if (!this.enfant || !this.pret) return false;
    try { return this.enfant.send(m); } catch { return false; }
  }

  private finAttente(id: string): void {
    const l = this.enAttente.get(id);
    this.enAttente.delete(id);
    for (const r of l ?? []) r();
  }

  /** Retire un torrent du client (et efface ses données si `effacer`) ; rend la main quand c'est fait. */
  retirer(id: string, effacer: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.envoyer({ t: 'retirer', id, effacer })) return resolve();
      const l = this.enAttente.get(id) ?? [];
      l.push(resolve);
      this.enAttente.set(id, l);
      setTimeout(() => this.finAttente(id), 15_000).unref();
    });
  }

  /** Arrête l'enfant (aucun processus orphelin) et ne le relance plus. */
  async arreter(): Promise<void> {
    this.arrete = true;
    if (this.relance) { clearTimeout(this.relance); this.relance = null; }
    const enfant = this.enfant;
    if (!enfant) return;
    await new Promise<void>((resolve) => {
      const tue = setTimeout(() => { try { enfant.kill('SIGKILL'); } catch { /* déjà parti */ } }, 5000);
      enfant.once('exit', () => { clearTimeout(tue); resolve(); });
      try { enfant.send({ t: 'arreter' } satisfies VersEnfant); } catch { enfant.kill('SIGTERM'); }
    });
  }

  /** Essais : tue l'enfant comme un plantage. */
  tuer(): void { this.enfant?.kill('SIGKILL'); }
}
