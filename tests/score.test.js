'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.Parties = require('../extension/background/parties.js');
const Score = require('../extension/background/score.js');

const empty = {
  site: 'example.com',
  thirdParty: [],
  cookies: { list: [] },
  storage: { origins: [] },
  fingerprinting: { detections: [] },
  sync: { events: [] },
  bounces: [],
  categories: [],
  hijack: { keyboard: [], signatures: [], websockets: [], eventStreams: [], polling: [], globals: null },
};

test('os tetos dos critérios somam 100', () => {
  assert.equal(Score.CRITERIA.reduce((sum, c) => sum + c.max, 0), 100);
});

test('página sem nada observado tira 100 (A)', () => {
  const r = Score.compute(empty);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A');
});

test('cada critério respeita o teto', () => {
  const thirdParty = Array.from({ length: 30 }, (_, i) => ({ site: `t${i}.com`, tracker: true, firstSeenMs: 100 }));
  const r = Score.compute({ ...empty, thirdParty });
  const trackers = r.criteria.find(c => c.id === 'trackers');
  assert.equal(trackers.penalty, 20); // 60 pontos brutos, teto 20
  assert.equal(r.score, 80);
});

test('só conta o que surgiu na janela de 30 s', () => {
  const thirdParty = [
    { site: 'a.com', tracker: true, firstSeenMs: 1000 },
    { site: 'b.com', tracker: true, firstSeenMs: 45000 },
  ];
  assert.equal(Score.compute({ ...empty, thirdParty }).score, 98);
});

test('cookies de 3ª parte contam mesmo particionados; validade > 1 ano pesa 2', () => {
  const list = [
    { name: 'uid', site: 'criteo.com', thirdParty: true, partitioned: true, lifetimeDays: 390, inWindow: true },
    { name: 'st', site: 'seedtag.com', thirdParty: true, partitioned: true, lifetimeDays: 30, inWindow: true },
    { name: '_ga', site: 'example.com', thirdParty: false, writersThirdParty: true,
      writers: ['https://www.googletagmanager.com/gtag/js'], inWindow: true },
  ];
  const r = Score.compute({ ...empty, cookies: { list } });
  assert.equal(r.criteria.find(c => c.id === 'cookies').penalty, 3);
  assert.equal(r.criteria.find(c => c.id === 'storage').penalty, 1);
  assert.equal(r.score, 96);
});

test('fingerprinting de 3ª parte pesa mais que de 1ª parte', () => {
  const fp3 = Score.compute({ ...empty, fingerprinting: { detections: [{ technique: 'canvas', scriptThirdParty: true }] } });
  const fp1 = Score.compute({ ...empty, fingerprinting: { detections: [{ technique: 'canvas', scriptThirdParty: false }] } });
  assert.equal(fp3.score, 85);
  assert.equal(fp1.score, 92);
});

test('sincronização, bounce, vigilância e sequestro do navegador', () => {
  const r = Score.compute({
    ...empty,
    sync: { events: [
      { kind: 'third-party', ownerSite: '1rx.io', receiverSite: 'doubleclick.net', idName: '_rxuuid', firstSeenMs: 3000 },
      { kind: 'first-party-id', ownerSite: 'example.com', receiverSite: 'criteo.com', idName: 'cto_bundle', firstSeenMs: 3000 },
    ] },
    bounces: [{ site: 'tracker.net' }],
    categories: [{ category: 'session-recording', sites: ['hotjar.com'], firstSeenMs: 500 }],
    hijack: { ...empty.hijack, polling: [{ site: 'chartbeat.net' }], globals: { overridden: [{ name: 'fetch' }] } },
  });
  const penalty = id => r.criteria.find(c => c.id === id).penalty;
  assert.equal(penalty('sync'), 9);
  assert.equal(penalty('surveillance'), 10);
  assert.equal(penalty('hijack'), 4);
  assert.equal(r.score, 77);
  assert.equal(r.grade, 'B');
});

test('teclado ouvido conta uma vez por site de 3ª parte', () => {
  const keyboard = [
    { scriptSite: 'jsuol.com.br', scriptThirdParty: true },
    { scriptSite: 'jsuol.com.br', scriptThirdParty: true },
    { scriptSite: 'cxense.com', scriptThirdParty: true },
    { scriptSite: 'example.com', scriptThirdParty: false },
  ];
  const r = Score.compute({ ...empty, hijack: { ...empty.hijack, keyboard } });
  assert.equal(r.criteria.find(c => c.id === 'surveillance').penalty, 6);
});

test('sensibilidade: pesos multiplicam teto e pontos, e a nota é renormalizada', () => {
  const thirdParty = [{ site: 'a.com', tracker: true, firstSeenMs: 0 }];
  const base = Score.compute({ ...empty, thirdParty });
  const heavier = Score.compute({ ...empty, thirdParty }, { trackers: 1.3 });
  assert.equal(base.score, 98);
  assert.ok(heavier.score < base.score + 1 && heavier.score >= 97);
});

test('faixas de nota', () => {
  const at = n => Score.compute({ ...empty, thirdParty: Array.from({ length: n }, (_, i) => ({ site: `t${i}.com`, tracker: true, firstSeenMs: 0 })) });
  assert.equal(at(7).grade, 'A'); // 86
  assert.equal(at(8).grade, 'B'); // 84
});
