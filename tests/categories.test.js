'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Categories = require('../extension/background/categories.js');

test('gravação de sessão pelos domínios dos serviços', () => {
  assert.deepEqual(Categories.categoriesOf('https://static.hotjar.com/c/hotjar-1.js'), ['session-recording']);
  assert.deepEqual(Categories.categoriesOf('https://f.clarity.ms/collect'), ['session-recording']);
  assert.deepEqual(Categories.categoriesOf('https://www.hotjar.com.evil.example/'), []);
});

test('pixels de redes sociais', () => {
  assert.deepEqual(Categories.categoriesOf('https://www.facebook.com/tr/?id=1&ev=PageView'), ['facebook-pixel']);
  assert.deepEqual(Categories.categoriesOf('https://connect.facebook.net/en_US/fbevents.js'), ['facebook-pixel']);
  assert.deepEqual(Categories.categoriesOf('https://www.facebook.com/profile'), []);
  assert.deepEqual(Categories.categoriesOf('https://analytics.twitter.com/i/adsct?txn_id=o1'), ['x-pixel']);
  assert.deepEqual(Categories.categoriesOf('https://analytics.tiktok.com/i18n/pixel/events.js'), ['tiktok-pixel']);
});

test('Google Analytics com remarketing', () => {
  assert.deepEqual(Categories.categoriesOf('https://stats.g.doubleclick.net/g/collect?v=2&tid=G-1'), ['ga-remarketing']);
  assert.deepEqual(Categories.categoriesOf('https://www.google.com.br/ads/ga-audiences?v=1'), ['ga-remarketing']);
  assert.deepEqual(Categories.categoriesOf('https://www.google-analytics.com/g/collect?v=2'), []);
});
