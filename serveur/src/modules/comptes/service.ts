// Logique du module comptes sans HTTP : invitations, réglages, tailles. Partagée par les routes et la ligne de commande.
import type { Role, Reglages, TypeInvitation } from '@canape/partage';
import type { Config } from '../../config.ts';
import { transaction, type Base } from '../../db/index.ts';
import { jetonAleatoire, maintenantIso, sha256Hex } from '../../commun/identifiants.ts';

const MS_JOUR = 86_400_000;
export const DUREE_INVITATION_JOURS = 7;

export const lienInvitation = (config: Config, jeton: string): string => `${config.urlPublique}/invitation/${jeton}`;

export interface OptionsCreationInvitation {
  type: TypeInvitation;
  role?: Role | null;
  utilisateurId?: number | null;
  prenomSuggere?: string | null;
  creePar?: number | null;
  jours?: number;
  /** Retire d'abord les invitations d'administrateur « système » encore valides (premier démarrage, ligne de commande). */
  remplacerSysteme?: boolean;
}

/** Crée une invitation ; rend le jeton en clair (seul son SHA-256 est stocké) et le lien. */
export function creerInvitation(db: Base, config: Config, o: OptionsCreationInvitation): { id: number; jeton: string; lien: string; expireLe: string } {
  const jeton = jetonAleatoire();
  const maintenant = new Date();
  const expireLe = maintenantIso(new Date(maintenant.getTime() + (o.jours ?? DUREE_INVITATION_JOURS) * MS_JOUR));
  const id = transaction(db, () => {
    if (o.remplacerSysteme) {
      db.prepare(
        `DELETE FROM invitations WHERE type = 'compte' AND role = 'admin' AND cree_par IS NULL AND utilisee_le IS NULL`,
      ).run();
    }
    if (o.type === 'reinitialisation' && o.utilisateurId) {
      db.prepare(`DELETE FROM invitations WHERE type = 'reinitialisation' AND utilisateur_id = ? AND utilisee_le IS NULL`).run(o.utilisateurId);
    }
    const r = db.prepare(
      `INSERT INTO invitations (jeton_hash, type, role, utilisateur_id, prenom_suggere, cree_par, cree_le, expire_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sha256Hex(jeton), o.type, o.type === 'compte' ? (o.role ?? 'viewer') : null, o.utilisateurId ?? null,
      o.prenomSuggere ?? null, o.creePar ?? null, maintenantIso(maintenant), expireLe,
    );
    return Number(r.lastInsertRowid);
  });
  return { id, jeton, lien: lienInvitation(config, jeton), expireLe };
}

export interface LigneInvitation {
  id: number;
  type: TypeInvitation;
  role: Role | null;
  utilisateur_id: number | null;
  prenom_suggere: string | null;
  cree_par: number | null;
  cree_le: string;
  expire_le: string;
  utilisee_le: string | null;
}

/** Invitation correspondant au jeton si elle existe (valide ou non). */
export function chercherInvitation(db: Base, jeton: string): LigneInvitation | null {
  return (db.prepare('SELECT * FROM invitations WHERE jeton_hash = ?').get(sha256Hex(jeton)) as LigneInvitation | undefined) ?? null;
}

export function invitationValide(i: LigneInvitation | null): boolean {
  return i !== null && !i.utilisee_le && Date.parse(i.expire_le) > Date.now();
}

export function nombreComptes(db: Base): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM utilisateurs').get() as { n: number }).n;
}

// ---- Réglages -------------------------------------------------------------------------------------------------

type Validateur = (v: unknown) => boolean;
const entierPositif: Validateur = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;

/** Liste blanche des réglages modifiables, avec leur validation. */
export const REGLAGES_VALIDES: Record<keyof Reglages, Validateur> = {
  preparationAuto: (v) => typeof v === 'boolean',
  quotaDefautOctets: entierPositif,
};

export function reglagesParDefaut(config: Config): Reglages {
  return { preparationAuto: config.preparationAuto, quotaDefautOctets: config.quotaDefaut };
}

/** Tous les réglages : valeurs enregistrées, sinon celles de la configuration. */
export function lireReglages(db: Base, config: Config): Reglages {
  const r: Reglages = reglagesParDefaut(config);
  const lignes = db.prepare('SELECT cle, valeur FROM reglages').all() as Array<{ cle: string; valeur: string }>;
  for (const { cle, valeur } of lignes) {
    if (!(cle in REGLAGES_VALIDES)) continue;
    try {
      const v: unknown = JSON.parse(valeur);
      if (REGLAGES_VALIDES[cle as keyof Reglages](v)) (r as unknown as Record<string, unknown>)[cle] = v;
    } catch { /* valeur illisible : on garde le défaut */ }
  }
  return r;
}

export function lireReglage<K extends keyof Reglages>(db: Base, config: Config, cle: K): Reglages[K] {
  return lireReglages(db, config)[cle];
}

export function ecrireReglages(db: Base, valeurs: Partial<Reglages>): void {
  transaction(db, () => {
    for (const [cle, v] of Object.entries(valeurs)) {
      db.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(v));
    }
  });
}

/** Octets occupés par les films de chaque propriétaire. */
export function octetsParProprietaire(db: Base): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of db.prepare('SELECT proprietaire_id AS id, COALESCE(SUM(taille), 0) AS n FROM films GROUP BY proprietaire_id').all() as Array<{ id: number; n: number }>) {
    m.set(l.id, l.n);
  }
  return m;
}
