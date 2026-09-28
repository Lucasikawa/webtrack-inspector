'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.Parties = require('../extension/background/parties.js');
globalThis.Fingerprint = require('../extension/background/fingerprint.js');
globalThis.Tracking = require('../extension/background/tracking.js');
globalThis.Categories = require('../extension/background/categories.js');
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

test('cookies surgidos depois da janela de 30 s entram no total, mas não no carregamento', () => {
  // Caso do Storage blocking do DDG (cookies criados ao clicar em "Store data")
  // e de portais que renovam anúncios.
  const report = new TabReport(1, 'https://example.com/');
  report.startedAt -= 40000; // navegação começou há 40 s
  report.addCookie({ key: 'late|example.com|/', name: 'late', domain: 'example.com', path: '/',
    site: 'example.com', session: true, expires: null }, 'store');
  const { summary, list } = report.toJSON().cookies;
  assert.equal(summary.total, 1);
  assert.equal(summary.inWindow, 0);
  assert.equal(summary.afterWindow, 1);
  assert.equal(list[0].inWindow, false);
  assert.deepEqual(summary.firstParty, { session: 1, persistent: 0 });
  assert.deepEqual(summary.window.firstParty, { session: 0, persistent: 0 });
});

test('recorte de terceiros na janela de 30 s', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  report.addRequest(req('https://securepubads.g.doubleclick.net/x', 'script', {
    urlClassification: { firstParty: [], thirdParty: ['tracking_ad'] } }));
  report.startedAt -= 60000; // o próximo site aparece 60 s depois
  report.addRequest(req('https://match.adsrvr.org/track', 'image', {
    urlClassification: { firstParty: [], thirdParty: ['tracking_ad'] } }));
  const { totals } = report.toJSON();
  assert.equal(totals.thirdPartySites, 2);
  assert.equal(totals.windowThirdPartySites, 1);
  assert.equal(totals.windowTrackerSites, 1);
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

test('validade de cookies curtos não é arredondada para zero', () => {
  const report = new TabReport(1, 'https://www.quintoandar.com.br/');
  report.addCookie({ key: '_hjSession|quintoandar.com.br|/', name: '_hjSession', domain: 'quintoandar.com.br',
    path: '/', site: 'quintoandar.com.br', session: false, expires: report.startedAt + 30 * 60000 }, 'store');
  const [cookie] = report.toJSON().cookies.list;
  assert.ok(cookie.lifetimeDays > 0.02 && cookie.lifetimeDays < 0.022, `lifetimeDays=${cookie.lifetimeDays}`);
});

test('associa cookies e chaves de storage ao script que os gravou', () => {
  const page = 'https://privacy-test-pages.site/privacy-protections/storage-blocking/';
  const report = new TabReport(1, page);
  const frame = { frameOrigin: 'https://privacy-test-pages.site', frameUrl: page };
  const tracker = 'https://broken.third-party.site/privacy-protections/storage-blocking/3rdparty.js';
  report.addHookEvent({ kind: 'cookieWrite', name: 'tptdata', script: tracker, ...frame });
  report.addHookEvent({ kind: 'storageWrite', area: 'localStorage', key: 'data', script: `${page}main.js`, ...frame });
  report.addCookie({ key: 'tptdata|privacy-test-pages.site|/', name: 'tptdata', domain: 'privacy-test-pages.site',
    path: '/', site: 'privacy-test-pages.site', session: false, expires: report.startedAt + 400 * 86400000 }, 'store');
  report.addStorageSnapshot(snapshot('https://privacy-test-pages.site', true, ['data']));

  const json = report.toJSON();
  assert.deepEqual(json.cookies.list[0].writers, [tracker]);
  assert.equal(json.cookies.summary.firstPartyByThirdPartyScript, 1);
  assert.deepEqual(json.storage.origins[0].localStorage.keys[0].writers, [`${page}main.js`]);
});

test('classifica leituras de canvas e separa as descartadas pela heurística', () => {
  const page = 'https://www.uol.com.br/';
  const report = new TabReport(1, page);
  const canvas = {
    kind: 'canvas', method: 'toDataURL', contextType: '2d', width: 240, height: 60, chars: 25, colors: 3,
    saveRestore: false, listeners: false, frameOrigin: 'https://www.uol.com.br', frameUrl: page,
  };
  report.addHookEvent({ ...canvas, script: 'https://cdn.fingerprint-vendor.com/fp.js' });
  report.addHookEvent({ ...canvas, script: `${page}#inline`, width: 8, height: 8 });
  report.addHookEvent({ kind: 'webglInfo', parameter: 'UNMASKED_RENDERER_WEBGL', script: 'https://cdn.fingerprint-vendor.com/fp.js',
    frameOrigin: 'https://www.uol.com.br', frameUrl: page });

  const { summary, detections, discarded } = report.toJSON().fingerprinting;
  assert.deepEqual(summary.byTechnique, { canvas: 1, 'webgl-info': 1 });
  assert.equal(summary.thirdPartyScripts, 1);
  assert.equal(detections[0].scriptSite, 'fingerprint-vendor.com');
  assert.equal(detections[0].scriptThirdParty, true);
  assert.equal(discarded.length, 1);
  assert.equal(discarded[0].inline, true);
  assert.equal(discarded[0].criteria.size, false);
});

// Cookie sync, bounce tracking e parâmetros de rastreamento

const cookieOf = (name, domain, value, extra = {}) => ({
  key: `${name}|${domain}|/`, name, domain, path: '/', site: Parties.siteOf(domain),
  session: false, expires: Date.now() + 90 * 86400000, value, ...extra,
});

test('cookie sync entre terceiros: ID do AppNexus aparece na URL de outra plataforma', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  report.addCookie(cookieOf('uuid2', 'adnxs.com', '7243182715609810533'), 'http', 'https://ib.adnxs.com/getuidj');
  report.addRequest(req('https://image6.pubmatic.com/AdServer/UCookieSetPug?rd=x&uid=7243182715609810533', 'image'));
  const { summary, events } = report.toJSON().sync;
  assert.equal(summary.thirdPartyPairs, 1);
  assert.equal(events[0].ownerSite, 'adnxs.com');
  assert.equal(events[0].idName, 'uuid2');
  assert.equal(events[0].receiverSite, 'pubmatic.com');
  assert.equal(events[0].kind, 'third-party');
});

test('ID de cookie de 1ª parte (gravado por script) enviado a um terceiro', () => {
  const page = 'https://www.uol.com.br/';
  const report = new TabReport(1, page);
  report.addHookEvent({ kind: 'cookieWrite', name: '_pubcid', value: '0f3e9d6a-1c2b-4f5e-8a7d-6b5c4d3e2f10',
    script: 'https://tags.crwdcntrl.net/lt/c/16589/sync.min.js', frameOrigin: 'https://www.uol.com.br', frameUrl: page });
  report.addRequest(req('https://fastlane.rubiconproject.com/a/api/fastlane.json?eid_pubcid.org=0f3e9d6a-1c2b-4f5e-8a7d-6b5c4d3e2f10', 'xmlhttprequest'));
  const { summary, events } = report.toJSON().sync;
  assert.equal(summary.firstPartyIdShares, 1);
  assert.equal(events[0].kind, 'first-party-id');
  assert.equal(events[0].idSource, 'document.cookie');
});

test('ID do cabeçalho Cookie conta como conhecido; o próprio dono não é sync', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  report.addRequestCookies('https://ib.adnxs.com/getuid', 'uuid2=7243182715609810533; anj=abc');
  report.addRequest(req('https://ib.adnxs.com/ut/v3?uid=7243182715609810533', 'xmlhttprequest'));
  assert.equal(report.toJSON().sync.summary.events, 0);
  report.addRequest(req('https://ads.pubmatic.com/x?adnxs_uid=7243182715609810533', 'image'));
  assert.equal(report.toJSON().sync.summary.events, 1);
});

test('endpoints típicos de sync ficam registrados mesmo sem ID reconhecido', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  report.addRequest(req('https://match.adsrvr.org/track/cmf/generic?ttd_pid=rwuq9ny&ttd_tpi=1', 'image'));
  const { summary, endpoints } = report.toJSON().sync;
  assert.equal(summary.endpointSites, 1);
  assert.equal(endpoints[0].site, 'adsrvr.org');
});

// Página intermediária de bounce, como a do DDG: grava um UID e redireciona.
function bounceFixture(destination) {
  const origin = new TabReport(1, 'https://privacy-test-pages.site/privacy-protections/bounce-tracking/');
  const bounce = new TabReport(1, `https://bad.third-party.site/privacy-protections/bounce-tracking/bounce.html?destination=${destination}`);
  bounce.previous = origin.snapshotForNext();
  bounce.committedAt = Date.now() - 300;
  bounce.addRequestCookies('https://bad.third-party.site/privacy-protections/bounce-tracking/bounce.html', 'bounceUID=42');
  const final = new TabReport(1, `https://${destination}/privacy-protections/bounce-tracking/?bounceUIDlocalStorage=42&bounceUIDcookie=42&isNew=`);
  final.previous = bounce.snapshotForNext();
  final.transition = { type: 'link', qualifiers: [] };
  return { bounce, final };
}

test('bounce por script: página de outro site, 300 ms, sem interação, passa o UID na URL', () => {
  const { final } = bounceFixture('www.first-party.site');
  const [b] = final.toJSON().bounces;
  assert.equal(b.type, 'script');
  assert.equal(b.site, 'third-party.site');
  assert.equal(b.fromSite, 'privacy-test-pages.site');
  assert.ok(b.dwellMs < 1000);
  assert.deepEqual(b.storedIds, ['bounceUID']);
  assert.deepEqual(b.passedParams.filter(p => p.matches).map(p => p.param), ['bounceUIDlocalStorage', 'bounceUIDcookie']);
});

test('bounce que volta ao site de origem também conta (A -> rastreador -> A)', () => {
  const { final } = bounceFixture('privacy-test-pages.site');
  assert.equal(final.toJSON().bounces.length, 1);
});

test('não é bounce: interação do usuário, permanência longa ou URL digitada', () => {
  const interacted = bounceFixture('www.first-party.site');
  interacted.bounce.addHookEvent({ kind: 'interaction', frameOrigin: 'https://bad.third-party.site' });
  interacted.final.previous = interacted.bounce.snapshotForNext();
  assert.equal(interacted.final.toJSON().bounces.length, 0);

  const slow = bounceFixture('www.first-party.site');
  slow.final.previous.committedAt -= 60000;
  assert.equal(slow.final.toJSON().bounces.length, 0);

  const typed = bounceFixture('www.first-party.site');
  typed.final.transition = { type: 'typed', qualifiers: ['from_address_bar'] };
  assert.equal(typed.final.toJSON().bounces.length, 0);
});

test('bounce por redirecionamento HTTP: site intermediário que grava cookie', () => {
  const report = new TabReport(1, 'https://ad.tracker-net.com/click?id=9');
  report.previous = new TabReport(1, 'https://www.uol.com.br/').snapshotForNext();
  report.addCookie(cookieOf('clk', 'tracker-net.com', 'c9f1e2d3a4b5'), 'http', 'https://ad.tracker-net.com/click?id=9');
  report.setUrl('https://www.loja.com.br/produto?ref=c9f1e2d3a4b5');
  const [b] = report.toJSON().bounces;
  assert.equal(b.type, 'redirect');
  assert.equal(b.site, 'tracker-net.com');
  assert.deepEqual(b.storedIds, ['clk']);
  assert.equal(b.passedParams[0].matches, 'clk');
});

test('parâmetros de rastreamento na navegação', () => {
  const report = new TabReport(1, 'https://privacy-test-pages.site/privacy-protections/query-parameters/query.html?utm_source=something&q=other');
  assert.deepEqual(report.toJSON().trackingParams.map(p => p.param), ['utm_source']);
});

test('valor do cookie não vai para o JSON exportado', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  report.addCookie(cookieOf('_ga', 'uol.com.br', 'GA1.1.1567894321.1790000000'), 'store');
  assert.equal('value' in report.toJSON().cookies.list[0], false);
});

test('categorias no formato do Blacklight, por site e para a página', () => {
  const report = new TabReport(1, 'https://www.quintoandar.com.br/');
  report.addRequest(req('https://script.hotjar.com/modules.abc.js'));
  report.addRequest(req('https://static.hotjar.com/c/hotjar-1203740.js?sv=7'));
  report.addRequest(req('https://stats.g.doubleclick.net/g/collect?v=2&tid=G-2NHZ8V3TH0', 'beacon'));
  const json = report.toJSON();
  assert.deepEqual(json.categories.map(c => c.category), ['ga-remarketing', 'session-recording']);
  assert.deepEqual(json.categories.find(c => c.category === 'session-recording').sites, ['hotjar.com']);
  assert.deepEqual(json.thirdParty.find(s => s.site === 'hotjar.com').categories, ['session-recording']);
});

// Indícios de sequestro do navegador

test('WebSocket e EventSource para terceiros contam como conexão persistente', () => {
  const report = new TabReport(1, 'https://privacy-test-pages.site/privacy-protections/request-blocking/');
  report.addRequest(req('wss://bad.third-party.site/block-me/web-socket', 'websocket'));
  report.addError({ url: 'wss://bad.third-party.site/block-me/web-socket', error: 'NS_ERROR_WEBSOCKET_CONNECTION_REFUSED' });
  report.markEventStream('https://bad.third-party.site/block-me/server-sent-events');
  const { summary, websockets, eventStreams } = report.toJSON().hijack;
  assert.equal(summary.thirdPartySockets, 2);
  assert.equal(websockets[0].thirdParty, true);
  assert.deepEqual(websockets[0].errors, ['NS_ERROR_WEBSOCKET_CONNECTION_REFUSED']);
  assert.equal(eventStreams[0].site, 'third-party.site');
});

test('polling: mesmo endpoint de terceiro em intervalos regulares', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  for (let i = 0; i < 6; i++) {
    report.addRequest(req(`https://ping.chartbeat.net/ping?h=uol.com.br&x=${i}`, 'image'));
    report.startedAt -= 15000; // próxima requisição 15 s depois
  }
  const { polling } = report.toJSON().hijack;
  assert.equal(polling.length, 1);
  assert.equal(polling[0].endpoint, 'ping.chartbeat.net/ping');
  assert.equal(polling[0].meanIntervalMs, 15000);
  assert.equal(polling[0].requests, 6);
});

test('requisições irregulares ou poucas não contam como polling', () => {
  const report = new TabReport(1, 'https://www.uol.com.br/');
  for (const gap of [100, 9000, 200, 20000]) {
    report.addRequest(req('https://api.permutive.com/v2.0/watson', 'xmlhttprequest'));
    report.startedAt -= gap;
  }
  report.addRequest(req('https://api.permutive.com/v2.0/watson', 'xmlhttprequest'));
  assert.equal(report.toJSON().hijack.polling.length, 0);
});

test('funções nativas substituídas, globais novas e listeners de teclado', () => {
  const page = 'https://www.quintoandar.com.br/';
  const report = new TabReport(1, page);
  const frame = { frameOrigin: 'https://www.quintoandar.com.br', frameUrl: page };
  report.addHookEvent({ kind: 'globals', addedCount: 3, added: ['dataLayer', 'Sentry', '__NEXT_DATA__'],
    overridden: [{ name: 'window.fetch', source: 'function(){...}' }], signatures: [], ...frame });
  report.addHookEvent({ kind: 'listener', type: 'keydown', target: 'document', script: 'https://static.hotjar.com/c/hotjar-1.js', ...frame });
  report.addHookEvent({ kind: 'listener', type: 'input', target: 'input', script: 'https://static.hotjar.com/c/hotjar-1.js', ...frame });
  report.addHookEvent({ kind: 'listener', type: 'keydown', target: 'window', script: `${page}_next/app.js`, ...frame });
  const { summary, keyboard, globals } = report.toJSON().hijack;
  assert.equal(summary.overridden, 1);
  assert.equal(summary.addedGlobals, 3);
  assert.equal(summary.thirdPartyKeyboardScripts, 1);
  assert.deepEqual(keyboard[0].types, ['input', 'keydown']);
  assert.equal(keyboard[0].scriptThirdParty, true);
  assert.deepEqual(globals.added, ['dataLayer', 'Sentry', '__NEXT_DATA__']);
});

test('assinaturas conhecidas de hook (script hook.js, cookie e global)', () => {
  const report = new TabReport(1, 'http://localhost:8000/');
  report.addRequest(req('http://127.0.0.1:3000/hook.js', 'script'));
  report.addCookie({ key: 'BEEFHOOK|localhost|/', name: 'BEEFHOOK', domain: 'localhost', path: '/',
    site: 'localhost', session: true, expires: null }, 'store');
  report.addHookEvent({ kind: 'globals', addedCount: 1, added: ['beef'], overridden: [], signatures: ['beef'],
    frameOrigin: 'http://localhost:8000', frameUrl: 'http://localhost:8000/' });
  assert.deepEqual(report.toJSON().hijack.signatures,
    ['cookie BEEFHOOK (localhost)', 'global beef', 'script hook.js (127.0.0.1)']);
});
