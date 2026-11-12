<script lang="ts">
  import type { Reglages } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { analyserTaille, formaterOctets } from '$lib/comptes/format.ts';
  import { Bouton, Carte, Champ, Chargement, toast } from '$lib/ui/index.ts';

  let reglages = $state<Reglages | null>(null);
  let quota = $state('');
  let erreurQuota = $state<string | null>(null);
  let envoi = $state(false);

  $effect(() => {
    api.get<Reglages>('/api/admin/reglages').then((r) => { reglages = r; quota = formaterOctets(r.quotaDefautOctets); }, () => toast.erreur('Impossible de lire les réglages.'));
  });

  async function enregistrer(corps: Partial<Reglages>): Promise<boolean> {
    try {
      reglages = await api.patch<Reglages>('/api/admin/reglages', corps);
      toast.ok('Enregistré.');
      return true;
    } catch (x) {
      toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible d’enregistrer.');
      return false;
    }
  }

  async function enregistrerQuota(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    erreurQuota = null;
    const o = analyserTaille(quota.replace(/\s/g, ''));
    if (o === null) { erreurQuota = 'Taille illisible. Exemple : 100 Go.'; return; }
    envoi = true;
    if (await enregistrer({ quotaDefautOctets: o }) && reglages) quota = formaterOctets(reglages.quotaDefautOctets);
    envoi = false;
  }
</script>

<svelte:head><title>Réglages · Canapé</title></svelte:head>

<h1>Réglages</h1>
{#if !reglages}
  <Chargement />
{:else}
  <Carte titre="Préparation automatique">
    <label class="bascule">
      <input type="checkbox" checked={reglages.preparationAuto} onchange={(e) => enregistrer({ preparationAuto: e.currentTarget.checked })} />
      Convertir à l'avance, quand le serveur est calme, les films qui ne se lisent pas directement.
    </label>
  </Carte>
  <Carte titre="Quota des nouveaux comptes">
    <form onsubmit={enregistrerQuota}>
      <Champ libelle="Espace donné à chaque nouveau spectateur" bind:value={quota} aide="Par exemple 100 Go. Les administrateurs n'ont pas de limite." erreur={erreurQuota} />
      <Bouton type="submit" chargement={envoi}>Enregistrer</Bouton>
    </form>
  </Carte>
{/if}

<style>
  form { display: grid; gap: var(--espace-3); }
  .bascule { display: flex; gap: var(--espace-3); align-items: flex-start; }
</style>
