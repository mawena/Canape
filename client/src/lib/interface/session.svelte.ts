// Session vue par l'interface : utilisateur courant (GET /api/etat), déconnexion (POST /api/deconnexion).
// Fichier volontairement petit et isolé : à l'intégration, il est remplacé par le magasin du module comptes
// (`$lib/comptes/session.svelte.ts`), qui expose la même surface (`utilisateur`, `estAdmin`, `charge`,
// `installationRequise`, `version`, `charger()`, `deconnexion()`).
import { goto } from '$app/navigation';
import type { EtatApi, Utilisateur } from '@canape/partage';
import { api, surNonConnecte } from '$lib/api/client.ts';

const etat = $state<{ utilisateur: Utilisateur | null; installationRequise: boolean; charge: boolean; version: string }>({
  utilisateur: null, installationRequise: false, charge: false, version: '',
});
let promesse: Promise<void> | null = null;
let branche = false;

function brancher(): void {
  if (branche) return;
  branche = true;
  surNonConnecte(() => {
    if (!etat.utilisateur) return;
    etat.utilisateur = null;
    void goto(`/connexion?retour=${encodeURIComponent(`${location.pathname}${location.search}`)}`, { replaceState: true });
  });
}

export const session = {
  get utilisateur(): Utilisateur | null { return etat.utilisateur; },
  get estAdmin(): boolean { return etat.utilisateur?.role === 'admin'; },
  get installationRequise(): boolean { return etat.installationRequise; },
  get charge(): boolean { return etat.charge; },
  get version(): string { return etat.version; },

  charger(forcer = false): Promise<void> {
    brancher();
    if (promesse && !forcer) return promesse;
    promesse = api.get<EtatApi>('/api/etat').then((e) => {
      etat.utilisateur = e.utilisateur;
      etat.installationRequise = e.installationRequise;
      etat.version = e.version;
      etat.charge = true;
    }, (e: unknown) => { promesse = null; throw e; });
    return promesse;
  },

  async deconnexion(): Promise<void> {
    try { await api.post('/api/deconnexion'); } finally {
      etat.utilisateur = null;
      await goto('/connexion', { replaceState: true });
    }
  },
};
