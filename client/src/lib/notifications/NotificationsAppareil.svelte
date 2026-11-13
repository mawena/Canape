<script lang="ts">
  /**
   * Section « Notifications sur cet appareil » du compte. L'accord se donne appareil par appareil :
   * rien n'est demandé au navigateur avant le clic sur l'interrupteur.
   */
  import { onMount } from 'svelte';
  import { ErreurApi } from '$lib/api/client.ts';
  import { Badge, Bouton, Carte, Interrupteur, toast } from '$lib/ui/index.ts';
  import { activer, desactiver, essayer, etatNotifications, lireEnvironnement, type EtatNotifications } from './push.ts';

  let etat = $state<EtatNotifications>('chargement');
  let coche = $state(false);
  let occupe = $state(false);
  let essai = $state(false);
  let erreur = $state<string | null>(null);

  async function relire(): Promise<void> {
    etat = etatNotifications(await lireEnvironnement());
    coche = etat === 'actif';
  }

  onMount(() => { void relire(); });

  async function changer(veut: boolean): Promise<void> {
    erreur = null;
    occupe = true;
    try {
      if (veut) {
        etat = await activer();
        coche = etat === 'actif';
        if (etat === 'actif') toast.ok('Notifications activées sur cet appareil.');
      } else {
        await desactiver();
        etat = 'inactif';
        coche = false;
        toast.ok('Notifications coupées sur cet appareil.');
      }
    } catch (x) {
      erreur = x instanceof ErreurApi || x instanceof Error ? x.message : 'Impossible de changer le réglage.';
      await relire();
    } finally { occupe = false; }
  }

  async function envoyerEssai(): Promise<void> {
    erreur = null;
    essai = true;
    try {
      const r = await essayer();
      if (r.envoyes > 0) toast.ok('Essai envoyé : la notification arrive dans un instant.');
      else erreur = 'Le service de notifications de ton navigateur n’a pas répondu. Réessaie dans un moment.';
      if (r.envoyes === 0) await relire();
    } catch (x) {
      erreur = x instanceof Error ? x.message : 'Impossible d’envoyer l’essai.';
    } finally { essai = false; }
  }

  const bloque = $derived(etat === 'non-pris-en-charge' || etat === 'iphone-a-installer' || etat === 'refuse' || etat === 'chargement');
</script>

<Carte titre="Notifications sur cet appareil" data-test="notifications-appareil" data-etat={etat}>
  <p class="doux">
    Reçois « Camille est dans la salle » quand quelqu’un entre dans l’une de tes séances alors que tu n’y es pas encore.
    La notification contient seulement le prénom, le titre de la séance et son adresse, et passe par le service de notifications de ton navigateur.
    Tu choisis pour chaque appareil, et tu peux couper à tout moment.
  </p>

  <Interrupteur bind:coche libelle="Me prévenir sur cet appareil" disabled={bloque || occupe} surChangement={(v) => { void changer(v); }} />

  <p class="etat" data-test="notifications-etat" role="status">
    {#if etat === 'chargement'}<span class="doux">Vérification de l’appareil…</span>
    {:else if etat === 'actif'}<Badge ton="ok" icone="verifier">Activées sur cet appareil</Badge>
    {:else if etat === 'inactif'}<Badge ton="neutre">Coupées sur cet appareil</Badge>
    {:else if etat === 'refuse'}<Badge ton="alerte" icone="alerte">Refusées dans le navigateur</Badge>
      <span class="doux">Autorise les notifications pour ce site dans les réglages du navigateur, puis recharge la page.</span>
    {:else if etat === 'iphone-a-installer'}<Badge ton="alerte" icone="info">Ajoute d’abord Canapé à l’écran d’accueil</Badge>
      <span class="doux">Sur iPhone et iPad, les notifications ne marchent que depuis l’application ajoutée à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »).</span>
    {:else}<Badge ton="alerte" icone="info">Non prises en charge ici</Badge>
      <span class="doux">Ce navigateur ne sait pas recevoir de notifications.</span>
    {/if}
  </p>

  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}

  {#snippet pied()}
    <Bouton variante="secondaire" chargement={essai} disabled={etat !== 'actif' || occupe} onclick={envoyerEssai} data-test="notifications-essai">Envoyer un essai</Bouton>
  {/snippet}
</Carte>

<style>
  .doux { color: var(--doux); font-weight: 500; margin: 0 0 var(--e-4); max-width: 62ch; }
  .etat { margin: var(--e-3) 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--e-2) var(--e-3); }
  .etat .doux { margin: 0; font-size: 14px; }
  .erreur { color: var(--mal); margin: var(--e-3) 0 0; }
</style>
