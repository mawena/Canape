import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formaterDuree, formaterReste, formaterTaille, nomLangue, raccourcirNom, teinteTitre } from './formats.ts';

test('tailles et durées en français', () => {
  assert.equal(formaterTaille(1_288_490_188), '1,3 Go');
  assert.equal(formaterTaille(512), '512 o');
  assert.equal(formaterDuree(6720), '1 h 52');
  assert.equal(formaterDuree(540), '9 min');
  assert.equal(formaterDuree(null), '');
  assert.equal(formaterReste(120), 'il reste 2 min');
});

test('noms raccourcis au milieu, langues, teintes stables', () => {
  const long = `${'a'.repeat(80)}.mkv`;
  const court = raccourcirNom(long, 30);
  assert.equal(court.length, 30);
  assert.ok(court.endsWith('.mkv') && court.includes('…'));
  assert.equal(nomLangue('fre'), 'Français');
  assert.equal(nomLangue(null), 'Langue inconnue');
  assert.equal(teinteTitre('Dune'), teinteTitre('Dune'));
  assert.ok(teinteTitre('Dune') >= 0 && teinteTitre('Dune') < 360);
});
