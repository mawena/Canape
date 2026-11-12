import { test, expect, televerser, FILM_WEBM } from './support/fixtures.ts';
import { creerSeance, entrerDansLaSalle } from './support/salle.ts';

const positionFilm = (p: import('@playwright/test').Page): Promise<number> =>
  p.getByTestId('film').evaluate((v: HTMLVideoElement) => v.currentTime);

test.describe('Lien de la séance pendant le film', () => {
  test("l'hôte invite sans arrêter le film ; un troisième compte arrive au bon moment ; l'invité n'a pas l'option ; la liste donne le même lien", async ({ ouvrir, monde, browserName }) => {
    test.setTimeout(150_000);
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const a = await ouvrir(monde.admin);
    const b = await ouvrir(monde.viewer);
    await a.contexte.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {}); // Chromium seulement
    await entrerDansLaSalle(a.page, id);
    await entrerDansLaSalle(b.page, id);
    await expect(a.page.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');

    // Film lancé.
    await a.page.getByTestId('lecture').click();
    await expect(a.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    await expect(b.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    await expect.poll(() => positionFilm(a.page), { timeout: 20_000 }).toBeGreaterThan(1.5);

    // L'invité (non hôte) n'a pas le bouton ; l'hôte l'a.
    await expect(b.page.getByTestId('inviter-seance')).toHaveCount(0);
    await expect(a.page.getByTestId('inviter-seance')).toBeVisible();

    // L'hôte ouvre « Inviter » : le panneau donne le lien, le film continue.
    await a.page.getByTestId('inviter-seance').click();
    await expect(a.page.getByTestId('panneau-inviter')).toBeVisible();
    await expect(a.page.getByTestId('lien-seance')).toHaveValue(/\/rejoindre\/.+/);
    const lien = await a.page.getByTestId('lien-seance').inputValue();
    await a.page.getByTestId('copier-lien-seance').click();
    await expect(a.page.getByTestId('copier-lien-seance')).toContainText('Lien copié');
    if (browserName === 'chromium') expect(await a.page.evaluate(() => navigator.clipboard.readText())).toBe(lien);
    await expect(a.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    await expect(b.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    const avant = await positionFilm(a.page);
    await expect.poll(() => positionFilm(a.page), { timeout: 10_000 }).toBeGreaterThan(avant + 0.8);

    // Échap ferme le panneau et rend le focus au bouton.
    await a.page.keyboard.press('Escape');
    await expect(a.page.getByTestId('panneau-inviter')).toHaveCount(0);
    await expect(a.page.getByTestId('inviter-seance')).toBeFocused();
    await expect(a.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');

    // Même lien que celui de la liste des séances.
    await a.page.getByTestId('inviter-seance').click();
    await expect(a.page.getByTestId('lien-seance')).toHaveValue(lien);
    await a.page.keyboard.press('Escape');
    const liste = await ouvrir(monde.admin);
    await liste.contexte.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await liste.page.goto('/seances');
    await expect(liste.page.getByTestId('copier-lien-liste')).toHaveCount(1);
    const reponse = liste.page.waitForResponse((r) => r.url().endsWith(`/api/seances/${id}/lien`) && r.request().method() === 'POST');
    await liste.page.getByTestId('copier-lien-liste').click();
    expect(((await (await reponse).json()) as { lien: string }).lien).toBe(lien);
    // Le viewer, lui, n'a aucun « Copier le lien » dans sa liste.
    const listeViewer = await ouvrir(monde.viewer);
    await listeViewer.page.goto('/seances');
    await expect(listeViewer.page.getByTestId('seance').first()).toBeVisible();
    await expect(listeViewer.page.getByTestId('copier-lien-liste')).toHaveCount(0);

    // Un troisième compte ouvre le lien pendant la lecture : il arrive dans la salle, au bon moment.
    const tiers = await monde.nouveauViewer('Dominique');
    const t = await ouvrir(tiers);
    await t.page.goto(lien);
    await expect(t.page).toHaveURL(new RegExp(`/seances/${id}`));
    await expect(t.page.getByTestId('sas')).toBeVisible();
    await expect(t.page.getByTestId('inviter-seance')).toHaveCount(0);
    await t.page.getByTestId('entrer-salle').click();
    await expect(t.page.getByTestId('salle')).toHaveAttribute('data-liaison', 'ouvert');
    await expect(a.page.getByTestId('salle')).toHaveAttribute('data-nb-presents', '3');
    await expect(t.page.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    await expect.poll(async () => Math.abs((await positionFilm(t.page)) - (await positionFilm(a.page))), { timeout: 20_000 }).toBeLessThan(3);
    expect(await positionFilm(t.page)).toBeGreaterThan(2);
  });

  test("dans le sas, l'hôte voit « Inviter », pas l'invité", async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const a = await ouvrir(monde.admin);
    await a.page.goto(`/seances/${id}`);
    await expect(a.page.getByTestId('sas')).toBeVisible();
    await a.page.getByTestId('inviter-seance').click();
    await expect(a.page.getByTestId('lien-seance')).toHaveValue(/\/rejoindre\/.+/);
    const b = await ouvrir(monde.viewer);
    await b.page.goto(`/seances/${id}`);
    await expect(b.page.getByTestId('sas')).toBeVisible();
    await expect(b.page.getByTestId('inviter-seance')).toHaveCount(0);
  });

  test("le panneau s'affiche dans la salle en plein écran", async ({ ouvrir, monde, browserName }) => {
    test.skip(browserName === 'webkit', 'Plein écran non fiable sous WebKit de Playwright.');
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const a = await ouvrir(monde.admin);
    await entrerDansLaSalle(a.page, id);
    await a.page.getByTestId('plein-ecran').click();
    await expect.poll(() => a.page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await a.page.getByTestId('inviter-seance').click();
    await expect(a.page.getByTestId('panneau-inviter')).toBeVisible();
    const dedans = await a.page.evaluate(() => document.fullscreenElement?.contains(document.querySelector('[data-test="panneau-inviter"]')) ?? false);
    expect(dedans).toBe(true);
  });
});
