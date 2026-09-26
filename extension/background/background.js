'use strict';

// Estado por aba. "reports" guarda a página exibida; "pending" guarda a navegação
// de nível superior que já começou (requisição main_frame) mas ainda não foi
// confirmada. Assim, requisições tardias da página antiga (ex.: beacons de
// unload) não são atribuídas à página nova.
const reports = new Map(); // tabId -> TabReport
const pending = new Map(); // tabId -> TabReport

// URL do documento de topo que originou a requisição.
function topLevelUrl(details) {
  if (details.frameId === 0) return details.documentUrl;
  const ancestors = details.frameAncestors;
  return ancestors && ancestors.length ? ancestors[ancestors.length - 1].url : details.documentUrl;
}

function commit(tabId) {
  const report = pending.get(tabId);
  if (!report) return;
  pending.delete(tabId);
  reports.set(tabId, report);
  updateBadge(tabId);
}

function onBeforeRequest(details) {
  const { tabId } = details;
  if (tabId < 0) return; // requisições sem aba: service workers, o próprio navegador

  if (details.type === 'main_frame') {
    const next = pending.get(tabId);
    if (next && next.requestId === details.requestId) {
      next.setUrl(details.url); // redirecionamento: mesmo requestId, nova URL
    } else {
      pending.set(tabId, new TabReport(tabId, details.url, details.requestId));
    }
    pending.get(tabId).addRequest(details);
    return;
  }

  const top = TabReport.normalizeUrl(topLevelUrl(details));
  const next = pending.get(tabId);
  // O primeiro subrecurso do novo documento pode chegar antes do onCommitted.
  if (next && top === next.url) commit(tabId);

  let report = reports.get(tabId);
  if (!report) {
    // Página aberta antes de a extensão carregar: cria o relatório pela URL de topo.
    if (!top) return;
    report = new TabReport(tabId, top);
    reports.set(tabId, report);
  }
  if (report.addRequest(details)) updateBadge(tabId);
}

// Relatório que deve receber um evento posterior ao onBeforeRequest da mesma
// requisição: o main_frame pertence à navegação pendente; o resto, à página atual.
function reportForEvent(details) {
  if (details.tabId < 0) return null;
  if (details.type === 'main_frame') return pending.get(details.tabId) || reports.get(details.tabId);
  return reports.get(details.tabId);
}

function onErrorOccurred(details) {
  const report = reportForEvent(details);
  if (report) report.addError(details);
}

function onCommitted(details) {
  if (details.frameId !== 0) return;
  const { tabId } = details;
  const url = TabReport.normalizeUrl(details.url);
  const next = pending.get(tabId);

  // Compara também pelo site, caso as duas APIs serializem a URL de forma diferente.
  if (next && (next.url === url || next.site === Parties.siteOf(url))) {
    commit(tabId);
  } else if (reports.get(tabId)?.url !== url || next) {
    // Navegação sem requisição de rede (ex.: back/forward cache) ou a navegação
    // pendente foi abandonada: começa um relatório novo.
    pending.delete(tabId);
    reports.set(tabId, new TabReport(tabId, url));
  }
  // O Firefox limpa o badge específico da aba ao trocar de página.
  updateBadge(tabId);
}

function updateBadge(tabId) {
  const report = reports.get(tabId);
  const count = report ? report.thirdPartySiteCount() : 0;
  browser.browserAction
    .setBadgeText({ tabId, text: count ? String(count) : '' })
    .catch(() => {}); // aba já fechada
}

browser.browserAction.setBadgeBackgroundColor({ color: '#9a3412' });
browser.browserAction.setBadgeTextColor({ color: '#ffffff' });

browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, { urls: ['<all_urls>'] });
browser.webRequest.onErrorOccurred.addListener(onErrorOccurred, { urls: ['<all_urls>'] });
browser.webNavigation.onCommitted.addListener(onCommitted);
browser.tabs.onRemoved.addListener(tabId => {
  reports.delete(tabId);
  pending.delete(tabId);
});

browser.runtime.onMessage.addListener(message => {
  if (message && message.type === 'getReport') {
    const report = reports.get(message.tabId);
    return Promise.resolve(report ? report.toJSON() : null);
  }
  return undefined;
});
