<script lang="ts">
  import type { InvitationAdmin, LienInvitation, Role } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { dateCourte, expireDans } from '$lib/comptes/format.ts';
  import { Bouton, Carte, Champ, Chargement, EtatVide, toast } from '$lib/ui/index.ts';

  let invitations = $state<InvitationAdmin[] | null>(null);
  let role: Role = $state('viewer');
  let prenom = $state('');
  let jours = $state('7');
  let dernier = $state<string | null>(null);
  let envoi = $state(false);

  async function charger(): Promise<void> {
    try { invitations = await api.get<InvitationAdmin[]>('/api/admin/invitations'); } catch (x) {
      toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible de charger les invitations.');
    }
  }
  $effect(() => { void charger(); });

  async function copier(texte: string): Promise<void> {
    try { await navigator.clipboard.writeText(texte); toast.ok('Lien copié.'); } catch { toast.info('Copie le lien à la main.'); }
  }

  async function creer(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    envoi = true;
    try {
      const corps: { role: Role; prenomSuggere?: string; dureeJours?: number } = { role, dureeJours: Math.max(1, Math.min(90, Number(jours) || 7)) };
      if (prenom.trim()) corps.prenomSuggere = prenom.trim();
      const r = await api.post<LienInvitation>('/api/admin/invitations', corps);
      dernier = r.lien;
      prenom = '';
      await copier(r.lien);
      await charger();
    } catch (x) {
      toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible de créer le lien.');
    } finally { envoi = false; }
  }

  async function revoquer(i: InvitationAdmin): Promise<void> {
    try {
      await api.supprimer(`/api/admin/invitations/${i.id}`);
      invitations = (invitations ?? []).filter((x) => x.id !== i.id);
      toast.ok('Lien révoqué.');
    } catch (x) { toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible de révoquer.'); }
  }

  const actives = $derived((invitations ?? []).filter((i) => !i.utiliseeLe && Date.parse(i.expireLe) > Date.now()));
</script>

<svelte:head><title>Invitations · Canapé</title></svelte:head>

<h1>Invitations</h1>
<Carte titre="Inviter quelqu'un">
  <form onsubmit={creer}>
    <label class="role">
      <span>Rôle</span>
      <select bind:value={role}>
        <option value="viewer">Spectateur</option>
        <option value="admin">Administrateur</option>
      </select>
    </label>
    <Champ libelle="Prénom (facultatif)" bind:value={prenom} maxlength={40} aide="Pré-remplit le formulaire de la personne." />
    <Champ libelle="Durée de validité (jours)" bind:value={jours} type="number" min="1" max="90" />
    <Bouton type="submit" icone="plus" chargement={envoi}>Créer un lien</Bouton>
  </form>
  {#if dernier}
    <div class="dernier">
      <p>Voici le lien (il fonctionne une seule fois) :</p>
      <code>{dernier}</code>
      <Bouton variante="secondaire" icone="lien" onclick={() => dernier && copier(dernier)}>Copier</Bouton>
    </div>
  {/if}
</Carte>

<h2>En attente</h2>
{#if !invitations}
  <Chargement />
{:else if actives.length === 0}
  <EtatVide titre="Aucun lien en attente." texte="Crée un lien pour inviter quelqu'un." icone="utilisateurs" />
{:else}
  <ul class="liste">
    {#each actives as i (i.id)}
      <li>
        <Carte>
          <div class="ligne">
            <div>
              <strong>{i.type === 'reinitialisation' ? 'Nouveau mot de passe' : i.role === 'admin' ? 'Administrateur' : 'Spectateur'}</strong>{#if i.prenomSuggere} · {i.prenomSuggere}{/if}
              <div class="doux">Créé le {dateCourte(i.creeLe)} · {expireDans(i.expireLe)}</div>
            </div>
            <Bouton variante="danger" taille="s" icone="supprimer" onclick={() => revoquer(i)}>Révoquer</Bouton>
          </div>
        </Carte>
      </li>
    {/each}
  </ul>
{/if}

<style>
  form { display: grid; gap: var(--espace-3); }
  .role { display: grid; gap: 6px; font-size: 0.85rem; color: var(--doux); }
  select { height: 48px; border-radius: 14px; padding: 0 var(--espace-3); background: var(--fond-3); color: inherit; border: 1px solid var(--bordure); font: inherit; }
  .dernier { display: grid; gap: var(--espace-2); }
  code { word-break: break-all; }
  .liste { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--espace-3); }
  .ligne { display: flex; justify-content: space-between; align-items: center; gap: var(--espace-3); }
  .doux { color: var(--doux); font-size: 0.9rem; }
</style>
