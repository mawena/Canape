import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { api, ErreurApi, surNonConnecte } from './client.ts';

const fetchOrigine = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOrigine;
  surNonConnecte(null);
});

function simuler(statut: number, corps?: unknown, type = 'application/json'): { appels: Array<{ url: string; init: RequestInit }> } {
  const appels: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    return new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut, headers: { 'content-type': type } });
  }) as typeof fetch;
  return { appels };
}

test('GET rend le JSON typé', async () => {
  const { appels } = simuler(200, { version: '1.0.0' });
  const r = await api.get<{ version: string }>('/api/etat');
  assert.equal(r.version, '1.0.0');
  assert.equal(appels[0]?.init.method, 'GET');
});

test('POST envoie du JSON ; 204 rend undefined', async () => {
  const { appels } = simuler(204);
  const r = await api.post('/api/deconnexion', { a: 1 });
  assert.equal(r, undefined);
  assert.equal(appels[0]?.init.body, '{"a":1}');
  assert.equal((appels[0]?.init.headers as Record<string, string>)['Content-Type'], 'application/json');
});

test('les erreurs { erreur, message } deviennent des ErreurApi', async () => {
  simuler(401, { erreur: 'non_connecte', message: 'Connexion requise.' });
  let vue: ErreurApi | null = null;
  surNonConnecte((e) => { vue = e; });
  await assert.rejects(api.get('/api/compte'), (e: unknown) => {
    assert.ok(e instanceof ErreurApi);
    assert.equal(e.statut, 401);
    assert.equal(e.code, 'non_connecte');
    assert.equal(e.message, 'Connexion requise.');
    return true;
  });
  assert.equal((vue as ErreurApi | null)?.statut, 401);
});

test('corps d\'erreur absent : message par défaut ; réseau coupé : statut 0', async () => {
  globalThis.fetch = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
  await assert.rejects(api.get('/x'), (e: unknown) => e instanceof ErreurApi && e.statut === 502 && e.code === 'erreur_http');
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  await assert.rejects(api.get('/x'), (e: unknown) => e instanceof ErreurApi && e.statut === 0 && e.code === 'reseau');
});
