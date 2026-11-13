import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, expect, televerser, FILM_WEBM } from './support/fixtures.ts';
import { creerSeance, entrerDansLaSalle } from './support/salle.ts';

// Phase 19 : fin de séance et souvenir. Captures (écran de fin, historique clair et sombre) seulement si
// CANAPE_E2E_CAPTURES_FIN (dossier) est défini.
const dossierCaptures = process.env['CANAPE_E2E_CAPTURES_FIN'];

test.describe('Fin de séance et souvenir', () => {
  test('le film arrive à la fin : écran de fin, notes en direct, historique, note après coup', async ({ ouvrir, monde }, info) => {
    test.setTimeout(150_000);
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const a = (await ouvrir(monde.admin)).page;
    const bCtx = await ouvrir(monde.viewer);
    const b = bCtx.page;
    await entrerDansLaSalle(a, id);
    await entrerDansLaSalle(b, id);
    await expect(a.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');
    await expect(b.getByTestId('salle')).toHaveAttribute('data-nb-presents', '2');
    await expect(a.getByTestId('fin-seance')).toHaveCount(0);

    // Le film va à la fin (25 s : on saute de 30 s).
    await a.getByTestId('lecture').click();
    await expect(b.getByTestId('salle')).toHaveAttribute('data-lecture', 'true');
    await a.keyboard.press('Shift+ArrowRight');
    for (const p of [a, b]) {
      await expect(p.getByTestId('fin-seance')).toBeVisible({ timeout: 40_000 });
      await expect(p.getByTestId('temps-ensemble')).toContainText('ensemble');
      await expect(p.getByTestId('present-fin')).toHaveCount(2);
    }
    if (dossierCaptures) {
      mkdirSync(dossierCaptures, { recursive: true });
      await a.waitForTimeout(600);
    }

    // Chacune note : la note de l'une apparaît en direct chez l'autre ; la sienne est en évidence.
    await a.getByTestId('note-coeur').click();
    await expect(a.getByTestId('note-coeur')).toHaveAttribute('aria-pressed', 'true');
    await expect(b.getByTestId('note-autre')).toHaveCount(1);
    await expect(b.locator('[data-test="present-fin"][data-note="coeur"]')).toHaveCount(1);
    await expect(b.getByTestId('note-coeur')).toHaveAttribute('aria-pressed', 'false');
    // Changer d'avis, puis effacer en recliquant.
    await a.getByTestId('note-bof').click();
    await expect(b.locator('[data-test="present-fin"][data-note="bof"]')).toHaveCount(1);
    await a.getByTestId('note-bof').click();
    await expect(b.locator('[data-test="present-fin"][data-note=""]')).toHaveCount(2);
    await a.getByTestId('note-coeur').click();
    await expect(b.locator('[data-test="present-fin"][data-note="coeur"]')).toHaveCount(1);
    if (dossierCaptures) {
      await b.waitForTimeout(400);
      await b.screenshot({ path: path.join(dossierCaptures, `fin-${info.project.name}.png`) });
    }

    // « Revoir la fin » ferme le voile (chez soi seulement), et il ne revient pas tout seul.
    await b.getByTestId('revoir-fin').click();
    await expect(b.getByTestId('fin-seance')).toHaveCount(0);
    await expect(a.getByTestId('fin-seance')).toBeVisible();
    await b.waitForTimeout(1500);
    await expect(b.getByTestId('fin-seance')).toHaveCount(0);
    await expect(b.getByTestId('salle')).toBeVisible();

    // Historique de B : le souvenir, la note de A ; B note après coup.
    await a.getByTestId('quitter-fin').click();
    await b.goto('/historique');
    const souvenir = b.getByTestId('souvenir').first();
    await expect(souvenir).toBeVisible();
    await expect(souvenir.getByTestId('souvenir-temps')).toContainText('ensemble');
    await expect(souvenir.getByTestId('souvenir-note')).toContainText(monde.admin.prenom);
    await expect(souvenir.getByTestId('note-bien')).toHaveAttribute('aria-pressed', 'false');
    await souvenir.getByTestId('note-bien').click();
    await expect(souvenir.getByTestId('note-bien')).toHaveAttribute('aria-pressed', 'true');
    await b.reload();
    await expect(b.getByTestId('souvenir').first().getByTestId('note-bien')).toHaveAttribute('aria-pressed', 'true');
    if (dossierCaptures) {
      await b.screenshot({ path: path.join(dossierCaptures, `historique-clair-${info.project.name}.png`) });
      await b.emulateMedia({ colorScheme: 'dark' });
      await b.evaluate(() => { document.documentElement.dataset['theme'] = 'sombre'; });
      await b.waitForTimeout(400);
      await b.screenshot({ path: path.join(dossierCaptures, `historique-sombre-${info.project.name}.png`) });
    }

    // A (qui a quitté) retrouve sa note et celle de B dans son propre historique.
    await a.goto('/historique');
    await expect(a.getByTestId('souvenir').first().getByTestId('note-coeur')).toHaveAttribute('aria-pressed', 'true');
    await expect(a.getByTestId('souvenir').first().getByTestId('souvenir-note')).toContainText(monde.viewer.prenom);
  });

  test("l'hôte termine la séance : l'écran de fin s'ouvre dans la salle", async ({ ouvrir, monde }) => {
    const filmId = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM);
    const id = await creerSeance(monde.serveur, monde.requeteAdmin, filmId, [monde.viewer.id]);
    const b = (await ouvrir(monde.viewer)).page;
    await entrerDansLaSalle(b, id);
    const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/seances/${id}`, { headers: { Origin: monde.serveur.url }, data: { terminee: true } });
    expect(r.status()).toBe(200);
    await expect(b.getByTestId('fin-seance')).toBeVisible();
    await expect(b.getByTestId('temps-ensemble')).toContainText('Tu as regardé seul·e');
    await b.getByTestId('revoir-fin').click();
    await expect(b.getByTestId('fin-seance')).toHaveCount(0);
  });
});
