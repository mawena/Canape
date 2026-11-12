<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ErreurApi } from '$lib/api/client.ts';
  import { retourSur } from '$lib/comptes/format.ts';
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Bouton, Carte, Champ, Chargement } from '$lib/ui/index.ts';

  let identifiant = $state('');
  let motDePasse = $state('');
  let voir = $state(false);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let prete = $state(false);

  const retour = $derived(retourSur(page.url.searchParams.get('retour')));

  $effect(() => {
    session.charger().then(() => {
      if (session.utilisateur) void goto(retour, { replaceState: true });
      else prete = true;
    }, () => { prete = true; });
  });

  async function envoyer(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    erreur = null;
    envoi = true;
    try {
      await session.connexion(identifiant.trim(), motDePasse);
      await goto(retour, { replaceState: true });
    } catch (x) {
      erreur = x instanceof ErreurApi ? x.message : 'Quelque chose a coincé. Réessaie dans un instant.';
    } finally {
      envoi = false;
    }
  }
</script>

<svelte:head><title>Connexion · Canapé</title></svelte:head>

<main>
  <h1>Canapé</h1>
  <p class="accroche">Le même film, au même instant, chacun chez soi.</p>
  {#if !prete}
    <Chargement />
  {:else if session.installationRequise}
    <Carte titre="Bienvenue chez toi.">
      <p>Aucun compte n'existe encore. Ouvre le lien d'invitation affiché dans le journal du serveur (ou créé avec <code>canape admin inviter --role admin</code>) pour créer le compte administrateur.</p>
    </Carte>
  {:else}
    <Carte titre="Se connecter">
      <form onsubmit={envoyer}>
        <Champ libelle="Identifiant" bind:value={identifiant} autocomplete="username" required autocapitalize="none" spellcheck={false} />
        <Champ libelle="Mot de passe" bind:value={motDePasse} type={voir ? 'text' : 'password'} autocomplete="current-password" required erreur={erreur} />
        <label class="voir"><input type="checkbox" bind:checked={voir} /> Afficher le mot de passe</label>
        <Bouton type="submit" chargement={envoi} disabled={!identifiant || !motDePasse}>Se connecter</Bouton>
      </form>
      <p class="aide">Pas de compte ? Il faut une invitation.</p>
    </Carte>
  {/if}
</main>

<style>
  main { min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--espace-3); padding: var(--espace-5) var(--espace-4); }
  h1 { color: var(--or); text-align: center; }
  .accroche { color: var(--doux); font-family: var(--titre); font-style: italic; margin: 0 0 var(--espace-3); text-align: center; }
  main :global(.carte) { width: min(400px, calc(100vw - 2 * var(--espace-4))); }
  form { display: grid; gap: var(--espace-3); }
  .voir { color: var(--doux); font-size: 0.9rem; display: flex; gap: var(--espace-2); align-items: center; }
  .aide { margin: 0; color: var(--doux); font-size: 0.9rem; }
</style>
