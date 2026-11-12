import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatOctets, formatPourcent, formatVitesse } from './formats.ts';
import { moteurPour, reglagesHls } from './attacher.ts';

test('moteurPour : direct, hls.js ou HLS natif (iPhone)', () => {
  assert.equal(moteurPour({ mode: 'direct' }, true), 'direct');
  assert.equal(moteurPour({ mode: 'hls' }, true), 'hlsjs');
  assert.equal(moteurPour({ mode: 'hls' }, false), 'natif');
});

test('réglages hls.js : VOD lente, pas de faible latence, délais longs', () => {
  const r = reglagesHls();
  assert.equal(r.lowLatencyMode, false);
  assert.equal(r.backBufferLength, 30);
  assert.ok((r.fragLoadPolicy?.default.maxTimeToFirstByteMs ?? 0) >= 45_000);
  assert.ok((r.fragLoadPolicy?.default.errorRetry?.maxNumRetry ?? 0) >= 5);
});

test('formats français', () => {
  assert.equal(formatPourcent(0.62), '62 %');
  assert.equal(formatOctets(4.2 * 1024 ** 3), '4,2 Go');
  assert.equal(formatVitesse(1.42), '1,4 ×');
  assert.equal(formatVitesse(null), '—');
});
