<script lang="ts">
  import type { Reglages, Stockage, UtilisateurAdmin, InvitationAdmin } from '@canape/partage';
  import { api } from '$lib/api/client.ts';
  import { formaterOctets, pourcentage } from '$lib/comptes/format.ts';
  import { Carte, Chargement } from '$lib/ui/index.ts';

  let comptes = $state<UtilisateurAdmin[] | null>(null);
  let invitations = $state<InvitationAdmin[] | null>(null);
  let stockage = $state<Stockage | null>(null);
  let reglages = $state<Reglages | null>(null);
  let echec = $state(false);

  $effect(() => {
    Promise.all([
      api.get<UtilisateurAdmin[]>('/api/admin/utilisateurs'),
      api.get<InvitationAdmin[]>('/api/admin/invitations'),
      api.get<Stockage>('/api/admin/stockage'),
      api.get<Reglages>('/api/admin/reglages'),
    ]).then(([c, i, s, r]) => { comptes = c; invitations = i; stockage = s; reglages = r; }, () => { echec = true; });
  });

  const actifs = $derived(comptes?.filter((c) => c.actif).length ?? 0);
  const enAttente = $derived(invitations?.filter((i) => !i.utiliseeLe && Date.parse(i.expireLe) > Date.now()).length ?? 0);
</script>

<svelte:head><title>Administration · Canapé</title></svelte:head>

<h1>Administration</h1>
{#if echec}
  <p>Impossible de charger les chiffres pour le moment.</p>
{:else if !comptes || !stockage || !reglages}
  <Chargement />
{:else}
  <div class="grille">
    <Carte titre="Comptes">
      <p class="chiffre">{actifs}</p>
      <p>compte{actifs > 1 ? 's' : ''} actif{actifs > 1 ? 's' : ''} sur {comptes.length}</p>
      <a href="/admin/utilisateurs">Gérer les comptes</a>
    </Carte>
    <Carte titre="Invitations">
      <p class="chiffre">{enAttente}</p>
      <p>lien{enAttente > 1 ? 's' : ''} en attente</p>
      <a href="/admin/invitations">Inviter quelqu'un</a>
    </Carte>
    <Carte titre="Espace disque">
      <p class="chiffre">{formaterOctets(stockage.disque.libre)}</p>
      <p>libres sur {formaterOctets(stockage.disque.total)} ({pourcentage(stockage.disque.total - stockage.disque.libre, stockage.disque.total)} % utilisés)</p>
      <a href="/admin/stockage">Voir le détail</a>
    </Carte>
    <Carte titre="Réglages">
      <p>Préparation automatique : {reglages.preparationAuto ? 'activée' : 'désactivée'}.</p>
      <p>Quota par défaut : {formaterOctets(reglages.quotaDefautOctets)}.</p>
      <a href="/admin/reglages">Modifier</a>
    </Carte>
  </div>
{/if}

<style>
  .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--espace-4); }
  .chiffre { font-size: 2.2rem; margin: 0; color: var(--or); font-family: var(--titre); }
  p { margin: 0; }
</style>
