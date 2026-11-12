<script lang="ts">
  import { tick } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Send from '@lucide/svelte/icons/send';
  import { LIMITES_WS } from '@canape/partage';
  import type { Salle } from './salle.svelte.ts';

  let { salle, cote }: { salle: Salle; cote: 'gauche' | 'droite' } = $props();
  let texte = $state('');
  let liste: HTMLElement | undefined = $state();

  $effect(() => {
    void salle.lignes.length;
    void tick().then(() => { if (liste) liste.scrollTop = liste.scrollHeight; });
  });

  function envoyer(): void {
    if (salle.envoyerMessage(texte)) texte = '';
  }
  function touche(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      envoyer();
    } else if (e.key === 'Escape') {
      salle.ouvrirChat(false);
    }
  }
  const heure = (t: number): string => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
</script>

<aside class="chat {cote}" aria-label="Discussion" data-test="chat">
  <header>
    <h2>Discussion</h2>
    <button type="button" class="x" aria-label="Fermer la discussion" onclick={() => salle.ouvrirChat(false)}><X size={18} /></button>
  </header>
  <div class="liste" role="log" aria-live="polite" bind:this={liste}>
    {#each salle.lignes as l, i (l.cle)}
      {#if l.genre === 'systeme'}
        <p class="systeme">{l.texte}</p>
      {:else}
        {@const precedent = salle.lignes[i - 1]}
        {#if !l.soi && !(precedent && precedent.genre === 'message' && precedent.utilisateurId === l.utilisateurId)}
          <span class="auteur">{l.prenom ?? 'Quelqu’un'}</span>
        {/if}
        <p class="bulle" class:soi={l.soi} title={heure(l.heure)} data-test="message">{l.texte}</p>
      {/if}
    {/each}
  </div>
  <form onsubmit={(e) => { e.preventDefault(); envoyer(); }}>
    <textarea rows="1" bind:value={texte} onkeydown={touche} maxlength={LIMITES_WS.texteMessageMax} placeholder="Écris un message" aria-label="Message" data-test="saisie-chat"></textarea>
    {#if texte.length > 450}<span class="compteur">{texte.length}/{LIMITES_WS.texteMessageMax}</span>{/if}
    <button type="submit" aria-label="Envoyer" disabled={!texte.trim()}><Send size={18} /></button>
  </form>
</aside>

<style>
  .chat { position: absolute; z-index: 6; bottom: 120px; top: 70px; width: 300px; display: flex; flex-direction: column; border-radius: var(--r-xl, 28px); background: var(--fond-verre); backdrop-filter: var(--flou-verre); -webkit-backdrop-filter: var(--flou-verre); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: var(--ombre-4); color: var(--texte, #f7f3ee); overflow: hidden; }
  .chat.gauche { left: 16px; }
  .chat.droite { right: 16px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px 6px; }
  h2 { font: 700 1.0625rem / 1.3 var(--texte-police); letter-spacing: -0.01em; margin: 0; }
  .x { background: none; border: 0; color: var(--doux); display: grid; place-items: center; width: 44px; height: 44px; margin: -8px -8px -8px 0; border-radius: 50%; }
  .x:hover { background: rgba(255, 255, 255, 0.08); color: var(--texte); }
  .liste { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
  .auteur { font-size: 12px; font-weight: 600; color: var(--rose, #ff8fb4); margin-top: 6px; }
  .bulle { margin: 0; padding: 8px 13px; background: var(--s3); border-radius: 6px 18px 18px 18px; max-width: 85%; align-self: flex-start; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 0.92rem; }
  .bulle.soi { align-self: flex-end; background: var(--lampe-fond, rgba(255, 179, 71, 0.14)); border-radius: 18px 6px 18px 18px; border: 1px solid rgba(255, 179, 71, 0.25); }
  .systeme { margin: 6px 0; text-align: center; color: var(--discret, #9f99ad); font-size: 13px; }
  form { position: relative; display: flex; gap: 6px; padding: 8px 10px 12px; align-items: flex-end; }
  textarea { flex: 1; resize: none; background: var(--s2, #1d1b26); border: 1px solid var(--bord-champ, #7d7790); border-radius: 22px; padding: 11px 16px; color: inherit; max-height: 96px; }
  textarea:focus { outline: 3px solid var(--lampe-vive); outline-offset: 1px; border-color: var(--lampe); }
  form button { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--lampe, #ffb347); color: var(--lampe-sur, #1a1006); display: grid; place-items: center; }
  form button:disabled { opacity: 0.4; }
  .compteur { position: absolute; right: 56px; top: -4px; font-size: 11px; color: var(--alerte, #ffd166); }
  @media (max-width: 1024px) {
    .chat { top: auto; left: 0; right: 0; bottom: 0; width: auto; height: 55%; border-radius: var(--r-xl, 28px) var(--r-xl, 28px) 0 0; }
  }
  @media (max-height: 520px) and (orientation: landscape) {
    .chat { top: 0; bottom: 0; left: auto; right: 0; width: 280px; height: auto; border-radius: 0; }
  }
</style>
