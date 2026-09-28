'use strict';

const TYPE_LABELS = {
  main_frame: 'documento',
  sub_frame: 'iframe',
  stylesheet: 'css',
  script: 'script',
  image: 'imagem',
  imageset: 'imagem',
  font: 'fonte',
  object: 'objeto',
  xmlhttprequest: 'xhr/fetch',
  ping: 'ping',
  beacon: 'beacon',
  csp_report: 'csp',
  media: 'mídia',
  websocket: 'websocket',
  web_manifest: 'manifest',
  speculative: 'pré-conexão',
  other: 'outro',
};

const TABS = ['third-party', 'cookies', 'storage', 'alerts'];
const TAB_LABELS = { 'third-party': 'Terceiros', cookies: 'Cookies', storage: 'Storage', alerts: 'Alertas' };

const TECHNIQUE_LABELS = {
  canvas: 'Canvas fingerprint',
  webgl: 'WebGL fingerprint',
  'webgl-info': 'Consulta à GPU (WebGL)',
  fonts: 'Enumeração de fontes',
};

// Rótulos curtos das categorias do Blacklight (as regras estão em categories.js).
const CATEGORY_LABELS = {
  'session-recording': 'gravação de sessão',
  'facebook-pixel': 'pixel do Facebook',
  'tiktok-pixel': 'pixel do TikTok',
  'x-pixel': 'pixel do X',
  'ga-remarketing': 'GA remarketing',
  'linkedin-insight': 'LinkedIn Insight',
};

const CRITERIA_LABELS = {
  size: 'canvas menor que 16×16',
  text: 'texto com menos de 10 caracteres e 1 cor',
  noInteraction: 'uso interativo (save/restore ou eventos)',
  extraction: 'área lida menor que 16×16',
};

// Cria elementos sem innerHTML: hosts, URLs e nomes de cookies vêm da página e
// não são confiáveis.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else el[key] = value;
  }
  // Valores falsos (false, 0, '', null) permitem escrever `cond && h(...)`;
  // números sempre chegam aqui como texto via String().
  for (const child of children.flat()) {
    if (child) el.append(child);
  }
  return el;
}

// Formatação

function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function typeList(types) {
  return [...new Set(types.map(t => TYPE_LABELS[t] || t))].join(', ');
}

// Número em negrito seguido do rótulo no singular ou plural.
function chip(value, singular, pluralForm = singular) {
  return h('span', {}, h('b', {}, String(value)), ` ${value === 1 ? singular : pluralForm}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
}

// URL de script encurtada para exibição: host + caminho, sem query. Se for
// longa, preserva o host e o fim do caminho (o nome do arquivo).
function shortScript(url) {
  if (!url) return 'script desconhecido';
  try {
    const u = new URL(url);
    const text = u.host + u.pathname;
    if (text.length <= 64) return text;
    const segments = u.pathname.split('/').filter(Boolean);
    const tail = segments.slice(-2).join('/');
    return tail.length < 40 ? `${u.host}/…/${tail}` : `${u.host}/…/${segments[segments.length - 1].slice(0, 40)}`;
  } catch {
    return url.slice(0, 64);
  }
}

function formatLifetime(days) {
  if (days === null) return 'fim da sessão';
  if (days < 1 / 24) return plural(Math.max(1, Math.round(days * 24 * 60)), 'minuto', 'minutos');
  if (days < 1) return plural(Math.round(days * 24), 'hora', 'horas');
  if (days < 31) return plural(Math.round(days), 'dia', 'dias');
  if (days < 365) return plural(Math.round(days / 30), 'mês', 'meses');
  const years = Math.round((days / 365) * 10) / 10;
  return `${years.toLocaleString('pt-BR')} ${years < 2 ? 'ano' : 'anos'}`;
}

// Estado da interface, mantido entre as atualizações periódicas.

const ui = {
  tab: 'third-party',
  openDetails: new Set(),
};

try {
  const saved = localStorage.getItem('popupTab');
  if (TABS.includes(saved)) ui.tab = saved;
} catch {
  // armazenamento indisponível: fica a aba padrão
}

// <details> que lembra se estava aberto.
function detailsBlock(id, className, summary, ...children) {
  const el = h('details', { class: className, open: ui.openDetails.has(id) }, h('summary', {}, summary), ...children);
  el.addEventListener('toggle', () => {
    if (el.open) ui.openDetails.add(id);
    else ui.openDetails.delete(id);
  });
  return el;
}

// Resumo

function renderStats(report) {
  const stat = (value, label, alert = false) =>
    h('div', { class: 'stat' },
      h('div', { class: alert && value ? 'stat-value alert' : 'stat-value' }, String(value)),
      h('div', { class: 'stat-label' }, label));
  document.getElementById('stats').replaceChildren(
    stat(report.totals.thirdPartySites, 'sites de 3ª parte'),
    stat(report.totals.trackerSites, 'rastreadores', true),
    stat(report.cookies.summary.total, 'cookies injetados'),
    stat(report.storage.summary.items, 'itens em storage'),
  );
}

function renderTabs(report) {
  const counts = report
    ? {
      'third-party': report.totals.thirdPartySites,
      cookies: report.cookies.list.length,
      storage: report.storage.summary.originsWithData,
      alerts: alertCount(report),
    }
    : {};
  for (const button of document.querySelectorAll('.tab')) {
    const tab = button.dataset.tab;
    button.setAttribute('aria-selected', String(tab === ui.tab));
    button.replaceChildren(TAB_LABELS[tab], counts[tab] !== undefined ? h('span', { class: 'tab-count' }, ` ${counts[tab]}`) : '');
  }
}

// Aba Terceiros

function renderSite(site) {
  const hosts = site.hosts.map(x => `${x.host} (${x.requests})`).join(' · ');
  const meta = [typeList(site.types), site.classifications.join(', '), Object.keys(site.errors).join(', ')]
    .filter(Boolean).join(' · ');
  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name' }, site.site),
      site.tracker && h('span', { class: 'pill tracker' }, 'rastreador'),
      site.blockedByFirefox && h('span', { class: 'pill' }, 'bloqueado pelo Firefox'),
      ...site.categories.map(c => h('span', { class: 'pill warn' }, CATEGORY_LABELS[c] || c)),
      h('span', { class: 'count' }, `${site.requests} req.`)),
    h('div', { class: 'meta' }, hosts),
    meta && h('div', { class: 'meta' }, meta));
}

function renderThirdParty(report) {
  const t = report.totals;
  const summary = [
    plural(t.requests, 'requisição', 'requisições'),
    `${t.thirdPartyRequests} a terceiros`,
    t.windowThirdPartySites !== t.thirdPartySites && `${t.windowThirdPartySites} sites de 3ª parte nos primeiros 30 s`,
    t.blockedByFirefoxSites && plural(t.blockedByFirefoxSites, 'site bloqueado pelo Firefox', 'sites bloqueados pelo Firefox'),
  ].filter(Boolean).join(' · ');

  return [
    h('p', { class: 'note' }, summary),
    h('h2', {}, 'Domínios de terceira parte'),
    report.thirdParty.length
      ? h('ul', { class: 'list' }, report.thirdParty.map(renderSite))
      : h('p', { class: 'empty' }, 'Nenhuma conexão a domínios de terceira parte observada.'),
    detailsBlock('first-party', 'section', `Primeira parte (${plural(t.firstPartyHosts, 'host', 'hosts')})`,
      h('ul', { class: 'list' }, report.firstParty.map(renderSite))),
    h('p', { class: 'note' },
      'Rastreadores classificados pelas listas da Proteção Aprimorada contra Rastreamento do Firefox.'),
  ];
}

// Aba Cookies

function renderCookie(cookie) {
  const flags = [
    cookie.domain,
    !cookie.session && `validade ${formatLifetime(cookie.lifetimeDays)}`,
    cookie.viaHttp ? 'HTTP' : 'JavaScript',
    cookie.secure && 'Secure',
    cookie.httpOnly && 'HttpOnly',
    cookie.sameSite && `SameSite=${cookie.sameSite}`,
    cookie.partitioned && 'particionado',
    !cookie.inWindow && 'após 30 s',
  ].filter(Boolean).join(' · ');
  const byThirdPartyScript = !cookie.thirdParty && cookie.writersThirdParty;
  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name mono' }, cookie.name || '(sem nome)'),
      h('span', { class: 'tags' },
        cookie.viaHttp && !cookie.stored && h('span', { class: 'pill warn', title: 'Set-Cookie recebido, mas o Firefox não gravou (bloqueado ou rejeitado)' }, 'não gravado'),
        byThirdPartyScript && h('span', { class: 'pill warn', title: 'Cookie de primeira parte gravado por script de terceiro' }, 'script de 3ª parte'),
        cookie.lifetimeDays > 365 && h('span', { class: 'pill warn' }, '> 1 ano'),
        h('span', { class: 'pill' }, cookie.session ? 'sessão' : 'persistente'))),
    h('div', { class: 'meta' }, flags),
    cookie.sourceUrl && h('div', { class: 'meta' }, `Set-Cookie em ${cookie.sourceUrl}`),
    cookie.writers.length > 0 && h('div', { class: 'meta' }, `document.cookie por ${cookie.writers.map(shortScript).join(', ')}`));
}

function renderCookies(report) {
  const { summary, list } = report.cookies;
  if (!list.length) return [h('p', { class: 'empty' }, 'Nenhum cookie injetado observado nesta página.')];

  const fp = summary.firstParty;
  const tp = summary.thirdParty;
  const matrix = h('table', { class: 'matrix' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Sessão'), h('th', {}, 'Persistente'), h('th', {}, 'Total'))),
    h('tbody', {},
      h('tr', {}, h('th', {}, '1ª parte'), h('td', {}, String(fp.session)), h('td', {}, String(fp.persistent)),
        h('td', { class: 'total' }, String(fp.session + fp.persistent))),
      h('tr', {}, h('th', {}, '3ª parte'), h('td', {}, String(tp.session)), h('td', {}, String(tp.persistent)),
        h('td', { class: 'total' }, String(tp.session + tp.persistent)))));

  const partyTotal = m => m.session + m.persistent;
  const loadNote = `No carregamento (primeiros ${summary.windowMs / 1000} s da navegação): `
    + `${summary.inWindow} (1ª parte ${partyTotal(summary.window.firstParty)}, 3ª parte ${partyTotal(summary.window.thirdParty)}).`
    + (summary.afterWindow
      ? ` Depois: ${summary.afterWindow} (ex.: criados por interação ou por anúncios que se renovam).`
      : '');

  const thirdParty = list.filter(c => c.thirdParty);
  const firstParty = list.filter(c => !c.thirdParty);
  return [
    h('h2', {}, 'Cookies injetados na página'),
    h('p', { class: 'note' }, loadNote),
    matrix,
    h('div', { class: 'chips' },
      chip(summary.viaHttp, 'via HTTP'),
      chip(summary.viaJs, 'via JavaScript'),
      chip(summary.partitioned, 'particionado', 'particionados'),
      chip(summary.longLived, 'com validade > 1 ano'),
      chip(summary.notStored, 'Set-Cookie não gravado', 'Set-Cookie não gravados'),
      chip(summary.firstPartyByThirdPartyScript, 'de 1ª parte gravado por script de 3ª parte', 'de 1ª parte gravados por scripts de 3ª parte')),
    thirdParty.length && h('h2', {}, `Terceira parte (${thirdParty.length})`),
    thirdParty.length && h('ul', { class: 'list' }, thirdParty.map(renderCookie)),
    firstParty.length && h('h2', {}, `Primeira parte (${firstParty.length})`),
    firstParty.length && h('ul', { class: 'list' }, firstParty.map(renderCookie)),
  ];
}

// Aba Storage

function renderStorageOrigin(origin) {
  const part = (label, info, unit) => info.available
    ? h('span', {}, `${label}: ${plural(info.count, unit[0], unit[1])}${info.bytes ? ` · ${formatBytes(info.bytes)}` : ''}`)
    : h('span', { class: 'off' }, `${label}: bloqueado (${info.error})`);
  const keyList = (title, keys) => keys.length && [
    h('div', { class: 'meta' }, title),
    h('ul', { class: 'keys' }, keys.map(k => h('li', {},
      h('span', { class: 'mono' }, k.key),
      k.writers.length > 0 && h('span', { class: 'writer', title: k.writers.join('\n') }, shortScript(k.writers[0])),
      h('span', { class: 'size' }, formatBytes(k.size * 2))))),
  ];
  const names = [
    ...origin.indexedDB.databases.map(db => `IndexedDB: ${db.name} (v${db.version})`),
    ...origin.cacheStorage.names.map(name => `Cache API: ${name}`),
  ];
  const hasDetails = origin.localStorage.keys.length || origin.sessionStorage.keys.length || names.length;

  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name' }, origin.origin),
      h('span', { class: 'tags' },
        !origin.isTop && h('span', { class: 'pill' }, 'iframe'),
        h('span', { class: origin.thirdParty ? 'pill tracker' : 'pill' }, origin.thirdParty ? '3ª parte' : '1ª parte'))),
    h('div', { class: 'storage-line' },
      part('localStorage', origin.localStorage, ['chave', 'chaves']),
      part('sessionStorage', origin.sessionStorage, ['chave', 'chaves']),
      part('IndexedDB', origin.indexedDB, ['banco', 'bancos']),
      part('Cache API', origin.cacheStorage, ['cache', 'caches'])),
    hasDetails && detailsBlock(`storage:${origin.origin}`, '', 'Ver chaves',
      keyList('localStorage', origin.localStorage.keys),
      keyList('sessionStorage', origin.sessionStorage.keys),
      names.length && h('ul', { class: 'keys' }, names.map(n => h('li', {}, h('span', { class: 'mono' }, n))))));
}

function renderStorage(report) {
  const { summary, origins } = report.storage;
  if (!origins.length) {
    return [h('p', { class: 'empty' }, 'Nenhum armazenamento observado ainda. O retrato é coletado após o load da página.')];
  }
  const thirdParty = `(${summary.thirdPartyOriginsWithData} de 3ª parte)`;
  const localBytes = `(${formatBytes(summary.localStorageBytes)})`;
  return [
    h('h2', {}, 'Armazenamento HTML5 por origem'),
    h('div', { class: 'chips' },
      chip(summary.originsWithData, `origem com dados ${thirdParty}`, `origens com dados ${thirdParty}`),
      chip(summary.localStorageKeys, `chave em localStorage ${localBytes}`, `chaves em localStorage ${localBytes}`),
      chip(summary.sessionStorageKeys, 'em sessionStorage'),
      chip(summary.indexedDBDatabases, 'banco IndexedDB', 'bancos IndexedDB'),
      chip(summary.cacheStorageCaches, 'cache (Cache API)', 'caches (Cache API)'),
      summary.blockedOrigins && chip(summary.blockedOrigins, 'origem com acesso bloqueado', 'origens com acesso bloqueado')),
    h('ul', { class: 'list' }, origins.map(renderStorageOrigin)),
    h('p', { class: 'note' }, 'Inclui iframes de terceiros. Só nomes de chaves e tamanhos são lidos; os valores não saem da página.'),
  ];
}

// Aba Alertas

function renderDetection(d) {
  const where = d.inline ? 'script inline da página' : shortScript(d.script);
  let details = '';
  if (d.technique === 'canvas' || d.technique === 'webgl') {
    const read = d.area ? `${d.method} de ${d.area.w}×${d.area.h}` : `${d.method}${d.format ? ` (${d.format})` : ''}`;
    details = [
      `canvas ${d.width}×${d.height}`,
      d.technique === 'canvas' && `${plural(d.chars, 'caractere', 'caracteres')}, ${plural(d.colors, 'cor', 'cores')}`,
      read,
      d.copiedFrom && `copiado de ${d.copiedFrom}`,
    ].filter(Boolean).join(' · ');
  } else if (d.technique === 'webgl-info') {
    details = `getParameter(${d.parameter})`;
  } else if (d.technique === 'fonts') {
    details = `${d.fonts} fontes testadas, mesmo texto medido ${d.repeats} vezes`;
  }
  const frame = otherFrameOrigin(d.frameOrigin);
  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name' }, TECHNIQUE_LABELS[d.technique] || d.technique),
      h('span', { class: 'tags' },
        h('span', { class: d.scriptThirdParty ? 'pill tracker' : 'pill' }, d.scriptThirdParty ? 'script de 3ª parte' : 'script de 1ª parte'))),
    h('div', { class: 'meta', title: d.script || '' }, where),
    details && h('div', { class: 'meta' }, details),
    frame && h('div', { class: 'meta' }, `no iframe ${frame}`),
    d.textSample && h('div', { class: 'meta mono' }, `“${d.textSample}”`));
}

// Origem do frame, só quando não é o documento de topo.
function otherFrameOrigin(frameOrigin) {
  if (!frameOrigin || !lastReport) return null;
  try {
    return new URL(lastReport.url).origin === frameOrigin ? null : frameOrigin;
  } catch {
    return null;
  }
}

function hijackCount(report) {
  const h = report.hijack.summary;
  return h.thirdPartySockets + h.polling + (h.overridden ? 1 : 0) + h.thirdPartyKeyboardScripts + h.signatures;
}

function alertCount(report) {
  return report.fingerprinting.summary.detections + report.categories.length + report.bounces.length
    + report.sync.summary.events + report.trackingParams.length + hijackCount(report);
}

// ID longo abreviado para exibição (o JSON exportado tem o valor completo).
function shortId(token) {
  return token.length > 14 ? `${token.slice(0, 12)}…` : token;
}

function renderBounce(b) {
  const via = b.type === 'redirect' ? 'redirecionamento HTTP' : 'redirecionamento por script';
  const passed = b.passedParams.filter(p => p.matches);
  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name' }, `Bounce via ${b.site}`),
      h('span', { class: 'tags' }, h('span', { class: 'pill tracker' }, via))),
    h('div', { class: 'meta', title: b.url }, b.url.length > 90 ? `${b.url.slice(0, 89)}…` : b.url),
    h('div', { class: 'meta' }, [
      b.fromSite && `vindo de ${b.fromSite}`,
      b.dwellMs !== undefined && `ficou ${b.dwellMs} ms, sem interação`,
    ].filter(Boolean).join(' · ')),
    b.storedIds.length > 0 && h('div', { class: 'meta' }, `identificadores do intermediário: ${b.storedIds.join(', ')}`),
    passed.length > 0 && h('div', { class: 'meta mono' },
      `repassado na URL: ${passed.map(p => `${p.param}=${shortId(p.value)} (= ${p.matches})`).join(', ')}`));
}

function renderSync(e) {
  const kind = e.kind === 'first-party-id' ? 'ID de 1ª parte' : 'entre terceiros';
  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name' }, `${e.ownerSite} → ${e.receiverSite}`),
      h('span', { class: 'tags' },
        h('span', { class: e.kind === 'third-party' ? 'pill tracker' : 'pill warn' }, kind),
        h('span', { class: 'count' }, `${e.requests} req.`))),
    h('div', { class: 'meta' }, `${e.idName} (${e.idSource}) = ${shortId(e.token)}`),
    h('div', { class: 'meta', title: e.url }, `em ${shortScript(e.url)}`));
}

function renderTracking(report) {
  const { summary, events, endpoints } = report.sync;
  const bounces = report.bounces;
  const params = report.trackingParams;
  return [
    h('h2', {}, 'Categorias (testes do Blacklight)'),
    report.categories.length
      ? h('ul', { class: 'list' }, report.categories.map(c => h('li', { class: 'item' },
        h('div', { class: 'row' },
          h('span', { class: 'name' }, c.label),
          h('span', { class: 'count' }, `${c.requests} req.`)),
        h('div', { class: 'meta' }, c.sites.join(', ')),
        h('div', { class: 'meta', title: c.example }, shortScript(c.example)))))
      : h('p', { class: 'empty' }, 'Nenhuma gravação de sessão, pixel de rede social ou GA com remarketing.'),

    h('h2', {}, 'Bounce tracking'),
    bounces.length
      ? h('ul', { class: 'list' }, bounces.map(renderBounce))
      : h('p', { class: 'empty' }, 'Nenhum redirecionamento por site intermediário antes desta página.'),

    h('h2', {}, 'Sincronização de identificadores (cookie sync)'),
    events.length
      ? [
        h('div', { class: 'chips' },
          chip(summary.thirdPartyPairs, 'par entre terceiros', 'pares entre terceiros'),
          chip(summary.firstPartyIdShares, 'ID de 1ª parte enviado a terceiro', 'IDs de 1ª parte enviados a terceiros'),
          chip(summary.receivers, 'receptor', 'receptores')),
        h('ul', { class: 'list' }, events.map(renderSync)),
      ]
      : h('p', { class: 'empty' }, 'Nenhum identificador de um site visto na URL de outro.'),
    endpoints.length > 0 && detailsBlock('endpoints', 'section',
      `Endpoints típicos de sincronização (${endpoints.length} ${endpoints.length === 1 ? 'site' : 'sites'})`,
      h('ul', { class: 'list' }, endpoints.map(ep => h('li', { class: 'item' },
        h('div', { class: 'row' }, h('span', { class: 'name' }, ep.site), h('span', { class: 'count' }, `${ep.requests} req.`)),
        h('div', { class: 'meta', title: ep.example }, shortScript(ep.example)))))),

    h('h2', {}, 'Parâmetros de rastreamento na URL'),
    params.length
      ? h('ul', { class: 'list' }, params.map(p => h('li', { class: 'item' },
        h('div', { class: 'row' }, h('span', { class: 'name mono' }, `${p.param}=${shortId(p.value)}`)),
        h('div', { class: 'meta', title: p.url }, shortScript(p.url)))))
      : h('p', { class: 'empty' }, 'Nenhum parâmetro de rastreamento conhecido na URL desta página.'),
    h('p', { class: 'note' },
      'Cookie sync: trecho de cookie ou storage com cara de identificador (≥ 8 caracteres, com dígitos, não timestamp) '
      + 'que aparece na URL de uma requisição a outro site (Acar et al., 2014; Englehardt & Narayanan, 2016). '
      + 'Bounce: página de outro site que ficou até 10 s sem interação, ou redirecionamento HTTP por site intermediário.'),
  ];
}

function renderHijack(report) {
  const hj = report.hijack;
  const sockets = [...hj.websockets, ...hj.eventStreams.map(s => ({ ...s, stream: true }))].filter(s => s.thirdParty);
  const item = (name, tags, ...lines) => h('li', { class: 'item' },
    h('div', { class: 'row' }, h('span', { class: 'name' }, name), h('span', { class: 'tags' }, ...tags)),
    ...lines.filter(Boolean).map(line => h('div', { class: 'meta' }, line)));
  const items = [
    ...hj.signatures.map(sig => item(`Assinatura de hook conhecida: ${sig}`, [h('span', { class: 'pill tracker' }, 'BeEF')])),
    ...sockets.map(sock => item(
      `${sock.stream ? 'EventSource' : 'WebSocket'} para ${sock.site}`,
      [h('span', { class: 'pill tracker' }, 'conexão persistente')],
      sock.url,
      sock.messagesSent && 'mensagens enviadas pela página',
      sock.errors && sock.errors.length > 0 && `erro: ${sock.errors.join(', ')}`)),
    ...hj.polling.map(p => item(
      `Polling para ${p.site}`,
      [h('span', { class: 'pill warn' }, `a cada ${(p.meanIntervalMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`)],
      `${p.endpoint} · ${p.requests} requisições em ${Math.round(p.spanMs / 1000)} s (variação ${p.cv})`)),
    ...hj.keyboard.filter(k => k.scriptThirdParty).map(k => item(
      'Captura de teclado por script de 3ª parte',
      [h('span', { class: 'pill tracker' }, k.types.join(', '))],
      shortScript(k.script),
      `em: ${k.targets.join(', ')}`)),
  ];
  const overridden = hj.globals ? hj.globals.overridden : [];
  return [
    h('h2', {}, 'Sequestro de navegador (hijacking/hook)'),
    items.length
      ? h('ul', { class: 'list' }, items)
      : h('p', { class: 'empty' }, 'Nenhuma conexão persistente com terceiros, polling, captura de teclado por terceiros ou assinatura de hook.'),
    overridden.length > 0 && detailsBlock('overridden', 'section',
      `Funções nativas substituídas por scripts da página (${overridden.length})`,
      h('ul', { class: 'list' }, overridden.map(o => h('li', { class: 'item' },
        h('div', { class: 'name mono' }, o.name),
        o.source && h('div', { class: 'meta mono' }, o.source))))),
    hj.globals && hj.globals.addedCount > 0 && detailsBlock('added-globals', 'section',
      `Globais adicionadas ao window por scripts da página (${hj.globals.addedCount})`,
      h('p', { class: 'meta mono' }, hj.globals.added.join(', '))),
    hj.keyboard.some(k => !k.scriptThirdParty) && detailsBlock('fp-keyboard', 'section',
      `Listeners de teclado de scripts de 1ª parte (${hj.keyboard.filter(k => !k.scriptThirdParty).length})`,
      h('ul', { class: 'list' }, hj.keyboard.filter(k => !k.scriptThirdParty).map(k => h('li', { class: 'item' },
        h('div', { class: 'meta' }, `${shortScript(k.script)} · ${k.types.join(', ')}`))))),
    h('p', { class: 'note' },
      'Indícios, não prova: conexão WebSocket/EventSource com terceiro; o mesmo endpoint de terceiro chamado ≥ 5 vezes em ≥ 10 s '
      + 'com intervalos regulares; funções como fetch, XMLHttpRequest ou document.write com referência diferente da capturada antes '
      + 'dos scripts da página; listeners de teclado registrados por scripts de terceiros; assinaturas do BeEF (hook.js, global beef, '
      + 'cookie BEEFHOOK).'),
  ];
}

function renderAlerts(report) {
  const { summary, detections, discarded } = report.fingerprinting;
  const discardedBlock = discarded.length > 0 && detailsBlock('discarded', 'section',
    `Leituras de canvas descartadas pela heurística (${discarded.length})`,
    h('ul', { class: 'list' }, discarded.map(d => h('li', { class: 'item' },
      h('div', { class: 'meta', title: d.script || '' }, `${shortScript(d.script)} · canvas ${d.width}×${d.height} · ${d.method}`),
      h('div', { class: 'meta' }, `falhou: ${Object.entries(d.criteria).filter(([, ok]) => !ok).map(([k]) => CRITERIA_LABELS[k] || k).join('; ')}`)))));

  return [
    h('h2', {}, 'Fingerprinting'),
    detections.length
      ? h('div', { class: 'chips' },
        chip(summary.detections, 'detecção', 'detecções'),
        chip(summary.scripts, 'script', 'scripts'),
        chip(summary.thirdPartyScripts, 'de 3ª parte', 'de 3ª parte'))
      : h('p', { class: 'empty' }, 'Nenhuma técnica de fingerprinting detectada nesta página.'),
    detections.length > 0 && h('ul', { class: 'list' }, detections.map(renderDetection)),
    discardedBlock,
    h('p', { class: 'note' },
      'Canvas: heurística de Englehardt & Narayanan (ACM CCS 2016) — canvas ≥ 16×16, texto com ≥ 10 caracteres ou ≥ 2 cores, '
      + 'sem uso interativo e imagem extraída. WebGL: leitura de canvas WebGL ≥ 16×16. Fontes: ≥ 50 fontes para o mesmo texto.'),
    ...renderTracking(report),
    ...renderHijack(report),
  ];
}

// Renderização geral

let lastReport = null;

function render(report) {
  lastReport = report;
  const content = document.getElementById('content');
  renderTabs(report);

  if (!report || !report.host) {
    document.getElementById('page-site').textContent = 'Sem dados para esta aba';
    document.getElementById('page-url').textContent = '';
    document.getElementById('stats').replaceChildren();
    content.replaceChildren(h('p', { class: 'empty' },
      'Recarregue a página com a extensão ativa para iniciar a análise.'));
    return;
  }

  document.getElementById('page-site').textContent = report.site;
  document.getElementById('page-url').textContent = report.url;
  renderStats(report);

  const renderers = { 'third-party': renderThirdParty, cookies: renderCookies, storage: renderStorage, alerts: renderAlerts };
  content.replaceChildren(...renderers[ui.tab](report).flat().filter(Boolean));
}

for (const button of document.querySelectorAll('.tab')) {
  button.addEventListener('click', () => {
    ui.tab = button.dataset.tab;
    try {
      localStorage.setItem('popupTab', ui.tab);
    } catch {
      // sem persistência da aba; segue funcionando
    }
    render(lastReport);
  });
}

document.getElementById('version').textContent = `v${browser.runtime.getManifest().version}`;

document.getElementById('export').addEventListener('click', async () => {
  const status = document.getElementById('foot-status');
  status.textContent = 'Exportando…';
  // O diálogo de salvar pode fechar o popup; o download segue no background.
  const result = await browser.runtime.sendMessage({ type: 'exportReport', tabId });
  status.textContent = result && result.ok ? 'Relatório exportado.' : `Falha: ${result ? result.error : 'sem resposta'}`;
});

let tabId = null;
let lastVersion = null;

async function refresh() {
  const report = await browser.runtime.sendMessage({ type: 'getReport', tabId });
  const version = report ? `${report.startedAt}:${report.version}` : 'vazio';
  if (version === lastVersion) return;
  lastVersion = version;
  render(report);
}

// Aberto como aba (popup.html?tab=<id>), mostra o relatório daquela aba em
// tamanho de página: útil para prints completos e para o teste automatizado.
const forcedTab = Number(new URLSearchParams(location.search).get('tab'));
if (forcedTab) document.body.classList.add('full');

document.getElementById('open-tab').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL(`popup/popup.html?tab=${tabId}`) });
  window.close();
});

async function init() {
  if (forcedTab) {
    tabId = forcedTab;
  } else {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab.id;
  }
  await refresh();
  setInterval(refresh, 1000);
}

init();
