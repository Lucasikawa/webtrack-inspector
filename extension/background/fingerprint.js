'use strict';

// Avaliação das leituras de canvas observadas por content/hooks.js.
//
// Canvas 2D: heurística de Englehardt & Narayanan, "Online Tracking: A
// 1-million-site Measurement and Analysis" (ACM CCS 2016, seção 6.1), a mesma
// usada pelo OpenWPM e pelo Blacklight. Uma leitura é fingerprinting quando:
//  1. o canvas tem pelo menos 16 x 16 px;
//  2. o texto desenhado tem pelo menos 10 caracteres distintos ou 2 cores;
//  3. o script não usa save/restore nem listeners de eventos no canvas
//     (indícios de desenho interativo legítimo);
//  4. a imagem é extraída com toDataURL/toBlob, ou com getImageData de uma
//     área de pelo menos 16 x 16 px.
//
// WebGL (critério próprio, fora do artigo): leitura da imagem de um canvas
// WebGL de pelo menos 16 x 16 px. Jogos e visualizações 3D raramente leem os
// próprios pixels; scripts de fingerprint leem para calcular um hash.
const Fingerprint = (() => {
  const MIN_SIZE = 16;
  const MIN_CHARS = 10;
  const MIN_COLORS = 2;
  const IMAGE_EXPORTS = new Set(['toDataURL', 'toBlob', 'convertToBlob']);

  function isWebGL(contextType) {
    return /webgl/i.test(contextType || '');
  }

  // Área lida: a do getImageData/readPixels, ou o canvas inteiro nas exportações.
  function extractedArea(event) {
    return event.area || { w: event.width, h: event.height };
  }

  function evaluateCanvas(event) {
    const area = extractedArea(event);
    const bigEnough = event.width >= MIN_SIZE && event.height >= MIN_SIZE;
    const areaBigEnough = area.w >= MIN_SIZE && area.h >= MIN_SIZE;

    if (isWebGL(event.contextType)) {
      const criteria = { size: bigEnough, extraction: areaBigEnough };
      return { technique: criteria.size && criteria.extraction ? 'webgl' : null, criteria };
    }

    const criteria = {
      size: bigEnough,
      text: event.chars >= MIN_CHARS || event.colors >= MIN_COLORS,
      noInteraction: !event.saveRestore && !event.listeners,
      extraction: IMAGE_EXPORTS.has(event.method) || (event.method === 'getImageData' && areaBigEnough),
    };
    const matches = Object.values(criteria).every(Boolean);
    return { technique: matches ? 'canvas' : null, criteria };
  }

  return { evaluateCanvas, MIN_SIZE, MIN_CHARS, MIN_COLORS };
})();

if (typeof module !== 'undefined') module.exports = Fingerprint;
