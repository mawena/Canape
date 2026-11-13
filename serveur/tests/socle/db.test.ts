import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DOSSIER_MIGRATIONS, migrer, ouvrirBase, transaction } from '../../src/db/index.ts';

const TABLES = [
  'reglages', 'utilisateurs', 'sessions', 'invitations', 'films', 'films_partages', 'sous_titres_externes',
  'televersements', 'seances', 'seances_participants', 'seances_presences', 'seances_notes', 'messages', 'progression', 'preparations',
];

test('les migrations créent toutes les tables du contrat, une seule fois', () => {
  const db = ouvrirBase(':memory:');
  const faites = migrer(db);
  assert.deepEqual(faites, ['001_base.sql', '010_comptes.sql', '011_inscription.sql', '020_films.sql', '021_films_couleur.sql', '030_seances.sql', '031_seances_lien.sql', '040_lecture.sql', '050_torrents.sql', '051_transmission.sql', '060_souvenirs.sql']);
  const noms = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((t) => t.name);
  for (const t of TABLES) assert.ok(noms.includes(t), `table ${t} manquante`);
  assert.deepEqual(migrer(db), [], 'deuxième passage : rien à appliquer');
  assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);
});

test('le migrateur applique dans l\'ordre numérique et annule une migration en échec', () => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'canape-mig-'));
  try {
    writeFileSync(path.join(dossier, '002_b.sql'), 'CREATE TABLE b (id INTEGER);');
    writeFileSync(path.join(dossier, '001_a.sql'), 'CREATE TABLE a (id INTEGER);');
    writeFileSync(path.join(dossier, '003_mauvaise.sql'), 'CREATE TABLE c (id INTEGER); CREATE TABLE a (id INTEGER);');
    const db = ouvrirBase(':memory:');
    assert.throws(() => migrer(db, dossier), /003_mauvaise\.sql/);
    const noms = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((t) => t.name);
    assert.ok(noms.includes('a') && noms.includes('b'));
    assert.ok(!noms.includes('c'), 'la migration en échec est annulée en entier');
    assert.deepEqual(
      (db.prepare('SELECT nom FROM migrations_appliquees ORDER BY nom').all() as Array<{ nom: string }>).map((l) => l.nom),
      ['001_a.sql', '002_b.sql'],
    );
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('transaction : validation, annulation et imbrication', () => {
  const db = ouvrirBase(':memory:');
  migrer(db, DOSSIER_MIGRATIONS);
  const compte = () => (db.prepare('SELECT COUNT(*) AS n FROM reglages').get() as { n: number }).n;
  transaction(db, () => db.prepare("INSERT INTO reglages VALUES ('a','1')").run());
  assert.equal(compte(), 1);
  assert.throws(() => transaction(db, () => {
    db.prepare("INSERT INTO reglages VALUES ('b','1')").run();
    throw new Error('boum');
  }), /boum/);
  assert.equal(compte(), 1);
  transaction(db, () => {
    db.prepare("INSERT INTO reglages VALUES ('c','1')").run();
    assert.throws(() => transaction(db, () => {
      db.prepare("INSERT INTO reglages VALUES ('d','1')").run();
      throw new Error('interne');
    }));
  });
  assert.deepEqual(
    (db.prepare('SELECT cle FROM reglages ORDER BY cle').all() as Array<{ cle: string }>).map((l) => l.cle),
    ['a', 'c'],
  );
});
