<script lang="ts">
  import { BarreProgression, Bouton, Icone } from '$lib/ui/index.ts';
  import { formaterDebit, formaterReste, formaterTaille, raccourcirNom } from './formats.ts';
  import { televersements, type Envoi } from './televersements.svelte.ts';

  const envois = $derived(televersements.envois);
  let selecteur: HTMLInputElement | undefined = $state();

  const pourcent = (e: Envoi) => (e.taille ? Math.round((e.octets / e.taille) * 100) : 0);

  function annuler(e: Envoi): void {
    if (pourcent(e) > 5 && !confirm(`Annuler l’envoi de « ${e.nom} » ? Ce qui a déjà été envoyé sera perdu.`)) return;
    televersements.annuler(e.id);
  }
  function choisir(): void {
    const f = selecteur?.files;
    if (f) televersements.ajouter(Array.from(f));
    if (selecteur) selecteur.value = '';
  }
</script>

{#if envois.length}
  <section class="panneau" aria-label="Envois en cours">
    <ul>
      {#each envois as e (e.id)}
        {@const p = pourcent(e)}
        <li class="envoi" class:erreur={e.etat === 'erreur'} class:fini={e.etat === 'termine'}>
          <div class="ligne">
            <span class="icone" aria-hidden="true">
              <Icone nom={e.etat === 'termine' ? 'verifier' : e.etat === 'erreur' ? 'alerte' : 'televerser'} />
            </span>
            <span class="nom" title={e.nom}>{raccourcirNom(e.nom)}</span>
            <span class="actions">
              {#if e.etat === 'envoi' || e.etat === 'reessai'}
                <Bouton variante="discret" taille="s" icone="pause" onclick={() => televersements.pause(e.id)} aria-label="Mettre en pause" />
              {/if}
              {#if e.etat === 'pause' || e.etat === 'erreur'}
                <Bouton variante="secondaire" taille="s" onclick={() => televersements.reprendre(e.id)}>Reprendre</Bouton>
              {/if}
              {#if e.etat === 'interrompu'}
                <Bouton variante="secondaire" taille="s" onclick={() => selecteur?.click()}>Choisir le fichier</Bouton>
              {/if}
              {#if e.etat === 'termine'}
                <Bouton variante="discret" taille="s" icone="fermer" onclick={() => televersements.annuler(e.id)} aria-label="Retirer de la liste" />
              {:else}
                <Bouton variante="discret" taille="s" icone="fermer" onclick={() => annuler(e)} aria-label="Annuler l’envoi" />
              {/if}
            </span>
          </div>
          {#if e.etat !== 'erreur' && e.etat !== 'interrompu'}
            <BarreProgression valeur={e.taille ? e.octets / e.taille : 0} libelle="Progression de l’envoi" />
          {/if}
          <p class="detail" aria-live={p % 25 === 0 ? 'polite' : 'off'}>
            {#if e.message}
              {e.message}
            {:else if e.etat === 'attente'}
              En attente de son tour…
            {:else}
              <span class="chiffres">{p} % · {formaterTaille(e.octets)} sur {formaterTaille(e.taille)}{#if e.debit} · {formaterDebit(e.debit)}{/if}{#if e.reste !== null} · {formaterReste(e.reste)}{/if}</span>
            {/if}
          </p>
        </li>
      {/each}
    </ul>
  </section>
{/if}
<input bind:this={selecteur} type="file" accept="video/*,.mkv,.mp4,.m4v,.mov,.avi,.webm,.ts,.m2ts" hidden onchange={choisir} />

<style>
  .panneau { background: var(--s1, #15141c); border: 1px solid var(--bord, #2f2c3b); border-radius: 14px; padding: 8px 14px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  .envoi { display: grid; gap: 8px; padding: 12px 0; }
  .envoi + .envoi { border-top: 1px solid var(--bord, #2f2c3b); }
  .ligne { display: flex; align-items: center; gap: 10px; }
  .icone { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: var(--s2, #1d1b26); color: var(--lampe, #ffb347); }
  .fini .icone { color: var(--ok, #5fdcae); }
  .erreur .icone { color: var(--mal, #ff7b6e); }
  .erreur { outline: 1px solid rgba(255, 123, 110, 0.6); outline-offset: 4px; border-radius: 10px; }
  .nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; gap: 4px; }
  .detail { margin: 0; font-size: 0.875rem; color: var(--doux, #c0bacb); }
  .chiffres { font-variant-numeric: tabular-nums; }
  .erreur .detail { color: var(--mal, #ff7b6e); }
</style>
