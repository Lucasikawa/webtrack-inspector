'use strict';

// Funções puras para detectar compartilhamento de identificadores: cookie sync,
// bounce tracking e parâmetros de rastreamento em URLs.
//
// Identificador: método de Acar et al., "The Web Never Forgets" (CCS 2014), e de
// Englehardt & Narayanan (CCS 2016): valores de cookies/storage divididos em
// trechos; um trecho é candidato a identificador se tiver pelo menos 8
// caracteres, contiver dígitos e não for um timestamp. Um identificador de um
// site que aparece na URL de uma requisição para outro site indica
// sincronização (o segundo site passa a conhecer o ID do primeiro).
const Tracking = (() => {
  const TOKEN = /[A-Za-z0-9_-]{8,128}/g;
  const YEAR_S = 365 * 24 * 60 * 60;

  // Parâmetros de rastreamento conhecidos (campanhas e cliques de anúncios).
  const TRACKING_PARAMS = new Set([
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'fbclid', 'fb_source', 'fb_ref', 'fb_action_ids', 'fb_action_types',
    'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'srsltid',
    'msclkid', 'yclid', 'igshid', 'twclid', 'ttclid', 'li_fat_id', 'epik', 'rdt_cid',
    'mc_eid', 'mc_cid', '_hsenc', '_hsmi', 'mkt_tok', 'oly_anon_id', 'oly_enc_id',
    'vero_id', '_openstat', 'rb_clickid', 's_cid', 'ncid', 'sc_cid', 'irclickid',
  ]);

  // Caminhos típicos de sincronização entre plataformas de anúncio.
  const SYNC_ENDPOINT = /(user-?sync|usersync|cookie-?sync|cookiesync|getuid|setuid|\/sync\b|syncframe|\/match\b|\/cm\b|\/cmf?\/|\/pixel\?.*google_nid|ttd_pid|\/idsync|\/rum\?|\/map\?)/i;

  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  function isTimestamp(token, now) {
    if (!/^\d+$/.test(token)) return false;
    const n = Number(token);
    const seconds = token.length === 13 ? n / 1000 : token.length === 10 ? n : NaN;
    return Math.abs(seconds - now / 1000) <= YEAR_S;
  }

  function isIdLike(token, now = Date.now()) {
    if (token.length < 8 || !/\d/.test(token)) return false;
    if (!/[A-Za-z]/.test(token) && token.length < 10) return false; // números curtos
    if (/^(.)\1+$/.test(token)) return false; // 00000000
    return !isTimestamp(token, now);
  }

  // Trechos com cara de identificador dentro de um valor (cookie, storage, URL).
  function idTokens(value, now = Date.now()) {
    const text = safeDecode(safeDecode(String(value)));
    return [...new Set(text.match(TOKEN) || [])].filter(t => isIdLike(t, now));
  }

  // Trechos da URL (caminho e query, decodificados) que podem carregar um ID.
  function urlTokens(url, now = Date.now()) {
    try {
      const u = new URL(url);
      return idTokens(u.pathname + u.search + u.hash, now);
    } catch {
      return [];
    }
  }

  function params(url) {
    try {
      return [...new URL(url).searchParams.entries()];
    } catch {
      return [];
    }
  }

  function trackingParams(url) {
    return params(url).filter(([name]) => TRACKING_PARAMS.has(name.toLowerCase()));
  }

  function isSyncEndpoint(url) {
    try {
      const u = new URL(url);
      return SYNC_ENDPOINT.test(u.pathname + u.search);
    } catch {
      return false;
    }
  }

  return { isIdLike, idTokens, urlTokens, params, trackingParams, isSyncEndpoint, TRACKING_PARAMS };
})();

if (typeof module !== 'undefined') module.exports = Tracking;
