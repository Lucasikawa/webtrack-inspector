'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Blocklist = require('../extension/background/blocklist.js');

test('normaliza o que o usuário digita', () => {
  assert.equal(Blocklist.normalize('bad.third-party.site'), 'bad.third-party.site');
  assert.equal(Blocklist.normalize('  DoubleClick.NET '), 'doubleclick.net');
  assert.equal(Blocklist.normalize('*.doubleclick.net'), 'doubleclick.net');
  assert.equal(Blocklist.normalize('https://ads.x.com:8443/tag.js?a=1'), 'ads.x.com');
  assert.equal(Blocklist.normalize('127.0.0.1'), '127.0.0.1');
  assert.equal(Blocklist.normalize('não é domínio'), null);
  assert.equal(Blocklist.normalize(''), null);
});

test('um domínio cobre os subdomínios, mas não domínios parecidos', () => {
  const list = new Set(['doubleclick.net', 'bad.third-party.site']);
  assert.equal(Blocklist.match('securepubads.g.doubleclick.net', list), 'doubleclick.net');
  assert.equal(Blocklist.match('doubleclick.net', list), 'doubleclick.net');
  assert.equal(Blocklist.match('bad.third-party.site', list), 'bad.third-party.site');
  assert.equal(Blocklist.match('good.third-party.site', list), null);
  assert.equal(Blocklist.match('notdoubleclick.net', list), null);
});
