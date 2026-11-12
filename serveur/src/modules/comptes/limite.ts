// Limite d'essais de connexion : fenêtre glissante, par clé (adresse IP, identifiant). En mémoire.

export class LimiteEssais {
  readonly max: number;
  readonly fenetreMs: number;
  private readonly echecs = new Map<string, number[]>();
  private readonly maintenant: () => number;

  constructor(max = 5, fenetreMs = 60_000, maintenant: () => number = Date.now) {
    this.max = max;
    this.fenetreMs = fenetreMs;
    this.maintenant = maintenant;
  }

  private recents(cle: string): number[] {
    const limite = this.maintenant() - this.fenetreMs;
    const l = (this.echecs.get(cle) ?? []).filter((t) => t > limite);
    if (l.length) this.echecs.set(cle, l);
    else this.echecs.delete(cle);
    return l;
  }

  /** Secondes à attendre avant de pouvoir réessayer (0 si aucune des clés n'a atteint la limite). */
  attente(cles: string[]): number {
    let attente = 0;
    for (const c of cles) {
      const l = this.recents(c);
      if (l.length >= this.max) {
        const debloque = (l[l.length - this.max] ?? 0) + this.fenetreMs;
        attente = Math.max(attente, Math.ceil((debloque - this.maintenant()) / 1000));
      }
    }
    return attente;
  }

  /** Essais restants avant blocage (le plus bas parmi les clés). */
  restants(cles: string[]): number {
    return Math.max(0, Math.min(...cles.map((c) => this.max - this.recents(c).length)));
  }

  echec(cles: string[]): void {
    const t = this.maintenant();
    for (const c of cles) this.echecs.set(c, [...this.recents(c), t]);
    if (this.echecs.size > 5000) for (const c of [...this.echecs.keys()]) this.recents(c);
  }

  reussite(cle: string): void {
    this.echecs.delete(cle);
  }
}
