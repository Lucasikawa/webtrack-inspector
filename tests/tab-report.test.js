'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.Parties = require('../extension/background/parties.js');
const TabReport = require('../extension/background/tab-report.js');

const req = (url, type = 'script', extra = {}) => ({ url, type, ...extra });

test('agrupa hosts por site e separa primeira de terceira parte', () => {
  const report = new TabReport(1, 'https://www.privacy-test-pages.site/tracker-reporting/');
  report.addRequest(req('https://www.privacy-test-pages.site/tracker-reporting/', 'main_frame'));
  report.addRequest(req('https://cdn.privacy-test-pages.site/app.js'));
  report.addRequest(req('https://bad.third-party.site/tracker.js'));
  report.addRequest(req('https://broken.third-party.site/pixel.png', 'image'));

  const json = report.toJSON();
  assert.equal(json.site, 'privacy-test-pages.site');
  assert.equal(json.totals.requests, 4);
  assert.equal(json.totals.thirdPartySites, 1);
  assert.equal(json.totals.thirdPartyHosts, 2);
  assert.equal(json.totals.firstPartyHosts, 2);
  assert.deepEqual(json.thirdParty[0].types, ['image', 'script']);
});

test('addRequest sinaliza só o primeiro host de cada site de terceira parte', () => {
  const report = new TabReport(1, 'https://example.com/');
  assert.equal(report.addRequest(req('https://example.com/a.js')), false);
  assert.equal(report.addRequest(req('https://a.tracker.net/x')), true);
  assert.equal(report.addRequest(req('https://b.tracker.net/y')), false);
  assert.equal(report.thirdPartySiteCount(), 1);
});

test('marca rastreadores pela urlClassification do Firefox', () => {
  const report = new TabReport(1, 'https://example.com/');
  report.addRequest(req('https://www.google-analytics.com/g/collect', 'beacon', {
    thirdParty: true,
    urlClassification: { firstParty: [], thirdParty: ['tracking', 'tracking_analytics'] },
  }));
  report.addRequest(req('https://consent.cookiebot.com/uc.js', 'script', {
    urlClassification: { firstParty: [], thirdParty: ['consentmanager'] },
  }));

  const json = report.toJSON();
  assert.equal(json.totals.trackerSites, 1);
  assert.equal(json.thirdParty[0].site, 'google-analytics.com');
  assert.equal(json.thirdParty[0].firefoxThirdParty, true);
  assert.equal(json.thirdParty.find(s => s.site === 'cookiebot.com').tracker, false);
});

test('redirecionamento do main_frame reclassifica as partes', () => {
  const report = new TabReport(1, 'https://t.co/abc');
  report.addRequest(req('https://t.co/abc', 'main_frame'));
  report.setUrl('https://www.example.com/');
  report.addRequest(req('https://www.example.com/', 'main_frame'));

  const json = report.toJSON();
  assert.equal(json.site, 'example.com');
  assert.deepEqual(json.navigationChain, ['https://t.co/abc', 'https://www.example.com/']);
  assert.deepEqual(json.thirdParty.map(s => s.site), ['t.co']);
});

test('marca sites cujas requisições o Firefox cancelou pela Proteção Aprimorada', () => {
  const report = new TabReport(1, 'https://privacy-test-pages.site/tracker-reporting/1major-via-img.html');
  report.addRequest(req('https://facebook.com/tr?test=1', 'image'));
  report.addError({ url: 'https://facebook.com/tr?test=1', error: 'NS_ERROR_SOCIALTRACKING_URI' });
  report.addRequest(req('https://good.third-party.site/x.js'));
  report.addError({ url: 'https://good.third-party.site/x.js', error: 'NS_BINDING_ABORTED' });

  const json = report.toJSON();
  const fb = json.thirdParty.find(s => s.site === 'facebook.com');
  assert.equal(fb.blockedByFirefox, true);
  assert.deepEqual(fb.errors, { NS_ERROR_SOCIALTRACKING_URI: 1 });
  assert.equal(json.thirdParty.find(s => s.site === 'third-party.site').blockedByFirefox, false);
  assert.equal(json.totals.blockedByFirefoxSites, 1);
});

test('classifica cookies em 1ª/3ª parte e sessão/persistente, mesclando HTTP e API', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  const cookie = (name, domain, session, extra = {}) => ({
    key: `${name}|${domain}|/`, name, domain, path: '/', site: Parties.siteOf(domain),
    session, expires: session ? null : report.startedAt + 400 * 86400000, partitioned: null, ...extra,
  });

  report.addCookie(cookie('sid', 'www.uol.com.br', true), 'http', 'https://www.uol.com.br/');
  report.addCookie(cookie('sid', 'www.uol.com.br', true, { partitioned: false }), 'store');
  report.addCookie(cookie('_ga', 'uol.com.br', false), 'store'); // document.cookie
  report.addCookie(cookie('IDE', 'doubleclick.net', false), 'http', 'https://ad.doubleclick.net/x');
  report.addCookie(cookie('ts', 'criteo.com', true, { partitioned: true }), 'store');

  const { summary, list } = report.toJSON().cookies;
  assert.equal(list.length, 4);
  assert.deepEqual(summary.firstParty, { session: 1, persistent: 1 });
  assert.deepEqual(summary.thirdParty, { session: 1, persistent: 1 });
  assert.equal(summary.viaHttp, 2);
  assert.equal(summary.viaJs, 2);
  assert.equal(summary.notStored, 1); // IDE: Set-Cookie sem gravação observada
  assert.equal(summary.partitioned, 1);
  assert.equal(summary.longLived, 2);
  assert.equal(list.find(c => c.name === 'sid').sourceUrl, 'https://www.uol.com.br/');
});

test('cookies observados mais de 10 s após o load não contam como do carregamento', () => {
  const report = new TabReport(1, 'https://example.com/');
  report.markLoaded();
  report.loadedMs -= 20000; // simula load ocorrido 20 s atrás
  report.addCookie({ key: 'late|example.com|/', name: 'late', domain: 'example.com', path: '/',
    site: 'example.com', session: true, expires: null }, 'store');
  const { summary } = report.toJSON().cookies;
  assert.equal(summary.duringLoad, 0);
  assert.equal(summary.afterLoad, 1);
});

test('involvesSite atribui cookies ao próprio site e a sites contatados há pouco', () => {
  const report = new TabReport(1, 'https://www.quintoandar.com.br/');
  report.addRequest(req('https://gum.criteo.com/sync'));
  assert.equal(report.involvesSite('quintoandar.com.br'), true);
  assert.equal(report.involvesSite('criteo.com'), true);
  assert.equal(report.involvesSite('facebook.com'), false);
});

function snapshot(origin, isTop, local = [], extra = {}) {
  const store = keys => ({ available: true, count: keys.length, bytes: keys.length * 20, keys: keys.map(key => ({ key, size: 8 })) });
  return {
    origin, url: `${origin}/`, isTop,
    localStorage: store(local),
    sessionStorage: store([]),
    indexedDB: { available: true, count: 0, databases: [] },
    cacheStorage: { available: true, count: 0, names: [] },
    collectedAt: Date.now(),
    ...extra,
  };
}

test('agrega armazenamento HTML5 por origem e separa 1ª de 3ª parte', () => {
  const report = new TabReport(1, 'https://privacy-test-pages.site/privacy-protections/storage-blocking/');
  report.addStorageSnapshot(snapshot('https://privacy-test-pages.site', true, ['data'], {
    indexedDB: { available: true, count: 1, databases: [{ name: 'data', version: 1 }] },
  }));
  report.addStorageSnapshot(snapshot('https://good.third-party.site', false, ['data']));
  report.addStorageSnapshot(snapshot('https://broken.third-party.site', false, [], {
    localStorage: { available: false, error: 'SecurityError', count: 0, bytes: 0, keys: [] },
  }));

  const { summary, origins } = report.toJSON().storage;
  assert.equal(origins[0].origin, 'https://privacy-test-pages.site');
  assert.equal(origins[0].thirdParty, false);
  assert.equal(summary.origins, 3);
  assert.equal(summary.originsWithData, 2);
  assert.equal(summary.thirdPartyOriginsWithData, 1);
  assert.equal(summary.localStorageKeys, 2);
  assert.equal(summary.indexedDBDatabases, 1);
  assert.equal(summary.blockedOrigins, 1);
});

test('retrato repetido não gera nova versão; iframe da mesma origem não desfaz isTop', () => {
  const report = new TabReport(1, 'https://example.com/');
  report.addStorageSnapshot(snapshot('https://example.com', true, ['a']));
  const version = report.version;
  report.addStorageSnapshot(snapshot('https://example.com', true, ['a']));
  report.addStorageSnapshot(snapshot('https://example.com', false, ['a']));
  assert.equal(report.version, version);
  report.addStorageSnapshot(snapshot('https://example.com', false, ['a', 'b']));
  assert.equal(report.toJSON().storage.origins[0].isTop, true);
  assert.equal(report.toJSON().storage.summary.localStorageKeys, 2);
});
