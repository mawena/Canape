// Web Push sans dépendance : chiffrement (vecteur de la RFC 8291) et VAPID (RFC 8292).
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { test, describe } from 'node:test';
import { chiffrerAes128gcm, enteteVapid, envoyerNotification, genererClesVapid, jetonVapid } from '../../src/modules/notifications/webpush.ts';
import { creerAbonneTest, creerFauxService, verifierJwt } from './aides-notifications.ts';

const b = (s: string) => Buffer.from(s, 'base64url');

describe('chiffrement aes128gcm (RFC 8291)', () => {
  test('annexe A : résultat identique octet pour octet', () => {
    const resultat = chiffrerAes128gcm({
      charge: b('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
      clePubliqueAbonne: b('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
      auth: b('BTBZMqHH6r4Tts7J_aSIgg'),
      fixe: {
        clePrivee: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        clePublique: b('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
        sel: b('DGv6ra1nlYgDCS1FRnbzlw'),
      },
    });
    assert.equal(
      resultat.toString('base64url'),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  test('aller-retour avec des clés tirées au hasard (déchiffrement par l\'abonné)', () => {
    const abonne = creerAbonneTest();
    const charge = Buffer.from('Camille est dans la salle — é à ü', 'utf8');
    const corps = chiffrerAes128gcm({ charge, clePubliqueAbonne: b(abonne.p256dh), auth: b(abonne.auth) });
    assert.equal(corps.readUInt32BE(16), 4096);
    assert.equal(corps.readUInt8(20), 65);
    assert.deepEqual(abonne.dechiffrer(corps), charge);
    // Deux envois du même message ne se ressemblent pas (sel et clé éphémères neufs).
    assert.notDeepEqual(chiffrerAes128gcm({ charge, clePubliqueAbonne: b(abonne.p256dh), auth: b(abonne.auth) }), corps);
  });

  test('une charge trop grande pour un enregistrement est refusée', () => {
    const abonne = creerAbonneTest();
    assert.throws(() => chiffrerAes128gcm({ charge: Buffer.alloc(4100), clePubliqueAbonne: b(abonne.p256dh), auth: b(abonne.auth) }));
  });
});

describe('VAPID (RFC 8292)', () => {
  test('clés : point non compressé de 65 octets et clé privée de 32', () => {
    const k = genererClesVapid();
    assert.equal(b(k.publique).length, 65);
    assert.equal(b(k.publique)[0], 4);
    assert.equal(b(k.privee).length, 32);
    // La clé privée correspond bien à la clé publique.
    const e = createECDH('prime256v1');
    e.setPrivateKey(b(k.privee));
    assert.deepEqual(e.getPublicKey(), b(k.publique));
  });

  test('JWT ES256 vérifiable avec la clé publique, signature brute de 64 octets', () => {
    const k = genererClesVapid();
    const jwt = jetonVapid(k, 'https://push.exemple', 'https://canape.exemple', 1_900_000_000);
    const { entete, charge, valide } = verifierJwt(jwt, k.publique);
    assert.equal(valide, true);
    assert.deepEqual(entete, { typ: 'JWT', alg: 'ES256' });
    assert.deepEqual(charge, { aud: 'https://push.exemple', exp: 1_900_000_000, sub: 'https://canape.exemple' });
    assert.equal(b(jwt.split('.')[2]!).length, 64);
    // Une autre clé ne valide pas la signature.
    assert.equal(verifierJwt(jwt, genererClesVapid().publique).valide, false);
  });

  test('en-tête Authorization : audience = origine de l\'endpoint, expiration dans moins de 24 h, pas d\'adresse e-mail', () => {
    const k = genererClesVapid();
    const maintenant = Date.UTC(2026, 10, 13, 12, 0, 0);
    const h = enteteVapid(k, 'https://push.exemple/abc/def?x=1', 'https://canape.exemple', maintenant);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h);
    assert.ok(m, h);
    assert.equal(m[2], k.publique);
    const { charge, valide } = verifierJwt(m[1]!, k.publique);
    assert.equal(valide, true);
    assert.equal(charge['aud'], 'https://push.exemple');
    assert.ok((charge['exp'] as number) - maintenant / 1000 <= 24 * 3600);
    assert.doesNotMatch(h, /mailto|@/);
  });
});

describe('envoi vers un faux service', () => {
  test('en-têtes attendus, corps déchiffrable ; 410 = abonnement expiré ; service muet = délai dépassé', async () => {
    const faux = await creerFauxService();
    try {
      const abonne = creerAbonneTest();
      const cles = genererClesVapid();
      const a = { endpoint: faux.url(), p256dh: abonne.p256dh, auth: abonne.auth };
      const options = { cles, sujet: 'https://canape.exemple', delaiMs: 300 };
      assert.deepEqual(await envoyerNotification(a, Buffer.from('bonjour'), options), { ok: true });
      const r = faux.recus[0]!;
      assert.equal(r.entetes['content-encoding'], 'aes128gcm');
      assert.equal(r.entetes['ttl'], '3600');
      assert.match(String(r.entetes['authorization']), /^vapid t=.+, k=.+$/);
      assert.equal(abonne.dechiffrer(r.corps).toString(), 'bonjour');

      faux.statut = 410;
      assert.deepEqual(await envoyerNotification(a, Buffer.from('x'), options), { ok: false, statut: 410, expire: true, raison: 'HTTP 410' });
      faux.statut = 500;
      const r500 = await envoyerNotification(a, Buffer.from('x'), options);
      assert.equal(r500.ok, false);
      assert.equal(r500.ok === false && r500.expire, false);

      faux.statut = 201;
      faux.retardMs = 1500;
      const t0 = Date.now();
      const lent = await envoyerNotification(a, Buffer.from('x'), options);
      assert.equal(lent.ok, false);
      assert.ok(Date.now() - t0 < 1200, 'le délai court coupe l\'attente');
    } finally {
      await faux.fermer();
    }
  });
});
