<script lang="ts">
  /**
   * <ChercherCompte surTrouve={(u) => …} exclus={[1, 2]} />
   * « Ajouter quelqu'un par son identifiant » : cherche un compte par son identifiant exact (`GET /api/utilisateurs?identifiant=`),
   * affiche « Personne avec cet identifiant. » si rien, sinon le compte trouvé avec un bouton « Ajouter ».
   * Sert au partage d'un film et à l'invitation à une séance : un spectateur ne voit jamais la liste de tous les comptes.
   */
  import type { UtilisateurPublic } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { Avatar, Bouton, Champ } from '$lib/ui/index.ts';

  interface Props { surTrouve: (u: UtilisateurPublic) => void; exclus?: number[] }
  let { surTrouve, exclus = [] }: Props = $props();

  let identifiant = $state('');
  let trouve = $state<UtilisateurPublic | null>(null);
  let vide = $state(false);
  let erreur = $state<string | null>(null);
  let recherche = $state(false);

  async function chercher(e?: Event): Promise<void> {
    e?.preventDefault();
    const x = identifiant.trim();
    if (!x) return;
    recherche = true; erreur = null; vide = false; trouve = null;
    try {
      const l = await api.get<UtilisateurPublic[]>(`/api/utilisateurs?identifiant=${encodeURIComponent(x)}`);
      const u = l[0];
      if (!u) vide = true;
      else if (exclus.includes(u.id)) erreur = `${u.prenom} est déjà dans la liste.`;
      else trouve = u;
    } catch (x2) {
      erreur = x2 instanceof ErreurApi && x2.statut === 429 ? 'Trop de recherches. Réessaie dans une minute.' : x2 instanceof ErreurApi ? x2.message : 'Recherche impossible pour le moment.';
    } finally {
      recherche = false;
    }
  }

  function ajouter(): void {
    if (!trouve) return;
    surTrouve(trouve);
    trouve = null; identifiant = '';
  }
</script>

<div class="chercher">
  <div class="rangee">
    <Champ
      libelle="Ajouter quelqu'un par son identifiant" bind:value={identifiant} autocapitalize="none" spellcheck={false} autocomplete="off"
      aide="L'identifiant exact, tel que la personne te l'a donné." data-test="champ-chercher-identifiant"
      onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') void chercher(e); }}
    />
    <Bouton variante="secondaire" chargement={recherche} disabled={!identifiant.trim()} onclick={() => chercher()} data-test="chercher-identifiant">Chercher</Bouton>
  </div>
  <div role="status" aria-live="polite">
    {#if vide}<p class="vide" data-test="aucun-compte">Personne avec cet identifiant.</p>{/if}
    {#if erreur}<p class="erreur">{erreur}</p>{/if}
    {#if trouve}
      <div class="trouve" data-test="compte-trouve">
        <Avatar prenom={trouve.prenom} couleur={trouve.couleur} taille={32} />
        <strong>{trouve.prenom}</strong>
        <Bouton taille="s" icone="plus" onclick={ajouter} data-test="ajouter-identifiant">Ajouter</Bouton>
      </div>
    {/if}
  </div>
</div>

<style>
  .chercher { display: grid; gap: var(--e-2); }
  .rangee { display: flex; gap: var(--e-3); align-items: flex-start; flex-wrap: wrap; }
  .rangee :global(.champ), .rangee :global(label) { flex: 1 1 220px; }
  .rangee :global(.bouton) { margin-top: 26px; }
  .vide, .erreur { margin: 0; font-size: 0.9rem; color: var(--doux); }
  .erreur { color: var(--mal); }
  .trouve { display: flex; align-items: center; gap: var(--e-3); padding: var(--e-2) var(--e-3); border-radius: var(--r-m); background: var(--lampe-fond); }
  .trouve strong { flex: 1; }
</style>
