<script lang="ts">
  import SelecteurTheme from '$lib/interface/SelecteurTheme.svelte';
  import { COULEURS_AVATAR, type Compte } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { aideMotDePasse, formaterOctets, pourcentage } from '$lib/comptes/format.ts';
  import { session } from '$lib/comptes/session.svelte.ts';
  import NotificationsAppareil from '$lib/notifications/NotificationsAppareil.svelte';
  import { Avatar, BarreProgression, Bouton, Carte, Champ, Chargement, toast } from '$lib/ui/index.ts';

  let compte = $state<Compte | null>(null);
  let prenom = $state('');
  let actuel = $state('');
  let nouveau = $state('');
  let erreurProfil = $state<string | null>(null);
  let erreurMdp = $state<string | null>(null);
  let envoiProfil = $state(false);
  let envoiMdp = $state(false);

  $effect(() => {
    session.charger().then(async () => {
      if (!session.utilisateur) { return; }
      compte = await api.get<Compte>('/api/compte');
      prenom = compte.prenom;
    }, () => undefined);
  });

  const aide = $derived(nouveau ? aideMotDePasse(nouveau) : null);

  async function enregistrerProfil(corps: { prenom?: string; couleur?: string }): Promise<void> {
    erreurProfil = null;
    envoiProfil = true;
    try {
      compte = await api.patch<Compte>('/api/compte', corps);
      session.remplacer(compte);
      toast.ok('Enregistré.');
    } catch (x) {
      erreurProfil = x instanceof ErreurApi ? x.message : 'Impossible d’enregistrer.';
    } finally { envoiProfil = false; }
  }

  async function changerMotDePasse(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    erreurMdp = null;
    envoiMdp = true;
    try {
      await api.patch('/api/compte', { motDePasse: { actuel, nouveau } });
      actuel = ''; nouveau = '';
      toast.ok('Mot de passe changé. Tes autres appareils sont déconnectés.');
    } catch (x) {
      erreurMdp = x instanceof ErreurApi ? x.message : 'Impossible de changer le mot de passe.';
    } finally { envoiMdp = false; }
  }
</script>

<svelte:head><title>Mon compte · Canapé</title></svelte:head>

<main>
  <p class="retour"><a href="/">← Retour</a></p>
  <h1>Mon compte</h1>
  {#if !session.charge || (session.utilisateur && !compte)}
    <Chargement />
  {:else if !compte}
    <Carte titre="Connecte-toi pour voir ton compte."><Bouton href="/connexion?retour=/compte">Se connecter</Bouton></Carte>
  {:else}
    <Carte titre="Profil">
      <form onsubmit={(e) => { e.preventDefault(); void enregistrerProfil({ prenom: prenom.trim() }); }}>
        <div class="ident"><Avatar prenom={compte.prenom} couleur={compte.couleur} taille={56} /><p>{compte.identifiant}<br /><span class="doux">{compte.role === 'admin' ? 'Administrateur' : 'Spectateur'}</span></p></div>
        <Champ libelle="Prénom" bind:value={prenom} required maxlength={40} erreur={erreurProfil} />
        <fieldset>
          <legend>Ta couleur</legend>
          <div class="couleurs">
            {#each COULEURS_AVATAR as c (c)}
              <button type="button" class="couleur" class:choisie={c === compte.couleur} aria-label={`Couleur ${c}`} aria-pressed={c === compte.couleur} onclick={() => enregistrerProfil({ couleur: c })}>
                <Avatar prenom={compte.prenom} couleur={c} taille={36} />
              </button>
            {/each}
          </div>
        </fieldset>
        <Bouton type="submit" variante="secondaire" chargement={envoiProfil} disabled={!prenom.trim() || prenom.trim() === compte.prenom}>Enregistrer le prénom</Bouton>
      </form>
    </Carte>

    <Carte titre="Mot de passe">
      <form onsubmit={changerMotDePasse}>
        <Champ libelle="Mot de passe actuel" bind:value={actuel} type="password" autocomplete="current-password" required erreur={erreurMdp} />
        <Champ libelle="Nouveau mot de passe" bind:value={nouveau} type="password" autocomplete="new-password" required erreur={aide} aide="10 caractères au minimum, sans autre règle." />
        <Bouton type="submit" chargement={envoiMdp} disabled={!actuel || !nouveau || aide !== null}>Changer le mot de passe</Bouton>
      </form>
    </Carte>

    <NotificationsAppareil />

    <Carte titre="Apparence">
      <p class="doux">Clair par défaut. Le thème sombre est plus reposant le soir ; « Comme mon appareil » suit ses réglages.</p>
      <SelecteurTheme />
    </Carte>

    <Carte titre="Mon espace">
      {#if compte.quotaOctets === null}
        <p>{formaterOctets(compte.octetsUtilises)} utilisés, sans limite.</p>
      {:else}
        <BarreProgression valeur={compte.quotaOctets > 0 ? compte.octetsUtilises / compte.quotaOctets : 1} libelle="Espace utilisé" />
        <p>{formaterOctets(compte.octetsUtilises)} sur {formaterOctets(compte.quotaOctets)} ({pourcentage(compte.octetsUtilises, compte.quotaOctets)} %).</p>
      {/if}
      {#if !compte.peutTeleverser}<p class="doux">Tu ne peux pas ajouter de films pour le moment.</p>{/if}
    </Carte>

    <Bouton variante="discret" icone="deconnexion" onclick={() => session.deconnexion()}>Se déconnecter</Bouton>
  {/if}
</main>

<style>
  main { max-width: 640px; margin: 0 auto; display: grid; gap: var(--e-5); }
  h1 { font: 400 clamp(2.25rem, 5vw, 3rem) / 1.02 var(--titre); letter-spacing: -0.01em; }
  form { display: grid; gap: var(--e-4); }
  .ident { display: flex; align-items: center; gap: var(--e-4); padding: var(--e-4); border-radius: var(--r-m); background: var(--s2); }
  .ident p { margin: 0; font-weight: 650; }
  .doux { color: var(--doux); font-weight: 500; }
  .retour { margin: 0; }
  .retour a { display: inline-flex; align-items: center; min-height: 44px; color: var(--doux); text-decoration: none; font-weight: 600; }
  .retour a:hover { color: var(--texte); }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--e-2); }
  legend { color: var(--doux); font-size: 14px; font-weight: 600; padding: 0; margin-bottom: var(--e-2); }
  .couleurs { display: flex; flex-wrap: wrap; gap: var(--e-2); }
  .couleur { background: none; border: 2px solid transparent; border-radius: 50%; padding: 3px; cursor: pointer; min-width: 44px; min-height: 44px; display: grid; place-items: center; }
  .couleur.choisie { border-color: var(--texte); }
</style>
