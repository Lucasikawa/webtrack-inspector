'use strict';

// Classificação de primeira × terceira parte pelo "site" (eTLD+1, domínio
// registrável). Usa a Public Suffix List via tldts, incluindo a seção privada
// (ex.: github.io), que é a mesma noção de site usada pelos navegadores.
const Parties = (() => {
  const psl = typeof tldts !== 'undefined' ? tldts : require('tldts');
  const OPTIONS = { allowPrivateDomains: true };

  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  // Aceita URL ou hostname. IPs e nomes sem sufixo público (localhost) não
  // têm eTLD+1: nesses casos o próprio host é o site.
  function siteOf(hostOrUrl) {
    const host = hostOrUrl.includes('/') ? hostOf(hostOrUrl) : hostOrUrl.toLowerCase();
    if (!host) return '';
    return psl.getDomain(host, OPTIONS) || host;
  }

  function isThirdParty(site, topSite) {
    return Boolean(site && topSite && site !== topSite);
  }

  return { hostOf, siteOf, isThirdParty };
})();

if (typeof module !== 'undefined') module.exports = Parties;
