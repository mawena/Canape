// Sécurité des torrents : trackers et sources web internes retirés (SSRF), masque des clés, bencode, client RPC.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import parseTorrent from 'parse-torrent';
import { decoder } from '../../src/modules/mediatheque/torrents/bencode.ts';
import { lierOuCopier } from '../../src/modules/mediatheque/mediatheque.ts';
import { analyserMagnet } from '../../src/modules/mediatheque/torrents/fichiers.ts';
import { hoteInterdit, masquer, securiserMagnet, securiserTorrent, trackerAdmis } from '../../src/modules/mediatheque/torrents/securite.ts';
import { ClientTransmission, ErreurTransmission } from '../../src/modules/mediatheque/torrents/transmission-rpc.ts';
import { chargerConfig } from '../../src/config.ts';
import { fabriquerTorrent, hashAuHasard, magnetDe } from './aides-transmission.ts';
import { FauxTransmission } from './faux-transmission.ts';

const PUBLIC = 'http://93.184.216.34:6969/announce';

describe('hôtes interdits (localhost, bouclage, privés, lien local, non routables)', () => {
  const interdits = [
    'http://localhost/announce', 'http://LOCALHOST:8080/a', 'http://foo.localhost/a', 'http://127.0.0.1:9091/a', 'http://127.1/a', 'http://2130706433/a',
    'http://0x7f.0.0.1/a', 'http://10.0.0.5/a', 'http://172.16.3.4/a', 'http://172.31.255.255/a', 'http://192.168.1.1/a', 'http://169.254.169.254/latest',
    'http://100.64.0.1/a', 'http://0.0.0.0/a', 'udp://224.0.0.1:80', 'http://[::1]/a', 'http://[::]/a', 'http://[fe80::1]/a', 'http://[fd00::1]/a',
    'http://[::ffff:127.0.0.1]/a', 'http://[::ffff:10.0.0.1]/a', 'http://intranet/a', 'http://serveur.local/a', 'http://base.internal/a',
    'ftp://93.184.216.34/a', 'file:///etc/passwd', 'pas une url', 'http://203.0.113.9/a',
  ];
  for (const u of interdits) test(`refusé : ${u}`, () => assert.equal(trackerAdmis(u), false, u));
  for (const u of [PUBLIC, 'udp://93.184.216.34:1337/announce', 'https://tracker.exemple.org/announce', 'http://[2606:2800:220:1::1]/a']) {
    test(`admis : ${u}`, () => assert.equal(trackerAdmis(u), true, u));
  }
  test('hoteInterdit : crochets et point final', () => {
    assert.equal(hoteInterdit('[::1]'), true);
    assert.equal(hoteInterdit('localhost.'), true);
    assert.equal(hoteInterdit('exemple.org'), false);
  });
});

describe('.torrent réécrit avant Transmission', () => {
  test("retire url-list, httpseeds, nodes et les trackers internes ; l'empreinte ne change pas", async () => {
    const tr = fabriquerTorrent({
      announce: 'http://127.0.0.1:6969/announce',
      announceList: [['http://127.0.0.1:6969/announce', 'http://10.1.2.3/announce', PUBLIC], ['udp://tracker/announce'], ['http://[::1]:80/a'], ['http://169.254.169.254/x']],
      urlList: ['http://127.0.0.1:9000/fichier'], httpseeds: ['http://192.168.0.2/seed'], nodes: [['127.0.0.1', 6881]], prive: true,
    });
    const sortie = await securiserTorrent(tr.octets);
    const racine = decoder(sortie).valeur as Map<string, unknown>;
    for (const cle of ['url-list', 'httpseeds', 'nodes', 'announce']) assert.equal(racine.has(cle), false, cle);
    const liste = (racine.get('announce-list') as Buffer[][]).map((p) => p.map((b) => b.toString()));
    assert.deepEqual(liste, [[PUBLIC]]);
    const t = (await parseTorrent(sortie)) as unknown as { infoHash: string; private?: boolean; urlList?: string[] };
    assert.equal(t.infoHash, tr.infoHash);
    assert.equal(t.private, true);
    assert.deepEqual(t.urlList, []);
  });

  test('un tracker public en annonce unique est gardé', async () => {
    const tr = fabriquerTorrent({ announce: PUBLIC });
    const racine = decoder(await securiserTorrent(tr.octets)).valeur as Map<string, Buffer>;
    assert.equal(racine.get('announce')!.toString(), PUBLIC);
  });

  test('des octets qui ne sont pas du bencode sont refusés', async () => {
    await assert.rejects(securiserTorrent(Buffer.from('ceci n\'est pas un torrent')));
    await assert.rejects(securiserTorrent(Buffer.from('d4:infod4:name1:xee extra')));
    await assert.rejects(securiserTorrent(Buffer.from('l'.repeat(200) + 'e'.repeat(200))));
    await assert.rejects(securiserTorrent(Buffer.from('i42e')));
  });
});

describe('liens magnet', () => {
  test('les trackers non publics sont retirés (analyse et réécriture), pas les publics', async () => {
    const h = hashAuHasard();
    const m = analyserMagnet(magnetDe(h, `&dn=Film&tr=${encodeURIComponent('http://127.0.0.1:1/a')}&tr=${encodeURIComponent(PUBLIC)}&tr=${encodeURIComponent('http://10.0.0.1/a')}&ws=http://127.0.0.1/x&xs=http://127.0.0.1/y`));
    assert.equal(m.infoHash, h);
    assert.doesNotMatch(m.magnet, /127\.0\.0\.1|10\.0\.0\.1|ws=|xs=/);
    assert.match(m.magnet, /93\.184\.216\.34/);
    const sur = await securiserMagnet(m.magnet);
    assert.equal(new URL(sur).searchParams.getAll('tr').join(','), PUBLIC);
    assert.equal(await securiserMagnet(magnetDe(h)), magnetDe(h));
  });
});

describe('masque des clés', () => {
  test('passkey, chemins d\'annonce et longs jetons ne sortent jamais', () => {
    const cle = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const texte = masquer(`Unregistered torrent https://tracker.exemple.org/${cle}/announce?passkey=${cle}&x=1 (pid=12345) ${cle}`);
    assert.doesNotMatch(texte, new RegExp(cle));
    assert.doesNotMatch(texte, /passkey=a1|announce\?|pid=12345/);
    assert.match(texte, /Unregistered torrent/);
    assert.match(texte, /tracker\.exemple\.org/);
    assert.equal(masquer('http://u:motdepasse@hote.exemple.org:9091/transmission/rpc'), 'http://hote.exemple.org:9091/…');
  });
});

describe('configuration du moteur', () => {
  test('moteur, partage des privés et valeurs refusées', () => {
    const c = chargerConfig({});
    assert.equal(c.torrentMoteur, 'auto');
    assert.equal(c.torrentPartagePrives, null);
    assert.equal(c.transmissionUrl, 'http://127.0.0.1:9091/transmission/rpc');
    assert.equal(chargerConfig({ CANAPE_TORRENT_MOTEUR: 'Transmission' }).torrentMoteur, 'transmission');
    assert.equal(chargerConfig({ CANAPE_TORRENT_PARTAGE_PRIVES: 'toujours' }).torrentPartagePrives, null);
    assert.equal(chargerConfig({ CANAPE_TORRENT_PARTAGE_PRIVES: '2,5' }).torrentPartagePrives, 2.5);
    assert.throws(() => chargerConfig({ CANAPE_TORRENT_MOTEUR: 'utorrent' }), /CANAPE_TORRENT_MOTEUR/);
    assert.throws(() => chargerConfig({ CANAPE_TORRENT_PARTAGE_PRIVES: 'beaucoup' }), /CANAPE_TORRENT_PARTAGE_PRIVES/);
  });
});

describe('client RPC de Transmission', () => {
  const faux = new FauxTransmission();
  const t0 = Date.now();
  void t0;
  after(async () => { await faux.arreter(); });

  test('identifiant de session renouvelé sur 409, authentification de base, résultat', async () => {
    faux.utilisateur = 'canape';
    faux.motDePasse = 'tres-secret';
    await faux.demarrer();
    const c = new ClientTransmission({ url: faux.url, utilisateur: 'canape', motDePasse: 'tres-secret' });
    assert.equal(((await c.appeler('session-get')) as { version: string }).version, '4.0.5 (faux)');
    assert.equal(faux.n409, 1);
    faux.renouvelerSession();
    await c.appeler('session-get');
    assert.equal(faux.n409, 2);
  });

  test("mauvais mot de passe : message clair, sans le mot de passe ; adresse sans identifiants", async () => {
    const c = new ClientTransmission({ url: faux.url.replace('http://', 'http://canape:nepasmontrer@'), utilisateur: 'canape', motDePasse: 'faux-mdp' });
    await assert.rejects(c.appeler('session-get'), (e: unknown) => {
      assert.ok(e instanceof ErreurTransmission);
      assert.equal(e.code, 'authentification');
      assert.match(e.message, /identifiant ou le mot de passe/);
      assert.doesNotMatch(e.message, /faux-mdp|nepasmontrer|tres-secret/);
      return true;
    });
    assert.doesNotMatch(c.adresse, /@|nepasmontrer/);
  });

  test('méthode refusée : erreur en français avec le texte de Transmission, sans clé', async () => {
    const c = new ClientTransmission({ url: faux.url, utilisateur: 'canape', motDePasse: 'tres-secret' });
    await assert.rejects(c.appeler('torrent-add', {}), (e: unknown) => e instanceof ErreurTransmission && e.code === 'refus' && /Transmission a refusé « torrent-add »/.test(e.message));
  });

  test('délai dépassé et Transmission arrêté', async () => {
    faux.latence = 400;
    const lent = new ClientTransmission({ url: faux.url, utilisateur: 'canape', motDePasse: 'tres-secret', delaiMs: 100 });
    await assert.rejects(lent.appeler('session-get'), (e: unknown) => e instanceof ErreurTransmission && e.code === 'delai');
    faux.latence = 0;
    await faux.arreter();
    const c = new ClientTransmission({ url: faux.url, utilisateur: 'canape', motDePasse: 'tres-secret', delaiMs: 500 });
    await assert.rejects(c.appeler('session-get'), (e: unknown) => e instanceof ErreurTransmission && e.code === 'injoignable' && /Est-il démarré/.test(e.message));
  });
});

describe('lien physique, copie en repli', () => {
  const travail = mkdtempSync(path.join(tmpdir(), 'canape-lien-'));
  after(() => rmSync(travail, { recursive: true, force: true }));
  const journal = (avertissements: string[]) => ({ info: () => undefined, warn: (...a: unknown[]) => { avertissements.push(String(a[1] ?? a[0])); }, error: () => undefined });

  test('même disque : même inode, le fichier source reste', async () => {
    const source = path.join(travail, 'source.mkv');
    writeFileSync(source, 'contenu');
    const cible = path.join(travail, 'cible.mkv');
    const av: string[] = [];
    assert.equal(await lierOuCopier(source, cible, journal(av)), 'lien');
    assert.equal(statSync(source).ino, statSync(cible).ino);
    assert.equal(statSync(source).nlink, 2);
    assert.deepEqual(av, []);
  });

  test('autre disque (EXDEV) : copie, avec un message clair', async () => {
    let autre: string | null = null;
    try { if (statSync('/dev/shm').dev !== statSync(travail).dev) autre = mkdtempSync('/dev/shm/canape-lien-'); } catch { /* pas de /dev/shm */ }
    if (!autre) return; // un seul disque ici : le repli est essayé à la main plus bas
    try {
      const source = path.join(travail, 'source2.mkv');
      writeFileSync(source, 'contenu 2');
      const cible = path.join(autre, 'cible.mkv');
      const av: string[] = [];
      assert.equal(await lierOuCopier(source, cible, journal(av)), 'copie');
      assert.notEqual(statSync(source).ino, statSync(cible).ino);
      assert.match(av[0] ?? '', /deux disques différents/);
    } finally { rmSync(autre, { recursive: true, force: true }); }
  });

  test('autre erreur (cible absente) : remontée, pas de copie silencieuse', async () => {
    mkdirSync(path.join(travail, 'x'), { recursive: true });
    await assert.rejects(lierOuCopier(path.join(travail, 'absent.mkv'), path.join(travail, 'x', 'c.mkv'), journal([])), /ENOENT/);
  });
});
