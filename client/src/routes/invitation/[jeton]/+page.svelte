<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { COULEURS_AVATAR, type InvitationPublique, type Utilisateur } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { aideMotDePasse, jaugeMotDePasse } from '$lib/comptes/format.ts';
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Avatar, BarreProgression, Bouton, Carte, Champ, Chargement, EtatVide } from '$lib/ui/index.ts';

  const jeton = $derived(page.params['jeton'] ?? '');
  let invitation = $state<InvitationPublique | null>(null);
  let echec = $state<string | null>(null);
  let prenom = $state('');
  let identifiant = $state('');
  let motDePasse = $state('');
  let couleur: string = $state(COULEURS_AVATAR[Math.floor(Math.random() * COULEURS_AVATAR.length)] as string);
  let erreur = $state<string | null>(null);
  let envoi = $state(false);
  let reinitialisee = $state(false);

  $effect(() => {
    const j = jeton;
    invitation = null;
    api.get<InvitationPublique>(`/api/invitations/${encodeURIComponent(j)}`).then(
      (i) => { invitation = i; if (i.prenomSuggere && !prenom) prenom = i.prenomSuggere; },
      (e: unknown) => { echec = e instanceof ErreurApi ? e.message : 'Impossible de lire cette invitation.'; },
    );
  });

  const aide = $derived(motDePasse ? aideMotDePasse(motDePasse) : null);
  const titre = $derived(
    invitation?.type === 'reinitialisation' ? 'Nouveau mot de passe'
      : invitation?.invitePar ? `${invitation.invitePar} t'invite sur Canapé.` : 'Bienvenue chez toi.',
  );

  async function envoyer(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!invitation) return;
    erreur = null;
    envoi = true;
    try {
      if (invitation.type === 'reinitialisation') {
        await api.post(`/api/invitations/${encodeURIComponent(jeton)}`, { motDePasse });
        reinitialisee = true;
      } else {
        const u = await api.post<Utilisateur>(`/api/invitations/${encodeURIComponent(jeton)}`, { prenom: prenom.trim(), identifiant: identifiant.trim(), motDePasse, couleur });
        session.remplacer(u);
        await session.charger(true);
        await goto('/', { replaceState: true });
      }
    } catch (x) {
      erreur = x instanceof ErreurApi ? x.message : 'Quelque chose a coincé. Réessaie dans un instant.';
    } finally {
      envoi = false;
    }
  }
</script>

<svelte:head><title>Invitation · Canapé</title></svelte:head>

<main>
  <h1>Canapé</h1>
  {#if echec}
    <EtatVide titre="Ce lien ne marche pas." texte={echec} />
  {:else if !invitation}
    <Chargement />
  {:else if !invitation.valide}
    <EtatVide titre="Ce lien a expiré." texte="Il a déjà servi, ou son délai est passé. Demande-en un nouveau à la personne qui t'a invité." icone="lien">
      {#snippet actions()}<Bouton href="/connexion" variante="secondaire">Aller à la connexion</Bouton>{/snippet}
    </EtatVide>
  {:else if reinitialisee}
    <Carte titre="C'est fait.">
      <p>Ton mot de passe est changé. Tu peux te connecter.</p>
      <Bouton href="/connexion">Se connecter</Bouton>
    </Carte>
  {:else}
    <Carte {titre}>
      <form onsubmit={envoyer}>
        {#if invitation.type === 'compte'}
          <Champ libelle="Prénom" bind:value={prenom} autocomplete="given-name" required maxlength={40} />
          <Champ libelle="Identifiant" bind:value={identifiant} autocomplete="username" required minlength={3} maxlength={64} autocapitalize="none" spellcheck={false} aide="Un pseudo ou une adresse e-mail, pour te connecter." />
        {/if}
        <Champ libelle={invitation.type === 'compte' ? 'Mot de passe' : 'Nouveau mot de passe'} bind:value={motDePasse} type="password" autocomplete="new-password" required minlength={10} erreur={aide ?? erreur} />
        <BarreProgression valeur={jaugeMotDePasse(motDePasse)} libelle="Longueur du mot de passe" />
        {#if invitation.type === 'compte'}
          <fieldset>
            <legend>Ta couleur</legend>
            <div class="couleurs">
              {#each COULEURS_AVATAR as c (c)}
                <button type="button" class="couleur" class:choisie={c === couleur} aria-label={`Couleur ${c}`} aria-pressed={c === couleur} onclick={() => { couleur = c; }}>
                  <Avatar prenom={prenom || '?'} couleur={c} taille={36} />
                </button>
              {/each}
            </div>
          </fieldset>
        {/if}
        <Bouton type="submit" chargement={envoi} disabled={!motDePasse || aide !== null || (invitation.type === 'compte' && (!prenom.trim() || !identifiant.trim()))}>
          {invitation.type === 'compte' ? 'Créer mon compte' : 'Enregistrer'}
        </Bouton>
      </form>
    </Carte>
  {/if}
</main>

<style>
  main { min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--espace-3); padding: var(--espace-5) var(--espace-4); }
  h1 { color: var(--or); text-align: center; }
  main :global(.carte) { width: min(420px, calc(100vw - 2 * var(--espace-4))); }
  form { display: grid; gap: var(--espace-3); }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--espace-2); }
  legend { color: var(--doux); font-size: 0.85rem; padding: 0; margin-bottom: var(--espace-2); }
  .couleurs { display: flex; flex-wrap: wrap; gap: var(--espace-2); }
  .couleur { background: none; border: 2px solid transparent; border-radius: 50%; padding: 2px; cursor: pointer; }
  .couleur.choisie { border-color: var(--creme, #fff); }
</style>
