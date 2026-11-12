'use strict';

function decoder(buffer) {
  const utf8 = buffer.toString('utf8');
  // Beaucoup de .srt français sont en Windows-1252 : repli si l'UTF-8 est invalide.
  return utf8.includes('�') ? buffer.toString('latin1') : utf8;
}

// Convertit un .srt (texte) en WebVTT.
function srtVersVtt(texte) {
  const propre = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  const blocs = propre.split(/\n{2,}/);
  const sortie = ['WEBVTT', ''];
  for (const bloc of blocs) {
    const lignes = bloc.split('\n');
    let i = 0;
    if (lignes[i] && /^\d+$/.test(lignes[i].trim()) && lignes[i + 1] && lignes[i + 1].includes('-->')) i++;
    if (!lignes[i] || !lignes[i].includes('-->')) continue;
    const minutage = lignes[i].replace(/(\d+):(\d+):(\d+),(\d+)/g, '$1:$2:$3.$4').replace(/(\d+):(\d+),(\d+)/g, '00:$1:$2.$3');
    sortie.push(minutage.trim(), ...lignes.slice(i + 1), '');
  }
  return sortie.join('\n');
}

function versVtt(buffer, extension) {
  const texte = decoder(buffer);
  if (extension === '.vtt') return texte.replace(/^﻿/, '').startsWith('WEBVTT') ? texte.replace(/^﻿/, '') : 'WEBVTT\n\n' + texte;
  return srtVersVtt(texte);
}

module.exports = { srtVersVtt, versVtt, decoder };
