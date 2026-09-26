'use strict';

// Retrato do armazenamento HTML5 da origem deste frame: localStorage,
// sessionStorage, IndexedDB e Cache API. Roda em todos os frames, inclusive
// iframes de terceiros. Só nomes de chaves e tamanhos são enviados; os valores
// ficam na página.
(() => {
  const MAX_ITEMS = 100;

  // Armazenamento bloqueado (ex.: iframe de rastreador com a proteção do
  // Firefox ativa) lança SecurityError: vira available: false.
  function unavailable(error) {
    return { available: false, error: error && error.name ? error.name : String(error), count: 0 };
  }

  function describeWebStorage(getStorage) {
    try {
      const storage = getStorage();
      const keys = [];
      let bytes = 0;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const size = (storage.getItem(key) || '').length;
        bytes += (key.length + size) * 2; // UTF-16
        if (keys.length < MAX_ITEMS) keys.push({ key, size });
      }
      return { available: true, count: storage.length, bytes, keys };
    } catch (error) {
      return { ...unavailable(error), bytes: 0, keys: [] };
    }
  }

  async function describeIndexedDB() {
    try {
      const databases = await window.indexedDB.databases();
      return {
        available: true,
        count: databases.length,
        databases: databases.slice(0, MAX_ITEMS).map(db => ({ name: String(db.name), version: Number(db.version) })),
      };
    } catch (error) {
      return { ...unavailable(error), databases: [] };
    }
  }

  async function describeCacheStorage() {
    try {
      const names = await window.caches.keys();
      return { available: true, count: names.length, names: names.slice(0, MAX_ITEMS).map(String) };
    } catch (error) {
      return { ...unavailable(error), names: [] };
    }
  }

  async function send() {
    if (location.origin === 'null') return; // origem opaca (sandbox, data:)
    const snapshot = {
      origin: location.origin,
      url: location.href,
      isTop: window === window.top,
      localStorage: describeWebStorage(() => window.localStorage),
      sessionStorage: describeWebStorage(() => window.sessionStorage),
      indexedDB: await describeIndexedDB(),
      cacheStorage: await describeCacheStorage(),
      collectedAt: Date.now(),
    };
    browser.runtime.sendMessage({ type: 'storageSnapshot', snapshot }).catch(() => {});
  }

  // Coleta no load e de novo depois, para pegar gravações de scripts tardios.
  function schedule() {
    send();
    setTimeout(send, 3000);
    setTimeout(send, 10000);
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });

  // O background pede uma coleta nova enquanto o popup está aberto.
  browser.runtime.onMessage.addListener(message => {
    if (message && message.type === 'collectStorage') send();
  });
})();
