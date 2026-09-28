'use strict';

// O Firefox marca as requisições com as listas da Proteção Aprimorada contra
// Rastreamento (details.urlClassification). Estas flags indicam rastreador;
// as demais (ex.: consentmanager, anti_fraud) não.
const TRACKER_FLAG = /tracking|fingerprinting|cryptomining/;

// Erros de rede com que a Proteção Aprimorada do Firefox cancela requisições
// (ex.: NS_ERROR_TRACKING_URI, NS_ERROR_SOCIALTRACKING_URI).
const FIREFOX_BLOCK_ERROR = /NS_ERROR_\w*(TRACKING|FINGERPRINTING|CRYPTOMINING)_URI/;

// Janela de coleta: primeiros 30 s após o início da navegação, a mesma usada
// para o HAR no protocolo de evidências. Define os cookies "injetados no
// carregamento" e o recorte de terceiros comparável ao HAR. (O evento load não
// serve: em páginas que nunca param de fazer requisições, como portais com vídeo
// ao vivo e anúncios que se renovam, ele pode não ocorrer em minutos.)
const CAPTURE_WINDOW_MS = 30000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Limite de eventos de fingerprinting guardados por página.
const MAX_HOOK_EVENTS = 200;

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
    this.cookies = new Map(); // nome|domínio|path -> cookie observado
    this.storage = new Map(); // origem -> último retrato do armazenamento HTML5
    this.hookEvents = []; // leituras de canvas, consultas à GPU, sondagem de fontes
    this.writers = new Map(); // cookie ou chave de storage -> scripts que gravaram
    this.loadedMs = null; // tempo até o evento load do documento de topo
    this.setUrl(url);
  }

  elapsed() {
    return Date.now() - this.startedAt;
  }

  markLoaded() {
    if (this.loadedMs !== null) return;
    this.loadedMs = this.elapsed();
    this.version++;
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
        firstSeenMs: this.elapsed(),
        lastSeenAt: 0,
      };
      this.hosts.set(host, entry);
    }

    entry.lastSeenAt = Date.now();
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

  // source 'http': Set-Cookie de uma resposta desta aba (sourceUrl = URL da resposta).
  // source 'store': cookie gravado, visto pela API de cookies.
  addCookie(cookie, source, sourceUrl = null) {
    let entry = this.cookies.get(cookie.key);
    if (!entry) {
      entry = { ...cookie, viaHttp: false, stored: false, sourceUrl: null, firstSeenMs: this.elapsed() };
      this.cookies.set(cookie.key, entry);
    }
    if (source === 'http') {
      entry.viaHttp = true;
      entry.sourceUrl = entry.sourceUrl || sourceUrl;
      if (!entry.stored) Object.assign(entry, cookie);
    } else {
      // A API de cookies reflete o que o navegador de fato gravou.
      entry.stored = true;
      Object.assign(entry, cookie);
    }
    this.version++;
  }

  // A API de cookies não informa a aba. Um cookie gravado é atribuído a esta
  // página se for do próprio site ou de um site que ela contatou há pouco.
  involvesSite(site, withinMs = 30000) {
    if (site === this.site) return true;
    const now = Date.now();
    for (const entry of this.hosts.values()) {
      if (entry.site === site && now - entry.lastSeenAt <= withinMs) return true;
    }
    return false;
  }

  cookiesJSON() {
    const list = [...this.cookies.values()]
      .map(c => {
        const writers = this.writersOf(`cookie|${c.site}|${c.name}`);
        return { ...c, writers, writersThirdParty: writers.some(w => this.isThirdPartyUrl(w)) };
      })
      .map(c => ({
        ...c,
        thirdParty: Parties.isThirdParty(c.site, this.site),
        inWindow: c.firstSeenMs <= CAPTURE_WINDOW_MS,
        // Validade no momento em que o cookie foi definido, em dias (precisão de
        // ~1 min, para cookies de sessão do Hotjar e afins, que duram 30 min).
        lifetimeDays: c.expires === null
          ? null
          : Math.round(((c.expires - this.startedAt - c.firstSeenMs) / DAY_MS) * 1000) / 1000,
      }))
      .sort((a, b) => b.thirdParty - a.thirdParty || a.site.localeCompare(b.site) || a.name.localeCompare(b.name));

    // Matriz 1ª/3ª parte x sessão/persistente de um conjunto de cookies.
    const matrix = cookies => {
      const count = predicate => cookies.filter(predicate).length;
      return {
        firstParty: {
          session: count(c => !c.thirdParty && c.session),
          persistent: count(c => !c.thirdParty && !c.session),
        },
        thirdParty: {
          session: count(c => c.thirdParty && c.session),
          persistent: count(c => c.thirdParty && !c.session),
        },
      };
    };
    const count = predicate => list.filter(predicate).length;
    const inWindow = list.filter(c => c.inWindow);
    return {
      // Todos os cookies da página; "window" restringe aos da janela de coleta
      // (cookies criados depois, por interação ou anúncios renovados, ficam fora).
      summary: {
        total: list.length,
        windowMs: CAPTURE_WINDOW_MS,
        inWindow: inWindow.length,
        afterWindow: list.length - inWindow.length,
        ...matrix(list),
        window: matrix(inWindow),
        longLived: count(c => c.lifetimeDays !== null && c.lifetimeDays > 365),
        viaHttp: count(c => c.viaHttp),
        viaJs: count(c => !c.viaHttp && c.stored),
        notStored: count(c => c.viaHttp && !c.stored),
        partitioned: count(c => c.partitioned === true),
        // Cookies de primeira parte gravados via document.cookie por scripts de
        // terceiros (ex.: _ga do Google Analytics).
        firstPartyByThirdPartyScript: count(c => !c.thirdParty && c.writersThirdParty),
      },
      list,
    };
  }

  // Retrato enviado pelo content script de um frame (content/storage.js).
  // Frames da mesma origem compartilham o armazenamento: guarda um por origem.
  addStorageSnapshot(snapshot) {
    const { collectedAt, url, isTop, frameId, ...content } = snapshot;
    const signature = JSON.stringify(content);
    const prev = this.storage.get(snapshot.origin);
    const wasTop = Boolean(prev && prev.isTop);
    if (prev && prev.signature === signature && (wasTop || !isTop)) return;
    this.storage.set(snapshot.origin, {
      ...snapshot,
      isTop: isTop || wasTop,
      site: Parties.siteOf(snapshot.origin),
      signature,
    });
    this.version++;
  }

  storageJSON() {
    const items = s => s.localStorage.count + s.sessionStorage.count + s.indexedDB.count + s.cacheStorage.count;
    const withWriters = (origin, area, info) => ({
      ...info,
      keys: (info.keys || []).map(k => ({ ...k, writers: this.writersOf(`storage|${origin}|${area}|${k.key}`) })),
    });
    const origins = [...this.storage.values()]
      .map(({ signature, frameId, ...s }) => ({
        ...s,
        localStorage: withWriters(s.origin, 'localStorage', s.localStorage),
        sessionStorage: withWriters(s.origin, 'sessionStorage', s.sessionStorage),
        thirdParty: Parties.isThirdParty(s.site, this.site),
        items: items(s),
      }))
      .sort((a, b) => a.thirdParty - b.thirdParty || b.isTop - a.isTop || b.items - a.items || a.origin.localeCompare(b.origin));
    const sum = fn => origins.reduce((n, s) => n + fn(s), 0);
    return {
      summary: {
        origins: origins.length,
        originsWithData: origins.filter(s => s.items > 0).length,
        thirdPartyOriginsWithData: origins.filter(s => s.thirdParty && s.items > 0).length,
        items: sum(s => s.items),
        localStorageKeys: sum(s => s.localStorage.count),
        localStorageBytes: sum(s => s.localStorage.bytes),
        sessionStorageKeys: sum(s => s.sessionStorage.count),
        sessionStorageBytes: sum(s => s.sessionStorage.bytes),
        indexedDBDatabases: sum(s => s.indexedDB.count),
        cacheStorageCaches: sum(s => s.cacheStorage.count),
        blockedOrigins: origins.filter(s => !s.localStorage.available).length,
      },
      origins,
    };
  }

  // Evento de content/hooks.js.
  addHookEvent(event) {
    if (event.kind === 'cookieWrite') {
      this.addWriter(`cookie|${Parties.siteOf(event.frameOrigin)}|${event.name}`, event.script);
    } else if (event.kind === 'storageWrite') {
      this.addWriter(`storage|${event.frameOrigin}|${event.area}|${event.key}`, event.script);
    } else if (this.hookEvents.length < MAX_HOOK_EVENTS) {
      this.hookEvents.push({ ...event, receivedMs: this.elapsed() });
    } else {
      return;
    }
    this.version++;
  }

  addWriter(key, script) {
    if (!script) return;
    if (!this.writers.has(key)) this.writers.set(key, new Set());
    this.writers.get(key).add(script);
  }

  writersOf(key) {
    return [...(this.writers.get(key) || [])];
  }

  isThirdPartyUrl(url) {
    return Parties.isThirdParty(Parties.siteOf(url), this.site);
  }

  // Script identificado pela pilha de chamadas. Script inline aparece com a URL
  // do próprio documento.
  describeScript(url, frameUrl) {
    return {
      script: url || null,
      scriptSite: url ? Parties.siteOf(url) : null,
      scriptThirdParty: url ? this.isThirdPartyUrl(url) : false,
      inline: Boolean(url && frameUrl && TabReport.normalizeUrl(url) === TabReport.normalizeUrl(frameUrl)),
    };
  }

  fingerprintJSON() {
    const detections = [];
    const discarded = [];
    for (const e of this.hookEvents) {
      const base = { ...this.describeScript(e.script, e.frameUrl), frameOrigin: e.frameOrigin, receivedMs: e.receivedMs };
      if (e.kind === 'canvas') {
        const { technique, criteria } = Fingerprint.evaluateCanvas(e);
        const item = {
          technique,
          ...base,
          method: e.method,
          format: e.format || null,
          contextType: e.contextType,
          width: e.width,
          height: e.height,
          area: e.area || null,
          chars: e.chars,
          colors: e.colors,
          textSample: e.textSample,
          offscreen: Boolean(e.offscreen),
          copiedFrom: e.copiedFrom || null,
          criteria,
        };
        (technique ? detections : discarded).push(item);
      } else if (e.kind === 'webglInfo') {
        detections.push({ technique: 'webgl-info', ...base, parameter: e.parameter });
      } else if (e.kind === 'fontProbe') {
        detections.push({ technique: 'fonts', ...base, fonts: e.fonts, repeats: e.repeats, textSample: e.textSample });
      }
    }
    const byTechnique = {};
    for (const d of detections) byTechnique[d.technique] = (byTechnique[d.technique] || 0) + 1;
    const scripts = new Set(detections.map(d => d.script));
    const thirdPartyScripts = new Set(detections.filter(d => d.scriptThirdParty).map(d => d.script));
    return {
      summary: {
        detections: detections.length,
        scripts: scripts.size,
        thirdPartyScripts: thirdPartyScripts.size,
        byTechnique,
        discarded: discarded.length,
      },
      detections,
      discarded,
    };
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
      loadedMs: this.loadedMs,
      version: this.version,
      navigationChain: this.navigationChain,
      totals: {
        requests: this.totalRequests,
        thirdPartyRequests: sum(thirdParty, s => s.requests),
        thirdPartySites: thirdParty.length,
        thirdPartyHosts: sum(thirdParty, s => s.hosts.length),
        trackerSites: thirdParty.filter(s => s.tracker).length,
        // Recorte da janela de coleta, comparável ao HAR.
        windowThirdPartySites: thirdParty.filter(s => s.firstSeenMs <= CAPTURE_WINDOW_MS).length,
        windowTrackerSites: thirdParty.filter(s => s.tracker && s.firstSeenMs <= CAPTURE_WINDOW_MS).length,
        blockedByFirefoxSites: thirdParty.filter(s => s.blockedByFirefox).length,
        firstPartyHosts: sum(firstParty, s => s.hosts.length),
      },
      thirdParty,
      firstParty,
      cookies: this.cookiesJSON(),
      storage: this.storageJSON(),
      fingerprinting: this.fingerprintJSON(),
    };
  }
}

if (typeof module !== 'undefined') module.exports = TabReport;
