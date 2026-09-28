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

// Bounce tracking por script: a página intermediária fica no máximo este tempo,
// sem interação do usuário, antes de seguir para outro site.
const BOUNCE_MAX_DWELL_MS = 10000;
// Navegações iniciadas pelo próprio usuário na barra de endereço, favoritos ou
// recarga não são bounces.
const USER_TRANSITIONS = new Set(['typed', 'auto_bookmark', 'reload', 'generated', 'keyword', 'keyword_generated', 'start_page']);
// Valores triviais demais para provar que um identificador foi repassado.
const TRIVIAL_VALUES = new Set(['', '0', '1', 'true', 'false', 'null', 'undefined']);

// Polling persistente: o mesmo endpoint de terceiro chamado pelo menos 5 vezes,
// ao longo de 10 s ou mais, em intervalos regulares (coeficiente de variação
// até 0,35) entre 250 ms e 60 s. É como o hook do BeEF busca comandos.
const POLL_TYPES = new Set(['xmlhttprequest', 'script', 'image', 'imageset', 'beacon', 'ping', 'other']);
const POLL_MIN_REQUESTS = 5;
const POLL_MIN_SPAN_MS = 10000;
const POLL_MAX_CV = 0.35;
const MAX_POLL_SAMPLES = 300;

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
    this.idSources = new Map(); // trecho com cara de ID -> { site, name, source }
    this.ownValues = new Map(); // nome -> valor de cookies/storage do próprio site
    this.syncEvents = new Map(); // dono|nome|receptor -> ID repassado a outro site
    this.syncEndpoints = new Map(); // site -> requisições a caminhos típicos de sync
    this.categoryExamples = new Map(); // categoria -> primeira URL que a revelou
    this.websockets = new Map(); // URL -> conexão WebSocket
    this.eventStreams = new Map(); // URL -> conexão EventSource (Server-Sent Events)
    this.pollTimes = new Map(); // host+caminho de terceiro -> instantes das requisições
    this.listeners = new Map(); // script|evento -> listener de teclado/digitação
    this.globals = null; // último retrato de globais adicionadas e funções substituídas
    this.signatures = new Set(); // assinaturas conhecidas de hook (BeEF)
    this.blockedByRule = new Map(); // regra da lista de bloqueio -> requisições canceladas
    this.interacted = false; // houve clique, toque ou tecla nesta página
    this.committedAt = null;
    this.previous = null; // resumo da página anterior na aba (bounce tracking)
    this.previousReport = null; // a própria página anterior, enquanto esta é a atual
    this.previousLeftAt = null; // quando a aba saiu da página anterior
    this.transition = null; // tipo da navegação (webNavigation.onCommitted)
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
        categories: new Set(), // categorias no formato do Blacklight
        blockedByPlugin: 0, // requisições canceladas pela lista de bloqueio
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
    for (const category of Categories.categoriesOf(details.url)) {
      entry.categories.add(category);
      if (!this.categoryExamples.has(category)) this.categoryExamples.set(category, details.url.slice(0, 300));
    }
    if (entry.thirdParty) this.checkSync(details.url, entry.site);
    this.trackPersistence(details, entry);
    this.version++;
    return isNewSite && entry.thirdParty;
  }

  // Requisição cancelada pela lista de bloqueio personalizada.
  addBlocked(details, rule) {
    const entry = this.hosts.get(Parties.hostOf(details.url));
    if (entry) entry.blockedByPlugin++;
    this.blockedByRule.set(rule, (this.blockedByRule.get(rule) || 0) + 1);
    this.version++;
  }

  // Conexões persistentes e assinaturas de hook numa requisição.
  trackPersistence(details, entry) {
    let path = '';
    try {
      path = new URL(details.url).pathname;
    } catch {
      return;
    }
    if (details.type === 'websocket') {
      const socket = this.websockets.get(details.url) || { url: details.url, site: entry.site, handshakes: 0, messagesSent: false, errors: [] };
      socket.handshakes++;
      this.websockets.set(details.url, socket);
    }
    if (entry.thirdParty && POLL_TYPES.has(details.type)) {
      const key = entry.host + path;
      const times = this.pollTimes.get(key) || [];
      if (times.length < MAX_POLL_SAMPLES) times.push(this.elapsed());
      this.pollTimes.set(key, times);
    }
    if (/\/hook\.js$/i.test(path)) this.signatures.add(`script hook.js (${entry.host})`);
  }

  // Requisição com Accept: text/event-stream (EventSource).
  markEventStream(url) {
    if (this.eventStreams.has(url)) return;
    this.eventStreams.set(url, { url, site: Parties.siteOf(url) });
    this.version++;
  }

  // Guarda os trechos com cara de identificador de um cookie ou chave de
  // storage, com o site dono. O primeiro dono de cada valor prevalece.
  recordValue(site, name, value, source) {
    if (value === undefined || value === null) return;
    const text = String(value);
    if (site === this.site) this.ownValues.set(name, text);
    for (const token of Tracking.idTokens(text)) {
      if (!this.idSources.has(token)) this.idSources.set(token, { site, name, source });
    }
  }

  // Cabeçalho Cookie de uma requisição: revela os IDs que o site já tinha.
  addRequestCookies(url, header) {
    const site = Parties.siteOf(url);
    for (const pair of String(header).split(';')) {
      const eq = pair.indexOf('=');
      if (eq > 0) this.recordValue(site, pair.slice(0, eq).trim(), pair.slice(eq + 1).trim(), 'cabeçalho Cookie');
    }
  }

  // Requisição a um terceiro que leva na URL um identificador de outro site:
  // o receptor passa a conhecer o ID do dono (sincronização).
  checkSync(url, receiverSite) {
    for (const token of Tracking.urlTokens(url)) {
      const owner = this.idSources.get(token);
      if (!owner || owner.site === receiverSite) continue;
      const key = `${owner.site}|${owner.name}|${receiverSite}`;
      let event = this.syncEvents.get(key);
      if (!event) {
        event = {
          ownerSite: owner.site,
          idName: owner.name,
          idSource: owner.source,
          receiverSite,
          token,
          url: url.slice(0, 500),
          firstSeenMs: this.elapsed(),
          requests: 0,
        };
        this.syncEvents.set(key, event);
      }
      event.requests++;
    }
    if (Tracking.isSyncEndpoint(url)) {
      const endpoint = this.syncEndpoints.get(receiverSite) || { site: receiverSite, requests: 0, example: url.slice(0, 300) };
      endpoint.requests++;
      this.syncEndpoints.set(receiverSite, endpoint);
    }
  }

  // Registra uma requisição que falhou (webRequest.onErrorOccurred).
  addError(details) {
    const entry = this.hosts.get(Parties.hostOf(details.url));
    if (!entry || !details.error) return;
    entry.errors[details.error] = (entry.errors[details.error] || 0) + 1;
    const socket = this.websockets.get(details.url);
    if (socket && !socket.errors.includes(details.error)) socket.errors.push(details.error);
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
    this.recordValue(cookie.site, cookie.name, cookie.value, source === 'http' ? 'Set-Cookie' : 'cookie');
    if (cookie.name === 'BEEFHOOK') this.signatures.add(`cookie BEEFHOOK (${cookie.domain})`);
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
      .map(({ value, ...c }) => c)
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
    const frameSite = Parties.siteOf(event.frameOrigin);
    if (event.kind === 'cookieWrite') {
      this.addWriter(`cookie|${frameSite}|${event.name}`, event.script);
      this.recordValue(frameSite, event.name, event.value, 'document.cookie');
    } else if (event.kind === 'storageWrite') {
      this.addWriter(`storage|${event.frameOrigin}|${event.area}|${event.key}`, event.script);
      this.recordValue(frameSite, event.key, event.value, event.area);
    } else if (event.kind === 'interaction') {
      if (this.interacted) return;
      this.interacted = true;
    } else if (event.kind === 'listener') {
      const key = `${event.script}|${event.type}`;
      if (this.listeners.has(key)) return;
      this.listeners.set(key, { script: event.script, type: event.type, target: event.target, frameOrigin: event.frameOrigin });
    } else if (event.kind === 'globals') {
      this.globals = { addedCount: event.addedCount, added: event.added, overridden: event.overridden };
      for (const name of event.signatures || []) this.signatures.add(`global ${name}`);
    } else if (event.kind === 'wsSend') {
      const socket = this.websockets.get(event.url);
      if (!socket || socket.messagesSent) return;
      socket.messagesSent = true;
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

  // Resumo desta página no momento em que a aba navega para outra. A próxima
  // página o usa para decidir se esta foi um bounce.
  snapshotForNext(leftAt = Date.now()) {
    const previous = this.previousSnapshot();
    return {
      url: this.url,
      site: this.site,
      previousSite: previous ? previous.site : null,
      committedAt: this.committedAt || this.startedAt,
      leftAt,
      interacted: this.interacted,
      ownValues: [...this.ownValues],
    };
  }

  // Resumo da página anterior. Enquanto esta página é a atual, é calculado na
  // hora a partir da própria página anterior, que ainda pode receber eventos
  // atrasados (ex.: o identificador gravado logo antes de redirecionar).
  previousSnapshot() {
    if (this.previous) return this.previous;
    return this.previousReport ? this.previousReport.snapshotForNext(this.previousLeftAt) : null;
  }

  // Congela o resumo da anterior quando esta deixa de ser a página atual.
  freezePrevious() {
    this.previous = this.previousSnapshot();
    this.previousReport = null;
  }

  bouncesJSON() {
    const bounces = [];
    const chain = this.navigationChain;
    const prev = this.previousSnapshot();
    const origin = prev ? prev.site : null;

    // Redirecionamento HTTP por um site intermediário (ex.: link de anúncio
    // que passa pelo rastreador antes do destino).
    for (let i = 0; i < chain.length - 1; i++) {
      const site = Parties.siteOf(chain[i]);
      if (!site || site === this.site || site === origin) continue;
      const setByHop = [...this.cookies.values()].filter(c => c.sourceUrl && TabReport.normalizeUrl(c.sourceUrl) === chain[i]);
      const values = new Map(setByHop.filter(c => !TRIVIAL_VALUES.has(c.value)).map(c => [c.value, c.name]));
      bounces.push({
        type: 'redirect',
        site,
        url: chain[i],
        fromSite: origin,
        storedIds: setByHop.map(c => c.name),
        passedParams: Tracking.params(chain[i + 1]).map(([param, value]) => ({ param, value: value.slice(0, 100), matches: values.get(value) || null })),
      });
    }

    // Redirecionamento por script: página de outro site que ficou pouco tempo,
    // sem interação do usuário, e mandou a aba para um terceiro site.
    const transition = this.transition || { type: null, qualifiers: [] };
    const automatic = !USER_TRANSITIONS.has(transition.type) && !(transition.qualifiers || []).includes('forward_back');
    if (prev && prev.site !== this.site && prev.previousSite && prev.previousSite !== prev.site && automatic) {
      const dwellMs = prev.leftAt - prev.committedAt;
      if (dwellMs <= BOUNCE_MAX_DWELL_MS && !prev.interacted) {
        const values = new Map(prev.ownValues.filter(([, v]) => !TRIVIAL_VALUES.has(v)).map(([n, v]) => [v, n]));
        bounces.push({
          type: 'script',
          site: prev.site,
          url: prev.url,
          fromSite: prev.previousSite,
          dwellMs,
          storedIds: prev.ownValues.map(([name]) => name),
          passedParams: Tracking.params(chain[0]).map(([param, value]) => ({ param, value: value.slice(0, 100), matches: values.get(value) || null })),
        });
      }
    }
    return bounces;
  }

  syncJSON() {
    const events = [...this.syncEvents.values()]
      .map(e => ({ ...e, kind: e.ownerSite === this.site ? 'first-party-id' : 'third-party' }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.ownerSite.localeCompare(b.ownerSite) || a.receiverSite.localeCompare(b.receiverSite));
    const endpoints = [...this.syncEndpoints.values()].sort((a, b) => b.requests - a.requests);
    return {
      summary: {
        events: events.length,
        thirdPartyPairs: events.filter(e => e.kind === 'third-party').length,
        firstPartyIdShares: events.filter(e => e.kind === 'first-party-id').length,
        receivers: new Set(events.map(e => e.receiverSite)).size,
        endpointSites: endpoints.length,
      },
      events,
      endpoints,
    };
  }

  // Categorias do Blacklight presentes na página, com os sites que as revelaram.
  categoriesJSON() {
    const result = [];
    for (const [category, example] of this.categoryExamples) {
      const hosts = [...this.hosts.values()].filter(e => e.categories.has(category));
      result.push({
        category,
        label: Categories.LABELS[category],
        sites: [...new Set(hosts.map(e => e.site))].sort(),
        requests: hosts.reduce((n, e) => n + e.requests, 0),
        firstSeenMs: Math.min(...hosts.map(e => e.firstSeenMs)),
        example,
      });
    }
    return result.sort((a, b) => a.category.localeCompare(b.category));
  }

  // Indícios de sequestro do navegador (hijacking/hook).
  hijackJSON() {
    const withParty = item => ({ ...item, thirdParty: Parties.isThirdParty(item.site, this.site) });
    const websockets = [...this.websockets.values()].map(withParty);
    const eventStreams = [...this.eventStreams.values()].map(withParty);

    const polling = [];
    for (const [endpoint, times] of this.pollTimes) {
      if (times.length < POLL_MIN_REQUESTS) continue;
      const intervals = times.slice(1).map((t, i) => t - times[i]);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const sd = Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length);
      const span = times[times.length - 1] - times[0];
      const cv = mean > 0 ? sd / mean : Infinity;
      if (span >= POLL_MIN_SPAN_MS && mean >= 250 && mean <= 60000 && cv <= POLL_MAX_CV) {
        polling.push({
          endpoint,
          site: Parties.siteOf(endpoint.split('/')[0]),
          requests: times.length,
          meanIntervalMs: Math.round(mean),
          cv: Math.round(cv * 100) / 100,
          spanMs: span,
        });
      }
    }
    polling.sort((a, b) => b.requests - a.requests);

    // Listeners de teclado agrupados por script.
    const byScript = new Map();
    for (const l of this.listeners.values()) {
      const key = l.script || '(desconhecido)';
      const item = byScript.get(key) || { ...this.describeScript(l.script, null), types: new Set(), targets: new Set() };
      item.types.add(l.type);
      item.targets.add(l.target);
      byScript.set(key, item);
    }
    const keyboard = [...byScript.values()]
      .map(k => ({ ...k, types: [...k.types].sort(), targets: [...k.targets].sort() }))
      .sort((a, b) => b.scriptThirdParty - a.scriptThirdParty || String(a.script).localeCompare(String(b.script)));

    const overridden = this.globals ? this.globals.overridden : [];
    const signatures = [...this.signatures].sort();
    return {
      summary: {
        thirdPartySockets: websockets.filter(s => s.thirdParty).length + eventStreams.filter(s => s.thirdParty).length,
        polling: polling.length,
        overridden: overridden.length,
        thirdPartyKeyboardScripts: keyboard.filter(k => k.scriptThirdParty).length,
        signatures: signatures.length,
        addedGlobals: this.globals ? this.globals.addedCount : null,
      },
      websockets,
      eventStreams,
      polling,
      keyboard,
      globals: this.globals,
      signatures,
    };
  }

  trackingParamsJSON() {
    const found = new Map();
    for (const url of this.navigationChain) {
      for (const [param, value] of Tracking.trackingParams(url)) {
        const key = `${param}=${value}`;
        if (!found.has(key)) found.set(key, { param, value: value.slice(0, 100), url });
      }
    }
    return [...found.values()];
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
          categories: new Set(),
          blockedByPlugin: 0,
        };
        bySite.set(e.site, s);
      }
      s.blockedByPlugin += e.blockedByPlugin;
      e.categories.forEach(c => s.categories.add(c));
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
      categories: [...s.categories].sort(),
      tracker: [...s.classifications].some(c => TRACKER_FLAG.test(c)),
      blockedByFirefox: Object.keys(s.errors).some(e => FIREFOX_BLOCK_ERROR.test(e)),
    }));
    const byRelevance = (a, b) =>
      b.tracker - a.tracker || b.requests - a.requests || a.site.localeCompare(b.site);
    const thirdParty = sites.filter(s => s.thirdParty).sort(byRelevance);
    const firstParty = sites.filter(s => !s.thirdParty).sort(byRelevance);
    const sum = (list, fn) => list.reduce((n, s) => n + fn(s), 0);

    const previous = this.previousSnapshot();
    const json = {
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
        blockedByPluginRequests: [...this.blockedByRule.values()].reduce((a, b) => a + b, 0),
        firstPartyHosts: sum(firstParty, s => s.hosts.length),
      },
      thirdParty,
      firstParty,
      cookies: this.cookiesJSON(),
      storage: this.storageJSON(),
      fingerprinting: this.fingerprintJSON(),
      categories: this.categoriesJSON(),
      sync: this.syncJSON(),
      bounces: this.bouncesJSON(),
      trackingParams: this.trackingParamsJSON(),
      hijack: this.hijackJSON(),
      blocked: Object.fromEntries(this.blockedByRule),
      interacted: this.interacted,
      transition: this.transition,
      previous: previous ? { url: previous.url, site: previous.site } : null,
    };
    json.score = Score.compute(json);
    return json;
  }
}

if (typeof module !== 'undefined') module.exports = TabReport;
