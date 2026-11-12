<script lang="ts">
  import { goto } from '$app/navigation';
  import { COULEURS_AVATAR, MOT_DE_PASSE_MIN_INSCRIPTION, type CorpsInscription, type EtatInscription, type Utilisateur } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { jaugeMotDePasse } from '$lib/comptes/format.ts';
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Avatar, BarreProgression, Bouton, Carte, Champ, Chargement, EtatVide, Logo } from '$lib/ui/index.ts';

  /** Le serveur refuse un formulaire envoyé moins de 3 s après le jeton : on patiente à sa place. */
  const DELAI_MIN_MS = 3200;

  let etat = $state<EtatInscription | null>(null);
  let echec = $state<string | null>(null);
  let recuLe = 0;
  let prenom = $state('');
  let identifiant = $state('');
  let motDePasse = $state('');
  let confirmation = $state('');
  let couleur: string = $state(COULEURS_AVATAR[Math.floor(Math.random() * COULEURS_AVATAR.length)] as string);
  let accepte = $state(false);
  let piege = $state('');
  let envoi = $state(false);
  let general = $state<string | null>(null);
  let erreurs = $state<{ prenom?: string; identifiant?: string; motDePasse?: string; regles?: string }>({});

  async function chargerEtat(): Promise<void> {
    try {
      etat = await api.get<EtatInscription>('/api/inscription');
      recuLe = Date.now();
    } catch (e) {
      echec = e instanceof ErreurApi ? e.message : 'Impossible de joindre Canapé. Réessaie dans un instant.';
    }
  }

  $effect(() => {
    void session.charger().then(() => {
      if (session.utilisateur) void goto('/', { replaceState: true });
    }, () => undefined);
    void chargerEtat();
  });

  const manque = $derived(Math.max(0, MOT_DE_PASSE_MIN_INSCRIPTION - [...motDePasse].length));
  const aideMdp = $derived(motDePasse && manque > 0 ? `Encore ${manque} caractère${manque > 1 ? 's' : ''}.` : null);
  const aideConfirmation = $derived(confirmation && confirmation !== motDePasse ? 'Les deux mots de passe sont différents.' : null);
  const pret = $derived(
    Boolean(prenom.trim() && identifiant.trim() && motDePasse && manque === 0 && confirmation === motDePasse && accepte && etat?.jeton),
  );

  function classer(message: string): void {
    if (/mot de passe/i.test(message)) erreurs = { motDePasse: message };
    else if (/pr[ée]nom/i.test(message)) erreurs = { prenom: message };
    else if (/identifiant/i.test(message)) erreurs = { identifiant: message };
    else if (/r[èe]gles/i.test(message)) erreurs = { regles: message };
    else general = message;
  }

  async function envoyer(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!pret || !etat?.jeton) return;
    general = null;
    erreurs = {};
    envoi = true;
    try {
      const attente = DELAI_MIN_MS - (Date.now() - recuLe);
      if (attente > 0) await new Promise((r) => setTimeout(r, attente));
      const corps: CorpsInscription = {
        prenom: prenom.trim(), identifiant: identifiant.trim(), motDePasse, couleur, accepteRegles: true, jeton: etat.jeton, site: piege,
      };
      const u = await api.post<Utilisateur>('/api/inscription', corps);
      session.remplacer(u);
      await session.charger(true);
      await goto('/', { replaceState: true });
    } catch (x) {
      if (!(x instanceof ErreurApi)) { general = 'Quelque chose a coincé. Réessaie dans un instant.'; return; }
      if (x.statut === 409) erreurs = { identifiant: 'Cet identifiant est déjà pris. Essaie-en un autre.' };
      else if (x.statut === 403) { etat = { ouverte: false, raison: x.message, jeton: null }; }
      else if (x.statut === 429) general = 'Trop d’inscriptions depuis cette connexion. Réessaie un peu plus tard.';
      else if (x.statut === 400 && /expir/i.test(x.message)) {
        general = 'Le formulaire a expiré. Il est renouvelé : valide à nouveau.';
        await chargerEtat();
      } else if (x.statut === 400 && /rapide/i.test(x.message)) {
        general = x.message;
        await chargerEtat();
      } else classer(x.message);
    } finally {
      envoi = false;
    }
  }
</script>

<svelte:head><title>Créer un compte · Canapé</title></svelte:head>

<main data-test="page-inscription">
  <a class="marque" href="/connexion" aria-label="Canapé"><Logo taille={44} mot /></a>
  {#if echec}
    <EtatVide titre="Impossible de joindre Canapé." texte={echec} icone="alerte">
      {#snippet actions()}<Bouton variante="secondaire" href="/connexion">Aller à la connexion</Bouton>{/snippet}
    </EtatVide>
  {:else if !etat}
    <Chargement />
  {:else if !etat.ouverte}
    <div data-test="inscriptions-fermees">
      <EtatVide titre="Les inscriptions sont fermées." texte={etat.raison ?? 'Les inscriptions sont fermées pour le moment.'} icone="info">
        {#snippet actions()}<Bouton variante="secondaire" href="/connexion" data-test="retour-connexion">Aller à la connexion</Bouton>{/snippet}
      </EtatVide>
    </div>
  {:else}
    <Carte titre="Crée ton compte.">
      <form onsubmit={envoyer} novalidate>
        <Champ libelle="Prénom" bind:value={prenom} autocomplete="given-name" required maxlength={40} erreur={erreurs.prenom} data-test="champ-prenom" />
        <Champ
          libelle="Identifiant" bind:value={identifiant} autocomplete="username" required minlength={3} maxlength={64}
          autocapitalize="none" spellcheck={false} erreur={erreurs.identifiant} data-test="champ-identifiant"
          aide="3 à 32 caractères : lettres, chiffres, point, tiret, souligné, ou ton adresse e-mail."
        />
        <Champ
          libelle="Mot de passe" bind:value={motDePasse} type="password" autocomplete="new-password" required minlength={MOT_DE_PASSE_MIN_INSCRIPTION}
          erreur={erreurs.motDePasse ?? aideMdp} data-test="champ-mot-de-passe"
        />
        <BarreProgression valeur={jaugeMotDePasse(motDePasse)} libelle={`Longueur du mot de passe (au moins ${MOT_DE_PASSE_MIN_INSCRIPTION} caractères)`} />
        <Champ libelle="Mot de passe, encore une fois" bind:value={confirmation} type="password" autocomplete="new-password" required erreur={aideConfirmation} data-test="champ-confirmation" />
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
        <!-- Champ piège : invisible pour les humains, les robots le remplissent. -->
        <div class="piege" aria-hidden="true">
          <label>Ne remplis pas ce champ<input type="text" name="site" bind:value={piege} tabindex="-1" autocomplete="off" data-test="champ-piege" /></label>
        </div>
        <div class="regles">
          <label class="case">
            <input type="checkbox" bind:checked={accepte} data-test="case-regles" aria-invalid={erreurs.regles ? 'true' : undefined} />
            <span>J'accepte les <a href="/regles" target="_blank" rel="noopener">règles d'usage</a></span>
          </label>
          {#if erreurs.regles}<p class="erreur" role="alert">{erreurs.regles}</p>{/if}
        </div>
        {#if general}<p class="erreur" role="alert" data-test="erreur-inscription">{general}</p>{/if}
        <Bouton type="submit" chargement={envoi} disabled={!pret} data-test="creer-compte">Créer mon compte</Bouton>
      </form>
      <p class="aide">Déjà un compte ? <a href="/connexion">Se connecter</a></p>
    </Carte>
  {/if}
</main>

<style>
  main {
    min-height: 100%; display: grid; place-content: center; justify-items: center; gap: var(--e-5); padding: var(--e-7) var(--e-4);
    background: radial-gradient(700px 420px at 50% 12%, rgba(255, 255, 255, 0.18), transparent 70%), var(--hero-degrade);
  }
  .marque { text-decoration: none; --texte: #fff; --logo-1: #bfdbfe; --logo-2: #fbcfe8; --logo-assise: #fff; }
  main :global(.carte) { width: min(460px, calc(100vw - 2 * var(--e-4))); box-shadow: var(--ombre-3); border-radius: var(--r-xl); padding: var(--e-7); }
  main :global(.carte h2) { font: 400 clamp(1.9rem, 5vw, 2.4rem) / 1.08 var(--titre); letter-spacing: -0.01em; }
  form { display: grid; gap: var(--e-4); }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: var(--e-2); }
  legend { color: var(--doux); font-size: 14px; font-weight: 600; padding: 0; margin-bottom: var(--e-2); }
  .couleurs { display: flex; flex-wrap: wrap; gap: var(--e-2); }
  .couleur { background: none; border: 2px solid transparent; border-radius: 50%; padding: 3px; cursor: pointer; min-width: 44px; min-height: 44px; display: grid; place-items: center; }
  .couleur.choisie { border-color: var(--texte); }
  .piege { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
  .case { display: flex; gap: var(--e-3); align-items: center; min-height: 44px; cursor: pointer; }
  .case input { width: 20px; height: 20px; accent-color: var(--lampe); }
  .case a, .aide a { color: var(--lampe); font-weight: 600; }
  .erreur { margin: 0; color: var(--mal, #b42318); font-size: 0.9rem; }
  .aide { margin: var(--e-4) 0 0; color: var(--doux); font-size: 0.9rem; }
</style>
