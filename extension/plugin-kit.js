// HoverPrompt plugin kit: what every plugin page shares with the ChatGPT image studio.
//   PluginKit.start() — applies the extension's appearance (light/dark, theme colour) and language, adds the colour orbs,
//                       and keeps both in step when they change in settings. Resolves to {zh}.
//   PluginKit.t(cn, en) / PluginKit.T('中文|English') — pick the text for the current language; for ru/ja/ko/hi/ar the
//                       English text is looked up in the extension's translations (locale-extra.js + locale.js, when loaded).
//   PluginKit.translate(root) — fills [data-t], [data-t-title], [data-t-placeholder], [data-t-aria] from "中文|English".
//   PluginKit.setAppearance('light'|'dark') — the extension-wide switch (same setting as the settings page).
// Markup and classes for each component: plugin-kit.html.
globalThis.PluginKit=(()=>{
 let zh=true,lang='zh-CN';const listeners=new Set();
 const t=(cn,en)=>zh?cn:lang!=='en'&&en&&globalThis.InterfaceLocale?InterfaceLocale.translate(en,lang):(en??cn);
 const setLang=value=>{lang=String(value||'zh-CN');zh=lang.startsWith('zh');};
 const T=pair=>{const [cn,en]=String(pair).split('|');return t(cn,en);};
 function translate(root=document){
  for(const n of root.querySelectorAll('[data-t]'))n.textContent=T(n.dataset.t);
  for(const n of root.querySelectorAll('[data-t-title]')){n.title=T(n.dataset.tTitle);n.setAttribute('aria-label',T(n.dataset.tTitle));}
  for(const n of root.querySelectorAll('[data-t-placeholder]'))n.placeholder=T(n.dataset.tPlaceholder);
  for(const n of root.querySelectorAll('[data-t-aria]'))n.setAttribute('aria-label',T(n.dataset.tAria));
  document.documentElement.lang=zh?'zh-CN':lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 }
 function appearance(prefs){
  const mode=['light','dark'].includes(prefs.appearanceMode)?prefs.appearanceMode:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  document.documentElement.dataset.appearance=mode;
  const color=/^#[0-9a-f]{6}$/i.test(prefs.themeColor||'')?prefs.themeColor:'#168c80';document.documentElement.style.setProperty('--accent',color);
  // text on the accent: black or white, whichever reads better (WCAG relative luminance)
  const lum=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  document.documentElement.style.setProperty('--accent-ink',lum>.179?'#000':'#fff');
 }
 function orbs(){if(document.querySelector('.orbs'))return;const box=document.createElement('div');box.className='orbs';box.setAttribute('aria-hidden','true');box.append(...Array.from({length:4},()=>document.createElement('i')));document.body.prepend(box);document.body.classList.add('ip-page');}
 async function setAppearance(mode){await chrome.storage.local.set({appearanceMode:mode});appearance({...(await chrome.storage.local.get(['themeColor'])),appearanceMode:mode});}
 async function start(){
  const saved=await chrome.storage.local.get(['uiLanguage','appearanceMode','themeColor']);
  setLang(saved.uiLanguage);appearance(saved);orbs();translate();
  // light/dark always follows the extension's setting; with "system" it also follows the system as it changes
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>chrome.storage.local.get(['appearanceMode','themeColor']).then(appearance));
  chrome.storage.onChanged.addListener((changes,area)=>{
   if(area!=='local')return;
   if(changes.appearanceMode||changes.themeColor)chrome.storage.local.get(['appearanceMode','themeColor']).then(appearance);
   if(changes.uiLanguage){setLang(changes.uiLanguage.newValue);translate();for(const fn of listeners)fn(zh);}
  });
  return {zh};
 }
 return {start,t,T,translate,setAppearance,onLanguage:fn=>listeners.add(fn),get zh(){return zh;},get lang(){return lang;}};
})();
