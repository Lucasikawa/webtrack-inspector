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
  report.committedAt = Date.now();
  reports.set(tabId, report);
  updateBadge(tabId);
}

// Nova página na aba, ligada à anterior (para detectar bounce tracking). A
// anterior congela o resumo da dela, para não formar uma cadeia em memória.
function newReport(tabId, url, requestId = null) {
  const report = new TabReport(tabId, url, requestId);
  const current = reports.get(tabId);
  if (current) {
    current.freezePrevious();
    report.previousReport = current;
    report.previousLeftAt = Date.now();
  }
  return report;
}

function onBeforeRequest(details) {
  const { tabId } = details;
  if (tabId < 0) return; // requisições sem aba: service workers, o próprio navegador

  if (details.type === 'main_frame') {
    const next = pending.get(tabId);
    if (next && next.requestId === details.requestId) {
      next.setUrl(details.url); // redirecionamento: mesmo requestId, nova URL
    } else {
      pending.set(tabId, newReport(tabId, details.url, details.requestId));
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

// Cabeçalho Cookie enviado: identificadores que cada site já tinha no navegador.
function onBeforeSendHeaders(details) {
  const report = reportForEvent(details);
  if (!report) return;
  const header = (details.requestHeaders || []).find(h => h.name.toLowerCase() === 'cookie');
  if (header && header.value) report.addRequestCookies(details.url, header.value);
}

function onHeadersReceived(details) {
  const report = reportForEvent(details);
  if (!report) return;
  for (const cookie of Cookies.parseSetCookieHeaders(details.responseHeaders, details.url)) {
    report.addCookie(cookie, 'http', details.url);
  }
}

function onCookieChanged({ removed, cookie }) {
  // Remoções (inclusive a que antecede uma sobrescrita) não são injeções.
  if (removed) return;
  const record = Cookies.fromBrowserCookie(cookie);
  // Com a Total Cookie Protection, cookies de terceiros ficam numa partição
  // identificada pelo site de topo, o que diz exatamente a que página pertencem.
  const partitionSite = cookie.partitionKey && cookie.partitionKey.topLevelSite
    ? Parties.siteOf(cookie.partitionKey.topLevelSite)
    : null;
  for (const report of [...reports.values(), ...pending.values()]) {
    const belongs = partitionSite ? partitionSite === report.site : report.involvesSite(record.site);
    if (belongs) report.addCookie(record, 'store');
  }
}

function onStorageSnapshot(snapshot, sender) {
  if (!sender.tab) return;
  const report = reports.get(sender.tab.id);
  // Retrato atrasado da página anterior: o frame de topo precisa ser do mesmo site.
  if (!report || (sender.frameId === 0 && Parties.siteOf(sender.url) !== report.site)) return;
  report.addStorageSnapshot({ ...snapshot, frameId: sender.frameId });
}

function onHookEvents(events, sender) {
  if (!sender.tab || !Array.isArray(events)) return;
  let report = reports.get(sender.tab.id);
  if (report && sender.frameId === 0 && Parties.siteOf(sender.url) !== report.site) {
    // Lote enviado pela página anterior ao sair dela (pagehide).
    const previous = report.previousReport;
    report = previous && TabReport.normalizeUrl(sender.url) === previous.url ? previous : null;
  }
  if (!report) return;
  for (const event of events) report.addHookEvent(event);
}

// Enquanto o popup está aberto, pede aos frames da aba um retrato novo do
// armazenamento, no máximo a cada 3 s.
const lastStorageRequest = new Map(); // tabId -> Date.now()
function requestStorageSnapshot(tabId) {
  const now = Date.now();
  if (now - (lastStorageRequest.get(tabId) || 0) < 3000) return;
  lastStorageRequest.set(tabId, now);
  browser.tabs.sendMessage(tabId, { type: 'collectStorage' }).catch(() => {});
}

// Salva o relatório da aba em JSON, com metadados para rastrear a evidência.
async function exportReport(tabId) {
  const report = reports.get(tabId);
  if (!report) return { ok: false, error: 'Sem relatório para esta aba.' };
  const manifest = browser.runtime.getManifest();
  const data = {
    tool: { name: manifest.name, version: manifest.version },
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    report: report.toJSON(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  const stamp = data.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  try {
    await browser.downloads.download({ url, filename: `plugin-${report.site}-${stamp}.json`, saveAs: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function onCompleted(details) {
  if (details.frameId !== 0) return;
  const report = reports.get(details.tabId);
  if (report && report.site === Parties.siteOf(details.url)) report.markLoaded();
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
    const report = newReport(tabId, url);
    report.committedAt = Date.now();
    reports.set(tabId, report);
  }
  // Tipo da navegação: distingue as iniciadas pelo usuário (barra de endereço,
  // favoritos, recarga) dos redirecionamentos automáticos.
  const current = reports.get(tabId);
  if (current) {
    current.transition = { type: details.transitionType, qualifiers: details.transitionQualifiers || [] };
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
browser.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, { urls: ['<all_urls>'] }, ['requestHeaders']);
browser.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['<all_urls>'] }, ['responseHeaders']);
browser.cookies.onChanged.addListener(onCookieChanged);
browser.webNavigation.onCommitted.addListener(onCommitted);
browser.webNavigation.onCompleted.addListener(onCompleted);
browser.tabs.onRemoved.addListener(tabId => {
  reports.delete(tabId);
  pending.delete(tabId);
  lastStorageRequest.delete(tabId);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message) return undefined;
  if (message.type === 'storageSnapshot') {
    onStorageSnapshot(message.snapshot, sender);
  } else if (message.type === 'hookEvents') {
    onHookEvents(message.events, sender);
  } else if (message.type === 'getReport') {
    requestStorageSnapshot(message.tabId);
    const report = reports.get(message.tabId);
    return Promise.resolve(report ? report.toJSON() : null);
  } else if (message.type === 'exportReport') {
    return exportReport(message.tabId);
  }
  return undefined;
});
