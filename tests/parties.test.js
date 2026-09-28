'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Parties = require('../extension/background/parties.js');

test('reconhece sufixos públicos', () => {
  assert.equal(Parties.isPublicSuffix('sp.gov.br'), true);
  assert.equal(Parties.isPublicSuffix('.github.io'), true);
  assert.equal(Parties.isPublicSuffix('www.sp.gov.br'), false);
  assert.equal(Parties.isPublicSuffix('quintoandar.com.br'), false);
  assert.equal(Parties.isPublicSuffix('127.0.0.1'), false);
});

test('siteOf usa o eTLD+1, inclusive sufixos compostos', () => {
  assert.equal(Parties.siteOf('https://www.google.com.br/search?q=x'), 'google.com.br');
  assert.equal(Parties.siteOf('stats.g.doubleclick.net'), 'doubleclick.net');
  assert.equal(Parties.siteOf('https://bbc.co.uk/'), 'bbc.co.uk');
});

test('siteOf trata sufixos privados da PSL como os navegadores', () => {
  assert.equal(Parties.siteOf('https://alice.github.io/'), 'alice.github.io');
  assert.notEqual(Parties.siteOf('alice.github.io'), Parties.siteOf('bob.github.io'));
});

test('siteOf devolve o próprio host para IPs e localhost', () => {
  assert.equal(Parties.siteOf('http://localhost:8000/x'), 'localhost');
  assert.equal(Parties.siteOf('http://127.0.0.1:8001/'), '127.0.0.1');
});

test('siteOf tolera URLs inválidas', () => {
  assert.equal(Parties.siteOf('nao é/uma url'), '');
});

test('isThirdParty compara sites', () => {
  assert.equal(Parties.isThirdParty('doubleclick.net', 'uol.com.br'), true);
  assert.equal(Parties.isThirdParty('uol.com.br', 'uol.com.br'), false);
  assert.equal(Parties.isThirdParty('', 'uol.com.br'), false);
});
