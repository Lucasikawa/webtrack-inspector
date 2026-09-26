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

// Cria elementos sem innerHTML: hosts e URLs vêm da página e não são confiáveis.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else el[key] = value;
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) el.append(child);
  }
  return el;
}

function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function typeList(types) {
  return [...new Set(types.map(t => TYPE_LABELS[t] || t))].join(', ');
}

function renderStats(totals) {
  const stat = (value, label, alert = false) =>
    h('div', { class: 'stat' },
      h('div', { class: alert && value ? 'stat-value alert' : 'stat-value' }, String(value)),
      h('div', { class: 'stat-label' }, label));
  document.getElementById('stats').replaceChildren(
    stat(totals.requests, 'requisições'),
    stat(totals.thirdPartySites, 'sites de 3ª parte'),
    stat(totals.thirdPartyHosts, 'hosts de 3ª parte'),
    stat(totals.trackerSites, 'rastreadores', true),
  );
}

function renderSite(site) {
  const hosts = site.hosts.map(x => `${x.host} (${x.requests})`).join(' · ');
  const meta = [typeList(site.types), site.classifications.join(', ')].filter(Boolean).join(' · ');
  return h('li', { class: 'site' },
    h('div', { class: 'site-row' },
      h('span', { class: 'site-name' }, site.site),
      site.tracker && h('span', { class: 'pill tracker' }, 'rastreador'),
      h('span', { class: 'count' }, `${site.requests} req.`)),
    h('div', { class: 'site-hosts' }, hosts),
    meta && h('div', { class: 'site-meta' }, meta));
}

function render(report) {
  const content = document.getElementById('content');
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
  renderStats(report.totals);

  const thirdParty = report.thirdParty.length
    ? h('ul', { class: 'sites' }, report.thirdParty.map(renderSite))
    : h('p', { class: 'empty' }, 'Nenhuma conexão a domínios de terceira parte observada.');

  const firstParty = h('details', { open: firstPartyOpen },
    h('summary', {}, `Primeira parte (${plural(report.totals.firstPartyHosts, 'host', 'hosts')})`),
    h('ul', { class: 'sites' }, report.firstParty.map(renderSite)));
  // Mantém a seção aberta/fechada entre as atualizações periódicas.
  firstParty.addEventListener('toggle', () => { firstPartyOpen = firstParty.open; });

  content.replaceChildren(h('h2', {}, 'Domínios de terceira parte'), thirdParty, firstParty);
}

let tabId = null;
let lastVersion = null;
let firstPartyOpen = false;

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
