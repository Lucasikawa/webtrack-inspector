'use strict';

// Categorias de rastreamento com as mesmas definições dos testes do Blacklight
// (The Markup), para comparar linha a linha: gravação de sessão, pixels de redes
// sociais e Google Analytics com remarketing. Cada regra olha host e caminho de
// uma requisição.
const Categories = (() => {
  const endsWith = (host, domains) => domains.some(d => host === d || host.endsWith(`.${d}`));

  // Serviços de gravação de sessão (session replay), que registram cliques,
  // rolagem e digitação para reproduzir a visita.
  const SESSION_RECORDERS = [
    'hotjar.com', 'hotjar.io', 'clarity.ms', 'fullstory.com', 'mouseflow.com',
    'smartlook.com', 'smartlook.cloud', 'logrocket.com', 'logrocket.io', 'lr-ingest.io',
    'luckyorange.com', 'luckyorange.net', 'inspectlet.com', 'sessioncam.com',
    'quantummetric.com', 'contentsquare.net', 'decibelinsight.net', 'glassboxdigital.io',
  ];

  const RULES = [
    {
      category: 'session-recording',
      label: 'gravação de sessão',
      test: (host, path) => endsWith(host, SESSION_RECORDERS)
        || (endsWith(host, ['mc.yandex.ru', 'mc.yandex.com']) && /webvisor/i.test(path)),
    },
    {
      category: 'facebook-pixel',
      label: 'pixel do Facebook',
      test: (host, path) => (endsWith(host, ['facebook.com']) && path.startsWith('/tr'))
        || (host === 'connect.facebook.net' && /fbevents\.js/.test(path)),
    },
    {
      category: 'tiktok-pixel',
      label: 'pixel do TikTok',
      test: host => endsWith(host, ['analytics.tiktok.com']),
    },
    {
      category: 'x-pixel',
      label: 'pixel do X (Twitter)',
      test: (host, path) => (endsWith(host, ['analytics.twitter.com', 't.co', 'ads-twitter.com', 'ads-api.x.com'])
        && /\/i\/adsct|uwt\.js|\/adsct/.test(path)),
    },
    {
      category: 'ga-remarketing',
      label: 'Google Analytics com remarketing',
      // Recursos de publicidade do Google Analytics ("remarketing audiences"):
      // o hit é espelhado para o domínio de anúncios do Google.
      test: (host, path) => (host === 'stats.g.doubleclick.net' && /\/(r|j|g)\/collect/.test(path))
        || (/^(www\.)?google\.[a-z.]+$/.test(host) && path.startsWith('/ads/ga-audiences')),
    },
    {
      category: 'linkedin-insight',
      label: 'LinkedIn Insight',
      test: (host, path) => host === 'px.ads.linkedin.com' || (host === 'snap.licdn.com' && /insight/.test(path)),
    },
  ];

  const LABELS = Object.fromEntries(RULES.map(r => [r.category, r.label]));

  function categoriesOf(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return [];
    }
    const host = u.hostname.toLowerCase();
    return RULES.filter(rule => rule.test(host, u.pathname)).map(rule => rule.category);
  }

  return { categoriesOf, LABELS, SESSION_RECORDERS };
})();

if (typeof module !== 'undefined') module.exports = Categories;
