#!/usr/bin/env node
'use strict';

// Reconciliação do que o plugin detectou com o Blacklight e o uBlock Origin,
// a partir das evidências de um site (evidencias/sites/<site>/):
//   plugin.json, <site>.har, ublock.txt, blacklight/raw/inspection.json e
//   blacklight/raw/requests.har
// Gera reconciliacao.md com uma linha por site rastreador: o que cada ferramenta
// viu, quantas requisições cada HAR tem e a causa provável de cada divergência,
// classificada a partir do tráfego. A causa é um ponto de partida para o
// relatório: cada linha traz a evidência (URL, regra, página) para conferir.
//
// Uso: node tools/reconcile.js evidencias/sites/uol.com.br [...]

const fs = require('fs');
const path = require('path');

const Parties = require('../extension/background/parties.js');
const Categories = require('../extension/background/categories.js');

const WINDOW_MS = 30000; // mesma janela de coleta do plugin e do HAR

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const siteOf = url => Parties.siteOf(url);
const count = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);

function entryFor(map, site, init) {
  if (!map.has(site)) map.set(site, init());
  return map.get(site);
}

// HAR: requisições por site, com exemplo de URL, Set-Cookie, Referer e iniciador.
function readHar(file) {
  const log = readJSON(file).log;
  const bySite = new Map();
  for (const e of log.entries) {
    const url = e.request.url;
    const site = siteOf(url);
    if (!site) continue;
    const s = entryFor(bySite, site, () => ({ requests: 0, example: url, setCookies: 0, referers: new Set(), initiators: new Set() }));
    s.requests++;
    const header = name => (e.request.headers.find(h => h.name.toLowerCase() === name) || {}).value;
    const referer = header('referer');
    if (referer) s.referers.add(referer.split('?')[0]);
    const initiator = typeof e._initiator === 'string' ? e._initiator : e._initiator && e._initiator.url;
    if (initiator && /^https?:/.test(initiator)) s.initiators.add(siteOf(initiator));
    s.setCookies += (e.response.headers || []).filter(h => h.name.toLowerCase() === 'set-cookie').length;
  }
  return { entries: log.entries, bySite };
}

// Log exportado do uBlock Origin: blocos separados por linha em branco, um campo
// por linha. Bloqueado: [tempo, regra, "--" ou "<<", contexto, parte, método,
// tipo, URL]; permitido: [tempo, contexto, parte, método, tipo, URL]; CNAME
// desmascarado: URL do alvo seguida de "aliasURL=<URL original>".
function readUblock(file) {
  const bySite = new Map();
  const cnames = new Map(); // host requisitado -> host real (CNAME)
  let total = 0;
  for (const block of fs.readFileSync(file, 'utf8').split(/\n\s*\n/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const urls = lines.filter(l => /^https?:\/\//.test(l));
    if (!urls.length) continue; // filtros cosméticos, scriptlets
    const alias = lines.find(l => l.startsWith('aliasURL='));
    const url = alias ? alias.slice('aliasURL='.length) : urls[urls.length - 1];
    const result = lines[2];
    const blocked = result === '--' || result === '<<';
    const site = siteOf(url);
    if (!site) continue;
    total++;
    const s = entryFor(bySite, site, () => ({ requests: 0, blocked: 0, redirected: 0, rules: new Set() }));
    s.requests++;
    if (blocked) {
      s.blocked++;
      if (result === '<<') s.redirected++;
      s.rules.add(lines[1]);
    }
    if (alias) cnames.set(new URL(url).hostname, new URL(urls[urls.length - 1]).hostname);
  }
  return { total, bySite, cnames };
}

// Relatório bruto do Blacklight.
function readBlacklight(dir) {
  const inspection = readJSON(path.join(dir, 'raw', 'inspection.json'));
  const reports = inspection.reports;
  const trackers = new Map();
  for (const t of reports.third_party_trackers) {
    const site = siteOf(t.url);
    if (!site) continue;
    const s = entryFor(trackers, site, () => ({ requests: 0, lists: new Set(), rules: new Set(), example: t.url }));
    s.requests++;
    s.lists.add(t.data.listName);
    if (s.rules.size < 3) s.rules.add(t.data.filter);
  }
  const cookies = new Map();
  for (const c of reports.cookies.filter(c => c.third_party)) count(cookies, siteOf(`https://${c.domain.replace(/^\./, '')}/`));
  return {
    inspection,
    trackers,
    cookies,
    har: readHar(path.join(dir, 'raw', 'requests.har')),
    pages: inspection.browsing_history || [],
  };
}

// Categorias do Blacklight no tráfego de um HAR, com as regras do plugin.
function harCategories(entries) {
  const found = new Map();
  for (const e of entries) {
    for (const c of Categories.categoriesOf(e.request.url)) {
      const s = entryFor(found, c, () => ({ sites: new Set(), referers: new Set() }));
      s.sites.add(siteOf(e.request.url));
      const referer = (e.request.headers.find(h => h.name.toLowerCase() === 'referer') || {}).value;
      if (referer) s.referers.add(referer.split('?')[0]);
    }
  }
  return found;
}

// Causa provável de cada linha, a partir de onde o site aparece.
function explain(row, ctx) {
  const notes = [];
  const secondPage = ctx.blacklight.pages[1];
  if (!row.ours && row.blHar) {
    const referers = [...row.blHar.referers];
    const initiators = [...row.blHar.initiators].filter(s => s && s !== row.site && s !== ctx.site);
    if (secondPage && referers.length && referers.every(r => r === secondPage.split('?')[0])) {
      notes.push(`só na 2ª página visitada pelo Blacklight (${secondPage})`);
    } else if (initiators.length) {
      notes.push(`ausente do nosso HAR; no HAR do Blacklight foi disparado por ${initiators.slice(0, 3).join(', ')} (leilão/sincronização da visita a partir dos EUA)`);
    } else {
      notes.push('ausente do nosso HAR: não carregado na visita a partir do Brasil (anúncio/segmentação por região ou momento)');
    }
  } else if (row.ours && !row.blHar && (row.plugin?.tracker || row.ublock?.blocked)) {
    notes.push('ausente do HAR do Blacklight: não carregado na visita dele (região ou momento)');
  } else if (row.ours && row.blHar) {
    if (row.blacklight && !row.plugin?.tracker) {
      notes.push(`nas duas visitas; a lista do Firefox (Disconnect) não o classifica, a ${[...row.blacklight.lists].join('/')} sim`);
    } else if (row.plugin?.tracker && !row.blacklight) {
      notes.push(`nas duas visitas; o Firefox classifica (${row.plugin.flags}), as listas EasyList/EasyPrivacy do Blacklight não`);
    } else if (row.plugin?.tracker && row.blacklight) {
      notes.push('concordam');
    }
  }
  if (row.ublock?.blocked && !row.plugin?.tracker) notes.push(`uBO bloqueia (${[...row.ublock.rules][0]}) sem classificação do Firefox`);
  if (row.ours && ctx.ublock && !row.ublock) notes.push('não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado)');
  return notes.join('; ') || '—';
}

function yesNo(value) {
  return value ? 'sim' : 'não';
}

function reconcile(dir) {
  const site = path.basename(dir);
  const plugin = readJSON(path.join(dir, 'plugin.json'));
  const report = plugin.report;
  const ours = readHar(path.join(dir, `${site}.har`));
  const ublock = fs.existsSync(path.join(dir, 'ublock.txt')) ? readUblock(path.join(dir, 'ublock.txt')) : null;
  const blacklight = readBlacklight(path.join(dir, 'blacklight'));
  const ctx = { site: report.site, blacklight, ublock };

  // Plugin: sites de 3ª parte na janela de 30 s.
  const pluginSites = new Map();
  for (const s of report.thirdParty.filter(s => s.firstSeenMs <= WINDOW_MS)) {
    pluginSites.set(s.site, { requests: s.requests, tracker: s.tracker, flags: s.classifications.filter(c => !c.startsWith('any_')).join(', ') });
  }

  // Linhas: todo site que alguma ferramenta tratou como rastreador.
  const candidates = new Set([
    ...[...pluginSites].filter(([, s]) => s.tracker).map(([s]) => s),
    ...[...(ublock ? ublock.bySite : [])].filter(([, s]) => s.blocked).map(([s]) => s),
    ...blacklight.trackers.keys(),
  ]);
  const rows = [...candidates].map(s => {
    const row = {
      site: s,
      plugin: pluginSites.get(s) || null,
      ublock: ublock ? ublock.bySite.get(s) || null : null,
      blacklight: blacklight.trackers.get(s) || null,
      ours: ours.bySite.get(s) || null,
      blHar: blacklight.har.bySite.get(s) || null,
    };
    row.explanation = explain(row, ctx);
    return row;
  }).sort((a, b) => {
    const score = r => (r.plugin?.tracker ? 4 : 0) + (r.blacklight ? 2 : 0) + (r.ublock?.blocked ? 1 : 0);
    return score(b) - score(a) || a.site.localeCompare(b.site);
  });

  const agree = rows.filter(r => r.plugin?.tracker && r.blacklight).length;
  const onlyBlacklight = rows.filter(r => r.blacklight && !r.plugin?.tracker).length;
  const onlyPlugin = rows.filter(r => r.plugin?.tracker && !r.blacklight).length;
  const blNotLoaded = rows.filter(r => r.blacklight && !r.ours).length;

  const bl = blacklight.inspection;
  const lines = [];
  lines.push(`# Reconciliação — ${site}`, '');
  lines.push('Gerado por `tools/reconcile.js` a partir das evidências desta pasta. A coluna');
  lines.push('**Causa provável** é classificada automaticamente pelo tráfego dos HARs e deve ser');
  lines.push('conferida; cada linha traz a evidência correspondente.', '');
  lines.push('## Fontes', '');
  lines.push(`- **Plugin**: \`plugin.json\` (v${plugin.tool.version}, exportado ${plugin.exportedAt}); sites de 3ª parte vistos nos primeiros ${WINDOW_MS / 1000} s.`);
  lines.push(`- **Nosso HAR**: \`${site}.har\`, ${ours.entries.length} requisições, ${ours.bySite.size} sites.`);
  if (ublock) lines.push(`- **uBlock Origin**: \`ublock.txt\`, ${ublock.total} requisições, ${[...ublock.bySite.values()].filter(s => s.blocked).length} sites com bloqueio.`);
  lines.push(`- **Blacklight**: \`blacklight/raw/inspection.json\` (${bl.start_time} a ${bl.end_time}, ${bl.browser.version}, a partir de \`${bl.location}\`; páginas: ${blacklight.pages.join(', ')}); \`blacklight/raw/requests.har\` com ${blacklight.har.entries.length} requisições.`);
  lines.push('');
  lines.push('## Resumo', '');
  lines.push('| | Plugin | uBlock Origin | Blacklight |');
  lines.push('|---|---|---|---|');
  lines.push(`| Sites rastreadores | ${[...pluginSites.values()].filter(s => s.tracker).length} (listas do Firefox) | ${ublock ? [...ublock.bySite.values()].filter(s => s.blocked).length + ' com bloqueio' : '—'} | ${blacklight.trackers.size} (EasyList/EasyPrivacy) |`);
  lines.push(`| Sites de 3ª parte | ${pluginSites.size} | ${ublock ? [...ublock.bySite.keys()].filter(s => s !== report.site).length : '—'} | ${[...blacklight.har.bySite.keys()].filter(s => s !== report.site).length} (no HAR) |`);
  lines.push(`| Cookies de 3ª parte | ${report.cookies.list.filter(c => c.thirdParty && (c.inWindow ?? c.duringLoad ?? true)).length} | — | ${[...blacklight.cookies.values()].reduce((a, b) => a + b, 0)} |`);
  lines.push('');
  lines.push(`Rastreadores: **${agree}** em comum com o Blacklight; **${onlyBlacklight}** só no Blacklight (${blNotLoaded} deles ausentes do nosso HAR, ou seja, não carregados na nossa visita); **${onlyPlugin}** só no plugin.`, '');

  lines.push('## Rastreadores por site', '');
  lines.push('| Site | Plugin | uBO | Blacklight | Nosso HAR | HAR Blacklight | Causa provável | Evidência |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const pluginCell = r.plugin ? (r.plugin.tracker ? `rastreador (${r.plugin.flags || '—'})` : 'visto, não classificado') : 'não visto';
    const ublockCell = !ublock ? '—' : r.ublock ? (r.ublock.blocked ? `bloqueou ${r.ublock.blocked}/${r.ublock.requests}` : `permitiu ${r.ublock.requests}`) : 'não requisitado';
    const blCell = r.blacklight ? `${[...r.blacklight.lists].join(', ')} (${r.blacklight.requests})` : (r.blHar ? 'visto, não classificado' : 'não visto');
    const evidence = (r.ours || r.blHar || {}).example || (r.blacklight || {}).example || '';
    lines.push(`| ${r.site} | ${pluginCell} | ${ublockCell} | ${blCell} | ${r.ours ? r.ours.requests : 0} | ${r.blHar ? r.blHar.requests : 0} | ${r.explanation} | \`${evidence.slice(0, 90)}\` |`);
  }
  lines.push('');

  // Categorias (testes do Blacklight)
  const oursCats = harCategories(ours.entries);
  const blCats = harCategories(blacklight.har.entries);
  const blReported = {
    'session-recording': Object.keys(bl.reports.session_recorders || {}).length > 0,
    'facebook-pixel': (bl.reports.fb_pixel_events || []).length > 0,
    'tiktok-pixel': (bl.reports.tiktok_pixel_events || []).length > 0,
    'x-pixel': (bl.reports.twitter_pixel_events || []).length > 0,
    'ga-remarketing': (bl.reports.google_analytics_events || []).length > 0,
  };
  lines.push('## Categorias (testes do Blacklight)', '');
  lines.push('Colunas "no HAR": regras do plugin (`categories.js`) aplicadas a cada HAR.', '');
  lines.push('| Categoria | Blacklight reportou | No HAR do Blacklight | No nosso HAR |');
  lines.push('|---|---|---|---|');
  for (const category of Object.keys(Categories.LABELS)) {
    const describe = found => {
      const f = found.get(category);
      if (!f) return 'não';
      const pages = [...f.referers].map(r => (blacklight.pages[1] && r === blacklight.pages[1].split('?')[0] ? '2ª página' : null)).filter(Boolean);
      return `sim: ${[...f.sites].join(', ')}${pages.length && pages.length === f.referers.size ? ' (só na 2ª página)' : ''}`;
    };
    const reported = category in blReported ? yesNo(blReported[category]) : '(não é teste do Blacklight)';
    lines.push(`| ${Categories.LABELS[category]} | ${reported} | ${describe(blCats)} | ${describe(oursCats)} |`);
  }
  lines.push('');

  // CNAMEs desmascarados pelo uBO (o plugin não resolve DNS)
  if (ublock && ublock.cnames.size) {
    lines.push('## CNAMEs desmascarados pelo uBlock Origin', '');
    lines.push('O uBO no Firefox resolve o DNS de cada host (`browser.dns`); o plugin não. Um subdomínio do');
    lines.push('próprio site que aponta para outro serviço é rastreamento disfarçado de 1ª parte.', '');
    lines.push('| Host requisitado | Aponta para | Subdomínio do próprio site? |');
    lines.push('|---|---|---|');
    for (const [host, target] of [...ublock.cnames].sort()) {
      lines.push(`| ${host} | ${target} | ${siteOf(host) === report.site ? '**sim**' : 'não'} |`);
    }
    lines.push('');
  }

  // Fingerprinting
  const keysOrList = v => (Array.isArray(v) ? v : Object.keys(v || {}));
  const blCanvas = keysOrList(bl.reports.canvas_fingerprinters.fingerprinters);
  const blFonts = keysOrList(bl.reports.canvas_font_fingerprinters.canvas_font);
  const describeFp = detections => (detections.length
    ? detections.map(d => `${d.technique} por \`${String(d.script).slice(0, 80)}\``).join('; ')
    : 'nenhum');
  lines.push('## Fingerprinting', '');
  lines.push(`- Blacklight, canvas: ${blCanvas.length ? blCanvas.map(u => `\`${u.slice(0, 100)}\``).join(', ') : 'nenhum'}`);
  lines.push(`- Blacklight, fontes: ${blFonts.length ? blFonts.map(u => `\`${u.slice(0, 100)}\``).join(', ') : 'nenhum'}`);
  lines.push(`- Plugin, coleta manual: ${describeFp(report.fingerprinting ? report.fingerprinting.detections : [])}`);
  const automated = path.join(dir, 'automatizado', 'plugin.json');
  if (fs.existsSync(automated)) {
    const auto = readJSON(automated).report;
    lines.push(`- Plugin, coleta automatizada (\`automatizado/\`, navigator.webdriver = true): ${describeFp(auto.fingerprinting.detections)}`);
  }
  lines.push('');

  const out = path.join(dir, 'reconciliacao.md');
  fs.writeFileSync(out, lines.join('\n'));
  return { out, rows: rows.length, agree, onlyBlacklight, onlyPlugin, blNotLoaded };
}

for (const dir of process.argv.slice(2)) {
  const r = reconcile(dir.replace(/\/$/, ''));
  console.log(`${r.out}: ${r.rows} sites rastreadores; ${r.agree} em comum; ${r.onlyBlacklight} só no Blacklight (${r.blNotLoaded} não carregados na nossa visita); ${r.onlyPlugin} só no plugin`);
}
