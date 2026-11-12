import { test, expect, televerser, FILM_WEBM, type Monde } from './support/fixtures.ts';
import { creerSeance, entrerDansLaSalle } from './support/salle.ts';

/** Deux personnes (admin et viewer) dans la même salle, chacune dans son contexte de navigateur. */
async function deuxDansLaSalle(monde: Monde, ouvrir: Parameters<Parameters<typeof test>[2]>[0]['ouvrir'], avant?: (filmId: string) => Promise<void>) {
  const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
  await avant?.(filmId);
  const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
  const a = await ouvrir(monde.admin);
  const b = await ouvrir(monde.viewer);
  await entrerDansLaSalle(a.page, id);
  await entrerDansLaSalle(b.page, id);
  await expect(a.page.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');
  await expect(b.page.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');
  return { a: a.page, b: b.page, id };
}

test.describe('Salle à deux', () => {
  test("sas, entrée, vignettes, chat, réaction, micro et caméra coupés, départ", async ({ ouvrir, monde, browserName }) => {
    const { a, b } = await deuxDansLaSalle(monde, ouvrir);

    // Chacun voit la vignette de l'autre ; la liaison WebRTC s'établit (caméras simulées : Chromium et Firefox).
    const avecMedia = browserName !== 'webkit';
    for (const p of [a, b]) {
      await expect(p.getByTestId('vignette')).toHaveCount(2);
      const autre = p.locator('[data-test="vignette"][data-moi="false"]');
      await expect(autre).toHaveCount(1);
      if (avecMedia) {
        await expect(autre).toHaveAttribute('data-pair', 'connected', { timeout: 30_000 });
        // Une image arrive vraiment de l'autre personne.
        await expect.poll(() => autre.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
      }
    }

    // Chat : le message de l'un arrive chez l'autre.
    await a.getByTestId('bouton-chat').click();
    await b.getByTestId('bouton-chat').click();
    await a.getByTestId('saisie-chat').fill('Bonsoir, tu me vois ?');
    await a.getByTestId('saisie-chat').press('Enter');
    await expect(b.getByTestId('message').filter({ hasText: 'Bonsoir, tu me vois ?' })).toBeVisible();
    await expect(a.getByTestId('message').filter({ hasText: 'Bonsoir, tu me vois ?' })).toBeVisible();

    // Réaction : l'emoji flotte chez l'autre.
    await a.getByTestId('reaction-1').click();
    await expect(b.getByTestId('reaction').first()).toBeVisible();

    // Micro et caméra coupés : visibles sur la vignette chez l'autre.
    if (avecMedia) {
      await a.getByTestId('micro').click();
      await expect(b.locator('[data-test="vignette"][data-moi="false"]').getByLabel('Micro coupé')).toBeVisible();
      await a.getByTestId('camera').click();
      await expect(b.locator('[data-test="vignette"][data-moi="false"]').getByLabel('Caméra coupée')).toBeVisible();
      await a.getByTestId('micro').click();
      await expect(b.locator('[data-test="vignette"][data-moi="false"]').getByLabel('Micro coupé')).toHaveCount(0);
    }

    // Départ de l'un : annonce chez l'autre, et sa vignette disparaît.
    await a.getByTestId('quitter').click();
    await expect(b.getByTestId('annonce').filter({ hasText: `${monde.admin.prenom} est parti` })).toBeVisible();
    await expect(b.getByTestId('salle')).toHaveAttribute('data-nb-presents', '1');
  });

  test("la salle marche sans caméra ni micro (aucun média local)", async ({ browser, monde }) => {
    // Un contexte sans permission : le navigateur refuse la caméra ; on entre quand même et on discute.
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const sans = await browser.newContext({ baseURL: monde.serveur.url, permissions: [] });
    await sans.addInitScript(() => {
      // Aucun périphérique : getUserMedia refuse comme sur un poste sans caméra.
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('absent', 'NotFoundError'));
    });
    const r = await sans.request.post('/api/connexion', { headers: { Origin: monde.serveur.url }, data: { identifiant: monde.viewer.identifiant, motDePasse: monde.viewer.motDePasse } });
    expect(r.status()).toBe(204);
    const p = await sans.newPage();
    await entrerDansLaSalle(p, id);
    await p.getByTestId('bouton-chat').click();
    await p.getByTestId('saisie-chat').fill('Je suis là sans caméra');
    await p.getByTestId('saisie-chat').press('Enter');
    await expect(p.getByTestId('message').filter({ hasText: 'Je suis là sans caméra' })).toBeVisible();
    await sans.close();
  });
});

// Lecture synchronisée (mode direct, WebM VP9/Opus).
test.describe('Salle à deux : lecture synchronisée', () => {
  test('lecture lancée par l\'un : l\'autre lit aussi', async ({ ouvrir, monde }) => {
    const { a, b } = await deuxDansLaSalle(monde, ouvrir);
    await a.getByTestId('lecture').click();
    await expect(b.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    await expect.poll(() => b.getByTestId('film').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1);
  });

  test('pause : les deux en pause à moins de 0,5 s d\'écart', async ({ ouvrir, monde }) => {
    const { a, b } = await deuxDansLaSalle(monde, ouvrir);
    await a.getByTestId('lecture').click();
    await expect.poll(() => b.getByTestId('film').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(2);
    await a.getByTestId('lecture').click();
    await expect(b.getByTestId('salle')).toHaveAttribute('data-lecture', 'false');
    const [ta, tb] = await Promise.all([a, b].map((p) => p.getByTestId('film').evaluate((v: HTMLVideoElement) => v.currentTime)));
    expect(Math.abs((ta ?? 0) - (tb ?? 0))).toBeLessThan(0.5);
  });

  test('saut dans la barre de temps : l\'autre suit', async ({ ouvrir, monde }) => {
    const { a, b } = await deuxDansLaSalle(monde, ouvrir);
    await a.getByTestId('avancer').click();
    await expect.poll(() => b.getByTestId('film').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(5);
  });

  test('compte à rebours lancé par l\'un, visible chez l\'autre', async ({ ouvrir, monde }) => {
    const { a, b } = await deuxDansLaSalle(monde, ouvrir);
    await a.getByTestId('lancer-ensemble').click();
    await expect(b.getByTestId('compte-a-rebours')).toBeVisible();
    await expect(b.getByTestId('salle')).toHaveAttribute('data-lecture', 'true', { timeout: 15_000 });
  });

  test('attente mutuelle : l\'un charge, l\'autre attend', async ({ ouvrir, monde }) => {
    const { a, b } = await deuxDansLaSalle(monde, ouvrir);
    await a.getByTestId('lecture').click();
    await expect(b.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    // Chez Camille, le film « charge » plus d'une seconde (readyState simulé : un vrai film de 25 s est déjà tout en mémoire) : Alix voit qu'on l'attend.
    await b.getByTestId('film').evaluate((v: HTMLVideoElement) => { Object.defineProperty(v, 'readyState', { configurable: true, get: () => 1 }); v.dispatchEvent(new Event('waiting')); });
    await expect(a.getByTestId('attente')).toBeVisible({ timeout: 10_000 });
    await expect(a.getByTestId('attente')).toContainText(monde.viewer.prenom);
    await expect(b.getByTestId('attente')).toContainText('Ton film charge');
    // Alix ne veut plus attendre : le voile disparaît chez elle, et l'annonce le dit.
    await a.getByTestId('ne-plus-attendre').click();
    await expect(a.getByTestId('attente')).toHaveCount(0, { timeout: 10_000 });
  });

  test('changement de sous-titres annoncé chez l\'autre', async ({ ouvrir, monde }) => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nBonsoir\n\n2\n00:00:04,000 --> 00:00:06,000\nBonne séance\n';
    const { a, b } = await deuxDansLaSalle(monde, ouvrir, async (filmId) => {
      const r = await monde.requeteAdmin.post(`${monde.serveur.url}/api/films/${filmId}/sous-titres`, {
        headers: { Origin: monde.serveur.url },
        multipart: { fichier: { name: 'Mire.fr.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(srt) }, langue: 'fr' },
      });
      expect(r.status(), await r.text()).toBeLessThan(300);
    });
    await a.getByTestId('langue-st').click();
    await a.locator('[data-test^="st-"]:not([data-test="st-aucun"])').first().check();
    await expect(b.getByTestId('annonce').filter({ hasText: /sous-titres/ })).toBeVisible();
  });
});
