'use strict';

// Lista de bloqueio personalizada: domínios cujas requisições de terceira parte
// são canceladas. Um domínio cobre também os subdomínios (doubleclick.net
// bloqueia securepubads.g.doubleclick.net).
const Blocklist = (() => {
  const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;
  const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

  // Aceita "doubleclick.net", "*.doubleclick.net", "https://ads.x.com/caminho"...
  // Devolve o host normalizado ou null se não for um domínio válido.
  function normalize(input) {
    let text = String(input || '').trim().toLowerCase();
    text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // esquema
    text = text.split(/[/?#]/)[0]; // caminho, query, fragmento
    text = text.replace(/:\d+$/, ''); // porta
    text = text.replace(/^\*?\./, '').replace(/\.$/, '');
    return HOST.test(text) || IPV4.test(text) || text === 'localhost' ? text : null;
  }

  // Regra da lista que cobre o host (o próprio host ou um domínio pai), ou null.
  function match(host, list) {
    let candidate = String(host || '').toLowerCase();
    while (candidate) {
      if (list.has(candidate)) return candidate;
      const dot = candidate.indexOf('.');
      if (dot === -1) return null;
      candidate = candidate.slice(dot + 1);
    }
    return null;
  }

  return { normalize, match };
})();

if (typeof module !== 'undefined') module.exports = Blocklist;
