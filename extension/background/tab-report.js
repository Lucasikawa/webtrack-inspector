'use strict';

// O Firefox marca as requisições com as listas da Proteção Aprimorada contra
// Rastreamento (details.urlClassification). Estas flags indicam rastreador;
// as demais (ex.: consentmanager, anti_fraud) não.
const TRACKER_FLAG = /tracking|fingerprinting|cryptomining/;

// Erros de rede com que a Proteção Aprimorada do Firefox cancela requisições
// (ex.: NS_ERROR_TRACKING_URI, NS_ERROR_SOCIALTRACKING_URI).
const FIREFOX_BLOCK_ERROR = /NS_ERROR_\w*(TRACKING|FINGERPRINTING|CRYPTOMINING)_URI/;

// Relatório de uma navegação de nível superior (uma página) em uma aba.
class TabReport {
  static normalizeUrl(url) {
    return (url || '').split('#')[0];
  }

  constructor(tabId, url, requestId = null) {
    this.tabId = tabId;
    this.requestId = requestId; // requisição main_frame que originou a navegação
    this.startedAt = Date.now();
    this.version = 0; // incrementa a cada mudança; o popup só redesenha se mudar
    this.navigationChain = []; // URLs do main_frame, incluindo redirecionamentos
    this.totalRequests = 0;
    this.hosts = new Map(); // host -> dados agregados das requisições
    this.setUrl(url);
  }

  setUrl(url) {
    this.url = TabReport.normalizeUrl(url);
    this.host = Parties.hostOf(this.url);
    this.site = Parties.siteOf(this.host);
    this.navigationChain.push(this.url);
    // Um redirecionamento do main_frame pode mudar o site de topo: reclassifica.
    for (const entry of this.hosts.values()) {
      entry.thirdParty = Parties.isThirdParty(entry.site, this.site);
    }
    this.version++;
  }

  // Registra uma requisição. Retorna true se ela trouxe um novo site de terceira parte.
  addRequest(details) {
    const host = Parties.hostOf(details.url);
    if (!host) return false;

    let entry = this.hosts.get(host);
    let isNewSite = false;
    if (!entry) {
      const site = Parties.siteOf(host);
      isNewSite = ![...this.hosts.values()].some(e => e.site === site);
      entry = {
        host,
        site,
        thirdParty: Parties.isThirdParty(site, this.site),
        firefoxThirdParty: false,
        requests: 0,
        types: new Set(),
        classifications: new Set(),
        errors: {}, // erro de rede -> quantidade
        firstSeenMs: Date.now() - this.startedAt,
      };
      this.hosts.set(host, entry);
    }

    this.totalRequests++;
    entry.requests++;
    entry.types.add(details.type);
    // details.thirdParty é o cálculo do próprio Firefox, que considera toda a
    // hierarquia de frames; guardado para comparação com o nosso.
    if (details.thirdParty) entry.firefoxThirdParty = true;
    const cls = details.urlClassification;
    if (cls) {
      for (const flag of [...(cls.firstParty || []), ...(cls.thirdParty || [])]) {
        entry.classifications.add(flag);
      }
    }
    this.version++;
    return isNewSite && entry.thirdParty;
  }

  // Registra uma requisição que falhou (webRequest.onErrorOccurred).
  addError(details) {
    const entry = this.hosts.get(Parties.hostOf(details.url));
    if (!entry || !details.error) return;
    entry.errors[details.error] = (entry.errors[details.error] || 0) + 1;
    this.version++;
  }

  thirdPartySiteCount() {
    const sites = new Set();
    for (const entry of this.hosts.values()) if (entry.thirdParty) sites.add(entry.site);
    return sites.size;
  }

  // Visão serializável, agrupada por site, usada pelo popup e pela exportação.
  toJSON() {
    const bySite = new Map();
    for (const e of this.hosts.values()) {
      let s = bySite.get(e.site);
      if (!s) {
        s = {
          site: e.site,
          thirdParty: e.thirdParty,
          firefoxThirdParty: false,
          requests: 0,
          firstSeenMs: e.firstSeenMs,
          hosts: [],
          types: new Set(),
          classifications: new Set(),
          errors: {},
        };
        bySite.set(e.site, s);
      }
      for (const [error, n] of Object.entries(e.errors)) s.errors[error] = (s.errors[error] || 0) + n;
      s.requests += e.requests;
      s.firstSeenMs = Math.min(s.firstSeenMs, e.firstSeenMs);
      s.firefoxThirdParty = s.firefoxThirdParty || e.firefoxThirdParty;
      s.hosts.push({ host: e.host, requests: e.requests });
      e.types.forEach(t => s.types.add(t));
      e.classifications.forEach(c => s.classifications.add(c));
    }

    const sites = [...bySite.values()].map(s => ({
      ...s,
      hosts: s.hosts.sort((a, b) => b.requests - a.requests),
      types: [...s.types].sort(),
      classifications: [...s.classifications].sort(),
      tracker: [...s.classifications].some(c => TRACKER_FLAG.test(c)),
      blockedByFirefox: Object.keys(s.errors).some(e => FIREFOX_BLOCK_ERROR.test(e)),
    }));
    const byRelevance = (a, b) =>
      b.tracker - a.tracker || b.requests - a.requests || a.site.localeCompare(b.site);
    const thirdParty = sites.filter(s => s.thirdParty).sort(byRelevance);
    const firstParty = sites.filter(s => !s.thirdParty).sort(byRelevance);
    const sum = (list, fn) => list.reduce((n, s) => n + fn(s), 0);

    return {
      tabId: this.tabId,
      url: this.url,
      host: this.host,
      site: this.site,
      startedAt: this.startedAt,
      version: this.version,
      navigationChain: this.navigationChain,
      totals: {
        requests: this.totalRequests,
        thirdPartyRequests: sum(thirdParty, s => s.requests),
        thirdPartySites: thirdParty.length,
        thirdPartyHosts: sum(thirdParty, s => s.hosts.length),
        trackerSites: thirdParty.filter(s => s.tracker).length,
        blockedByFirefoxSites: thirdParty.filter(s => s.blockedByFirefox).length,
        firstPartyHosts: sum(firstParty, s => s.hosts.length),
      },
      thirdParty,
      firstParty,
    };
  }
}

if (typeof module !== 'undefined') module.exports = TabReport;
