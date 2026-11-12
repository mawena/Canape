<script module lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Info from '@lucide/svelte/icons/info';
  import Film from '@lucide/svelte/icons/film';
  import House from '@lucide/svelte/icons/house';
  import Calendar from '@lucide/svelte/icons/calendar';
  import User from '@lucide/svelte/icons/user';
  import Users from '@lucide/svelte/icons/users';
  import Settings from '@lucide/svelte/icons/settings';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import Video from '@lucide/svelte/icons/video';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Maximize from '@lucide/svelte/icons/maximize';
  import Minimize from '@lucide/svelte/icons/minimize';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import VolumeX from '@lucide/svelte/icons/volume-x';
  import Subtitles from '@lucide/svelte/icons/subtitles';
  import Languages from '@lucide/svelte/icons/languages';
  import Headphones from '@lucide/svelte/icons/headphones';
  import WifiLow from '@lucide/svelte/icons/wifi-low';
  import Upload from '@lucide/svelte/icons/upload';
  import Download from '@lucide/svelte/icons/download';
  import Search from '@lucide/svelte/icons/search';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Link from '@lucide/svelte/icons/link';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Popcorn from '@lucide/svelte/icons/popcorn';
  import Clapperboard from '@lucide/svelte/icons/clapperboard';
  import Sofa from '@lucide/svelte/icons/sofa';
  import Copy from '@lucide/svelte/icons/copy';
  import Send from '@lucide/svelte/icons/send';
  import HardDrive from '@lucide/svelte/icons/hard-drive';
  import History from '@lucide/svelte/icons/history';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import Share2 from '@lucide/svelte/icons/share-2';
  import Shield from '@lucide/svelte/icons/shield';
  import Clock from '@lucide/svelte/icons/clock';
  import Pencil from '@lucide/svelte/icons/pencil';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Lamp from '@lucide/svelte/icons/lamp';
  import Moon from '@lucide/svelte/icons/moon';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CircleCheck from '@lucide/svelte/icons/circle-check';

  /**
   * Icônes Lucide (ISC), importées une à une : seules celles de cette table sont embarquées.
   * Les noms sont français et stables (API du kit) ; ajouter une icône = ajouter une ligne ici.
   */
  const ICONES = {
    // Noms de la première version du kit (gardés)
    lecture: Play, pause: Pause, plus: Plus, fermer: X, verifier: Check, alerte: TriangleAlert, info: Info,
    film: Film, maison: House, calendrier: Calendar, utilisateur: User, utilisateurs: Users, reglages: Settings,
    micro: Mic, 'micro-coupe': MicOff, camera: Video, 'camera-coupee': VideoOff, chat: MessageCircle,
    'plein-ecran': Maximize, volume: Volume2, 'sous-titres': Subtitles, televerser: Upload, recherche: Search,
    deconnexion: LogOut, lien: Link, supprimer: Trash2, 'fleche-gauche': ChevronLeft, 'fleche-droite': ChevronRight,
    popcorn: Popcorn,
    // Ajouts
    'volume-coupe': VolumeX, 'quitter-plein-ecran': Minimize, langues: Languages, casque: Headphones,
    'wifi-faible': WifiLow, telecharger: Download, 'chevron-bas': ChevronDown, clap: Clapperboard, canape: Sofa,
    copier: Copy, envoyer: Send, disque: HardDrive, historique: History, 'menu-points': Ellipsis, oeil: Eye,
    'oeil-barre': EyeOff, reculer: RotateCcw, avancer: RotateCw, partager: Share2, bouclier: Shield,
    horloge: Clock, crayon: Pencil, actualiser: RefreshCw, tri: ArrowUpDown, 'reglages-fins': SlidersHorizontal,
    lampe: Lamp, lune: Moon, 'calendrier-horloge': CalendarClock, ok: CircleCheck,
  } as const;

  export type NomIcone = keyof typeof ICONES;
</script>

<script lang="ts">
  /**
   * <Icone nom="film" taille={20} titre="…" />
   * - `nom` : voir `NomIcone` (liste dans LISEZMOI.md) ; trait 1,75 px, bouts ronds, `currentColor`.
   * - `taille` : 20 par défaut (16 dans les puces, 24 pour les commandes du lecteur).
   * - `titre` : si renseigné, l'icône est annoncée par les lecteurs d'écran ; sinon elle est décorative.
   * - `rempli` : remplit la forme (réservé au triangle de lecture).
   */
  interface Props {
    nom: NomIcone;
    taille?: number;
    titre?: string;
    rempli?: boolean;
    class?: string;
  }
  let { nom, taille = 20, titre, rempli = false, class: classe = '' }: Props = $props();
  const Composant = $derived(ICONES[nom]);
</script>

<Composant
  size={taille}
  strokeWidth={1.75}
  class="icone {classe}"
  fill={rempli ? 'currentColor' : 'none'}
  role={titre ? 'img' : undefined}
  aria-label={titre}
  aria-hidden={titre ? undefined : 'true'}
/>
