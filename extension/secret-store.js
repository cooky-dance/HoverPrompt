// Encrypts the secrets kept in chrome.storage.local at rest: the model API keys (sources[].apiKey, genSources[].apiKey and the
// older top-level apiKey) and the HoverPrompt account token (cloudConfig.token). The rest of the extension keeps reading and
// writing them through chrome.storage.local as before; this file wraps get/set so what reaches the disk is
// "hpenc1:<iv>:<ciphertext>" (AES-GCM, 256 bit) and what the code sees is the plain text.
//
// One owner for the key: the service worker makes a non-extractable CryptoKey on this device and keeps it in the extension's own
// IndexedDB ("hp-secrets"). Every other extension page, including the floating window that is embedded in web pages (where the
// browser may give a frame its own partitioned storage), asks the service worker to seal or open a text over runtime messages
// from extension pages only. Nobody can read the raw key bytes through the API, and settings files, backups or a look through the
// storage folder show only ciphertext. It does not stop software already running as you from using the extension's own
// storage; that is the same ground the browser itself covers for cookies. If the key is lost (site data cleared), the saved
// secrets cannot be opened: they read as empty, `secretsLost` is set and the settings page asks for the key again.
//
// Loaded first in every extension page and the service worker (importScripts), before any code that reads the storage.
(() => {
  const PREFIX = 'hpenc1:';
  const LOCK = 'hp-secrets';
  const MESSAGE = 'HP_SECRET';
  const SECRET_KEYS = ['apiKey', 'sources', 'genSources', 'cloudConfig'];

  const b64 = bytes => { let s = ''; for (const n of bytes) s += String.fromCharCode(n); return btoa(s); };
  const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  const sealed = value => typeof value === 'string' && value.startsWith(PREFIX);

  // [holder, field] of the string fields that hold secrets, per storage key
  function fields(key, value) {
    if (key === 'apiKey') return typeof value === 'string' ? [[{ v: value }, 'v']] : [];
    if (key === 'sources' || key === 'genSources') return Array.isArray(value) ? value.filter(x => x && typeof x.apiKey === 'string').map(x => [x, 'apiKey']) : [];
    if (key === 'cloudConfig') return value && typeof value.token === 'string' ? [[value, 'token']] : [];
    return [];
  }
  const clone = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

  function idbKeyProvider() {
    const open = () => new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCK, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db => new Promise((resolve, reject) => { const q = db.transaction('keys').objectStore('keys').get('main'); q.onsuccess = () => resolve(q.result || null); q.onerror = () => reject(q.error); });
    const write = (db, key) => new Promise((resolve, reject) => { const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put(key, 'main'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    return async () => {
      const db = await open();
      try {
        const existing = await read(db);
        if (existing) return existing;
        return await navigator.locks.request(LOCK, async () => {
          const again = await read(db);
          if (again) return again;
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          await write(db, key);
          return key;
        });
      } finally { db.close(); }
    };
  }

  // seal(text) -> "hpenc1:..." ; open(text) -> plain text, or undefined when the text is sealed but cannot be opened
  // (wrong or missing key). Anything else that goes wrong throws, so a passing failure is never mistaken for a lost key.
  function directBackend({ keyProvider, subtle = globalThis.crypto.subtle, random = n => crypto.getRandomValues(new Uint8Array(n)) }) {
    let keyPromise = null;
    const key = () => (keyPromise ||= Promise.resolve().then(keyProvider).catch(error => { keyPromise = null; throw error; }));
    return {
      async seal(text) {
        const iv = random(12);
        const data = await subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(text));
        return PREFIX + b64(iv) + ':' + b64(new Uint8Array(data));
      },
      async open(text) {
        const [iv, data] = text.slice(PREFIX.length).split(':');
        const k = await key();
        try { return new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(data))); } catch { return undefined; }
      },
    };
  }
  // asks the service worker; send(message) -> Promise<{ok, value?, error?}>
  function remoteBackend(send) {
    const call = async (op, text) => {
      const answer = await send({ type: MESSAGE, op, text });
      if (!answer || answer.ok !== true) throw new Error('secret store: ' + (answer?.error || 'no answer from the extension background'));
      return answer.value;
    };
    return { seal: text => call('seal', text), open: text => call('open', text) };
  }

  function createSecretStore({ backend, ...direct } = {}) {
    const be = backend || directBackend(direct);
    const seal = async text => (text === '' || sealed(text) ? text : be.seal(text));
    const open = async text => (sealed(text) ? be.open(text) : text);
    async function mapSecrets(items, fn) {
      const out = {}; let changed = false, lost = false;
      const apply = async ([object, field]) => {
        const before = object[field], after = await fn(before);
        if (after === undefined) { object[field] = ''; lost = true; } else { if (after !== before) changed = true; object[field] = after; }
      };
      for (const [name, value] of Object.entries(items)) {
        if (!SECRET_KEYS.includes(name)) { out[name] = value; continue; }
        if (name === 'apiKey') {
          const holder = { v: value };
          for (const [, field] of fields(name, value)) await apply([holder, field]);
          out[name] = holder.v;
          continue;
        }
        const copy = clone(value);
        for (const found of fields(name, copy)) await apply(found);
        out[name] = copy;
      }
      return { out, changed, lost };
    }
    return {
      encryptItems: async items => (await mapSecrets(items, seal)).out,
      decryptItems: items => mapSecrets(items, open),
      hasPlain: items => Object.entries(items).some(([name, value]) => SECRET_KEYS.includes(name) && fields(name, value).some(([holder, field]) => holder[field] !== '' && !sealed(holder[field]))),
      seal, open,
    };
  }

  // wraps one chrome.storage area in place; raw get/set stay available as area.rawGet / area.rawSet
  function install(area, store, { lock = (name, fn) => navigator.locks.request(name, fn) } = {}) {
    if (!area || area.__secretStore) return area;
    const rawGet = area.get.bind(area), rawSet = area.set.bind(area);
    const done = (callback, value) => { if (typeof callback === 'function') callback(value); return value; };
    // rewrites any plain secrets still on disk as ciphertext; re-reads inside the lock so a concurrent save is never overwritten
    const migrate = () => lock('hp-secrets-migrate', async () => {
      const raw = await rawGet(SECRET_KEYS);
      if (!store.hasPlain(raw)) return;
      await rawSet(await store.encryptItems(Object.fromEntries(Object.entries(raw).filter(([name]) => SECRET_KEYS.includes(name)))));
    }).catch(() => {});
    let reportedLoss = false;
    area.get = async function get(keys, callback) {
      if (typeof keys === 'function') { callback = keys; keys = null; }
      const items = await rawGet(keys);
      const { out, lost } = await store.decryptItems(items);
      if (lost && !reportedLoss) { reportedLoss = true; rawSet({ secretsLost: true }).catch(() => {}); }
      if (store.hasPlain(items)) migrate();
      return done(callback, out);
    };
    area.set = async function set(items, callback) {
      await rawSet(await store.encryptItems(items));
      return done(callback);
    };
    area.rawGet = rawGet; area.rawSet = rawSet; area.migrateSecrets = migrate; area.__secretStore = true;
    return area;
  }

  // the service worker answers seal/open for extension pages (never for content scripts or other extensions)
  function serveWorker(backend, runtime) {
    const home = runtime.getURL('');
    runtime.onMessage.addListener((message, sender, reply) => {
      if (message?.type !== MESSAGE) return false;
      if (sender?.id !== runtime.id || !String(sender.url || '').startsWith(home) || typeof message.text !== 'string') { reply({ ok: false, error: 'refused' }); return false; }
      const job = message.op === 'seal' ? backend.seal(message.text) : message.op === 'open' ? backend.open(message.text) : Promise.reject(new Error('bad op'));
      job.then(value => reply({ ok: true, value }), error => reply({ ok: false, error: String(error?.message || error).slice(0, 120) }));
      return true;
    });
  }

  const api = { PREFIX, SECRET_KEYS, MESSAGE, createSecretStore, directBackend, remoteBackend, install, serveWorker, idbKeyProvider };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalThis.SecretStore = api;
  const chromeApi = globalThis.chrome, storage = chromeApi?.storage?.local;
  if (storage && chromeApi.runtime?.sendMessage && typeof navigator !== 'undefined' && navigator.locks) {
    try {
      const inWorker = typeof ServiceWorkerGlobalScope !== 'undefined' && globalThis instanceof ServiceWorkerGlobalScope;
      let backend;
      if (inWorker) { backend = directBackend({ keyProvider: idbKeyProvider() }); serveWorker(backend, chromeApi.runtime); }
      else backend = remoteBackend(message => chromeApi.runtime.sendMessage(message));
      install(storage, createSecretStore({ backend }));
      storage.migrateSecrets();
    } catch { /* the storage then behaves as before */ }
  }
})();
