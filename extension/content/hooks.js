'use strict';

// Instrumentação de APIs no contexto da página, instalada em document_start
// (antes de qualquer script da página) e em todos os frames.
//
// Usa as APIs do Firefox para content scripts (window.wrappedJSObject e
// exportFunction): os wrappers são definidos direto nos protótipos da página,
// sem injetar <script>, então a CSP da página não interfere. Cada wrapper
// registra a chamada e repassa para a função original; erros da instrumentação
// nunca chegam à página.
//
// Observa:
//  - canvas 2D, OffscreenCanvas e WebGL, para a heurística de canvas
//    fingerprinting (avaliada no background, em fingerprint.js);
//  - measureText, para enumeração de fontes;
//  - getParameter(UNMASKED_VENDOR/RENDERER_WEBGL), consulta direta à GPU;
//  - document.cookie e Storage.setItem, para saber qual script grava cada
//    cookie e cada chave de armazenamento (o primeiro script de cada um);
//  - indícios de sequestro do navegador: funções nativas substituídas, globais
//    novas, listeners de teclado e mensagens por WebSocket.
(() => {
  const page = window.wrappedJSObject;
  if (!page || typeof exportFunction !== 'function') return;

  // Envio em lote para o background

  const queue = [];
  let flushTimer = null;
  const sent = new Set(); // evita repetir o mesmo evento

  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    const events = queue.splice(0);
    if (events.length) browser.runtime.sendMessage({ type: 'hookEvents', events }).catch(() => {});
  }

  function emit(event, dedupeKey) {
    if (dedupeKey) {
      if (sent.has(dedupeKey)) return;
      sent.add(dedupeKey);
    }
    queue.push({ ...event, frameOrigin: location.origin, frameUrl: location.href, t: Date.now() });
    if (!flushTimer) flushTimer = setTimeout(flush, 250);
  }

  // Páginas que redirecionam logo após gravar um identificador (bounce
  // tracking) saem antes do próximo lote: envia o que estiver pendente.
  window.addEventListener('pagehide', flush, { capture: true });

  // Script que fez a chamada: primeiro frame da pilha que não é da extensão.
  // Formato do Firefox: "funcao@https://site/script.js:10:5"; em eval:
  // "funcao@https://site/script.js line 3 > eval:1:1".
  const FRAME = /@(.*?)(?: line \d+ > [^:]+)?:\d+:\d+$/;
  function callerScript() {
    const lines = (new Error().stack || '').split('\n');
    for (const line of lines) {
      const match = FRAME.exec(line);
      if (match && match[1] && !match[1].startsWith('moz-extension:')) return match[1];
    }
    return null;
  }

  // Substitui um método do protótipo da página por um wrapper. `observe`
  // recebe o this, os argumentos e o resultado da chamada original.
  function hookMethod(proto, name, observe) {
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor || typeof descriptor.value !== 'function') return;
    const original = descriptor.value;
    exportFunction(function (...args) {
      const result = Reflect.apply(original, this, args);
      try {
        observe(this, args, result);
      } catch {
        // a instrumentação nunca pode quebrar a página
      }
      return result;
    }, proto, { defineAs: name });
  }

  // Estado por canvas (HTMLCanvasElement, OffscreenCanvas ou ImageBitmap
  // derivado de um canvas observado).

  const canvases = new WeakMap();
  let nextCanvasId = 1;
  function stateOf(canvas) {
    let state = canvases.get(canvas);
    if (!state) {
      state = {
        id: nextCanvasId++,
        offscreen: Boolean(page.OffscreenCanvas && canvas instanceof page.OffscreenCanvas),
        chars: new Set(),
        colors: new Set(),
        textSample: '',
        saveRestore: false,
        listeners: false,
        contextType: null,
        copiedFrom: null,
      };
      canvases.set(canvas, state);
    }
    return state;
  }

  function recordText(ctx, text, style) {
    const state = stateOf(ctx.canvas);
    const str = String(text);
    for (const ch of str) state.chars.add(ch);
    state.colors.add(String(style));
    if (!state.textSample) state.textSample = str.slice(0, 60);
  }

  // Leitura do conteúdo de um canvas: vira um evento avaliado no background.
  function recordExtraction(canvas, method, extra = {}) {
    const state = stateOf(canvas);
    const script = callerScript();
    const event = {
      kind: 'canvas',
      method,
      script,
      contextType: state.contextType,
      width: Number(canvas.width),
      height: Number(canvas.height),
      chars: state.chars.size,
      colors: state.colors.size,
      textSample: state.textSample,
      saveRestore: state.saveRestore,
      listeners: state.listeners,
      offscreen: state.offscreen,
      copiedFrom: state.copiedFrom,
      ...extra,
    };
    // Uma leitura por canvas, script e método.
    emit(event, JSON.stringify([state.id, script, method, extra]));
  }

  const HTMLCanvas = page.HTMLCanvasElement && page.HTMLCanvasElement.prototype;
  const Ctx2D = page.CanvasRenderingContext2D && page.CanvasRenderingContext2D.prototype;
  const Offscreen = page.OffscreenCanvas && page.OffscreenCanvas.prototype;
  const OffscreenCtx2D = page.OffscreenCanvasRenderingContext2D && page.OffscreenCanvasRenderingContext2D.prototype;
  const WebGL = [page.WebGLRenderingContext, page.WebGL2RenderingContext]
    .filter(Boolean).map(c => c.prototype);

  hookMethod(HTMLCanvas, 'getContext', (canvas, [type]) => {
    stateOf(canvas).contextType = String(type);
  });
  hookMethod(Offscreen, 'getContext', (canvas, [type]) => {
    stateOf(canvas).contextType = String(type);
  });

  for (const proto of [Ctx2D, OffscreenCtx2D]) {
    hookMethod(proto, 'fillText', (ctx, [text]) => recordText(ctx, text, ctx.fillStyle));
    hookMethod(proto, 'strokeText', (ctx, [text]) => recordText(ctx, text, ctx.strokeStyle));
    hookMethod(proto, 'save', ctx => { stateOf(ctx.canvas).saveRestore = true; });
    hookMethod(proto, 'restore', ctx => { stateOf(ctx.canvas).saveRestore = true; });
    // Copiar de outro canvas (ou de um ImageBitmap dele) herda o que foi desenhado lá.
    hookMethod(proto, 'drawImage', (ctx, [image]) => {
      const source = image && canvases.get(image);
      if (!source) return;
      const target = stateOf(ctx.canvas);
      source.chars.forEach(c => target.chars.add(c));
      source.colors.forEach(c => target.colors.add(c));
      target.textSample = target.textSample || source.textSample;
      if (source.chars.size) target.copiedFrom = source.offscreen ? 'OffscreenCanvas' : 'canvas';
    });
  }

  // O retorno da função original chega "sem Xray" (via wrappedJSObject), mas a
  // página repassa o bitmap ao drawImage como Xray: normaliza para a chave bater.
  hookMethod(Offscreen, 'transferToImageBitmap', (canvas, args, bitmap) => {
    canvases.set(XPCNativeWrapper(bitmap), stateOf(canvas));
  });

  // Listeners no canvas indicam uso interativo (desenho pelo usuário), um dos
  // critérios de exclusão da heurística.
  const EventTargetProto = page.EventTarget && page.EventTarget.prototype;
  const addEventListener = EventTargetProto && EventTargetProto.addEventListener;
  if (HTMLCanvas && addEventListener) {
    exportFunction(function (...args) {
      try {
        stateOf(this).listeners = true;
      } catch {
        // idem
      }
      return Reflect.apply(addEventListener, this, args);
    }, HTMLCanvas, { defineAs: 'addEventListener' });
  }

  hookMethod(HTMLCanvas, 'toDataURL', (canvas, [format]) => {
    recordExtraction(canvas, 'toDataURL', { format: format ? String(format) : 'image/png' });
  });
  hookMethod(HTMLCanvas, 'toBlob', (canvas, [, format]) => {
    recordExtraction(canvas, 'toBlob', { format: format ? String(format) : 'image/png' });
  });
  hookMethod(Offscreen, 'convertToBlob', (canvas, [options]) => {
    recordExtraction(canvas, 'convertToBlob', { format: options && options.type ? String(options.type) : 'image/png' });
  });
  for (const proto of [Ctx2D, OffscreenCtx2D]) {
    hookMethod(proto, 'getImageData', (ctx, [, , sw, sh]) => {
      recordExtraction(ctx.canvas, 'getImageData', { area: { w: Math.abs(Number(sw)), h: Math.abs(Number(sh)) } });
    });
  }

  // WebGL: leitura de pixels e consulta ao fabricante/modelo real da GPU
  // (constantes da extensão WEBGL_debug_renderer_info).
  const UNMASKED = { 37445: 'UNMASKED_VENDOR_WEBGL', 37446: 'UNMASKED_RENDERER_WEBGL' };
  for (const proto of WebGL) {
    hookMethod(proto, 'readPixels', (gl, [, , w, h]) => {
      recordExtraction(gl.canvas, 'readPixels', { area: { w: Math.abs(Number(w)), h: Math.abs(Number(h)) } });
    });
    hookMethod(proto, 'getParameter', (gl, [pname]) => {
      const name = UNMASKED[Number(pname)];
      if (!name) return;
      const script = callerScript();
      emit({ kind: 'webglInfo', script, parameter: name }, `webglInfo|${script}|${name}`);
    });
  }

  // Enumeração de fontes (Englehardt & Narayanan, 2016, seção 6.3): o mesmo
  // texto medido em muitas fontes diferentes. Contado por contexto de canvas,
  // para não capturar a pilha a cada chamada; o script só é identificado
  // quando o limiar é atingido.
  const FONT_THRESHOLD = 50;
  const fontProbes = new WeakMap(); // contexto -> { fonts, texts, reported }
  for (const proto of [Ctx2D, OffscreenCtx2D]) {
    hookMethod(proto, 'measureText', (ctx, [text]) => {
      let probe = fontProbes.get(ctx);
      if (!probe) {
        probe = { fonts: new Set(), texts: new Map(), reported: false };
        fontProbes.set(ctx, probe);
      }
      if (probe.reported) return;
      probe.fonts.add(String(ctx.font));
      const key = String(text);
      const repeats = (probe.texts.get(key) || 0) + 1;
      probe.texts.set(key, repeats);
      if (probe.fonts.size >= FONT_THRESHOLD && repeats >= FONT_THRESHOLD) {
        probe.reported = true;
        emit({ kind: 'fontProbe', script: callerScript(), fonts: probe.fonts.size, repeats, textSample: key.slice(0, 60) });
      }
    });
  }

  // Quem grava cookies via document.cookie

  const DocumentProto = page.Document && page.Document.prototype;
  const cookieDescriptor = DocumentProto && Object.getOwnPropertyDescriptor(DocumentProto, 'cookie');
  if (cookieDescriptor && cookieDescriptor.get && cookieDescriptor.set) {
    Object.defineProperty(DocumentProto, 'cookie', {
      configurable: true,
      enumerable: cookieDescriptor.enumerable,
      get: exportFunction(function () {
        return Reflect.apply(cookieDescriptor.get, this, []);
      }, page),
      set: exportFunction(function (value) {
        try {
          const str = String(value);
          const eq = str.indexOf('=');
          const name = str.slice(0, Math.max(0, eq)).trim();
          const semi = str.indexOf(';');
          const cookieValue = str.slice(eq + 1, semi === -1 ? undefined : semi).trim().slice(0, 512);
          // Só o primeiro script que grava cada cookie: evita capturar a
          // pilha em toda escrita. O valor serve para detectar identificadores
          // repassados a outros sites (cookie sync, bounce tracking).
          if (!sent.has(`cookie|${name}`)) {
            emit({ kind: 'cookieWrite', name, value: cookieValue, script: callerScript() }, `cookie|${name}`);
          }
        } catch {
          // idem
        }
        return Reflect.apply(cookieDescriptor.set, this, [value]);
      }, page),
    });
  }

  // Quem grava chaves de localStorage/sessionStorage via setItem

  const StorageProto = page.Storage && page.Storage.prototype;
  hookMethod(StorageProto, 'setItem', (storage, [key, value]) => {
    let area = 'localStorage';
    try {
      if (storage === window.sessionStorage) area = 'sessionStorage';
    } catch {
      // acesso bloqueado: mantém localStorage
    }
    const dedupe = `storage|${area}|${key}`;
    if (!sent.has(dedupe)) {
      emit({ kind: 'storageWrite', area, key: String(key), value: String(value).slice(0, 512), script: callerScript() }, dedupe);
    }
  });

  // Interação do usuário (clique, toque, tecla). Uma página que manda a aba
  // para outro site sem nenhuma interação é candidata a bounce tracking.
  // (Listeners registrados pelo content script passam pelo Xray e não
  // disparam o hook de addEventListener abaixo.)
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, event => {
      if (event.isTrusted) emit({ kind: 'interaction' }, 'interaction');
    }, { capture: true, passive: true });
  }

  // Sequestro de navegador (hijacking/hook)

  // Captura de teclado: script que escuta teclas, digitação ou colagem.
  const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'change', 'paste']);
  const listenerCounts = new Map();
  hookMethod(EventTargetProto, 'addEventListener', (target, [type]) => {
    const kind = String(type);
    if (!KEY_EVENTS.has(kind)) return;
    const n = (listenerCounts.get(kind) || 0) + 1;
    listenerCounts.set(kind, n);
    if (n > 30) return; // limita o custo de capturar a pilha
    let where = 'elemento';
    try {
      where = target === window ? 'window' : target === document ? 'document' : String(target.tagName || 'outro').toLowerCase();
    } catch {
      // alvo inacessível
    }
    const script = callerScript();
    emit({ kind: 'listener', type: kind, target: where, script }, `listener|${kind}|${script}`);
  });

  // Mensagens enviadas por WebSocket: canal ativo, não só aberto.
  hookMethod(page.WebSocket && page.WebSocket.prototype, 'send', socket => {
    const url = String(socket.url);
    emit({ kind: 'wsSend', url }, `wsSend|${url}`);
  });

  // Funções sensíveis que scripts de hook substituem para interceptar rede,
  // DOM, execução de código e navegação. A referência é capturada aqui, em
  // document_start, antes de qualquer script da página e já com a
  // instrumentação do plugin instalada; depois do load, uma referência
  // diferente indica substituição (inclusive por Proxy, que o toString disfarça).
  const SENSITIVE = [
    ['window', 'fetch'], ['window', 'XMLHttpRequest'], ['XMLHttpRequest.prototype', 'open'],
    ['XMLHttpRequest.prototype', 'send'], ['XMLHttpRequest.prototype', 'setRequestHeader'],
    ['window', 'WebSocket'], ['WebSocket.prototype', 'send'], ['window', 'EventSource'],
    ['Navigator.prototype', 'sendBeacon'], ['EventTarget.prototype', 'addEventListener'],
    ['Document.prototype', 'write'], ['Document.prototype', 'createElement'], ['Document.prototype', 'cookie'],
    ['Node.prototype', 'appendChild'], ['Node.prototype', 'insertBefore'], ['Element.prototype', 'setAttribute'],
    ['HTMLFormElement.prototype', 'submit'], ['HTMLInputElement.prototype', 'value'],
    ['History.prototype', 'pushState'], ['History.prototype', 'replaceState'],
    ['window', 'eval'], ['window', 'Function'], ['window', 'setTimeout'], ['window', 'setInterval'],
    ['window', 'open'], ['window', 'postMessage'], ['JSON', 'parse'], ['JSON', 'stringify'],
    ['Function.prototype', 'toString'], ['Object', 'defineProperty'], ['Storage.prototype', 'getItem'],
  ];

  function resolve(path) {
    let obj = page;
    if (path === 'window') return obj;
    for (const part of path.split('.')) obj = obj ? obj[part] : undefined;
    return obj;
  }

  function describeProp(path, name) {
    try {
      const obj = resolve(path);
      const d = obj && Object.getOwnPropertyDescriptor(obj, name);
      return d ? { value: d.value, get: d.get, set: d.set } : null;
    } catch {
      return null;
    }
  }

  const nativeToString = page.Function.prototype.toString;
  function sourceOf(fn) {
    try {
      return String(Reflect.apply(nativeToString, fn, [])).replace(/\s+/g, ' ').slice(0, 160);
    } catch {
      return '';
    }
  }

  if (window === window.top) {
    const baseline = SENSITIVE.map(([path, name]) => ({ path, name, desc: describeProp(path, name) }));
    const baselineGlobals = new Set(Object.getOwnPropertyNames(page));

    const checkGlobals = () => {
      const overridden = [];
      for (const { path, name, desc } of baseline) {
        if (!desc) continue;
        const label = path === 'window' ? name : `${path}.${name}`;
        const now = describeProp(path, name);
        if (!now) {
          overridden.push({ name: label, source: '(removida)' });
          continue;
        }
        for (const part of ['value', 'get', 'set']) {
          if (desc[part] !== now[part]) {
            overridden.push({ name: part === 'value' ? label : `${label} (${part})`, source: sourceOf(now[part]) });
          }
        }
      }
      const added = Object.getOwnPropertyNames(page).filter(n => !baselineGlobals.has(n) && !/^\d+$/.test(n));
      const signatures = added.filter(n => /^(beef|beefjs|beef_init|__beef)/i.test(n));
      emit({ kind: 'globals', addedCount: added.length, added: added.slice(0, 150), overridden, signatures },
        JSON.stringify(['globals', added.length, overridden.map(o => o.name)]));
    };
    const schedule = () => {
      setTimeout(checkGlobals, 5000);
      setTimeout(checkGlobals, 15000);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
  }
})();
