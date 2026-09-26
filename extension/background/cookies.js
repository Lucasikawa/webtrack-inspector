'use strict';

// Cookies vistos por dois caminhos, normalizados no mesmo formato para serem
// mesclados pela chave nome|domínio|path:
//  - cabeçalhos Set-Cookie das respostas HTTP (webRequest.onHeadersReceived);
//  - a API browser.cookies (cookies.onChanged), que mostra o que o navegador de
//    fato gravou, inclusive cookies criados por JavaScript (document.cookie).
const Cookies = (() => {
  function keyOf(name, domain, path) {
    return `${name}|${domain}|${path}`;
  }

  // default-path da RFC 6265 (seção 5.1.4): diretório do path da URL.
  function defaultPath(url) {
    let path;
    try {
      path = new URL(url).pathname;
    } catch {
      return '/';
    }
    const last = path.lastIndexOf('/');
    return last <= 0 ? '/' : path.slice(0, last);
  }

  function describe({ name, domain, hostOnly, path, session, expires, secure, httpOnly, sameSite, partitioned, valueLength }) {
    return {
      key: keyOf(name, domain, path),
      name,
      domain,
      hostOnly,
      path,
      site: Parties.siteOf(domain),
      session,
      expires, // epoch em ms; null para cookies de sessão
      secure,
      httpOnly,
      sameSite,
      partitioned, // null quando desconhecido (só a API de cookies informa)
      valueLength,
    };
  }

  // Uma linha Set-Cookie. Devolve null para cookies de remoção (Max-Age <= 0 ou
  // Expires no passado), que não são injeções.
  function parseSetCookie(line, url, now = Date.now()) {
    const [pair, ...attributes] = line.split(';');
    const eq = pair.indexOf('=');
    const name = (eq === -1 ? '' : pair.slice(0, eq)).trim();
    const value = (eq === -1 ? pair : pair.slice(eq + 1)).trim();
    if (!name && !value) return null;

    let domain = Parties.hostOf(url);
    let hostOnly = true;
    let path = null;
    let expires = null;
    let maxAge = null;
    let secure = false;
    let httpOnly = false;
    let sameSite = null;
    for (const attribute of attributes) {
      const i = attribute.indexOf('=');
      const key = (i === -1 ? attribute : attribute.slice(0, i)).trim().toLowerCase();
      const val = i === -1 ? '' : attribute.slice(i + 1).trim();
      if (key === 'domain' && val.replace(/^\./, '')) {
        domain = val.replace(/^\./, '').toLowerCase();
        hostOnly = false;
      } else if (key === 'path' && val.startsWith('/')) {
        path = val;
      } else if (key === 'expires' && !Number.isNaN(Date.parse(val))) {
        expires = Date.parse(val);
      } else if (key === 'max-age' && /^-?\d+$/.test(val)) {
        maxAge = Number(val);
      } else if (key === 'secure') {
        secure = true;
      } else if (key === 'httponly') {
        httpOnly = true;
      } else if (key === 'samesite') {
        sameSite = val.toLowerCase();
      }
    }
    if (maxAge !== null) expires = now + maxAge * 1000; // Max-Age tem precedência
    if (expires !== null && expires <= now) return null;

    return describe({
      name,
      domain,
      hostOnly,
      path: path || defaultPath(url),
      session: expires === null,
      expires,
      secure,
      httpOnly,
      sameSite,
      partitioned: null,
      valueLength: value.length,
    });
  }

  // Todos os Set-Cookie de uma resposta. O Firefox entrega vários Set-Cookie
  // num único cabeçalho, separados por \n.
  function parseSetCookieHeaders(headers, url, now = Date.now()) {
    const cookies = [];
    for (const header of headers || []) {
      if (header.name.toLowerCase() !== 'set-cookie' || !header.value) continue;
      for (const line of header.value.split('\n')) {
        const cookie = line.trim() ? parseSetCookie(line, url, now) : null;
        if (cookie) cookies.push(cookie);
      }
    }
    return cookies;
  }

  // Cookie da API browser.cookies.
  function fromBrowserCookie(c) {
    return describe({
      name: c.name,
      domain: c.domain.replace(/^\./, '').toLowerCase(),
      hostOnly: c.hostOnly,
      path: c.path,
      session: c.session,
      expires: c.session ? null : Math.round(c.expirationDate * 1000),
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite === 'no_restriction' ? 'none' : c.sameSite,
      partitioned: Boolean(c.partitionKey && c.partitionKey.topLevelSite),
      valueLength: (c.value || '').length,
    });
  }

  return { keyOf, defaultPath, parseSetCookie, parseSetCookieHeaders, fromBrowserCookie };
})();

if (typeof module !== 'undefined') module.exports = Cookies;
