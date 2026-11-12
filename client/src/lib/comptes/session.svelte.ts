// État de session (Svelte 5 runes) : utilisateur courant, connexion, déconnexion.
// Branché sur `surNonConnecte` : une session expirée renvoie vers `/connexion?retour=…`.
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
    // Un 401 sans session ouverte (mauvais mot de passe, par exemple) n'est pas une expiration.
    if (!etat.utilisateur) return;
    etat.utilisateur = null;
    const ici = `${location.pathname}${location.search}`;
    void goto(`/connexion?retour=${encodeURIComponent(ici)}`, { replaceState: true });
  });
}

export const session = {
  get utilisateur(): Utilisateur | null { return etat.utilisateur; },
  get estAdmin(): boolean { return etat.utilisateur?.role === 'admin'; },
  get installationRequise(): boolean { return etat.installationRequise; },
  get charge(): boolean { return etat.charge; },
  get version(): string { return etat.version; },

  /** Lit `/api/etat` (une seule fois tant que `forcer` n'est pas demandé). */
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

  async connexion(identifiant: string, motDePasse: string): Promise<void> {
    await api.post('/api/connexion', { identifiant, motDePasse });
    await this.charger(true);
  },

  async deconnexion(): Promise<void> {
    try { await api.post('/api/deconnexion'); } finally {
      etat.utilisateur = null;
      await goto('/connexion', { replaceState: true });
    }
  },

  /** Après création de compte ou modification du profil. */
  remplacer(u: Utilisateur | null): void { etat.utilisateur = u; etat.installationRequise = false; },
};
