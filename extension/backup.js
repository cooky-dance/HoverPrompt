// Backup and move (Settings → Interface): one file with the settings and every library record (with its images), to move
// HoverPrompt to another browser profile, another computer or another extension ID. 3.10.13 gave the GitHub build a fixed
// ID (manifest "key"), so a copy loaded from any folder is the same extension; a move from an older copy goes through this
// file once.
//
// The file is newline-delimited JSON, so neither side ever holds the whole library as one string: line 1 is a header
// {format:'hoverprompt-backup',version:1,app,exportedAt,records,secrets,settings}, then one library record per line.
// API keys and the account sign-in are left out unless "include API keys" is ticked; the file then holds them in plain text
// (it is written only to this computer), and on import they are encrypted again by secret-store.js.
// Import replaces the settings with the ones in the file and adds the records this library does not have yet (existing
// records are never overwritten), then reloads the page.
(() => {
  const DB = 'bilingual-image-prompts', STORE = 'tasks', FORMAT = 'hoverprompt-backup', BATCH = 40;
  const T = value => (globalThis.LanguageUI?.text ? LanguageUI.text(value) : String(value).split(' / ')[0]);
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };

  // secrets in chrome.storage.local (the same fields secret-store.js encrypts)
  function withoutSecrets(settings) {
    const out = structuredClone(settings);
    delete out.apiKey;
    for (const key of ['sources', 'genSources']) if (Array.isArray(out[key])) out[key] = out[key].map(source => { const copy = { ...source }; delete copy.apiKey; return copy; });
    if (out.cloudConfig && typeof out.cloudConfig === 'object') { out.cloudConfig = { ...out.cloudConfig }; delete out.cloudConfig.token; delete out.cloudConfig.expiresAt; }
    return out;
  }
  const SKIP = new Set(['secretsLost']);

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  // every record, a batch at a time, through a cursor (the library can be hundreds of MB)
  async function eachBatch(work) {
    const db = await openDb();
    try {
      let after = null;
      for (;;) {
        const batch = await new Promise((resolve, reject) => {
          const out = [], range = after == null ? null : IDBKeyRange.lowerBound(after, true);
          const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor(range);
          request.onsuccess = () => { const cursor = request.result; if (cursor && out.length < BATCH) { out.push(cursor.value); cursor.continue(); } else resolve(out); };
          request.onerror = () => reject(request.error);
        });
        if (!batch.length) return;
        after = batch.at(-1).id;
        await work(batch);
      }
    } finally { db.close(); }
  }
  const count = async () => { const db = await openDb(); try { return await new Promise((resolve, reject) => { const r = db.transaction(STORE, 'readonly').objectStore(STORE).count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); } finally { db.close(); } };

  async function exportBackup({ secrets, onProgress }) {
    const all = await chrome.storage.local.get(null), settings = {};
    for (const [key, value] of Object.entries(all)) if (!SKIP.has(key)) settings[key] = value;
    const total = await count();
    const header = { format: FORMAT, version: 1, app: chrome.runtime.getManifest().version, extensionId: chrome.runtime.id, exportedAt: new Date().toISOString(), records: total, secrets: !!secrets, settings: secrets ? settings : withoutSecrets(settings) };
    // parts are joined as Blobs, so the browser keeps the bytes and the page never builds one giant string
    let file = new Blob([JSON.stringify(header) + '\n'], { type: 'application/x-ndjson' }), done = 0;
    await eachBatch(async batch => { file = new Blob([file, batch.map(record => JSON.stringify(record)).join('\n') + '\n'], { type: 'application/x-ndjson' }); done += batch.length; onProgress?.(done, total); });
    const stamp = new Date(), pad = n => String(n).padStart(2, '0');
    const name = 'hoverprompt-backup-' + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + '-' + pad(stamp.getHours()) + pad(stamp.getMinutes()) + '.hpbackup';
    const url = URL.createObjectURL(file), link = el('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { name, records: done, bytes: file.size };
  }

  // lines of a (large) file, one at a time
  async function* lines(file) {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let rest = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += value;
      let at;
      while ((at = rest.indexOf('\n')) >= 0) { const line = rest.slice(0, at); rest = rest.slice(at + 1); if (line.trim()) yield line; }
    }
    if (rest.trim()) yield rest;
  }
  // adds the records that are not in the library yet; returns how many were added
  async function addMissing(db, records) {
    return new Promise((resolve, reject) => {
      let added = 0;
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      for (const record of records) {
        if (!record || typeof record.id !== 'string') continue;
        const request = store.add(record);
        request.onsuccess = () => { added++; };
        // already in this library: keep that record, carry on with the rest
        request.onerror = event => { if (request.error?.name === 'ConstraintError') { event.preventDefault(); event.stopPropagation(); } };
      }
      tx.oncomplete = () => resolve(added); tx.onabort = () => reject(tx.error || new Error('The library could not be written'));
    });
  }
  async function importBackup(file, { onProgress } = {}) {
    const iterator = lines(file), first = await iterator.next();
    let header;
    try { header = JSON.parse(first.value || ''); } catch { header = null; }
    if (!header || header.format !== FORMAT || header.version !== 1 || !header.settings || typeof header.settings !== 'object') throw new Error(T('这不是 HoverPrompt 备份文件 / This is not a HoverPrompt backup file'));
    const db = await openDb();
    let read = 0, added = 0, batch = [];
    try {
      for await (const line of iterator) {
        let record; try { record = JSON.parse(line); } catch { continue; }
        batch.push(record); read++;
        if (batch.length >= BATCH) { added += await addMissing(db, batch); batch = []; onProgress?.(read, header.records || 0); }
      }
      if (batch.length) added += await addMissing(db, batch);
    } finally { db.close(); }
    // settings last, so a broken file does not leave half-applied settings behind
    const settings = { ...header.settings };
    for (const key of SKIP) delete settings[key];
    await chrome.storage.local.set(settings);
    return { read, added, skipped: read - added, secrets: !!header.secrets, from: header.app };
  }

  function mount() {
    const pane = document.querySelector('[data-settings-pane="interface"]');
    if (!pane || $('backupCard')) return;
    const card = el('section', 'backup-card'); card.id = 'backupCard';
    const title = el('h3', '', T('备份与迁移 / Backup and move'));
    const note = el('p', 'hint', T('把设置和整个资料库（含图片）存成一个文件，用来换浏览器、换电脑，或从旧版扩展搬到新版。导入会用文件里的设置替换当前设置，资料库只添加还没有的记录，不会覆盖已有记录。 / Save the settings and the whole library (with images) as one file, to move to another browser or computer, or from an older copy of the extension. Import replaces the settings with the ones in the file and only adds records this library does not have yet.'));
    const secretsBox = el('label', 'checkbox-setting'), secrets = el('input'); secrets.type = 'checkbox'; secrets.id = 'backupSecrets';
    secretsBox.append(secrets, document.createTextNode(' ' + T('包含 API Key 和账号登录（文件里是明文，只保存在本机；导入后会重新加密） / Include API keys and the account sign-in (plain text in the file, kept on this computer; encrypted again on import)')));
    const exportButton = el('button', '', T('导出完整备份 / Export full backup')); exportButton.type = 'button'; exportButton.id = 'backupExport';
    const importButton = el('button', '', T('从备份导入 / Import a backup')); importButton.type = 'button'; importButton.id = 'backupImport';
    const picker = el('input'); picker.type = 'file'; picker.accept = '.hpbackup,application/x-ndjson,application/json'; picker.hidden = true; picker.id = 'backupFile';
    const status = el('p', 'hint backup-status'); status.id = 'backupStatus'; status.setAttribute('role', 'status');
    const actions = el('div', 'backup-actions'); actions.append(exportButton, importButton, picker);
    exportButton.onclick = async () => {
      exportButton.disabled = true; status.textContent = T('正在导出… / Exporting…');
      try {
        const result = await exportBackup({ secrets: secrets.checked, onProgress: (done, total) => { status.textContent = T('正在导出 / Exporting') + ' ' + done + '/' + total; } });
        status.textContent = T('已导出 / Exported') + ' ' + result.records + ' · ' + (result.bytes / 1048576).toFixed(1) + ' MB · ' + result.name;
      } catch (error) { status.textContent = T('导出失败： / Export failed: ') + (error?.message || error); }
      finally { exportButton.disabled = false; }
    };
    importButton.onclick = () => picker.click();
    picker.onchange = async () => {
      const file = picker.files?.[0]; picker.value = ''; if (!file) return;
      if (!confirm(T('导入会用备份里的设置替换当前设置，并把资料库里没有的记录加进来。继续吗？ / Import replaces the current settings with the ones in the backup and adds the records this library does not have. Continue?'))) return;
      importButton.disabled = true; status.textContent = T('正在导入… / Importing…');
      try {
        const result = await importBackup(file, { onProgress: (read, total) => { status.textContent = T('正在导入 / Importing') + ' ' + read + (total ? '/' + total : ''); } });
        status.textContent = T('已导入：新增 / Imported: added') + ' ' + result.added + ' · ' + T('已存在 / already there') + ' ' + result.skipped + (result.secrets ? '' : ' · ' + T('API Key 需要重新填写，云端账号需要重新登录 / Enter the API keys again and sign in to the cloud account again'));
        setTimeout(() => location.reload(), 2500);
      } catch (error) { status.textContent = T('导入失败： / Import failed: ') + (error?.message || error); importButton.disabled = false; }
    };
    card.append(title, note, secretsBox, actions, status);
    pane.append(card);
  }

  globalThis.HoverPromptBackup = { exportBackup, importBackup, withoutSecrets };
  // the interface language is applied a moment after the page starts (and can change): draw the card again then
  document.addEventListener('imageprompt-language', () => { const busy = document.querySelector('#backupCard button:disabled'); if (busy) return; $('backupCard')?.remove(); mount(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
