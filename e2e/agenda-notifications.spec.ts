import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { ChargeNotification } from '@canape/partage';
import { creerAbonneTest, creerFauxService, type AbonneTest, type FauxService } from '../serveur/tests/notifications/aides-notifications.ts';
import { test, expect, requeteConnectee, televerser, FILM_WEBM } from './support/fixtures.ts';
import { creerSeance, entrerDansLaSalle } from './support/salle.ts';

// Phase 20 : agenda (.ics) et notifications Web Push. Aucun vrai service de notifications : l'abonnement pointe vers un faux service local.
// Captures (compte, liste des séances) seulement si CANAPE_E2E_CAPTURES_AGENDA (dossier) est défini.
const dossierCaptures = process.env['CANAPE_E2E_CAPTURES_AGENDA'];

async function capturer(page: Page, nom: string): Promise<void> {
  if (!dossierCaptures) return;
  mkdirSync(dossierCaptures, { recursive: true });
  for (const [suffixe, largeur, hauteur] of [['ordinateur', 1440, 900], ['telephone', 390, 844]] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dossierCaptures, `${nom}-${suffixe}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Simule `PushManager` et la permission dans la page : l'abonnement pointe vers le faux service, avec les clés de `abonne`. */
async function simulerPush(page: Page, endpoint: string, abonne: AbonneTest): Promise<void> {
  await page.addInitScript(({ endpoint, p256dh, auth }) => {
    let abonnement: unknown = null;
    let permission: NotificationPermission = 'default';
    const nouveau = () => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
      unsubscribe: async () => { abonnement = null; return true; },
    });
    const gestionnaire = {
      getSubscription: async () => abonnement,
      subscribe: async () => { abonnement = nouveau(); return abonnement; },
    };
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { configurable: true, get: () => gestionnaire });
    if (!('PushManager' in window)) Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() { /* simulé */ } });
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission });
    Object.defineProperty(Notification, 'requestPermission', { configurable: true, value: async () => { permission = 'granted'; return permission; } });
  }, { endpoint, p256dh: abonne.p256dh, auth: abonne.auth });
}

test.describe('Agenda et notifications', () => {
  let faux: FauxService;
  test.beforeEach(async () => { faux = await creerFauxService(); });
  test.afterEach(async () => { await faux.fermer(); });

  test('« Ajouter à l\'agenda » télécharge un .ics valide', async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const prevue = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const r = await monde.requeteAdmin.post(`${monde.serveur.url}/api/seances`, {
      headers: { Origin: monde.serveur.url }, data: { filmId, titre: 'Soirée mire', prevueLe: prevue, invites: [monde.viewer.id] },
    });
    expect(r.status()).toBe(201);
    const { id } = (await r.json()) as { id: string };
    const { page } = await ouvrir(monde.admin);
    await page.goto('/seances');
    await expect(page.getByTestId('seance')).toHaveCount(1);
    const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByTestId('ajouter-agenda').click()]);
    expect(telechargement.suggestedFilename()).toBe(`seance-${id}.ics`);
    const texte = readFileSync((await telechargement.path())!, 'utf8');
    expect(texte.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(texte.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const l of texte.split('\r\n').slice(0, -1)) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
    expect(texte).toContain(`UID:${id}@`);
    expect(texte).toContain('SUMMARY:Canapé : Soirée mire');
    expect(texte).toContain(`URL:${monde.serveur.url}/seances/${id}`);
    expect(texte).toContain('TRIGGER:-PT15M');
    expect(texte).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    await capturer(page, 'seances');

    // Le viewer invité a aussi le bouton ; une séance sans date n'en a pas.
    const sans = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [], 'Sans date');
    await page.reload();
    await expect(page.getByTestId('seance')).toHaveCount(2);
    await expect(page.getByTestId('ajouter-agenda')).toHaveCount(1);
    void sans;
  });

  test('compte : l\'interrupteur abonne l\'appareil, l\'essai arrive au faux service, couper désabonne', async ({ ouvrir, monde }) => {
    const abonne = creerAbonneTest();
    const { page } = await ouvrir(monde.viewer);
    await simulerPush(page, faux.url('appareil'), abonne);
    await page.goto('/compte');
    const section = page.getByTestId('notifications-appareil');
    await expect(section).toHaveAttribute('data-etat', 'inactif');
    await expect(page.getByTestId('notifications-essai')).toBeDisabled();
    await capturer(page, 'compte-inactif');

    // Rien n'a été demandé ni envoyé avant le geste ; le clic abonne.
    await section.getByRole('switch').click();
    await expect(section).toHaveAttribute('data-etat', 'actif');
    await expect(page.getByTestId('notifications-etat')).toContainText('Activées');

    await page.getByTestId('notifications-essai').click();
    await faux.attendre(1);
    const recu = faux.recus[0]!;
    expect(recu.chemin).toBe('/push/appareil');
    expect(recu.entetes['content-encoding']).toBe('aes128gcm');
    expect(String(recu.entetes['authorization'])).toMatch(/^vapid t=.+, k=.+$/);
    const charge = JSON.parse(abonne.dechiffrer(recu.corps).toString()) as ChargeNotification;
    expect(charge.titre).toBe('Canapé');
    await capturer(page, 'compte-actif');

    // Couper : l'essai ne trouve plus aucun appareil.
    await section.getByRole('switch').click();
    await expect(section).toHaveAttribute('data-etat', 'inactif');
    const essai = await page.request.post('/api/notifications/essai', { headers: { Origin: monde.serveur.url }, data: {} });
    expect(await essai.json()).toEqual({ envoyes: 0, echecs: 0 });
  });

  test('une personne entre dans la salle : l\'autre participant abonné reçoit une notification', async ({ ouvrir, monde }) => {
    test.setTimeout(150_000);
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id], 'Soirée mire');
    const abonne = creerAbonneTest();
    const viewerApi = await requeteConnectee(monde.serveur, monde.viewer);
    const r = await viewerApi.post(`${monde.serveur.url}/api/notifications/abonnements`, { headers: { Origin: monde.serveur.url }, data: abonne.corps(faux.url('camille'), 'Appareil de test') });
    expect(r.status()).toBe(204);
    await viewerApi.dispose();

    const { page } = await ouvrir(monde.admin);
    await entrerDansLaSalle(page, id);
    await faux.attendre(1);
    expect(faux.recus).toHaveLength(1);
    const charge = JSON.parse(abonne.dechiffrer(faux.recus[0]!.corps).toString()) as ChargeNotification;
    expect(charge.titre).toBe(`${monde.admin.prenom} est dans la salle`);
    expect(charge.corps).toContain('Soirée mire');
    expect(charge.url).toBe(`/seances/${id}`);
  });
});
