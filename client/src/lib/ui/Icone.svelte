<script module lang="ts">
  /** Icônes SVG intégrées (trait 2, 24×24). Ajouter un nom = ajouter son tracé ici. */
  const TRACES = {
    lecture: 'M7 4.5v15l12-7.5z',
    pause: 'M8 5v14M16 5v14',
    plus: 'M12 5v14M5 12h14',
    fermer: 'M6 6l12 12M18 6L6 18',
    verifier: 'M5 12.5l4.5 4.5L19 7.5',
    alerte: 'M12 4l9 16H3zM12 10v4M12 17v.5',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8v.5',
    film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4',
    maison: 'M4 11l8-7 8 7M6 10v9h12v-9',
    calendrier: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
    utilisateur: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
    utilisateurs: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 19a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6.5 6.5 0 013.5 5',
    reglages: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.7a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.7a7 7 0 002-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
    micro: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4',
    'micro-coupe': 'M4 4l16 16M9 9v3a3 3 0 004.5 2.6M15 10V6a3 3 0 00-5.6-1.5M6 11a6 6 0 009 5.2M12 17v4',
    camera: 'M3 7h11v10H3zM14 11l7-4v10l-7-4',
    'camera-coupee': 'M4 4l16 16M3 7h8M14 9.5V7M14 11l7-4v10l-4-2.3M14 15v2H3V9',
    chat: 'M4 5h16v11H9l-5 4z',
    'plein-ecran': 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11',
    'sous-titres': 'M3 5h18v14H3zM7 11h3M13 11h4M7 15h5M15 15h2',
    televerser: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    recherche: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
    deconnexion: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
    lien: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1',
    supprimer: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    'fleche-gauche': 'M15 5l-7 7 7 7',
    'fleche-droite': 'M9 5l7 7-7 7',
    popcorn: 'M7 10l1.5 10h7L17 10M6 10a3 3 0 013-3 3 3 0 016 0 3 3 0 013 3z',
  } as const;

  export type NomIcone = keyof typeof TRACES;
</script>

<script lang="ts">
  interface Props {
    nom: NomIcone;
    taille?: number;
    /** Si renseigné, l'icône est annoncée par les lecteurs d'écran ; sinon elle est décorative. */
    titre?: string;
  }
  let { nom, taille = 20, titre }: Props = $props();
</script>

<svg
  width={taille}
  height={taille}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={titre ? 'img' : undefined}
  aria-label={titre}
  aria-hidden={titre ? undefined : 'true'}
>
  <path d={TRACES[nom]} />
</svg>
