'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.Parties = require('../extension/background/parties.js');
const Cookies = require('../extension/background/cookies.js');

const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

test('interpreta atributos de um Set-Cookie persistente de domínio', () => {
  const c = Cookies.parseSetCookie(
    'IDE=AHWqTU; Domain=.doubleclick.net; Path=/; Max-Age=34190000; Secure; HttpOnly; SameSite=None',
    'https://ad.doubleclick.net/pixel', NOW);
  assert.equal(c.name, 'IDE');
  assert.equal(c.domain, 'doubleclick.net');
  assert.equal(c.hostOnly, false);
  assert.equal(c.site, 'doubleclick.net');
  assert.equal(c.session, false);
  assert.equal(c.expires, NOW + 34190000 * 1000);
  assert.equal(c.secure, true);
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'none');
  assert.equal(c.key, 'IDE|doubleclick.net|/');
});

test('sem Expires/Max-Age é cookie de sessão, host-only e com default-path', () => {
  const c = Cookies.parseSetCookie('sid=abc', 'https://www.example.com/conta/login', NOW);
  assert.equal(c.session, true);
  assert.equal(c.expires, null);
  assert.equal(c.hostOnly, true);
  assert.equal(c.domain, 'www.example.com');
  assert.equal(c.path, '/conta');
});

test('Max-Age tem precedência sobre Expires', () => {
  const c = Cookies.parseSetCookie('a=1; Expires=Wed, 21 Aug 2030 20:00:00 GMT; Max-Age=60', 'https://x.com/', NOW);
  assert.equal(c.expires, NOW + 60000);
});

test('Expires no formato de data HTTP', () => {
  const c = Cookies.parseSetCookie('a=1; expires=Wed, 21 Aug 2030 20:00:00 GMT', 'https://x.com/', NOW);
  assert.equal(c.expires, Date.UTC(2030, 7, 21, 20, 0, 0));
});

test('cookies de remoção não contam como injeção', () => {
  assert.equal(Cookies.parseSetCookie('a=; Max-Age=0', 'https://x.com/', NOW), null);
  assert.equal(Cookies.parseSetCookie('a=; Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'https://x.com/', NOW), null);
});

test('Domain num sufixo público: descartado, salvo se for o próprio host', () => {
  // Imperva no www.sp.gov.br tenta gravar em .sp.gov.br, que é sufixo público.
  assert.equal(Cookies.parseSetCookie('visid_incap_1=abc; Domain=.sp.gov.br; Path=/', 'https://www.sp.gov.br/', NOW), null);
  const own = Cookies.parseSetCookie('a=1; Domain=sp.gov.br', 'https://sp.gov.br/', NOW);
  assert.equal(own.domain, 'sp.gov.br');
  assert.equal(own.hostOnly, true);
  const normal = Cookies.parseSetCookie('b=2; Domain=.quintoandar.com.br', 'https://www.quintoandar.com.br/', NOW);
  assert.equal(normal.hostOnly, false);
});

test('separa vários Set-Cookie que o Firefox junta com \\n', () => {
  const headers = [
    { name: 'Content-Type', value: 'text/html' },
    { name: 'Set-Cookie', value: 'a=1; Path=/\nb=2; Max-Age=3600\nc=; Max-Age=0' },
  ];
  const cookies = Cookies.parseSetCookieHeaders(headers, 'https://www.quintoandar.com.br/', NOW);
  assert.deepEqual(cookies.map(c => c.name), ['a', 'b']);
});

test('normaliza cookies da API browser.cookies, inclusive particionados', () => {
  const c = Cookies.fromBrowserCookie({
    name: '_ga', value: 'GA1.1.123', domain: '.uol.com.br', hostOnly: false, path: '/',
    session: false, expirationDate: NOW / 1000 + 400 * 86400, secure: false, httpOnly: false,
    sameSite: 'no_restriction', partitionKey: { topLevelSite: 'https://uol.com.br' },
  });
  assert.equal(c.key, '_ga|uol.com.br|/');
  assert.equal(c.site, 'uol.com.br');
  assert.equal(c.sameSite, 'none');
  assert.equal(c.partitioned, true);
  assert.equal(c.expires, NOW + 400 * 86400 * 1000);
});

test('chave do Set-Cookie e da API coincidem para o mesmo cookie', () => {
  const fromHeader = Cookies.parseSetCookie('uid=9; Domain=.criteo.com; Path=/; Max-Age=100', 'https://gum.criteo.com/sync', NOW);
  const fromStore = Cookies.fromBrowserCookie({
    name: 'uid', value: '9', domain: '.criteo.com', hostOnly: false, path: '/', session: false,
    expirationDate: NOW / 1000 + 100, secure: false, httpOnly: false, sameSite: 'lax',
  });
  assert.equal(fromHeader.key, fromStore.key);
});
