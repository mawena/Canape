// Le moteur Transmission avec le VRAI journal (celui de Fastify, pino), comme en production : quand Transmission ne
// répond pas, il le journalise sans planter. Les autres essais passent un journal 'silent' (fonctions vides), qui ne
// voit pas une méthode de pino appelée détachée de son objet : c'est ce qui faisait tomber Canapé au démarrage quand
// Transmission n'était pas encore installé.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import Fastify from 'fastify';
import { chargerConfig } from '../../src/config.ts';
import type { Journal } from '../../src/modules/mediatheque/mediatheque.ts';
import { MoteurTransmission } from '../../src/modules/mediatheque/torrents/moteur-transmission.ts';
import { attendre } from './aides-torrents.ts';
import { FauxTransmission } from './faux-transmission.ts';

function journalReel(): { journal: Journal; lignes: Array<{ level: number; msg: string }> } {
  const lignes: Array<{ level: number; msg: string }> = [];
  const flux = new Writable({ write(morceau, _enc, fin) { lignes.push(JSON.parse(String(morceau))); fin(); } });
  const app = Fastify({ logger: { level: 'info', stream: flux } });
  return { journal: app.log as unknown as Journal, lignes };
}

function configVers(url: string, env: Record<string, string> = {}) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'canape-journal-'));
  return chargerConfig({
    CANAPE_DONNEES: path.join(dossier, 'donnees'), CANAPE_FILMS: path.join(dossier, 'films'),
    CANAPE_CACHE: path.join(dossier, 'cache'), CANAPE_TELEVERSEMENTS: path.join(dossier, 'televersements'),
    CANAPE_TELECHARGEMENTS: path.join(dossier, 'telechargements'), CANAPE_URL_PUBLIQUE: 'http://localhost',
    CANAPE_TORRENT_MOTEUR: 'transmission', CANAPE_TORRENT_ISOLE: '1', CANAPE_TRANSMISSION_URL: url, ...env,
  });
}

test('Transmission absent : « Transmission ne répond pas » au niveau info, avec le vrai journal, sans planter', async () => {
  const faux = new FauxTransmission();
  await faux.demarrer();
  const url = faux.url;
  await faux.arreter(); // port fermé : connexion refusée
  const { journal, lignes } = journalReel();
  const moteur = new MoteurTransmission(configVers(url), journal);
  try {
    moteur.demarrer();
    const l = await attendre(() => lignes.find((x) => x.msg === 'Transmission ne répond pas'), 10_000, 50, 'rien journalisé');
    assert.equal(l.level, 30);
    assert.equal(moteur.actif, false);
  } finally {
    await moteur.arreter();
  }
});

test('mauvais mot de passe : « Transmission ne répond pas » au niveau erreur, avec le vrai journal, sans planter', async () => {
  const faux = new FauxTransmission();
  faux.utilisateur = 'canape';
  faux.motDePasse = 'le-bon';
  await faux.demarrer();
  const { journal, lignes } = journalReel();
  const moteur = new MoteurTransmission(
    configVers(faux.url, { CANAPE_TRANSMISSION_UTILISATEUR: 'canape', CANAPE_TRANSMISSION_MOT_DE_PASSE: 'le-mauvais' }), journal);
  try {
    moteur.demarrer();
    const l = await attendre(() => lignes.find((x) => x.msg === 'Transmission ne répond pas'), 10_000, 50, 'rien journalisé');
    assert.equal(l.level, 50);
    assert.equal(JSON.stringify(lignes).includes('le-mauvais'), false);
  } finally {
    await moteur.arreter();
    await faux.arreter();
  }
});
