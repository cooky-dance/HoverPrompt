// "Focus" chip: where a custom recognition focus is added to the reverse prompt ("composition, lighting, style…").
// In the Library it sits at the right end of the reference-image row; in the floating window it sits in the top row of buttons.
// A click opens a small panel with the field, quick tags and Clear / Done. The chip is highlighted whenever a focus is set, which
// is the signal that the next analyses will be steered by it. The focus is a standing setting kept in chrome.storage.local
// (reverseFocus), shared by the Library and the floating window, and is sent as "Emphasize: …" with every reverse request.
//
// The text itself lives in the existing #focus input (app.js reads it when an analysis starts); this file only moves that
// field into the panel, keeps it saved and shows the state.
(() => {
  const KEY = 'reverseFocus';
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  const T = value => (typeof LanguageUI !== 'undefined' ? LanguageUI.text(value) : String(value).split(' / ')[0]);
  const TAGS = ['构图 / Composition', '光线 / Lighting', '色彩 / Color', '画风 / Style', '材质 / Material', '人物与姿势 / People and pose', '镜头 / Camera', '图中文字 / Text in image'];
  const SPLIT = /[,，、;；\n]+/;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
  const svg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';

  let input = null, chip = null, label = null, pop = null, tagButtons = [], saveTimer = 0, applying = false;
  const tokens = text => text.split(SPLIT).map(part => part.trim()).filter(Boolean);
  const current = () => (input ? input.value.trim() : '');

  // resolves once the saved focus has been put into the field, so an analysis that starts at once still uses it
  let release;
  const ready = new Promise(resolve => { release = resolve; });

  function paint() {
    if (!chip) return;
    const text = current(), on = !!text;
    chip.setAttribute('aria-pressed', String(on));
    chip.classList.toggle('on', on);
    chip.title = on ? T('已添加识别重点： / Recognition focus on:') + ' ' + text : T('添加识别重点（构图、光线、画风…） / Add a recognition focus (composition, lighting, style…)');
    chip.setAttribute('aria-label', chip.title);
    const have = new Set(tokens(text).map(part => part.toLowerCase()));
    for (const button of tagButtons) button.setAttribute('aria-pressed', String(have.has(button.dataset.tag.toLowerCase())));
    if (pop) pop.querySelector('.focus-clear').disabled = !on;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { chrome.storage.local.set({ [KEY]: current().slice(0, 300) }); } catch { /* storage unavailable */ } }, 300);
  }
  function setOpen(open) {
    if (!pop) return;
    pop.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    // the cards below use backdrop-filter (their own layers); lift the one holding the panel above them while it is open
    document.documentElement.classList.toggle('focus-pop-open', open);
    if (open) setTimeout(() => input.focus(), 0);
  }
  function toggleTag(tag) {
    const parts = tokens(input.value), at = parts.findIndex(part => part.toLowerCase() === tag.toLowerCase());
    if (at >= 0) parts.splice(at, 1); else parts.push(tag);
    input.value = parts.join('、');
    paint(); save();
  }

  // the interface language is applied a moment after the page starts (and can change), so the texts are drawn again on that event
  function relabel() {
    if (!chip) return;
    chip.querySelector('span').textContent = T('识别重点 / Focus');
    pop.setAttribute('aria-label', T('识别重点 / Focus'));
    pop.querySelector('.focus-title').textContent = T('识别重点（可选） / Recognition focus (optional)');
    input.placeholder = T('例如：构图、光线、画风 / e.g. composition, lighting, style');
    pop.querySelector('.focus-note').textContent = T('填写后胶囊会高亮，之后每次反推都会侧重这些内容；清空即取消。 / The chip lights up once a focus is set; every reverse prompt then leans on it. Clear it to turn it off.');
    tagButtons.forEach((button, index) => { const text = T(TAGS[index]); button.textContent = text; button.dataset.tag = text; });
    pop.querySelector('.focus-clear').textContent = T('清除 / Clear');
    pop.querySelector('.focus-done').textContent = T('完成 / Done');
    paint();
  }

  function build(host) {
    label = document.querySelector('label.focus-control') || input.closest('label');
    const wrap = el('div', 'focus-chip-wrap');
    chip = el('button', 'focus-chip');
    chip.type = 'button'; chip.id = 'focusChip';
    chip.setAttribute('aria-haspopup', 'dialog'); chip.setAttribute('aria-expanded', 'false');
    chip.innerHTML = svg + '<span></span><i class="dot" aria-hidden="true"></i>';
    chip.querySelector('span').textContent = T('识别重点 / Focus');

    pop = el('div', 'focus-pop'); pop.id = 'focusPop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', T('识别重点 / Focus'));
    // the existing field moves in here; it keeps its id, so everything that reads it carries on working
    const field = el('div', 'focus-field');
    const title = el('div', 'focus-title', T('识别重点（可选） / Recognition focus (optional)'));
    input.removeAttribute('placeholder'); input.placeholder = T('例如：构图、光线、画风 / e.g. composition, lighting, style');
    input.maxLength = 300; input.autocomplete = 'off';
    field.append(title, input);
    const note = el('p', 'focus-note', T('填写后胶囊会高亮，之后每次反推都会侧重这些内容；清空即取消。 / The chip lights up once a focus is set; every reverse prompt then leans on it. Clear it to turn it off.'));
    const tags = el('div', 'focus-tags');
    tagButtons = TAGS.map(item => { const text = T(item), b = el('button', 'focus-tag', text); b.type = 'button'; b.dataset.tag = text; b.onclick = () => toggleTag(text); tags.append(b); return b; });
    const actions = el('div', 'focus-actions');
    const clear = el('button', 'focus-clear', T('清除 / Clear')); clear.type = 'button';
    clear.onclick = () => { input.value = ''; paint(); save(); input.focus(); };
    const done = el('button', 'focus-done', T('完成 / Done')); done.type = 'button'; done.onclick = () => setOpen(false);
    actions.append(clear, done);
    pop.append(field, tags, note, actions);
    if (label) { label.classList.remove('focus-control'); label.hidden = true; }

    chip.onclick = () => setOpen(pop.hidden);
    input.addEventListener('input', () => { paint(); save(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); setOpen(false); chip.focus(); } });
    document.addEventListener('pointerdown', event => { if (!pop.hidden && !wrap.contains(event.target)) setOpen(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !pop.hidden) { setOpen(false); chip.focus(); } });
    wrap.append(chip, pop);
    host(wrap);
    document.addEventListener('imageprompt-language', relabel);
    relabel();
  }

  // the field is also written by code (a value set from outside): keep the chip in step without saving
  function watchValue() {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', { configurable: true, get() { return native.get.call(this); }, set(value) { native.set.call(this, value); if (!applying) paint(); } });
  }

  // the Library's reference row is built a moment after the page is ready, so this may need to be tried again
  function mount() {
    if (chip || !input) return true;
    const host = embedded ? document.querySelector('main > header') || document.querySelector('header') : document.querySelector('.lib-refs');
    if (!host) return false;
    build(wrap => (embedded ? host.prepend(wrap) : host.append(wrap)));
    return true;
  }

  async function init() {
    input = document.getElementById('focus');
    if (!input) { release(); return; }
    watchValue();
    try {
      const saved = (await chrome.storage.local.get([KEY]))[KEY];
      if (typeof saved === 'string' && !input.value) { applying = true; input.value = saved; applying = false; }
    } catch { /* no saved focus */ }
    release();
    try {
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes[KEY]) return;
        const next = typeof changes[KEY].newValue === 'string' ? changes[KEY].newValue : '';
        if (document.activeElement !== input && next !== input.value) { input.value = next; }
      });
    } catch { /* ignore */ }
    // the Library builds its reference row a moment after the page is ready
    if (mount()) return;
    const watch = new MutationObserver(() => { if (mount()) watch.disconnect(); });
    watch.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => watch.disconnect(), 8000);
  }

  globalThis.FocusChip = { ready, refresh: paint };
  // the field already exists in the page; saved text is read at once so analyses started early still see it
  init();
})();
