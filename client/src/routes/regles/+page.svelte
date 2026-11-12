<script lang="ts">
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Bouton, Carte, Logo } from '$lib/ui/index.ts';

  $effect(() => { void session.charger().catch(() => undefined); });
</script>

<svelte:head><title>Règles d'usage · Canapé</title></svelte:head>

<main data-test="page-regles">
  <a class="marque" href={session.utilisateur ? '/' : '/connexion'} aria-label="Canapé"><Logo taille={44} mot /></a>
  <Carte titre="Les règles d'usage.">
    <p class="intro">Canapé sert à regarder des films à plusieurs, chacun chez soi, au même instant. Quelques règles simples pour que ça reste agréable.</p>
    <ol>
      <li><strong>Un petit salon, pas une vidéothèque publique.</strong> Tu ajoutes des films pour les regarder avec des proches, pas pour les diffuser au monde entier.</li>
      <li><strong>Seulement ce que tu as le droit de montrer.</strong> N'ajoute pas de contenu dont tu n'as pas les droits ou l'autorisation.</li>
      <li><strong>Rien d'illégal.</strong> Pas de contenu qui enfreint la loi : pédopornographie, incitation à la haine ou à la violence, atteinte à la vie privée de quelqu'un.</li>
      <li><strong>Du respect pour les autres.</strong> Pas d'insultes ni de harcèlement dans le chat ou ailleurs. Chacun peut quitter une séance à tout moment.</li>
      <li><strong>Tes films sont privés par défaut.</strong> Personne d'autre ne les voit tant que tu ne les partages pas, avec quelqu'un en particulier ou avec tous les inscrits.</li>
      <li><strong>L'administrateur garde la main.</strong> Il peut retirer un film ou fermer un compte qui ne respecte pas ces règles, sans préavis.</li>
      <li><strong>Un espace limité.</strong> Chaque compte a un quota de stockage. Si tu es à l'étroit, supprime des films ou demande plus de place à l'administrateur.</li>
    </ol>
    <p class="fin">En créant un compte, tu acceptes ces règles.</p>
    <div class="actions">
      {#if session.utilisateur}
        <Bouton href="/">Retour à Canapé</Bouton>
      {:else if session.inscriptionOuverte}
        <Bouton href="/inscription">Créer un compte</Bouton>
        <Bouton href="/connexion" variante="discret">Se connecter</Bouton>
      {:else}
        <Bouton href="/connexion" variante="secondaire">Aller à la connexion</Bouton>
      {/if}
    </div>
  </Carte>
</main>

<style>
  main {
    min-height: 100%; display: grid; align-content: start; justify-items: center; gap: var(--e-5); padding: var(--e-7) var(--e-4);
    background: radial-gradient(700px 420px at 50% 12%, rgba(255, 255, 255, 0.18), transparent 70%), var(--hero-degrade);
  }
  .marque { text-decoration: none; --texte: #fff; --logo-1: #bfdbfe; --logo-2: #fbcfe8; --logo-assise: #fff; }
  main :global(.carte) { width: min(640px, calc(100vw - 2 * var(--e-4))); box-shadow: var(--ombre-3); border-radius: var(--r-xl); padding: var(--e-7); }
  main :global(.carte h2) { font: 400 clamp(1.9rem, 5vw, 2.4rem) / 1.08 var(--titre); letter-spacing: -0.01em; }
  .intro { color: var(--doux); margin: 0 0 var(--e-4); }
  ol { margin: 0; padding-left: 1.3em; display: grid; gap: var(--e-3); line-height: 1.5; }
  .fin { margin: var(--e-5) 0 0; font-weight: 600; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--e-3); margin-top: var(--e-5); }
</style>
