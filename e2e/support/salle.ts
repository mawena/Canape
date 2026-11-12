import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { ServeurCanape } from './serveur.ts';

/** Crée une séance (API) pour `filmId`, avec les `invites` (identifiants de compte) ; rend son identifiant. */
export async function creerSeance(s: ServeurCanape, requete: APIRequestContext, filmId: string, invites: number[], titre = 'Soirée de test'): Promise<string> {
  const r = await requete.post(`${s.url}/api/seances`, { headers: { Origin: s.url }, data: { filmId, titre, invites } });
  expect(r.status(), await r.text()).toBeLessThan(300);
  return ((await r.json()) as { id: string }).id;
}

/** Va à la salle : sas, puis « Entrer dans la salle ». */
export async function entrerDansLaSalle(page: Page, seanceId: string): Promise<void> {
  await page.goto(`/seances/${seanceId}`);
  await expect(page.getByTestId('sas')).toBeVisible();
  await page.getByTestId('entrer-salle').click();
  await expect(page.getByTestId('salle')).toBeVisible();
  await expect(page.getByTestId('salle')).toHaveAttribute('data-liaison', 'ouvert');
}
