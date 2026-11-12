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
  .chat { position: absolute; z-index: 6; bottom: 120px; top: 70px; width: 300px; display: flex; flex-direction: column; border-radius: 22px; background: rgba(28, 24, 36, 0.82); backdrop-filter: blur(16px); color: var(--texte, #f7f3ee); overflow: hidden; }
  .chat.gauche { left: 16px; }
  .chat.droite { right: 16px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px 4px; }
  h2 { font: 400 1.25rem 'Instrument Serif', Georgia, serif; margin: 0; }
  .x { background: none; border: 0; color: var(--doux, #b9afc4); display: grid; padding: 4px; }
  .liste { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
  .auteur { font-size: 12px; font-weight: 600; color: var(--rose, #ff8fb4); margin-top: 6px; }
  .bulle { margin: 0; padding: 8px 12px; background: var(--s3, #312a3d); border-radius: 4px 16px 16px 16px; max-width: 85%; align-self: flex-start; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 0.92rem; }
  .bulle.soi { align-self: flex-end; background: var(--lampe-fond, rgba(255, 179, 71, 0.14)); border-radius: 16px 4px 16px 16px; }
  .systeme { margin: 6px 0; text-align: center; color: var(--discret, #9a90a7); font-size: 13px; }
  form { position: relative; display: flex; gap: 6px; padding: 8px 10px 12px; align-items: flex-end; }
  textarea { flex: 1; resize: none; background: var(--s2, #262031); border: 1px solid var(--bord-champ, #857a95); border-radius: 20px; padding: 9px 14px; color: inherit; max-height: 96px; }
  form button { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--lampe, #ffb347); color: var(--lampe-sur, #1a1006); display: grid; place-items: center; }
  form button:disabled { opacity: 0.4; }
  .compteur { position: absolute; right: 56px; top: -4px; font-size: 11px; color: var(--alerte, #ffd166); }
  @media (max-width: 1024px) {
    .chat { top: auto; left: 0; right: 0; bottom: 0; width: auto; height: 55%; border-radius: 22px 22px 0 0; }
  }
  @media (max-height: 520px) and (orientation: landscape) {
    .chat { top: 0; bottom: 0; left: auto; right: 0; width: 280px; height: auto; border-radius: 0; }
  }
</style>
