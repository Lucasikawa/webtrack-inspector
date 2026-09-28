'use strict';

// Pontuação de privacidade da página, de 0 a 100 (maior é melhor).
//
// Parte de 100 e desconta pontos em 7 critérios. Cada critério tem um teto, e os
// tetos somam 100, para que nenhum critério sozinho domine a nota. Os pontos por
// ocorrência seguem a gravidade da técnica:
//  - o que contorna os controles do usuário (fingerprinting, sincronização de
//    identificadores, bounce tracking, sequestro do navegador) desconta mais por
//    ocorrência do que o que ele consegue apagar (cookies, storage);
//  - rastreamento declarado em listas públicas desconta mais do que a simples
//    presença de terceiros, que sozinha não indica rastreamento (CDNs, fontes);
//  - os critérios espelham os testes do Blacklight (ad trackers, cookies de
//    terceiros, "evade cookie blockers", gravação de sessão, captura de teclado,
//    pixels, GA remarketing), para permitir a comparação, e acrescentam o que o
//    plugin mede além dele (sincronização, bounce, sequestro do navegador).
//
// O score mede o comportamento do site, não a proteção do navegador: cookies de
// terceiros contam mesmo quando o Firefox os particiona, porque o mesmo site, num
// navegador sem essa proteção, rastrearia com eles.
//
// Só entra o que foi observado nos primeiros 30 s da navegação, a mesma janela do
// HAR no protocolo de evidências.
const Score = (() => {
  const WINDOW_MS = 30000;
  const VERSION = 1;

  const CRITERIA = [
    { id: 'trackers', label: 'Rastreadores de terceira parte', max: 20,
      rule: '2 por site classificado como rastreador pelas listas do Firefox',
      blacklight: 'Ad trackers' },
    { id: 'cookies', label: 'Cookies de terceira parte', max: 15,
      rule: '1 por cookie; 2 se a validade passa de 1 ano',
      blacklight: 'Third-party cookies' },
    { id: 'storage', label: 'Identificadores guardados por terceiros', max: 10,
      rule: '1 por cookie ou chave de storage de 1ª parte gravado por script de 3ª parte; 1 por origem de 3ª parte com storage',
      blacklight: null },
    { id: 'fingerprinting', label: 'Fingerprinting', max: 15,
      rule: 'canvas, WebGL ou fontes: 15 se por script de 3ª parte, 8 se de 1ª; só consulta à GPU: 4 (3ª) ou 2 (1ª)',
      blacklight: 'Tracking that evades cookie blockers' },
    { id: 'sync', label: 'Sincronização de IDs e bounce tracking', max: 15,
      rule: '3 por par de sincronização entre terceiros; 1 por ID de 1ª parte enviado a terceiro; 5 por bounce',
      blacklight: null },
    { id: 'surveillance', label: 'Vigilância comportamental', max: 15,
      rule: 'gravação de sessão: 10; cada pixel (Facebook, TikTok, X, LinkedIn): 3; GA com remarketing: 3; cada site de 3ª parte com script ouvindo teclado: 3',
      blacklight: 'Session recording, key logging, Facebook/TikTok/X pixels, GA remarketing' },
    { id: 'hijack', label: 'Sequestro do navegador', max: 10,
      rule: 'assinatura de hook conhecida: 10; WebSocket/EventSource para terceiro: 4; polling de terceiro: 2; funções nativas substituídas: 2',
      blacklight: null },
  ];

  const GRADES = [[85, 'A'], [70, 'B'], [50, 'C'], [30, 'D'], [0, 'F']];
  const PIXELS = { 'facebook-pixel': 'pixel do Facebook', 'tiktok-pixel': 'pixel do TikTok', 'x-pixel': 'pixel do X', 'linkedin-insight': 'LinkedIn Insight' };

  const inWindow = item => (item.firstSeenMs ?? 0) <= WINDOW_MS;
  const siteOf = url => (typeof Parties !== 'undefined' ? Parties : require('./parties.js')).siteOf(url);

  // Ocorrências de cada critério: [{ label, points }].
  function occurrences(report) {
    const out = Object.fromEntries(CRITERIA.map(c => [c.id, []]));
    const add = (id, label, points) => out[id].push({ label, points });
    const site = report.site;

    for (const s of report.thirdParty || []) {
      if (s.tracker && inWindow(s)) add('trackers', s.site, 2);
    }

    const cookies = (report.cookies && report.cookies.list) || [];
    for (const c of cookies.filter(c => c.inWindow ?? c.duringLoad ?? true)) {
      if (c.thirdParty) add('cookies', `${c.name} (${c.site})`, c.lifetimeDays > 365 ? 2 : 1);
      else if (c.writersThirdParty) add('storage', `cookie ${c.name} gravado por ${siteOf((c.writers || [])[0])}`, 1);
    }
    for (const o of (report.storage && report.storage.origins) || []) {
      if (o.thirdParty && o.items > 0) add('storage', `storage de ${o.origin}`, 1);
      if (o.thirdParty) continue;
      for (const area of ['localStorage', 'sessionStorage']) {
        for (const k of (o[area] && o[area].keys) || []) {
          const writer = (k.writers || [])[0];
          if (writer && siteOf(writer) !== site) add('storage', `${area} ${k.key} gravada por ${siteOf(writer)}`, 1);
        }
      }
    }

    const detections = (report.fingerprinting && report.fingerprinting.detections) || [];
    const heavy = detections.filter(d => d.technique !== 'webgl-info');
    const gpu = detections.filter(d => d.technique === 'webgl-info');
    if (heavy.some(d => d.scriptThirdParty)) add('fingerprinting', `${heavy[0].technique} por script de 3ª parte`, 15);
    else if (heavy.length) add('fingerprinting', `${heavy[0].technique} por script de 1ª parte`, 8);
    else if (gpu.length) add('fingerprinting', 'consulta ao modelo da GPU', gpu.some(d => d.scriptThirdParty) ? 4 : 2);

    for (const e of (report.sync && report.sync.events) || []) {
      if (!inWindow(e)) continue;
      if (e.kind === 'third-party') add('sync', `${e.ownerSite} → ${e.receiverSite} (${e.idName})`, 3);
      else add('sync', `ID de 1ª parte ${e.idName} → ${e.receiverSite}`, 1);
    }
    for (const b of report.bounces || []) add('sync', `bounce via ${b.site}`, 5);

    for (const c of report.categories || []) {
      if (!inWindow(c)) continue;
      if (c.category === 'session-recording') add('surveillance', `gravação de sessão (${c.sites.join(', ')})`, 10);
      else if (PIXELS[c.category]) add('surveillance', PIXELS[c.category], 3);
      else if (c.category === 'ga-remarketing') add('surveillance', 'Google Analytics com remarketing', 3);
    }
    const hijack = report.hijack;
    if (hijack) {
      // Ouvir o teclado é condição para key logging, não prova dele (o Blacklight
      // só marca quando o texto digitado sai na rede): peso menor, 1 vez por site.
      const keyboardSites = new Set(hijack.keyboard.filter(k => k.scriptThirdParty).map(k => k.scriptSite));
      for (const s of keyboardSites) add('surveillance', `teclado ouvido por script de ${s}`, 3);
      for (const sig of hijack.signatures) add('hijack', `assinatura: ${sig}`, 10);
      for (const s of [...hijack.websockets, ...hijack.eventStreams].filter(s => s.thirdParty)) add('hijack', `conexão persistente com ${s.site}`, 4);
      for (const p of hijack.polling) add('hijack', `polling para ${p.site}`, 2);
      if (hijack.globals && hijack.globals.overridden.length) add('hijack', `${hijack.globals.overridden.length} funções nativas substituídas`, 2);
    }
    return out;
  }

  function grade(score) {
    return GRADES.find(([min]) => score >= min)[1];
  }

  // weights: multiplicador por critério (análise de sensibilidade). Muda o teto
  // e os pontos por ocorrência na mesma proporção; a nota é renormalizada para
  // 0-100 pela soma dos tetos.
  function compute(report, weights = {}) {
    const found = occurrences(report);
    let totalMax = 0;
    let totalPenalty = 0;
    const criteria = CRITERIA.map(c => {
      const w = weights[c.id] ?? 1;
      const max = c.max * w;
      const raw = found[c.id].reduce((sum, o) => sum + o.points, 0) * w;
      const penalty = Math.min(max, raw);
      totalMax += max;
      totalPenalty += penalty;
      return {
        id: c.id,
        label: c.label,
        rule: c.rule,
        blacklight: c.blacklight,
        max: Math.round(max * 10) / 10,
        penalty: Math.round(penalty * 10) / 10,
        items: found[c.id],
      };
    });
    const score = Math.round(100 - (100 * totalPenalty) / totalMax);
    return { version: VERSION, windowMs: WINDOW_MS, score, grade: grade(score), criteria };
  }

  return { compute, CRITERIA, GRADES, WINDOW_MS };
})();

if (typeof module !== 'undefined') module.exports = Score;
