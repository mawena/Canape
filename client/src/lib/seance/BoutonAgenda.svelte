<script lang="ts">
  /**
   * <BoutonAgenda seanceId={s.id} variante="discret" />
   * Télécharge le fichier .ics de la séance (le serveur le fabrique ; il s'ouvre dans l'agenda de l'appareil).
   * À n'afficher que pour une séance qui a une date prévue.
   */
  import { Bouton } from '$lib/ui/index.ts';

  interface Props {
    seanceId: string;
    variante?: 'primaire' | 'secondaire' | 'discret';
    taille?: 's' | 'm' | 'l';
  }
  let { seanceId, variante = 'discret', taille = 'm' }: Props = $props();
</script>

<Bouton
  href="/api/seances/{encodeURIComponent(seanceId)}/agenda.ics" {variante} {taille}
  icone="calendrier" data-test="ajouter-agenda"
>Ajouter à l’agenda</Bouton>
