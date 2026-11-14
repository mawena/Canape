import { test, expect, televerser, FILM_WEBM, type Monde } from './support/fixtures.ts';

// Phase 23 : films « à voir ensemble ». Aucun torrent ni service externe : un film téléversé, deux comptes.
async function filmPartage(monde: Monde, titre: string): Promise<string> {
  const id = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM, `${titre} (2020).webm`);
  const r = await monde.requeteAdmin.patch(`${monde.serveur.url}/api/films/${id}`, {
    headers: { Origin: monde.serveur.url }, data: { visibilite: 'partage', partages: [monde.viewer.id] },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return id;
}

test.describe('Films à voir ensemble', () => {
  test('deux personnes marquent un film, l\'accueil les montre, la séance se lance avec les deux, l\'envie se retire', async ({ ouvrir, monde }) => {
    const film = await filmPartage(monde, 'Les Nuits de Lisbonne');
    const admin = await ouvrir(monde.admin);
    const viewer = await ouvrir(monde.viewer);

    // Accueil sans envie : un état vide qui renvoie vers la galerie (le film existe, donc ce n'est pas un compte neuf).
    await admin.page.goto('/');
    await expect(admin.page.getByTestId('a-voir-vide')).toBeVisible();

    // Chacun marque le film depuis sa fiche : bouton à bascule, état annoncé.
    for (const { page } of [admin, viewer]) {
      await page.goto(`/galerie/${film}`);
      const bouton = page.getByTestId('bouton-envie');
      await expect(bouton).toHaveAttribute('aria-pressed', 'false');
      await bouton.click();
      await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    }
    await admin.page.reload();
    await expect(admin.page.getByTestId('bouton-envie')).toHaveAttribute('aria-pressed', 'true');
    await expect(admin.page.getByTestId('bouton-envie')).toContainText('2');

    // La galerie porte un marqueur sur la carte.
    await admin.page.goto('/galerie');
    await expect(admin.page.getByTestId('carte-envie')).toBeVisible();

    // L'accueil montre le film voulu par les deux, avec les deux prénoms.
    await admin.page.goto('/');
    const carte = admin.page.getByTestId('a-voir-film');
    await expect(carte).toHaveCount(1);
    await expect(carte).toHaveAttribute('data-envieux', '2');
    await expect(carte).toContainText('Les Nuits de Lisbonne');
    await expect(admin.page.getByTestId('a-voir-phrase')).toHaveText(`Toi et ${monde.viewer.prenom}, vous avez envie de le voir.`);

    // Lancer la séance : la page de création est pré-remplie avec le film et la personne intéressée.
    await admin.page.getByTestId('a-voir-lancer').click();
    await expect(admin.page).toHaveURL(/\/seances\/nouvelle\?film=.*&invites=\d+/);
    await expect(admin.page.getByTestId(`film-${film}`)).toBeChecked();
    await expect(admin.page.getByRole('checkbox', { name: new RegExp(monde.viewer.prenom) })).toBeChecked();
    await admin.page.getByTestId('creer-seance').click();
    await expect(admin.page.getByTestId('seance-creee')).toBeVisible();
    const liste = (await (await monde.requeteAdmin.get(`${monde.serveur.url}/api/seances`)).json()) as { aVenir: Array<{ invites: Array<{ id: number }> }> };
    expect(liste.aVenir).toHaveLength(1);
    expect(liste.aVenir[0]?.invites.map((i) => i.id)).toEqual([monde.viewer.id]);

    // Retrait : l'envie de l'hôte part, celle de l'autre reste ; puis plus rien.
    await admin.page.goto('/');
    await admin.page.getByTestId('a-voir-film').getByTestId('bouton-envie').click();
    await expect(admin.page.getByTestId('a-voir-phrase')).toHaveText(`${monde.viewer.prenom} a envie de le voir.`);
    // « Annuler » dans le toast remet l'envie.
    await admin.page.getByRole('button', { name: 'Annuler' }).click();
    await expect(admin.page.getByTestId('a-voir-phrase')).toHaveText(`Toi et ${monde.viewer.prenom}, vous avez envie de le voir.`);
    await admin.page.getByTestId('a-voir-film').getByTestId('bouton-envie').click();
    await expect(admin.page.getByTestId('a-voir-phrase')).toHaveText(`${monde.viewer.prenom} a envie de le voir.`);
    await expect(admin.page.getByTestId('a-voir-film')).toHaveAttribute('data-envieux', '1');
    await viewer.page.goto('/');
    await viewer.page.getByTestId('a-voir-film').getByTestId('bouton-envie').click();
    await expect(viewer.page.getByTestId('a-voir-vide')).toBeVisible();
    await expect(viewer.page.getByTestId('a-voir-film')).toHaveCount(0);
  });

  test('un film privé n\'apparaît pas chez les autres', async ({ ouvrir, monde }) => {
    const prive = await televerser(monde.serveur, monde.requeteAdmin, FILM_WEBM, 'Film secret (2021).webm');
    const admin = await ouvrir(monde.admin);
    await admin.page.goto(`/galerie/${prive}`);
    await admin.page.getByTestId('bouton-envie').click();
    await expect(admin.page.getByTestId('bouton-envie')).toHaveAttribute('aria-pressed', 'true');
    const viewer = await ouvrir(monde.viewer);
    await viewer.page.goto('/');
    await expect(viewer.page.getByTestId('a-voir-film')).toHaveCount(0);
    await expect(viewer.page.getByText('Film secret')).toHaveCount(0);
    const r = await viewer.contexte.request.put(`${monde.serveur.url}/api/films/${prive}/envie`, { headers: { Origin: monde.serveur.url } });
    expect(r.status()).toBe(404);
  });
});
