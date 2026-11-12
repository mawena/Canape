import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyserTaille, chargerConfig, ICE_DEFAUT } from '../../src/config.ts';

test('tailles lisibles', () => {
  assert.equal(analyserTaille('100G'), 100 * 1024 ** 3);
  assert.equal(analyserTaille('512M'), 512 * 1024 ** 2);
  assert.equal(analyserTaille('1.5 Go'), 1.5 * 1024 ** 3);
  assert.equal(analyserTaille('1024'), 1024);
  assert.throws(() => analyserTaille('beaucoup'), /taille invalide/);
});

test('valeurs par défaut du contrat', () => {
  const c = chargerConfig({});
  assert.equal(c.hote, '127.0.0.1');
  assert.equal(c.port, 8080);
  assert.equal(c.urlPublique, 'http://localhost:8080');
  assert.equal(c.https, false);
  assert.equal(c.derriereProxy, false);
  assert.equal(c.donnees, path.resolve('./donnees'));
  assert.equal(c.televersementMax, 100 * 1024 ** 3);
  assert.equal(c.quotaDefaut, 100 * 1024 ** 3);
  assert.equal(c.cacheMax, 20 * 1024 ** 3);
  assert.equal(c.transcodagePriorite, 10);
  assert.equal(c.preparationAuto, true);
  assert.ok(c.transcodageFils >= 1);
  assert.deepEqual(c.ice, ICE_DEFAUT);
  assert.equal(c.tmdbCle, '');
});

test('le fichier de configuration est lu, les variables d\'environnement l\'emportent', () => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'canape-conf-'));
  try {
    const f = path.join(dossier, 'canape.conf');
    writeFileSync(f, '# commentaire\nCANAPE_PORT=9000\nCANAPE_URL_PUBLIQUE="https://canape.exemple.fr/"\nCANAPE_CACHE_MAX=5G\nCANAPE_DERRIERE_PROXY=1\n');
    const c = chargerConfig({ CANAPE_PORT: '9100' }, f);
    assert.equal(c.port, 9100);
    assert.equal(c.urlPublique, 'https://canape.exemple.fr');
    assert.equal(c.origine, 'https://canape.exemple.fr');
    assert.equal(c.https, true);
    assert.equal(c.cacheMax, 5 * 1024 ** 3);
    assert.equal(c.derriereProxy, true);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('valeurs invalides refusées', () => {
  assert.throws(() => chargerConfig({ CANAPE_PORT: 'abc' }), /CANAPE_PORT/);
  assert.throws(() => chargerConfig({ CANAPE_ICE: '{' }), /CANAPE_ICE/);
  assert.throws(() => chargerConfig({ CANAPE_URL_PUBLIQUE: 'pas une url' }), /CANAPE_URL_PUBLIQUE/);
});
