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
