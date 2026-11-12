<script lang="ts">
  import type { Reglages } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { analyserTaille, formaterOctets } from '$lib/comptes/format.ts';
  import { Bouton, Carte, Champ, Chargement, Interrupteur, toast } from '$lib/ui/index.ts';

  let reglages = $state<Reglages | null>(null);
  let quota = $state('');
  let erreurQuota = $state<string | null>(null);
  let envoi = $state(false);
  let quotaInscrit = $state('');
  let erreurQuotaInscrit = $state<string | null>(null);
  let maxInscrits = $state('');
  let erreurMax = $state<string | null>(null);
  let envoiInscription = $state(false);

  $effect(() => {
    api.get<Reglages>('/api/admin/reglages').then((r) => { reglages = r; quota = formaterOctets(r.quotaDefautOctets); quotaInscrit = formaterOctets(r.quotaInscriptionOctets); maxInscrits = String(r.maxComptesInscrits); }, () => toast.erreur('Impossible de lire les réglages.'));
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

  async function enregistrerInscription(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    erreurQuotaInscrit = null; erreurMax = null;
    const o = analyserTaille(quotaInscrit.replace(/\s/g, ''));
    if (o === null) { erreurQuotaInscrit = 'Taille illisible. Exemple : 20 Go.'; return; }
    const n = Number(maxInscrits.trim());
    if (!Number.isInteger(n) || n < 0) { erreurMax = 'Indique un nombre entier, par exemple 100.'; return; }
    envoiInscription = true;
    if (await enregistrer({ quotaInscriptionOctets: o, maxComptesInscrits: n }) && reglages) {
      quotaInscrit = formaterOctets(reglages.quotaInscriptionOctets);
      maxInscrits = String(reglages.maxComptesInscrits);
    }
    envoiInscription = false;
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
  <Carte titre="Inscriptions libres">
    <div class="bloc" data-test="reglages-inscription">
      <Interrupteur
        coche={reglages.inscriptionsOuvertes} libelle="Inscriptions libres"
        aide="N'importe qui peut créer un compte sur la page d'inscription, sans invitation."
        surChangement={(v) => enregistrer({ inscriptionsOuvertes: v })}
      />
      <Interrupteur
        coche={reglages.torrentsInscrits} libelle="Torrents pour les inscrits"
        aide="Attention : chaque inscrit pourrait alors faire télécharger des torrents à ton serveur, avec sa bande passante, son disque et la responsabilité qui va avec. Laisse fermé si tu ne connais pas tes inscrits."
        surChangement={(v) => enregistrer({ torrentsInscrits: v })}
      />
      <form onsubmit={enregistrerInscription}>
        <Champ libelle="Quota d'un compte inscrit" bind:value={quotaInscrit} aide="Espace donné à chaque nouvel inscrit, par exemple 20 Go." erreur={erreurQuotaInscrit} data-test="quota-inscrit" />
        <Champ libelle="Nombre maximal de comptes inscrits" bind:value={maxInscrits} inputmode="numeric" aide="Au-delà, la page d'inscription annonce que les inscriptions sont complètes." erreur={erreurMax} data-test="max-inscrits" />
        <Bouton type="submit" chargement={envoiInscription}>Enregistrer</Bouton>
      </form>
    </div>
  </Carte>
{/if}

<style>
  .bloc { display: grid; gap: var(--espace-4, 1rem); }
  form { display: grid; gap: var(--espace-3); }
  .bascule { display: flex; gap: var(--espace-3); align-items: flex-start; }
</style>
