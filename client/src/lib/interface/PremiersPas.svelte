<script lang="ts">
  /**
   * Premiers pas (phase 14) : trois étapes simples pour un compte neuf. Elles se cochent toutes seules d'après les données
   * (films, personnes, séances) et la carte disparaît quand tout est fait ; on peut la refermer (mémorisé sur cet appareil).
   * Rien de bloquant : chaque étape est un simple lien.
   * - `films`, `seances` : nombres déjà connus de l'accueil. `estAdmin` : seuls les administrateurs créent des invitations.
   */
  import { onMount } from 'svelte';
  import type { UtilisateurPublic } from '@canape/partage';
  import { api } from '$lib/api/client.ts';
  import { Bouton, Icone } from '$lib/ui/index.ts';
  import type { NomIcone } from '$lib/ui/index.ts';
  import { liens } from '$lib/interface/liens.ts';

  interface Props { films: number; seances: number; estAdmin: boolean; /** Sortie : la carte est-elle affichée ? */ visible?: boolean }
  let { films, seances, estAdmin, visible: affichee = $bindable(false) }: Props = $props();

  const CLE = 'canape.premiers-pas';
  let ferme = $state(false);
  let personnes = $state<number | null>(null);

  onMount(() => {
    try { ferme = localStorage.getItem(CLE) === 'ferme'; } catch { /* stockage indisponible */ }
    void api.get<UtilisateurPublic[]>('/api/utilisateurs').then((l) => { personnes = Array.isArray(l) ? l.length : null; }).catch(() => { personnes = null; });
  });

  interface Etape { id: string; titre: string; texte: string; icone: NomIcone; fait: boolean; action: string; href?: string }
  const etapes = $derived<Etape[]>([
    {
      id: 'film', titre: 'Ajoute un film', icone: 'film', fait: films > 0, action: 'Ajouter un film', href: liens.ajouterFilm,
      texte: 'Envoie un fichier depuis ton ordinateur ou colle un lien torrent. Il est prêt dès qu’il est arrivé.',
    },
    {
      id: 'inviter', titre: 'Invite quelqu’un', icone: 'utilisateurs', fait: personnes !== null && personnes > 1,
      action: estAdmin ? 'Créer une invitation' : '', href: estAdmin ? '/admin/invitations' : undefined,
      texte: estAdmin ? 'Crée un lien d’invitation et envoie-le à la personne avec qui tu regardes.' : 'Dis à la personne avec qui tu regardes de créer son compte (ou demande une invitation à un administrateur), puis ajoute-la par son identifiant.',
    },
    {
      id: 'seance', titre: 'Lance une séance', icone: 'popcorn', fait: seances > 0, action: 'Lancer une séance', href: liens.nouvelleSeance(),
      texte: 'Choisis le film, fixe l’heure : vous vous retrouvez dans la même salle, synchronisés.',
    },
  ]);
  const faites = $derived(etapes.filter((e) => e.fait).length);
  const courante = $derived(etapes.find((e) => !e.fait)?.id ?? '');
  const visible = $derived(!ferme && personnes !== null && faites < etapes.length);
  $effect(() => { affichee = visible; });

  function fermer(): void {
    ferme = true;
    try { localStorage.setItem(CLE, 'ferme'); } catch { /* stockage indisponible */ }
  }
</script>

{#if visible}
  <section class="pas" aria-labelledby="titre-pas" data-test="premiers-pas">
    <header>
      <div>
        <h2 id="titre-pas">Pour bien démarrer</h2>
        <p class="avance tn">{faites} sur {etapes.length} faites</p>
      </div>
      <button type="button" class="x" aria-label="Fermer les premiers pas" onclick={fermer}><Icone nom="fermer" taille={18} /></button>
    </header>
    <div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax={etapes.length} aria-valuenow={faites} aria-label="Avancement"><i style:width="{(faites / etapes.length) * 100}%"></i></div>
    <ol>
      {#each etapes as e, i (e.id)}
        <li class:fait={e.fait} class:courante={e.id === courante} data-test="pas-{e.id}" data-fait={e.fait}>
          <span class="rond" aria-hidden="true">{#if e.fait}<Icone nom="verifier" taille={18} />{:else}{i + 1}{/if}</span>
          <div class="texte">
            <h3>{e.titre}{#if e.fait}<span class="vh"> (fait)</span>{/if}</h3>
            {#if !e.fait}<p>{e.texte}</p>{/if}
          </div>
          {#if !e.fait && e.href && e.action}
            <Bouton variante={e.id === courante ? 'primaire' : 'secondaire'} taille="s" href={e.href}>{e.action}</Bouton>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .pas {
    display: grid; gap: var(--e-4); padding: var(--e-6); border-radius: var(--r-l); background: var(--s1);
    border: 1px solid var(--bord-vif); box-shadow: inset 0 1px 0 var(--reflet);
    background-image: radial-gradient(520px 200px at 0% 0%, var(--lampe-fond), transparent 75%);
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--e-3); }
  h2 { font: 700 1.25rem / 1.2 var(--texte-police); letter-spacing: -0.02em; }
  .avance { color: var(--doux); font-size: 14px; margin-top: 2px; }
  .x { display: grid; place-items: center; width: 44px; height: 44px; margin: -8px -8px 0 0; border: 0; border-radius: 50%; background: transparent; color: var(--doux); }
  @media (hover: hover) { .x:hover { background: var(--s3); color: var(--texte); } }
  .barre { height: 6px; border-radius: 6px; background: var(--s3); overflow: hidden; }
  .barre i { display: block; height: 100%; border-radius: 6px; background: var(--lampe-degrade); transition: width var(--d-3) var(--ease); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--e-2); }
  li {
    display: grid; grid-template-columns: 36px 1fr auto; gap: var(--e-4); align-items: center; padding: var(--e-3) var(--e-3);
    border-radius: var(--r-m); border: 1px solid transparent;
  }
  li.courante { background: var(--s2); border-color: var(--bord); }
  .rond {
    display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--s3); color: var(--doux);
    font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums;
  }
  .courante .rond { background: var(--lampe-fond); color: var(--lampe); }
  .fait .rond { background: var(--ok-fond); color: var(--ok); }
  h3 { font: 650 1rem / 1.3 var(--texte-police); }
  .fait h3 { color: var(--doux); text-decoration: line-through; text-decoration-color: var(--discret); }
  .texte p { color: var(--doux); font-size: 14.5px; margin-top: 2px; max-width: 56ch; }
  @media (max-width: 640px) {
    .pas { padding: var(--e-5); }
    li { grid-template-columns: 36px 1fr; }
    li > :global(.bouton) { grid-column: 2; justify-self: start; }
  }
</style>
