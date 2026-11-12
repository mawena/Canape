// Dossiers de téléchargement ouverts au groupe canape, sans chmod qui pose le bit setgid (refusé en production par
// RestrictSUIDSGID). Voir serveur/src/modules/mediatheque/torrents/dossiers.ts.
import assert from 'node:assert/strict';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { creerDossierGroupe, ouvertAuGroupe, ouvrirAuGroupe } from '../../src/modules/mediatheque/torrents/dossiers.ts';

const mode = (p: string): number => lstatSync(p).mode & 0o7777;
let racine = '';
afterEach(() => { if (racine) rmSync(racine, { recursive: true, force: true }); racine = ''; });

test('creerDossierGroupe : 0770 malgré l\'umask 0027 du service, setgid hérité du parent, umask rendu', () => {
  racine = mkdtempSync(path.join(tmpdir(), 'canape-dossiers-'));
  const parent = path.join(racine, 'telechargements');
  mkdirSync(parent);
  chmodSync(parent, 0o2770); // posé par l'installateur (root) en production
  const avant = process.umask(0o027);
  try {
    creerDossierGroupe(path.join(parent, 'abc', 'Film'));
    assert.equal(process.umask(), 0o027, 'umask du processus rendu');
  } finally {
    process.umask(avant);
  }
  assert.equal(mode(path.join(parent, 'abc')), 0o2770);
  assert.equal(mode(path.join(parent, 'abc', 'Film')), 0o2770);
  // Déjà là : rien ne casse.
  creerDossierGroupe(path.join(parent, 'abc'));
  assert.equal(mode(path.join(parent, 'abc')), 0o2770);
});

test('ouvrirAuGroupe : anciens dossiers (2750) et fichiers (640) ouverts au groupe, liens ignorés', () => {
  racine = mkdtempSync(path.join(tmpdir(), 'canape-dossiers-'));
  const d = path.join(racine, 'abc');
  mkdirSync(path.join(d, 'Film'), { recursive: true });
  writeFileSync(path.join(d, 'Film', 'film.mkv'), 'x');
  writeFileSync(path.join(d, 'deja.srt'), 'x');
  symlinkSync('/etc/hostname', path.join(d, 'lien'));
  chmodSync(d, 0o2750);
  chmodSync(path.join(d, 'Film'), 0o750);
  chmodSync(path.join(d, 'Film', 'film.mkv'), 0o640);
  chmodSync(path.join(d, 'deja.srt'), 0o660);
  const n = ouvrirAuGroupe(d);
  assert.equal(n, 3, 'deux dossiers et un fichier changés ; le fichier déjà ouvert et le lien laissés');
  assert.equal(mode(d), 0o2770);
  assert.equal(mode(path.join(d, 'Film')), 0o2770);
  assert.equal(mode(path.join(d, 'Film', 'film.mkv')), 0o660);
  assert.equal(mode(path.join(d, 'deja.srt')), 0o660);
  assert.ok(lstatSync(path.join(d, 'lien')).isSymbolicLink());
  assert.equal(ouvrirAuGroupe(d), 0, 'une seconde fois : rien à faire');
});

test('ouvertAuGroupe', () => {
  assert.equal(ouvertAuGroupe(0o2770, true), true);
  assert.equal(ouvertAuGroupe(0o2750, true), false);
  assert.equal(ouvertAuGroupe(0o660, false), true);
  assert.equal(ouvertAuGroupe(0o640, false), false);
});
