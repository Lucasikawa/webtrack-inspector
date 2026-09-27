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

const TABS = ['third-party', 'cookies', 'storage'];

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
    }
    : {};
  for (const button of document.querySelectorAll('.tab')) {
    const tab = button.dataset.tab;
    button.setAttribute('aria-selected', String(tab === ui.tab));
    const label = { 'third-party': 'Terceiros', cookies: 'Cookies', storage: 'Storage' }[tab];
    button.replaceChildren(label, counts[tab] !== undefined ? h('span', { class: 'tab-count' }, ` ${counts[tab]}`) : '');
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
      h('span', { class: 'count' }, `${site.requests} req.`)),
    h('div', { class: 'meta' }, hosts),
    meta && h('div', { class: 'meta' }, meta));
}

function renderThirdParty(report) {
  const t = report.totals;
  const summary = [
    plural(t.requests, 'requisição', 'requisições'),
    `${t.thirdPartyRequests} a terceiros`,
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
    !cookie.duringLoad && 'após o load',
  ].filter(Boolean).join(' · ');
  return h('li', { class: 'item' },
    h('div', { class: 'row' },
      h('span', { class: 'name mono' }, cookie.name || '(sem nome)'),
      h('span', { class: 'tags' },
        cookie.viaHttp && !cookie.stored && h('span', { class: 'pill warn', title: 'Set-Cookie recebido, mas o Firefox não gravou (bloqueado ou rejeitado)' }, 'não gravado'),
        cookie.lifetimeDays > 365 && h('span', { class: 'pill warn' }, '> 1 ano'),
        h('span', { class: 'pill' }, cookie.session ? 'sessão' : 'persistente'))),
    h('div', { class: 'meta' }, flags),
    cookie.sourceUrl && h('div', { class: 'meta' }, `Set-Cookie em ${cookie.sourceUrl}`));
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
  const loadNote = report.loadedMs === null
    ? 'Página ainda carregando.'
    : `No carregamento (até 10 s após o load, ocorrido em ${(report.loadedMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s): `
      + `${summary.duringLoad} (1ª parte ${partyTotal(summary.load.firstParty)}, 3ª parte ${partyTotal(summary.load.thirdParty)}).`
      + (summary.afterLoad ? ` Depois disso: ${summary.afterLoad} (ex.: criados por interação com a página).` : '');

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
      chip(summary.notStored, 'Set-Cookie não gravado', 'Set-Cookie não gravados')),
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
    h('ul', { class: 'keys' }, keys.map(k => h('li', {}, h('span', { class: 'mono' }, k.key), h('span', {}, formatBytes(k.size * 2))))),
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

  const renderers = { 'third-party': renderThirdParty, cookies: renderCookies, storage: renderStorage };
  content.replaceChildren(...renderers[ui.tab](report).filter(Boolean));
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

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  await refresh();
  setInterval(refresh, 1000);
}

init();
