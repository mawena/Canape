'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const EXT_FILMS = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.ogv']);
const EXT_SOUS_TITRES = new Set(['.srt', '.vtt']);
const CODECS_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const CODECS_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis']);
const LANGUES = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português', nl: 'Nederlands' };
const PROFONDEUR_MAX = 6;

function dedans(racine, cible) {
  return cible === racine || cible.startsWith(racine + path.sep);
}

// Résout un chemin relatif à l'intérieur de `racine` ; renvoie le chemin réel ou null s'il en sort
// (`..`, chemin absolu, octet nul, lien symbolique vers l'extérieur) ou n'existe pas.
async function resoudre(racine, relatif) {
  if (typeof relatif !== 'string' || relatif === '' || relatif.includes('\0')) return null;
  let racineReelle;
  try { racineReelle = await fsp.realpath(racine); } catch { return null; }
  const candidat = path.resolve(racineReelle, relatif);
  if (!dedans(racineReelle, candidat)) return null;
  let reel;
  try { reel = await fsp.realpath(candidat); } catch { return null; }
  if (!dedans(racineReelle, reel)) return null;
  return reel;
}

function titreDe(nomFichier) {
  return path.basename(nomFichier, path.extname(nomFichier)).replace(/_/g, ' ');
}

function sousTitresDe(nomFilm, fichiersDuDossier, dossierRel) {
  const base = path.basename(nomFilm, path.extname(nomFilm));
  const res = [];
  for (const f of fichiersDuDossier) {
    const ext = path.extname(f).toLowerCase();
    if (!EXT_SOUS_TITRES.has(ext)) continue;
    const sansExt = f.slice(0, -ext.length);
    if (sansExt !== base && !sansExt.startsWith(base + '.')) continue;
    const langue = sansExt === base ? '' : sansExt.slice(base.length + 1).toLowerCase();
    res.push({
      chemin: path.posix.join(dossierRel, f),
      langue,
      libelle: langue ? (LANGUES[langue] || langue.toUpperCase()) : 'Sous-titres',
    });
  }
  return res.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

// ---- ffprobe (en cache) -------------------------------------------------
const cacheSonde = new Map();
let ffprobeAbsent = false;

function sonder(fichier, stat) {
  if (ffprobeAbsent) return Promise.resolve(null);
  const cle = `${fichier}:${stat.mtimeMs}:${stat.size}`;
  if (cacheSonde.has(cle)) return Promise.resolve(cacheSonde.get(cle));
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', fichier],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, sortie) => {
        if (err) {
          if (err.code === 'ENOENT') ffprobeAbsent = true;
          return resolve(null);
        }
        try {
          const j = JSON.parse(sortie);
          const v = (j.streams || []).find((s) => s.codec_type === 'video');
          const a = (j.streams || []).find((s) => s.codec_type === 'audio');
          const info = {
            video: v ? v.codec_name : null,
            audio: a ? a.codec_name : null,
            duree: j.format && j.format.duration ? Number(j.format.duration) : null,
            compatible: !!v && CODECS_VIDEO.has(v.codec_name) && (!a || CODECS_AUDIO.has(a.codec_name)),
          };
          cacheSonde.set(cle, info);
          resolve(info);
        } catch { resolve(null); }
      });
  });
}

async function lister(racine, { sonde = true } = {}) {
  let racineReelle;
  try { racineReelle = await fsp.realpath(racine); } catch { return []; }
  const films = [];

  async function parcourir(dossierRel, profondeur) {
    const abs = path.join(racineReelle, dossierRel);
    let entrees;
    try { entrees = await fsp.readdir(abs, { withFileTypes: true }); } catch { return; }
    const noms = entrees.map((e) => e.name);
    for (const e of entrees) {
      if (e.name.startsWith('.')) continue;
      const rel = path.posix.join(dossierRel.split(path.sep).join('/'), e.name);
      let estDossier = e.isDirectory();
      let estFichier = e.isFile();
      if (e.isSymbolicLink()) {
        const reel = await resoudre(racineReelle, rel);
        if (!reel) continue;
        const st = await fsp.stat(reel).catch(() => null);
        if (!st) continue;
        estDossier = st.isDirectory(); estFichier = st.isFile();
      }
      if (estDossier) {
        if (profondeur < PROFONDEUR_MAX) await parcourir(rel, profondeur + 1);
      } else if (estFichier && EXT_FILMS.has(path.extname(e.name).toLowerCase())) {
        const reel = await resoudre(racineReelle, rel);
        if (!reel) continue;
        const st = await fsp.stat(reel).catch(() => null);
        if (!st) continue;
        const info = sonde ? await sonder(reel, st) : null;
        films.push({
          chemin: rel,
          titre: titreDe(e.name),
          dossier: path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel),
          taille: st.size,
          extension: path.extname(e.name).toLowerCase().slice(1),
          compatible: info ? info.compatible : null,
          codecs: info ? { video: info.video, audio: info.audio } : null,
          duree: info ? info.duree : null,
          sousTitres: sousTitresDe(e.name, noms, path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel)),
        });
      }
    }
  }
  await parcourir('', 0);
  return films.sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'));
}

function estFilm(chemin) { return EXT_FILMS.has(path.extname(chemin).toLowerCase()); }
function estSousTitres(chemin) { return EXT_SOUS_TITRES.has(path.extname(chemin).toLowerCase()); }

module.exports = { resoudre, lister, sonder, estFilm, estSousTitres, sousTitresDe, titreDe, EXT_FILMS, fs };
