import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Base = DatabaseSync;

export const DOSSIER_MIGRATIONS = new URL('../../migrations/', import.meta.url).pathname;

/** Ouvre (et crée au besoin) la base : WAL, clés étrangères, `busy_timeout`. `':memory:'` accepté. */
export function ouvrirBase(chemin: string): Base {
  if (chemin !== ':memory:') mkdirSync(path.dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  return db;
}

const profondeur = new WeakMap<Base, number>();

/**
 * Exécute `fn` dans une transaction (`BEGIN IMMEDIATE`) : validée si `fn` rend, annulée si elle lève.
 * Imbriquable (points de sauvegarde). `fn` est synchrone, comme `node:sqlite`.
 */
export function transaction<T>(db: Base, fn: () => T): T {
  const n = profondeur.get(db) ?? 0;
  const point = `canape_${n}`;
  db.exec(n === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${point}`);
  profondeur.set(db, n + 1);
  try {
    const r = fn();
    profondeur.set(db, n);
    db.exec(n === 0 ? 'COMMIT' : `RELEASE ${point}`);
    return r;
  } catch (e) {
    profondeur.set(db, n);
    try {
      db.exec(n === 0 ? 'ROLLBACK' : `ROLLBACK TO ${point}; RELEASE ${point}`);
    } catch {
      /* la transaction a déjà été annulée par SQLite */
    }
    throw e;
  }
}

/**
 * Applique `migrations/*.sql` dans l'ordre (numéro puis nom), une transaction chacune ; la table
 * `migrations_appliquees` retient ce qui est fait. Rend les noms appliqués à cet appel.
 */
export function migrer(db: Base, dossier: string = DOSSIER_MIGRATIONS): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS migrations_appliquees (nom TEXT PRIMARY KEY, applique_le TEXT NOT NULL)');
  const faites = new Set(
    (db.prepare('SELECT nom FROM migrations_appliquees').all() as Array<{ nom: string }>).map((l) => l.nom),
  );
  const fichiers = readdirSync(dossier)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const appliquees: string[] = [];
  for (const f of fichiers) {
    if (faites.has(f)) continue;
    const sql = readFileSync(path.join(dossier, f), 'utf8');
    try {
      transaction(db, () => {
        db.exec(sql);
        db.prepare('INSERT INTO migrations_appliquees (nom, applique_le) VALUES (?, ?)').run(f, new Date().toISOString());
      });
    } catch (e) {
      throw new Error(`Migration ${f} en échec : ${(e as Error).message}`, { cause: e });
    }
    appliquees.push(f);
  }
  return appliquees;
}
