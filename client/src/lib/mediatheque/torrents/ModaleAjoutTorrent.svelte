<script lang="ts">
  /**
   * <ModaleAjoutTorrent bind:ouverte fichierInitial={file} />
   * « Ajouter par torrent » : un lien magnet à coller, ou un fichier `.torrent` (≤ 1 Mo) à déposer ou choisir.
   * `fichierInitial` : un `.torrent` déjà déposé sur la galerie, présélectionné à l'ouverture.
   */
  import { Bouton, Champ, Icone, Modale, toast } from '$lib/ui/index.ts';
  import { formaterTaille } from '../formats.ts';
  import { erreurFichierTorrent, erreurMagnet } from './logique.ts';
  import { telechargements } from './telechargements.svelte.ts';

  interface Props { ouverte: boolean; fichierInitial?: File | null }
  let { ouverte = $bindable(), fichierInitial = null }: Props = $props();

  let magnet = $state('');
  let fichier: File | null = $state(null);
  let erreur: string | null = $state(null);
  let erreurFichier: string | null = $state(null);
  let envoi = $state(false);
  let survol = $state(false);
  let selecteur: HTMLInputElement | undefined = $state();

  // À chaque ouverture : on repart de zéro (avec le fichier déposé, s'il y en a un).
  let etaitOuverte = false;
  $effect(() => {
    if (ouverte && !etaitOuverte) {
      magnet = ''; erreur = null; erreurFichier = null; envoi = false; survol = false;
      fichier = null;
      if (fichierInitial) prendre(fichierInitial);
    }
    etaitOuverte = ouverte;
  });

  function prendre(f: File | null | undefined): void {
    if (!f) return;
    const e = erreurFichierTorrent(f.name, f.size);
    erreurFichier = e;
    fichier = e ? null : f;
    if (!e) { magnet = ''; erreur = null; }
  }

  function enMagnet(): void { erreur = null; if (magnet.trim()) { fichier = null; erreurFichier = null; } }

  async function envoyer(ev: Event): Promise<void> {
    ev.preventDefault();
    if (envoi) return;
    erreur = null;
    if (!fichier) {
      const e = erreurMagnet(magnet);
      if (e) { erreur = e; return; }
    }
    envoi = true;
    try {
      const t = await telechargements.ajouter(fichier ? { fichier } : { magnet });
      ouverte = false;
      toast.ok(t.nom ? `« ${t.nom} » est en route.` : 'C’est parti : on récupère les informations du torrent.');
    } catch (e) {
      erreur = e instanceof Error ? e.message : 'L’ajout a échoué.';
    } finally { envoi = false; }
  }

  function depose(e: DragEvent): void {
    e.preventDefault(); e.stopPropagation(); survol = false;
    prendre(e.dataTransfer?.files[0]);
  }
</script>

<Modale bind:ouverte titre="Ajouter par torrent">
  <form id="form-torrent" onsubmit={envoyer} novalidate>
    <Champ libelle="Lien magnet" bind:value={magnet} oninput={enMagnet} placeholder="magnet:?xt=urn:btih:…" autocomplete="off" spellcheck="false"
      data-test="champ-magnet" erreur={fichier ? null : erreur} aide="Colle le lien : le film arrivera dans ta galerie quand il sera téléchargé." disabled={!!fichier} />

    <p class="ou" aria-hidden="true"><span>ou</span></p>

    <div class="depot" class:survol class:rempli={!!fichier} role="group" aria-label="Fichier .torrent"
      ondragenter={(e) => { e.preventDefault(); e.stopPropagation(); survol = true; }}
      ondragover={(e) => { e.preventDefault(); e.stopPropagation(); survol = true; }}
      ondragleave={() => (survol = false)} ondrop={depose}>
      {#if fichier}
        <Icone nom="verifier" />
        <p class="nom"><strong>{fichier.name}</strong> <span class="t-petit">{formaterTaille(fichier.size)}</span></p>
        <Bouton variante="discret" taille="s" onclick={() => { fichier = null; if (selecteur) selecteur.value = ''; }}>Retirer</Bouton>
      {:else}
        <Icone nom="televerser" />
        <p>Dépose un fichier <strong>.torrent</strong> ici</p>
        <Bouton variante="secondaire" taille="s" onclick={() => selecteur?.click()}>Choisir un fichier</Bouton>
      {/if}
      <input bind:this={selecteur} type="file" accept=".torrent,application/x-bittorrent" hidden data-test="fichier-torrent"
        onchange={() => prendre(selecteur?.files?.[0])} />
    </div>
    {#if erreurFichier}<p class="erreur" role="alert"><Icone nom="alerte" taille={16} /> {erreurFichier}</p>{/if}
    {#if fichier && erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={16} /> {erreur}</p>{/if}
  </form>
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => (ouverte = false)}>Annuler</Bouton>
    <Bouton type="submit" form="form-torrent" chargement={envoi} data-test="envoyer-torrent" disabled={!fichier && !magnet.trim()}>Ajouter</Bouton>
  {/snippet}
</Modale>

<style>
  form { display: grid; gap: var(--e-4); }
  .ou { display: flex; align-items: center; gap: var(--e-3); margin: 0; color: var(--discret); font-size: 0.875rem; }
  .ou::before, .ou::after { content: ''; flex: 1; height: 1px; background: var(--bord); }
  .depot { display: flex; align-items: center; gap: var(--e-3); flex-wrap: wrap; padding: var(--e-4); border: 2px dashed var(--bord-champ); border-radius: var(--r-m); color: var(--doux); transition: background var(--d-2) var(--ease), border-color var(--d-2) var(--ease); }
  .depot p { margin: 0; flex: 1; min-width: 140px; }
  .depot.survol { border-color: var(--lampe); background: var(--lampe-fond); color: var(--texte); }
  .depot.rempli { border-style: solid; border-color: var(--ok); color: var(--texte); }
  .nom { overflow-wrap: anywhere; }
  .erreur { display: flex; gap: var(--e-2); align-items: center; margin: 0; color: var(--mal); font-size: 0.9375rem; }
</style>
