<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ErreurApi } from '$lib/api/client.ts';
  import { retourSur } from '$lib/comptes/format.ts';
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Bouton, Carte, Champ, Chargement, Logo } from '$lib/ui/index.ts';

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
  <a class="marque" href="/" aria-label="Canapé"><Logo taille={44} mot /></a>
  <h1>Le même film, au même instant, chacun chez soi.</h1>
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
  main {
    min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--e-5); padding: var(--e-7) var(--e-4); text-align: center;
    background: radial-gradient(700px 420px at 50% 18%, rgba(255, 179, 71, 0.13), transparent 70%);
  }
  .marque { text-decoration: none; margin-bottom: var(--e-2); }
  h1 { font: 400 clamp(2.1rem, 6vw, 3.25rem) / 1.04 var(--titre); letter-spacing: -0.01em; max-width: 16ch; text-wrap: balance; margin-bottom: var(--e-3); }
  main :global(.carte) { width: min(420px, calc(100vw - 2 * var(--e-4))); text-align: left; box-shadow: var(--ombre-3); border-radius: var(--r-xl); padding: var(--e-7); }
  form { display: grid; gap: var(--e-4); }
  .voir { color: var(--doux); font-size: 0.9rem; display: flex; gap: var(--e-2); align-items: center; min-height: 32px; }
  .voir input { width: 18px; height: 18px; accent-color: var(--lampe); }
  .aide { margin: 0; color: var(--doux); font-size: 0.9rem; }
</style>
