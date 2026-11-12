// Sous-titres externes : décodage (UTF-8 ou Windows-1252) et conversion SubRip → WebVTT (repris de la 0.1).

export function decoder(octets: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

export function srtVersVtt(texte: string): string {
  const propre = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  const sortie = ['WEBVTT', ''];
  for (const bloc of propre.split(/\n{2,}/)) {
    const lignes = bloc.split('\n');
    let i = 0;
    if (lignes[i] && /^\d+$/.test(lignes[i]!.trim()) && lignes[i + 1]?.includes('-->')) i++;
    if (!lignes[i]?.includes('-->')) continue;
    const minutage = lignes[i]!
      .replace(/(\d+):(\d+):(\d+),(\d+)/g, '$1:$2:$3.$4')
      .replace(/(\d+):(\d+),(\d+)/g, '00:$1:$2.$3');
    sortie.push(minutage.trim(), ...lignes.slice(i + 1), '');
  }
  return sortie.join('\n');
}

/** Contenu d'un `.srt` ou `.vtt` → WebVTT en UTF-8. */
export function versVtt(octets: Uint8Array, extension: string): string {
  const texte = decoder(octets).replace(/^﻿/, '');
  if (extension.toLowerCase() === '.vtt') return /^WEBVTT/.test(texte) ? texte : `WEBVTT\n\n${texte}`;
  return srtVersVtt(texte);
}

const LANGUES: Record<string, string> = {
  fr: 'fr', fra: 'fr', fre: 'fr', french: 'fr', francais: 'fr', français: 'fr', vff: 'fr', vf: 'fr', vfq: 'fr',
  en: 'en', eng: 'en', english: 'en', anglais: 'en', vo: 'en',
  es: 'es', spa: 'es', spanish: 'es', de: 'de', ger: 'de', deu: 'de', it: 'it', ita: 'it', pt: 'pt', por: 'pt',
};
const NOMS_LANGUES: Record<string, string> = { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais' };

/** Langue et libellé devinés d'un nom de fichier (« Film.fr.srt », « Film.French.forced.srt »). */
export function deviner(nomFichier: string): { langue: string | null; libelle: string } {
  const sansExt = nomFichier.replace(/^.*[\\/]/, '').replace(/\.(srt|vtt)$/i, '');
  const morceaux = sansExt.split(/[.\s_-]+/).reverse();
  let langue: string | null = null;
  for (const m of morceaux.slice(0, 3)) {
    const l = LANGUES[m.toLowerCase()];
    if (l) { langue = l; break; }
  }
  const force = morceaux.slice(0, 3).some((m) => /^forced|forces?|forcés?$/i.test(m));
  const sdh = morceaux.slice(0, 3).some((m) => /^sdh$/i.test(m));
  const base = langue ? NOMS_LANGUES[langue] ?? langue : sansExt.slice(0, 60) || 'Sous-titres';
  return { langue, libelle: `${base}${force ? ' (forcés)' : ''}${sdh ? ' (SDH)' : ''}` };
}
