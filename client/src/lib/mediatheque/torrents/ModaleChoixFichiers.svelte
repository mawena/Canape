<script lang="ts">
  /**
   * <ModaleChoixFichiers bind:ouverte telechargement={t} />
   * Liste des fichiers d'un torrent : vidéos et sous-titres cochables (au moins une vidéo), total choisi.
   * Chaque vidéo choisie devient un film dans la galerie ; ses sous-titres lui sont ajoutés.
   */
  import type { Telechargement } from '@canape/partage';
  import { Bouton, Icone, Modale, toast } from '$lib/ui/index.ts';
  import { formaterTaille } from '../formats.ts';
  import { choixValide, fichierChoisissable, totalChoisi } from './logique.ts';
  import { telechargements } from './telechargements.svelte.ts';

  interface Props { ouverte: boolean; telechargement: Telechargement | null }
  let { ouverte = $bindable(), telechargement }: Props = $props();

  let choix: Set<number> = $state(new Set());
  let envoi = $state(false);
  let erreur: string | null = $state(null);
  let etaitOuverte = false;

  $effect(() => {
    if (ouverte && !etaitOuverte && telechargement) {
      choix = new Set(telechargement.fichiers.filter((f) => f.choisi).map((f) => f.index));
      erreur = null; envoi = false;
    }
    etaitOuverte = ouverte;
  });

  const fichiers = $derived(telechargement?.fichiers ?? []);
  const total = $derived(totalChoisi(fichiers, choix));
  const valide = $derived(choixValide(fichiers, choix));

  function basculer(index: number): void {
    const s = new Set(choix);
    if (s.has(index)) s.delete(index); else s.add(index);
    choix = s;
  }

  async function valider(): Promise<void> {
    if (!telechargement || !valide) return;
    envoi = true; erreur = null;
    try {
      await telechargements.choisirFichiers(telechargement.id, [...choix].sort((a, b) => a - b));
      ouverte = false;
      toast.ok('Ton choix est enregistré.');
    } catch (e) { erreur = e instanceof Error ? e.message : 'Le choix n’a pas pu être enregistré.'; }
    finally { envoi = false; }
  }
</script>

<Modale bind:ouverte titre="Choisir les fichiers" large>
  {#if fichiers.length === 0}
    <p class="t-petit">Les informations du torrent ne sont pas encore arrivées.</p>
  {:else}
    <p class="intro">Chaque vidéo cochée devient un film dans ta galerie ; les sous-titres sont ajoutés au film de leur dossier.</p>
    <ul data-test="liste-fichiers">
      {#each fichiers as f (f.index)}
        {@const possible = fichierChoisissable(f)}
        <li class:inactif={!possible}>
          <label>
            <input type="checkbox" checked={choix.has(f.index)} disabled={!possible} onchange={() => basculer(f.index)} />
            <span class="icone" aria-hidden="true"><Icone nom={f.video ? 'film' : f.sousTitres ? 'sous-titres' : 'disque'} taille={18} /></span>
            <span class="chemin" title={f.chemin}>{f.chemin}</span>
            <span class="taille tn">{formaterTaille(f.taille)}</span>
            <span class="vh">{f.video ? 'Vidéo' : f.sousTitres ? 'Sous-titres' : 'Autre fichier, non téléchargé'}</span>
          </label>
        </li>
      {/each}
    </ul>
    <p class="total" aria-live="polite">
      <strong class="tn">{formaterTaille(total)}</strong> à télécharger
      {#if !valide}<span class="alerte" role="alert"> · Coche au moins une vidéo.</span>{/if}
    </p>
    {#if erreur}<p class="alerte" role="alert">{erreur}</p>{/if}
  {/if}
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => (ouverte = false)}>Annuler</Bouton>
    <Bouton chargement={envoi} disabled={!valide} onclick={valider}>Enregistrer</Bouton>
  {/snippet}
</Modale>

<style>
  .intro { margin: 0 0 var(--e-3); color: var(--doux); }
  ul { list-style: none; margin: 0; padding: 0; max-height: min(46vh, 380px); overflow-y: auto; border: 1px solid var(--bord); border-radius: var(--r-m); }
  li + li { border-top: 1px solid var(--bord); }
  label { display: flex; align-items: center; gap: var(--e-3); min-height: 44px; padding: 6px var(--e-3); cursor: pointer; }
  li.inactif label { cursor: default; opacity: 0.55; }
  input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--lampe); flex: none; }
  .icone { color: var(--lampe); display: grid; flex: none; }
  .chemin { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .taille { color: var(--doux); font-size: 0.875rem; flex: none; }
  .total { margin: var(--e-3) 0 0; color: var(--doux); }
  .total strong { color: var(--texte); }
  .alerte { color: var(--mal); }
</style>
