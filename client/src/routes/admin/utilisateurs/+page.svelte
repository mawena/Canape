<script lang="ts">
  import type { UtilisateurAdmin } from '@canape/partage';
  import { api, ErreurApi } from '$lib/api/client.ts';
  import { analyserTaille, dateCourte, formaterOctets } from '$lib/comptes/format.ts';
  import { session } from '$lib/comptes/session.svelte.ts';
  import { Avatar, Bouton, Carte, Champ, Chargement, Modale, toast } from '$lib/ui/index.ts';

  let comptes = $state<UtilisateurAdmin[] | null>(null);
  let echec = $state<string | null>(null);
  let editionOuverte = $state(false);
  let edite = $state<UtilisateurAdmin | null>(null);
  let prenom = $state('');
  let quota = $state('');
  let erreurEdition = $state<string | null>(null);
  let suppressionOuverte = $state(false);
  let aSupprimer = $state<UtilisateurAdmin | null>(null);
  let lien = $state<string | null>(null);
  let lienOuvert = $state(false);

  async function charger(): Promise<void> {
    try { comptes = await api.get<UtilisateurAdmin[]>('/api/admin/utilisateurs'); } catch (x) {
      echec = x instanceof ErreurApi ? x.message : 'Impossible de charger les comptes.';
    }
  }
  $effect(() => { void charger(); });

  async function modifier(c: UtilisateurAdmin, corps: Record<string, unknown>, ok = 'Enregistré.'): Promise<boolean> {
    try {
      const m = await api.patch<UtilisateurAdmin>(`/api/admin/utilisateurs/${c.id}`, corps);
      comptes = (comptes ?? []).map((x) => (x.id === m.id ? m : x));
      toast.ok(ok);
      return true;
    } catch (x) {
      toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible de modifier ce compte.');
      return false;
    }
  }

  function ouvrirEdition(c: UtilisateurAdmin): void {
    edite = c; prenom = c.prenom; erreurEdition = null;
    quota = c.quotaOctets === null ? '' : formaterOctets(c.quotaOctets);
    editionOuverte = true;
  }

  async function enregistrerEdition(): Promise<void> {
    if (!edite) return;
    const corps: Record<string, unknown> = {};
    if (prenom.trim() !== edite.prenom) corps['prenom'] = prenom.trim();
    if (quota.trim() === '' || /^illimit/i.test(quota.trim())) {
      if (edite.quotaOctets !== null) corps['quotaOctets'] = null;
    } else {
      const o = analyserTaille(quota.replace(/\s/g, ''));
      if (o === null) { erreurEdition = 'Taille illisible. Exemple : 100 Go.'; return; }
      if (o !== edite.quotaOctets) corps['quotaOctets'] = o;
    }
    if (Object.keys(corps).length === 0) { editionOuverte = false; return; }
    if (await modifier(edite, corps)) editionOuverte = false;
  }

  async function reinitialiser(c: UtilisateurAdmin): Promise<void> {
    try {
      const r = await api.post<{ lien: string }>(`/api/admin/utilisateurs/${c.id}/reinitialisation`);
      lien = r.lien; lienOuvert = true;
    } catch (x) { toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible de créer le lien.'); }
  }

  async function copier(texte: string): Promise<void> {
    try { await navigator.clipboard.writeText(texte); toast.ok('Lien copié.'); } catch { toast.info('Copie le lien à la main.'); }
  }

  async function supprimer(): Promise<void> {
    if (!aSupprimer) return;
    try {
      await api.supprimer(`/api/admin/utilisateurs/${aSupprimer.id}`);
      comptes = (comptes ?? []).filter((x) => x.id !== aSupprimer?.id);
      toast.ok('Compte supprimé.');
      suppressionOuverte = false;
    } catch (x) { toast.erreur(x instanceof ErreurApi ? x.message : 'Impossible de supprimer ce compte.'); }
  }
</script>

<svelte:head><title>Comptes · Canapé</title></svelte:head>

<h1>Comptes</h1>
{#if echec}
  <p>{echec}</p>
{:else if !comptes}
  <Chargement />
{:else}
  <ul class="liste">
    {#each comptes as c (c.id)}
      <li>
        <Carte>
          <div class="ligne">
            <Avatar prenom={c.prenom} couleur={c.couleur} />
            <div class="qui">
              <strong>{c.prenom}</strong>{#if c.id === session.utilisateur?.id} <span class="doux">(toi)</span>{/if}
              <div class="doux">{c.identifiant} · {c.role === 'admin' ? 'administrateur' : 'spectateur'}{c.actif ? '' : ' · désactivé'}</div>
              <div class="doux">{formaterOctets(c.octetsUtilises)} / {c.quotaOctets === null ? 'illimité' : formaterOctets(c.quotaOctets)} · dernière visite {dateCourte(c.derniereConnexion)}</div>
            </div>
          </div>
          <div class="actions">
            <label><input type="checkbox" checked={c.role === 'admin'} onchange={(e) => { const v = e.currentTarget.checked; void modifier(c, { role: v ? 'admin' : 'viewer' }).then(() => charger()); }} /> Administrateur</label>
            <label><input type="checkbox" checked={c.peutTeleverser} onchange={(e) => modifier(c, { peutTeleverser: e.currentTarget.checked })} /> Peut ajouter des films</label>
            <label><input type="checkbox" checked={c.actif} onchange={(e) => { const v = e.currentTarget.checked; void modifier(c, { actif: v }).then(() => charger()); }} /> Actif</label>
          </div>
          <div class="actions">
            <Bouton variante="secondaire" taille="s" onclick={() => ouvrirEdition(c)}>Modifier</Bouton>
            <Bouton variante="secondaire" taille="s" icone="lien" onclick={() => reinitialiser(c)}>Lien de nouveau mot de passe</Bouton>
            {#if c.id !== session.utilisateur?.id}
              <Bouton variante="danger" taille="s" icone="supprimer" onclick={() => { aSupprimer = c; suppressionOuverte = true; }}>Supprimer</Bouton>
            {/if}
          </div>
        </Carte>
      </li>
    {/each}
  </ul>
{/if}

<Modale bind:ouverte={editionOuverte} titre="Modifier le compte">
  <form onsubmit={(e) => { e.preventDefault(); void enregistrerEdition(); }} id="form-edition">
    <Champ libelle="Prénom" bind:value={prenom} required maxlength={40} />
    <Champ libelle="Quota" bind:value={quota} aide="Par exemple 100 Go. Laisse vide pour ne pas limiter." erreur={erreurEdition} />
  </form>
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => { editionOuverte = false; }}>Annuler</Bouton>
    <Bouton type="submit" form="form-edition">Enregistrer</Bouton>
  {/snippet}
</Modale>

<Modale bind:ouverte={suppressionOuverte} titre="Supprimer ce compte ?">
  <p>Le compte de {aSupprimer?.prenom} et tous ses films seront supprimés pour de bon.</p>
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => { suppressionOuverte = false; }}>Annuler</Bouton>
    <Bouton variante="danger" onclick={supprimer}>Supprimer</Bouton>
  {/snippet}
</Modale>

<Modale bind:ouverte={lienOuvert} titre="Lien de nouveau mot de passe">
  <p>Envoie ce lien à la personne. Il fonctionne une seule fois, pendant 7 jours.</p>
  <code class="lien">{lien}</code>
  {#snippet pied()}
    <Bouton variante="discret" onclick={() => { lienOuvert = false; }}>Fermer</Bouton>
    <Bouton icone="lien" onclick={() => lien && copier(lien)}>Copier</Bouton>
  {/snippet}
</Modale>

<style>
  .liste { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--espace-3); }
  .ligne { display: flex; gap: var(--espace-3); align-items: center; }
  .qui { display: grid; gap: 2px; }
  .doux { color: var(--doux); font-size: 0.9rem; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--espace-3); align-items: center; }
  .actions label { display: flex; gap: var(--e-2); align-items: center; font-size: 0.9rem; min-height: 44px; }
  form { display: grid; gap: var(--espace-3); }
  .lien { word-break: break-all; display: block; }
</style>
