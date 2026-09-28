'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Tracking = require('../extension/background/tracking.js');

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

test('identificadores: exige 8+ caracteres, dígitos e descarta timestamps', () => {
  assert.equal(Tracking.isIdLike('d873abf03b2d4cb0bb9cbc6ed1a44286', NOW), true); // hash
  assert.equal(Tracking.isIdLike('7243182715609810533', NOW), true); // uuid2 do AppNexus
  assert.equal(Tracking.isIdLike('undefined', NOW), false); // sem dígito
  assert.equal(Tracking.isIdLike('12345678', NOW), false); // número curto
  assert.equal(Tracking.isIdLike(String(Math.round(NOW / 1000)), NOW), false); // timestamp em s
  assert.equal(Tracking.isIdLike(String(NOW), NOW), false); // timestamp em ms
  assert.equal(Tracking.isIdLike('0000000000', NOW), false);
});

test('idTokens separa os trechos de um cookie composto', () => {
  // _ga = GA1.1.<id do cliente>.<timestamp>
  const ts = Math.round(NOW / 1000);
  assert.deepEqual(Tracking.idTokens(`GA1.1.1567894321.${ts}`, NOW), ['1567894321']);
  assert.deepEqual(Tracking.idTokens('uid%3Da1b2c3d4e5f6', NOW), ['a1b2c3d4e5f6']);
});

test('urlTokens encontra IDs em query, caminho e valores codificados', () => {
  const url = 'https://sync.partner.com/pixel/a1b2c3d4e5f6?redir=https%3A%2F%2Fx.com%3Fuid%3D7243182715609810533';
  assert.deepEqual(Tracking.urlTokens(url, NOW).sort(), ['7243182715609810533', 'a1b2c3d4e5f6'].sort());
});

test('parâmetros de rastreamento conhecidos (página Query Parameters do DDG)', () => {
  const url = 'https://privacy-test-pages.site/privacy-protections/query-parameters/query.html?fbclid=12345&fb_source=someting&u=14';
  assert.deepEqual(Tracking.trackingParams(url), [['fbclid', '12345'], ['fb_source', 'someting']]);
  assert.deepEqual(Tracking.trackingParams('https://x.com/?q=something&id=1234'), []);
});

test('endpoints típicos de sincronização', () => {
  assert.equal(Tracking.isSyncEndpoint('https://ib.adnxs.com/getuidj?gdpr=0'), true);
  assert.equal(Tracking.isSyncEndpoint('https://match.adsrvr.org/track/cmf/generic?ttd_pid=rwuq9ny'), true);
  assert.equal(Tracking.isSyncEndpoint('https://gum.criteo.com/syncframe?origin=publishertagids'), true);
  assert.equal(Tracking.isSyncEndpoint('https://www.uol.com.br/noticias/'), false);
});
