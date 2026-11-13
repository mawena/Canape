import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cleEnOctets, etatNotifications, nomAppareil, type Environnement } from './appareil.ts';

const ordi: Environnement = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', installee: false,
  serviceWorker: true, pushManager: true, notification: true, permission: 'default', abonne: false,
};

describe('état des notifications', () => {
  test('inactif tant que rien n\'est accordé, actif avec abonnement et permission', () => {
    assert.equal(etatNotifications(ordi), 'inactif');
    assert.equal(etatNotifications({ ...ordi, permission: 'granted', abonne: true }), 'actif');
    assert.equal(etatNotifications({ ...ordi, permission: 'granted', abonne: false }), 'inactif');
  });
  test('refusé dans le navigateur', () => {
    assert.equal(etatNotifications({ ...ordi, permission: 'denied' }), 'refuse');
  });
  test('non pris en charge ; iPhone : seulement une fois ajouté à l\'écran d\'accueil', () => {
    assert.equal(etatNotifications({ ...ordi, pushManager: false }), 'non-pris-en-charge');
    const iphone = { ...ordi, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', pushManager: false, notification: false };
    assert.equal(etatNotifications(iphone), 'iphone-a-installer');
    assert.equal(etatNotifications({ ...iphone, installee: true }), 'non-pris-en-charge');
    assert.equal(etatNotifications({ ...iphone, installee: true, pushManager: true, notification: true }), 'inactif');
  });
});

describe('nom d\'appareil et clé', () => {
  test('noms lisibles', () => {
    assert.equal(nomAppareil(ordi.userAgent), 'Firefox sur Linux');
    assert.equal(nomAppareil('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'), 'Chrome sur Android');
    assert.equal(nomAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari sur iPhone');
    assert.equal(nomAppareil('inconnu'), 'Navigateur');
  });
  test('clé base64url en octets', () => {
    const octets = cleEnOctets('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    assert.equal(octets.length, 65);
    assert.equal(octets[0], 4);
  });
});
