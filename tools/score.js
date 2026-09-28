#!/usr/bin/env node
'use strict';

// Score de privacidade dos sites analisados, análise de sensibilidade dos pesos e
// comparação com os testes do Blacklight. Gera evidencias/score.md.
//
// A comparação calcula também o score "na mesma régua" com o que o Blacklight
// observou: separa a divergência que vem do que cada ferramenta viu da que vem do
// que cada uma mede.
//
// Para cada site usa a coleta final (evidencias/sites/<site>/final/plugin.json)
// se existir; senão, a primeira (evidencias/sites/<site>/plugin.json). O score é
// recalculado com a metodologia atual (extension/background/score.js), para que
// todas as coletas sejam avaliadas pela mesma régua.
//
// Uso: node tools/score.js [evidencias/sites/<site> ...]

const fs = require('fs');
const path = require('path');

globalThis.Parties = require('../extension/background/parties.js');
const Categories = require('../extension/background/categories.js');
const Score = require('../extension/background/score.js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SITES = ['sp.gov.br', 'quintoandar.com.br', 'uol.com.br'].map(s => path.join(ROOT, 'evidencias', 'sites', s));
const FACTORS = [0.7, 1.3];

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fmt = n => String(Math.round(n * 10) / 10).replace('.', ',');

function loadSite(dir) {
  const final = path.join(dir, 'final');
  const base = fs.existsSync(path.join(final, 'plugin.json')) ? final : dir;
  const plugin = readJSON(path.join(base, 'plugin.json'));
  const report = plugin.report;
  const site = path.basename(dir);
  const notes = [];

  // Coletas de versões anteriores não têm categorias: derivadas do HAR da mesma
  // coleta, com as mesmas regras do plugin.
  if (!report.categories) {
    const harFile = path.join(base, `${site}.har`);
    const found = new Map();
    for (const e of readJSON(harFile).log.entries) {
      for (const c of Categories.categoriesOf(e.request.url)) {
        const item = found.get(c) || { category: c, label: Categories.LABELS[c], sites: new Set(), firstSeenMs: 0 };
        item.sites.add(Parties.siteOf(e.request.url));
        found.set(c, item);
      }
    }
    report.categories = [...found.values()].map(c => ({ ...c, sites: [...c.sites] }));
    notes.push(`categorias derivadas de \`${path.relative(dir, harFile)}\` (JSON da v${plugin.tool.version} não as tem)`);
  }
  for (const [field, label] of [['sync', 'sincronização'], ['bounces', 'bounce'], ['hijack', 'sequestro do navegador']]) {
    if (!report[field]) notes.push(`${label} não coletado na v${plugin.tool.version}`);
  }

  // Até a v0.7.0, Set-Cookie com Domain num sufixo público entrava na lista,
  // embora nenhum navegador o grave (RFC 6265, seção 5.3, passo 5).
  const rejected = report.cookies.list.filter(c => !c.hostOnly && !c.stored && Parties.isPublicSuffix(c.domain));
  if (rejected.length) {
    report.cookies.list = report.cookies.list.filter(c => !rejected.includes(c));
    notes.push(`${rejected.length} cookies com Domain no sufixo público \`${[...new Set(rejected.map(c => c.domain))].join(', ')}\` desconsiderados (${rejected.map(c => `\`${c.name}\``).join(', ')}): nenhum navegador os grava (RFC 6265, seção 5.3)`);
  }

  const score = Score.compute(report);
  if (report.score && report.score.score !== score.score) {
    notes.push(`o popup e o JSON mostram ${report.score.score} (${report.score.grade}), calculado pela v${plugin.tool.version} antes da correção acima`);
  }

  return {
    site,
    dir,
    source: path.relative(ROOT, path.join(base, 'plugin.json')),
    version: plugin.tool.version,
    exportedAt: plugin.exportedAt,
    report,
    score,
    notes,
    blacklight: loadBlacklight(path.join(dir, 'blacklight')),
    automated: fs.existsSync(path.join(dir, 'automatizado', 'plugin.json')) ? readJSON(path.join(dir, 'automatizado', 'plugin.json')).report : null,
  };
}

// Resultado dos testes do Blacklight: totais do report.html, detalhes do
// inspection.json.
function loadBlacklight(dir) {
  if (!fs.existsSync(path.join(dir, 'raw', 'inspection.json'))) return null;
  const inspection = readJSON(path.join(dir, 'raw', 'inspection.json'));
  const r = inspection.reports;
  const text = fs.readFileSync(path.join(dir, 'report.html'), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const number = re => {
    const m = text.match(re);
    return m ? Number(m[1]) : 0;
  };
  const list = v => (Array.isArray(v) ? v : Object.keys(v || {}));
  const t0 = Date.parse(inspection.start_time);
  return {
    start: inspection.start_time,
    seconds: Math.round((Date.parse(inspection.end_time) - t0) / 1000),
    pages: inspection.browsing_history,
    location: inspection.location,
    adTrackers: number(/(\d+) Ad trackers found/),
    thirdPartyCookies: number(/(\d+) Third-party cookies found/),
    cookies: r.cookies.filter(c => c.third_party).map(c => ({
      name: c.name,
      domain: c.domain,
      lifetimeDays: c.expires === -1 ? 0 : (Date.parse(c.expires) - t0) / 864e5,
    })),
    canvas: [...new Set(list(r.canvas_fingerprinters.fingerprinters))],
    // Dado bruto (não é um teste exibido no relatório): scripts com listeners de
    // teclado, comparável ao que o plugin registra.
    keyboardScripts: Object.keys((r.behaviour_event_listeners || {}).KEYBOARD || {}).filter(u => /^https?:/.test(u)),
    sessionRecording: Object.keys(r.session_recorders || {}),
    keyLogging: Object.keys(r.key_logging || {}),
    facebookPixel: (r.fb_pixel_events || []).length > 0,
    tiktokPixel: (r.tiktok_pixel_events || []).length > 0,
    xPixel: (r.twitter_pixel_events || []).length > 0,
    gaRemarketing: (r.google_analytics_events || []).length > 0,
  };
}

// Relatório no formato do plugin montado com o que o Blacklight observou, para
// aplicar a mesma régua. Critérios que o Blacklight não mede ficam zerados.
function blacklightAsReport(s) {
  const b = s.blacklight;
  const site = s.report.site;
  const categories = [];
  const cat = (on, category, sites = []) => on && categories.push({ category, sites });
  cat(b.sessionRecording.length > 0, 'session-recording', b.sessionRecording);
  cat(b.facebookPixel, 'facebook-pixel');
  cat(b.tiktokPixel, 'tiktok-pixel');
  cat(b.xPixel, 'x-pixel');
  cat(b.gaRemarketing, 'ga-remarketing');
  return {
    site,
    thirdParty: Array.from({ length: b.adTrackers }, (_, i) => ({ site: `rastreador-${i}`, tracker: true })),
    cookies: { list: b.cookies.map(c => ({ name: c.name, site: c.domain, thirdParty: true, lifetimeDays: c.lifetimeDays })) },
    storage: { origins: [] },
    fingerprinting: { detections: b.canvas.map(u => ({ technique: 'canvas', scriptThirdParty: Parties.siteOf(u) !== site })) },
    sync: { events: [] },
    bounces: [],
    categories,
    hijack: {
      keyboard: b.keyboardScripts.map(u => ({ scriptSite: Parties.siteOf(u), scriptThirdParty: Parties.siteOf(u) !== site })),
      signatures: [], websockets: [], eventStreams: [], polling: [], globals: null,
    },
  };
}

// Análise de sensibilidade: cada peso multiplicado por 0,7 e 1,3, um de cada vez.
function sensitivity(sites) {
  const baseline = sites.map(s => s.score.score);
  const rank = scores => scores.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i).join(',');
  const baseRank = rank(baseline);
  const rows = [];
  for (const c of Score.CRITERIA) {
    for (const f of FACTORS) {
      const scores = sites.map(s => Score.compute(s.report, { [c.id]: f }).score);
      rows.push({ criterion: c.label, factor: f, scores, sameRank: rank(scores) === baseRank });
    }
  }
  return { baseline, rows };
}

function pluginCategory(report, category) {
  return (report.categories || []).find(c => c.category === category);
}

function blacklightRows(s) {
  const b = s.blacklight;
  const r = s.report;
  const window = x => (x.firstSeenMs ?? 0) <= Score.WINDOW_MS;
  const trackers = r.thirdParty.filter(t => t.tracker && window(t)).length;
  const cookies = r.cookies.list.filter(c => c.thirdParty && (c.inWindow ?? c.duringLoad ?? true)).length;
  const fp = (r.fingerprinting.detections || []).filter(d => d.technique !== 'webgl-info');
  const autoFp = s.automated ? s.automated.fingerprinting.detections.filter(d => d.technique !== 'webgl-info') : [];
  const keyboard = r.hijack ? [...new Set(r.hijack.keyboard.filter(k => k.scriptThirdParty).map(k => k.scriptSite))] : null;
  const blKeyboard = [...new Set(b.keyboardScripts.map(u => Parties.siteOf(u)).filter(x => x !== r.site))];
  const cat = c => (pluginCategory(r, c) ? `sim (${pluginCategory(r, c).sites.join(', ')})` : 'não');
  const yes = v => (v ? 'sim' : 'não');
  const rows = [
    ['Ad trackers', String(b.adTrackers), `${trackers} sites rastreadores (listas do Firefox)`],
    ['Cookies de terceiros', String(b.thirdPartyCookies), `${cookies} (particionados pelo Firefox)`],
    ['Canvas fingerprinting', b.canvas.length ? `sim (${[...new Set(b.canvas.map(u => Parties.siteOf(u)))].join(', ')})` : 'não',
      `${fp.length ? `sim (${[...new Set(fp.map(d => d.scriptSite))].join(', ')})` : 'não'}${s.automated ? `; automatizado: ${autoFp.length ? `sim (${[...new Set(autoFp.map(d => d.scriptSite))].join(', ')})` : 'não'}` : ''}`],
    ['Gravação de sessão', b.sessionRecording.length ? `sim (${b.sessionRecording.join(', ')})` : 'não', cat('session-recording')],
    ['Captura de teclado', b.keyLogging.length ? 'sim' : 'não', 'não medido (o plugin não digita nos campos)'],
    ['Listeners de teclado de 3ª parte (dado bruto)', blKeyboard.length ? `sim (${blKeyboard.join(', ')})` : 'não',
      keyboard === null ? 'não coletado' : keyboard.length ? `sim (${keyboard.join(', ')})` : 'não'],
    ['Pixel do Facebook', yes(b.facebookPixel), cat('facebook-pixel')],
    ['Pixel do TikTok', yes(b.tiktokPixel), cat('tiktok-pixel')],
    ['Pixel do X', yes(b.xPixel), cat('x-pixel')],
    ['GA com remarketing', yes(b.gaRemarketing), cat('ga-remarketing')],
  ];
  return rows.map(([test, blacklight, plugin]) => {
    if (/^não (medido|coletado)/.test(plugin)) return [test, blacklight, plugin, '—'];
    const bl = blacklight !== 'não' && blacklight !== '0';
    const pl = !/^(não|0 )/.test(plugin);
    let verdict = bl === pl ? 'concordam' : 'divergem';
    if (bl && pl && /^\d+$/.test(blacklight) && Number(blacklight) !== parseInt(plugin, 10)) verdict = 'presença concorda, contagem diverge';
    if (!pl && /automatizado: sim/.test(plugin) && bl) verdict = 'divergem na coleta manual, concordam na automatizada';
    return [test, blacklight, plugin, verdict];
  });
}

function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2).map(d => path.resolve(d)) : DEFAULT_SITES;
  const sites = dirs.map(loadSite);
  const sens = sensitivity(sites);
  const lines = [];
  const L = (...xs) => lines.push(...xs);

  L('# Score de privacidade dos sites analisados', '');
  L('Análise crítica e comparação com o Blacklight: [`score-analise.md`](score-analise.md).', '');
  L('Gerado por `tools/score.js` com a metodologia de `extension/background/score.js`', '(a mesma do popup). Parte de 100 e desconta pontos em 7 critérios; cada critério tem', 'teto, e os tetos somam 100. Só entra o que foi observado nos primeiros 30 s.', '');
  L('## Metodologia', '');
  L('| Critério | Teto | Regra | Teste equivalente no Blacklight |', '|---|---|---|---|');
  for (const c of Score.CRITERIA) L(`| ${c.label} | ${c.max} | ${c.rule} | ${c.blacklight || '—'} |`);
  L('', `Faixas: ${Score.GRADES.map(([min, g]) => `${g} ≥ ${min}`).join(', ')}.`, '');

  L('## Resultado', '');
  L(`| Critério (teto) | ${sites.map(s => s.site).join(' | ')} |`, `|---|${sites.map(() => '---').join('|')}|`);
  for (const c of Score.CRITERIA) {
    L(`| ${c.label} (${c.max}) | ${sites.map(s => `−${fmt(s.score.criteria.find(x => x.id === c.id).penalty)}`).join(' | ')} |`);
  }
  L(`| **Score** | ${sites.map(s => `**${s.score.score} (${s.score.grade})**`).join(' | ')} |`, '');
  for (const s of sites) {
    L(`- **${s.site}**: \`${s.source}\` (plugin v${s.version}, exportado ${s.exportedAt})${s.notes.length ? `; ${s.notes.join('; ')}` : ''}.`);
  }
  L('');

  L('### Ocorrências que descontaram pontos', '');
  for (const s of sites) {
    L(`#### ${s.site}`, '');
    for (const c of s.score.criteria.filter(c => c.items.length)) {
      const items = c.items.slice(0, 12).map(i => `${i.label} (−${i.points})`).join('; ');
      L(`- **${c.label}** (−${fmt(c.penalty)} de ${c.max}): ${items}${c.items.length > 12 ? `; e mais ${c.items.length - 12}` : ''}`);
    }
    L('');
  }

  L('## Análise de sensibilidade', '');
  L('Cada peso (teto e pontos por ocorrência do critério) multiplicado por 0,7 e por 1,3, um de cada vez; a nota é renormalizada para 0–100.', '');
  L(`| Critério | Fator | ${sites.map(s => s.site).join(' | ')} | Mesma ordem? |`, `|---|---|${sites.map(() => '---').join('|')}|---|`);
  L(`| (pesos originais) | 1 | ${sens.baseline.join(' | ')} | — |`);
  for (const row of sens.rows) L(`| ${row.criterion} | ${fmt(row.factor)} | ${row.scores.join(' | ')} | ${row.sameRank ? 'sim' : '**não**'} |`);
  const changed = sens.rows.filter(r => !r.sameRank).length;
  L('', changed ? `A ordem dos sites mudou em ${changed} de ${sens.rows.length} variações.` : `A ordem dos sites se mantém nas ${sens.rows.length} variações.`, '');

  L('## Comparação com o Blacklight', '');
  const withBl = sites.filter(x => x.blacklight);
  L('### Mesma régua aplicada ao que o Blacklight observou', '');
  L('O Blacklight não dá nota. Aqui o score do plugin é aplicado às contagens do Blacklight', '(ad trackers, cookies de terceiros, canvas, gravação de sessão, pixels, GA remarketing e', 'listeners de teclado do dado bruto). Critérios que o Blacklight não mede ficam em 0 e aparecem como "não mede".', '');
  const blScores = new Map(withBl.map(s => [s.site, Score.compute(blacklightAsReport(s))]));
  L(`| Critério (teto) | ${withBl.map(s => `${s.site}: plugin | ${s.site}: Blacklight`).join(' | ')} |`, `|---|${withBl.map(() => '---|---').join('|')}|`);
  const unmeasured = new Set(['storage', 'sync', 'hijack']);
  for (const c of Score.CRITERIA) {
    const cells = withBl.map(s => {
      const pl = s.score.criteria.find(x => x.id === c.id).penalty;
      const bl = blScores.get(s.site).criteria.find(x => x.id === c.id).penalty;
      return `−${fmt(pl)} | ${unmeasured.has(c.id) ? 'não mede' : `−${fmt(bl)}`}`;
    });
    L(`| ${c.label} (${c.max}) | ${cells.join(' | ')} |`);
  }
  L(`| **Score** | ${withBl.map(s => `**${s.score.score} (${s.score.grade})** | **${blScores.get(s.site).score} (${blScores.get(s.site).grade})**`).join(' | ')} |`, '');

  for (const s of withBl) {
    L(`### ${s.site}`, '', `Blacklight: análise de ${s.blacklight.start} (${s.blacklight.seconds} s, ${s.blacklight.pages.length} páginas: ${s.blacklight.pages.join(', ')}), a partir de \`${s.blacklight.location}\`.`, '');
    L('| Teste do Blacklight | Blacklight | Plugin | |', '|---|---|---|---|');
    for (const row of blacklightRows(s)) L(`| ${row.join(' | ')} |`);
    L('');
  }

  const out = path.join(ROOT, 'evidencias', 'score.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.log(`${path.relative(ROOT, out)}: ${sites.map(s => `${s.site} ${s.score.score} (${s.score.grade})`).join(', ')}; ordem mantida em ${sens.rows.length - changed}/${sens.rows.length} variações`);
  console.log(`mesma régua com os dados do Blacklight: ${withBl.map(s => `${s.site} ${blScores.get(s.site).score} (${blScores.get(s.site).grade})`).join(', ')}`);
}

main();
