'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Fingerprint = require('../extension/background/fingerprint.js');

// Leitura típica de fingerprinting (FingerprintJS, página de teste do DDG).
const fp = {
  method: 'toDataURL',
  contextType: '2d',
  width: 2000,
  height: 200,
  chars: 29,
  colors: 2,
  saveRestore: false,
  listeners: false,
};

test('canvas 2D com texto variado lido por toDataURL é fingerprinting', () => {
  const { technique, criteria } = Fingerprint.evaluateCanvas(fp);
  assert.equal(technique, 'canvas');
  assert.deepEqual(criteria, { size: true, text: true, noInteraction: true, extraction: true });
});

test('canvas menor que 16x16 não conta', () => {
  const result = Fingerprint.evaluateCanvas({ ...fp, width: 15, height: 200 });
  assert.equal(result.technique, null);
  assert.equal(result.criteria.size, false);
});

test('basta 10 caracteres distintos ou 2 cores', () => {
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, chars: 10, colors: 1 }).technique, 'canvas');
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, chars: 3, colors: 2 }).technique, 'canvas');
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, chars: 9, colors: 1 }).technique, null);
});

test('canvas interativo (save/restore ou listeners) é descartado', () => {
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, saveRestore: true }).criteria.noInteraction, false);
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, listeners: true }).technique, null);
});

test('getImageData só conta com área de pelo menos 16x16', () => {
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, method: 'getImageData', area: { w: 2000, h: 200 } }).technique, 'canvas');
  assert.equal(Fingerprint.evaluateCanvas({ ...fp, method: 'getImageData', area: { w: 1, h: 1 } }).technique, null);
});

test('leitura de canvas WebGL de pelo menos 16x16 é fingerprinting WebGL', () => {
  const webgl = { ...fp, contextType: 'webgl', chars: 0, colors: 0 };
  assert.equal(Fingerprint.evaluateCanvas(webgl).technique, 'webgl');
  assert.equal(Fingerprint.evaluateCanvas({ ...webgl, method: 'readPixels', area: { w: 1, h: 1 } }).technique, null);
  assert.equal(Fingerprint.evaluateCanvas({ ...webgl, contextType: 'experimental-webgl' }).technique, 'webgl');
});
