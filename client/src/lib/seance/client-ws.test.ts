import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { ClientWs, delaiReconnexion, urlWsSeance, type SocketLike } from './client-ws.ts';
import type { EtatLiaison, MessageServeur } from './types.ts';

class FauxSocket implements SocketLike {
  readyState = 0;
  envoyes: string[] = [];
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  send(d: string): void { this.envoyes.push(d); }
  close(): void { this.readyState = 3; this.onclose?.({}); }
  ouvrir(): void { this.readyState = 1; this.onopen?.({}); }
  perdre(): void { this.readyState = 3; this.onclose?.({}); }
}

let sockets: FauxSocket[];
let liaisons: Array<[EtatLiaison, number]>;
let recus: MessageServeur[];
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  sockets = [];
  liaisons = [];
  recus = [];
});
afterEach(() => mock.timers.reset());

function client(extra: Partial<ConstructorParameters<typeof ClientWs>[0]> = {}): ClientWs {
  return new ClientWs({
    url: 'ws://x/ws/seances/1',
    creerSocket: () => { const s = new FauxSocket(); sockets.push(s); return s; },
    surMessage: (m) => recus.push(m),
    surLiaison: (e, t) => liaisons.push([e, t]),
    ...extra,
  });
}

test('délais de reconnexion : 2 s, 4 s, 8 s puis 10 s', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(delaiReconnexion), [2000, 4000, 8000, 10_000, 10_000]);
});

test('ouverture, envoi JSON, messages reçus (les illisibles sont ignorés)', () => {
  const c = client();
  c.connecter();
  assert.equal(c.envoyer({ t: 'ping', c: 1 }), false);
  sockets[0]?.ouvrir();
  assert.equal(c.envoyer({ t: 'ping', c: 1 }), true);
  assert.equal(sockets[0]?.envoyes[0], '{"t":"ping","c":1}');
  sockets[0]?.onmessage?.({ data: 'pas du json' });
  sockets[0]?.onmessage?.({ data: '{"t":"pong","c":1,"s":5}' });
  assert.deepEqual(recus, [{ t: 'pong', c: 1, s: 5 }]);
  assert.deepEqual(liaisons, [['connexion', 0], ['ouvert', 0]]);
});

test('reconnexion automatique après une perte, avec attente croissante', () => {
  const c = client();
  c.connecter();
  sockets[0]?.ouvrir();
  sockets[0]?.perdre();
  assert.equal(sockets.length, 1);
  mock.timers.tick(1999);
  assert.equal(sockets.length, 1);
  mock.timers.tick(1);
  return Promise.resolve().then(() => {
    assert.equal(sockets.length, 2);
    sockets[1]?.perdre(); // échec sans ouverture : tentative 2
    assert.deepEqual(liaisons.at(-1), ['ferme', 2]);
    mock.timers.tick(3999);
    assert.equal(sockets.length, 2);
  });
});

test('avantReconnexion peut arrêter les tentatives', async () => {
  const c = client({ avantReconnexion: async () => false });
  c.connecter();
  sockets[0]?.ouvrir();
  sockets[0]?.perdre();
  mock.timers.tick(2000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sockets.length, 1);
});

test('fermer() ne relance pas', () => {
  const c = client();
  c.connecter();
  sockets[0]?.ouvrir();
  c.fermer();
  mock.timers.tick(20_000);
  assert.equal(sockets.length, 1);
});

test('adresse du WebSocket', () => {
  assert.equal(urlWsSeance('ab c', { protocol: 'https:', host: 'canape.test' }), 'wss://canape.test/ws/seances/ab%20c');
  assert.equal(urlWsSeance('1', { protocol: 'http:', host: 'localhost:5173' }), 'ws://localhost:5173/ws/seances/1');
});
