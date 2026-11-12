import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estRouteLibre, estSalle, sectionActive } from './routes.ts';

describe('routes', () => {
  it('reconnaît les routes libres', () => {
    assert.ok(estRouteLibre('/connexion'));
    assert.ok(estRouteLibre('/invitation/abc'));
    assert.ok(estRouteLibre('/rejoindre/xyz'));
    assert.ok(estRouteLibre('/inscription'));
    assert.ok(estRouteLibre('/regles'));
    assert.ok(!estRouteLibre('/galerie'));
    assert.ok(!estRouteLibre('/connexions-bidon'));
  });
  it('reconnaît la salle', () => {
    assert.ok(estSalle('/seances/abc123'));
    assert.ok(!estSalle('/seances'));
    assert.ok(!estSalle('/seances/nouvelle'));
    assert.ok(!estSalle('/seances/abc/autre'));
  });
  it('trouve la section active', () => {
    assert.equal(sectionActive('/'), 'accueil');
    assert.equal(sectionActive('/galerie'), 'films');
    assert.equal(sectionActive('/seances/nouvelle'), 'seances');
    assert.equal(sectionActive('/historique'), 'historique');
    assert.equal(sectionActive('/compte'), null);
  });
});
