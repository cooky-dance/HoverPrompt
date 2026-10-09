// Encrypts the API keys and the account token kept in chrome.storage.local (see secret-store.js)
if(typeof importScripts==='function')try{importScripts('secret-store.js');}catch{}
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:'analyze-image',title:chrome.i18n?.getMessage('menuAnalyze')||'生成中英文提示词',contexts:['image']});
});
async function openPanel(tab, imageUrl, activateButtons=false) {
  const optionsUrl=chrome.runtime.getURL('popup.html');
  const isOptions=value=>value===optionsUrl||value?.startsWith(optionsUrl+'?')||value?.startsWith(optionsUrl+'#');
  if(tab?.id&&isOptions(tab.url)){await chrome.tabs.update(tab.id,{active:true});return;}
  const message={type:'OPEN_PROMPT_PANEL',imageUrl,activateButtons};
  if(tab?.id && /^https?:\/\//.test(tab.url || '')) {
    try {
      try {const response=await chrome.tabs.sendMessage(tab.id,message);if(response?.opened!==true)throw new Error('Page did not confirm opening the floating window');}
      catch {
        await chrome.scripting.executeScript({target:{tabId:tab.id},files:['image-filter.js','page-images.js','image-buttons.js','liquid-glass.js','shortcuts.js','content.js']});
        const response=await chrome.tabs.sendMessage(tab.id,message);if(response?.opened!==true)throw new Error('Floating window did not initialize after injection');
      }
      return;
    } catch { /* Browser-protected pages reuse the full settings tab. */ }
  }
  const existing=(await chrome.tabs.query({})).find(candidate=>isOptions(candidate.url));
  if(existing){await chrome.tabs.update(existing.id,{active:true});if(existing.windowId)await chrome.windows.update(existing.windowId,{focused:true});if(imageUrl)await chrome.tabs.sendMessage(existing.id,{type:'OPEN_IMAGE_IN_SETTINGS',imageUrl});return;}
  await chrome.tabs.create({url:optionsUrl+(imageUrl?'?auto=1&image='+encodeURIComponent(imageUrl):'')});
}
// Toolbar icon. One click: opens the floating window, or closes it when it is open. Double click (a second click on the
// same tab within DOUBLE_CLICK_MS): opens the settings page at the Library. Opening waits out the double-click window, so
// a double click never flashes the floating window open; closing happens at once. Whether the window is open is asked
// from the page on every click (the panel's own × closes it too, and this service worker may have been restarted);
// only the pending first click is kept in memory. Pages without the content script (browser pages, the Web Store) report
// "unavailable" and keep the old fallback: the settings tab.
const DOUBLE_CLICK_MS=320,pendingClicks=new Map();
async function panelState(tab){
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))return 'unavailable';
  try{const response=await chrome.tabs.sendMessage(tab.id,{type:'PROMPT_PANEL_STATE'});return response?.open===true?'open':'closed';}catch{return 'closed';}
}
async function closePanel(tab){try{await chrome.tabs.sendMessage(tab.id,{type:'CLOSE_PROMPT_PANEL'});}catch{}}
async function openLibrary(){
  const optionsUrl=chrome.runtime.getURL('popup.html');
  const existing=(await chrome.tabs.query({})).find(candidate=>candidate.url===optionsUrl||candidate.url?.startsWith(optionsUrl+'?')||candidate.url?.startsWith(optionsUrl+'#'));
  if(existing){await chrome.tabs.update(existing.id,{active:true});if(existing.windowId)await chrome.windows.update(existing.windowId,{focused:true});await chrome.tabs.sendMessage(existing.id,{type:'OPEN_SETTINGS_PAGE',page:'history'}).catch(()=>{});return;}
  await chrome.tabs.create({url:optionsUrl+'#library'});
}
function onActionClicked(tab){
  const key=tab?.id??-1,first=pendingClicks.get(key);
  if(first){pendingClicks.delete(key);clearTimeout(first.timer);first.done();return first.state.then(state=>state==='open'?closePanel(tab):null).then(openLibrary);}
  const click={state:panelState(tab)};pendingClicks.set(key,click);
  click.state.then(state=>{if(state==='open'&&pendingClicks.get(key)===click)return closePanel(tab);});
  // resolves when this click has been handled (tests and callers can await it)
  return new Promise(resolve=>{click.done=resolve;click.timer=setTimeout(async()=>{
    if(pendingClicks.get(key)!==click)return resolve();pendingClicks.delete(key);
    try{if(await click.state!=='open')await openPanel(tab,undefined,true);}finally{resolve();}
  },DOUBLE_CLICK_MS);});
}
chrome.action.onClicked.addListener(onActionClicked);
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if(info.menuItemId==='analyze-image') return openPanel(tab,info.srcUrl);
});

// Shortcut "copy" on a page image: look the image up in the extension library by URL.
const imageKey=url=>{try{const u=new URL(url);const m=/^\/(?:\d+x\d*|originals)\/(.+?)(?:\.[a-z0-9]+)?$/i.exec(u.pathname);return /pinimg\.com$/i.test(u.hostname)&&m?'pin:'+m[1]:u.origin+u.pathname;}catch{return String(url||'');}};
function allLibraryTasks(){return new Promise((resolve,reject)=>{const open=indexedDB.open('bilingual-image-prompts',2);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('tasks'))open.result.createObjectStore('tasks',{keyPath:'id'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;if(!db.objectStoreNames.contains('tasks')){db.close();resolve([]);return;}const request=db.transaction('tasks','readonly').objectStore('tasks').getAll();request.onsuccess=()=>{db.close();resolve(request.result||[]);};request.onerror=()=>{db.close();reject(request.error);};};});}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='IMAGEPROMPT_LOOKUP'||!sender.tab)return;
  (async()=>{
    const key=imageKey(message.url),tasks=(await allLibraryTasks()).filter(task=>[task.imageUrl,task.originalUrl].some(url=>url&&imageKey(url)===key)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const {promptLanguages=[]}=await chrome.storage.local.get(['promptLanguages']);
    for(const task of tasks){const prompts={...(task.zh?{'zh-CN':task.zh}:{}),...(task.en?{en:task.en}:{}),...(task.prompts||{})};const order=[...promptLanguages.map(language=>language.code),...Object.keys(prompts)];const code=order.find(item=>typeof prompts[item]==='string'&&prompts[item].trim());if(code)return {prompt:prompts[code],language:code,id:task.id};}
    return {prompt:'',found:tasks.length>0};
  })().then(respond,error=>respond({error:error.message}));
  return true;
});
let captureBusy=false,lastCapture=0;
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='CAPTURE_IMAGEPROMPT_PAGE')return;
  (async()=>{
    if(!sender.tab?.id||captureBusy)throw new Error('截图正在运行或来源无效 / Capture busy or invalid source');
    captureBusy=true;
    try{const active=(await chrome.tabs.query({active:true,windowId:sender.tab.windowId}))[0];if(active?.id!==sender.tab.id)throw new Error('请返回原网页后截图 / Return to the source tab');const delay=Math.max(0,600-(Date.now()-lastCapture));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastCapture=Date.now();const dataUrl=await chrome.tabs.captureVisibleTab(sender.tab.windowId,{format:'png'});respond({dataUrl});}
    finally{captureBusy=false;}
  })().catch(error=>respond({error:error.message}));
  return true;
});

// Native command inbox is opt-in; alarms wake MV3 when no settings tab is open.
let cliPolling=false;
async function openCliTab(value){
 const url=new URL(value);
 if(!/^https?:$/.test(url.protocol)||url.username||url.password)throw new Error('Invalid page URL');
 const tab=await chrome.tabs.create({url:url.href,active:true});
 if(!tab?.id)throw new Error('Could not open page tab');
 // Sites often redirect (www.pinterest.com -> jp.pinterest.com), so accept any HTTP(S) page once loaded;
 // a page still loading after 60s is usually usable (long-polling), so continue instead of failing. On slow networks
 // the address stays in pendingUrl until the page commits, so that counts too.
 let current;const web=value=>/^https?:\/\//.test(value||'');
 for(let attempt=0;attempt<300;attempt++){
  current=await chrome.tabs.get(tab.id);
  if(current?.status==='complete'&&web(current.url))return tab.id;
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(web(current?.url)||web(current?.pendingUrl))return tab.id;
 throw new Error('页面 60 秒内没有打开，请检查网络后重试 / The page did not open within 60 seconds; check the network and try again');
}
const isTaskPage=url=>{const options=chrome.runtime.getURL('popup.html');return url===options||!!url?.startsWith(options+'?');};
async function taskPage(){
 const tab=(await chrome.tabs.query({})).find(item=>isTaskPage(item.url))||await chrome.tabs.create({url:chrome.runtime.getURL('popup.html'),active:false});
 // The queue lives in this page's memory; memory saver must not discard it mid-batch.
 if(tab?.id&&tab.autoDiscardable!==false)await chrome.tabs.update(tab.id,{autoDiscardable:false}).catch(()=>{});
 return tab;
}
let lastTaskPageCheck=0;
async function reviveTaskPage(){
 if(Date.now()-lastTaskPageCheck<60000)return;lastTaskPageCheck=Date.now();
 try{
  // A discarded task page silently stops all queued analyses; reloading it lets TaskRecovery resume them.
  for(const tab of (await chrome.tabs.query({})).filter(item=>isTaskPage(item.url||item.pendingUrl))){
   if(tab.discarded)await chrome.tabs.reload(tab.id);
   if(tab.autoDiscardable!==false)await chrome.tabs.update(tab.id,{autoDiscardable:false}).catch(()=>{});
  }
 }catch(error){console.warn('HoverPrompt task page check:',error.message);}
}
function snapshotPage(){
 const label=element=>(element.getAttribute('aria-label')||element.placeholder||element.name||element.innerText||element.value||'').trim().replace(/\s+/g,' ').slice(0,60);
 const visible=element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0;};
 return {url:location.href,title:document.title,text:(document.body?.innerText||'').replace(/\n{3,}/g,'\n\n').slice(0,6000),images:document.images.length,
  links:[...document.querySelectorAll('a[href]')].filter(visible).map(link=>({text:label(link),href:link.href})).filter(link=>link.text).slice(0,40),
  controls:[...document.querySelectorAll('input,textarea,select,button,[role=button]')].filter(visible).map(element=>({tag:element.tagName.toLowerCase(),type:element.type||element.getAttribute('role')||'',label:label(element)})).slice(0,40)};
}
async function pollCliCommands(){
 if(cliPolling)return;cliPolling=true;
 let id;
 try{
  const prefs=await chrome.storage.local.get(['localCacheEnabled','cliControlEnabled']);if(!prefs.localCacheEnabled||!prefs.cliControlEnabled)return;
  await reviveTaskPage();
  const incoming=await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'pull'});const command=incoming?.command;if(!command)return;id=command.id;
  let result;
  if(command.action==='scan'||command.action==='search'){
   if(command.action==='search')command.tabId=await openCliTab(command.url);
   const tabs=await chrome.tabs.query(command.tabId?{}:{active:true,lastFocusedWindow:true});const tab=command.tabId?tabs.find(tab=>tab.id===command.tabId):tabs[0];
   if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw new Error('Select an HTTP/HTTPS webpage or pass --tab-id');
   const message={type:'CLI_COLLECT_PAGE_IMAGES',scope:command.scope,requestId:id,maxScreens:command.maxScreens};
   try{result=await chrome.tabs.sendMessage(tab.id,message);}catch{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['image-filter.js','page-images.js','image-buttons.js','liquid-glass.js','shortcuts.js','content.js']});result=await chrome.tabs.sendMessage(tab.id,message);}
   if(result?.error)throw new Error(result.error);
   result={...result,tabId:tab.id};
   if(command.action==='search'){
    const taskTab=await taskPage();
    let filtered;
    for(let attempt=0;attempt<40;attempt++){
     try{filtered=await chrome.tabs.sendMessage(taskTab.id,{type:'CLI_FILTER_IMAGE_URLS',images:result.images});if(filtered)break;}catch{}
     await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!filtered||filtered.error)throw new Error(filtered?.error||'Extension library did not become ready');
    result={...result,images:filtered.images,alreadyProcessed:filtered.skipped,searchUrl:command.url};
    if(command.closeTab){await chrome.tabs.remove(tab.id).catch(()=>{});result.tabClosed=true;}
   }
  }else if(command.action==='snapshot'){
   let tabId=command.tabId;const opened=!!command.url;
   if(opened)tabId=await openCliTab(command.url);
   if(!tabId)tabId=(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0]?.id;
   const tab=tabId&&await chrome.tabs.get(tabId);
   if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw new Error('Select an HTTP/HTTPS webpage, pass --tab-id or --url');
   if(command.waitMs)await new Promise(resolve=>setTimeout(resolve,Math.min(30000,command.waitMs)));
   const [injected]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:snapshotPage});
   result={...injected?.result,tabId:tab.id};
   if(command.screenshot!==false){
    try{await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});await new Promise(resolve=>setTimeout(resolve,300));result.screenshot=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'jpeg',quality:70});}
    catch(error){result.screenshotError=error.message;}
   }
   if(command.closeTab&&opened){await chrome.tabs.remove(tab.id).catch(()=>{});result.tabClosed=true;}
  }else if(command.action==='submit'){
   if(!Array.isArray(command.urls)||command.urls.length<1||command.urls.length>100||command.urls.some(url=>{try{return !/^https?:$/.test(new URL(url).protocol);}catch{return true;}}))throw new Error('Invalid image URLs');
   const tab=await taskPage();
   for(let attempt=0;attempt<40;attempt++){
    try{result=await chrome.tabs.sendMessage(tab.id,{type:'CLI_SUBMIT_IMAGES',command});if(result)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
   }
   if(!result)throw new Error('Extension task page did not become ready');
  }else throw new Error('Unknown CLI action');
  await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'complete',id,result:result||{error:'No response'}});
 }catch(error){if(id)try{await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'complete',id,result:{error:error.message}});}catch{}}
 finally{cliPolling=false;}
}
// Optional CLI scheduling must never prevent toolbar/context-menu handlers starting.
try{if(chrome.alarms?.create&&chrome.alarms?.onAlarm?.addListener){Promise.resolve(chrome.alarms.create('imageprompt-cli',{periodInMinutes:.5})).catch(error=>console.warn('HoverPrompt CLI alarm:',error.message));chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='imageprompt-cli')pollCliCommands();});}}catch(error){console.warn('HoverPrompt CLI scheduling unavailable:',error.message);} 
chrome.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&(changes.cliControlEnabled||changes.localCacheEnabled))pollCliCommands();});
globalThis.setInterval?.(pollCliCommands,2000);
// Queued analyses live in the task page's memory; after an update or browser restart reopen it so it can resume orphaned tasks.
async function resumeTaskPage(){try{const prefs=await chrome.storage.local.get(['localCacheEnabled','cliControlEnabled']);if(prefs.localCacheEnabled&&prefs.cliControlEnabled)await taskPage();}catch(error){console.warn('HoverPrompt task page:',error.message);}}
chrome.runtime.onInstalled?.addListener(details=>{if(details.reason==='update')resumeTaskPage();});
chrome.runtime.onStartup?.addListener(resumeTaskPage);
if(chrome.storage?.local)pollCliCommands();

// ---- ChatGPT image studio plugin: save images from chatgpt.com, and offer recent library images as references ----
const PLUGIN_HOSTS={chatgpt:['chatgpt.com','chat.openai.com']};
async function pluginAllowed(sender,plugin){
 const host=(()=>{try{return new URL(sender.url||sender.tab?.url||'').hostname;}catch{return '';}})();
 if(!PLUGIN_HOSTS[plugin]?.some(allowed=>host===allowed||host.endsWith('.'+allowed)))return false;
 const {plugins={}}=await chrome.storage.local.get(['plugins']);return plugins[plugin]?.enabled===true;
}
function libraryPut(record){return new Promise((resolve,reject)=>{const open=indexedDB.open('bilingual-image-prompts',2);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('tasks'))open.result.createObjectStore('tasks',{keyPath:'id'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').put(record);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.type!=='PLUGIN_SAVE_IMAGE'&&message?.type!=='PLUGIN_LIBRARY_RECENT')return;
 (async()=>{
  if(!(await pluginAllowed(sender,'chatgpt')))throw new Error('插件未开启 / Plugin is off');
  if(message.type==='PLUGIN_LIBRARY_RECENT'){
   const tasks=(await allLibraryTasks()).filter(task=>/^data:image\//.test(task.image||'')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,12);
   return {items:tasks.map(task=>({id:task.id,image:task.image}))};
  }
  const image=String(message.image||'');if(!/^data:image\/(png|jpeg|webp);base64,/.test(image)||image.length>14*1024*1024)throw new Error('图片无效或超过 10 MB / Invalid image or over 10 MB');
  const prompt=String(message.prompt||'').slice(0,20000),record={id:'cgsave-'+crypto.randomUUID(),kind:'chatgpt-save',createdAt:Date.now(),status:'done',source:'chatgpt',zh:prompt,en:prompt,prompts:{},focus:'',image,imageUrl:/^https:\/\//.test(message.imageUrl||'')?message.imageUrl:undefined,sourceUrl:sender.tab?.url};
  await libraryPut(record);
  // keep the local backup in step when the bridge is on
  const {localCacheEnabled}=await chrome.storage.local.get(['localCacheEnabled']);if(localCacheEnabled===true)chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'put',record}).catch(()=>{});
  return {ok:true,id:record.id};
 })().then(respond,error=>respond({error:error.message}));
 return true;
});

// ChatGPT image studio: open the workbench, and read a generated image for a worker tab when the page's own fetch is refused.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.type!=='CGPT_OPEN_STUDIO'&&message?.type!=='CGPT_FETCH_IMAGE')return;
 (async()=>{
  if(!(await pluginAllowed(sender,'chatgpt')))throw new Error('插件未开启 / Plugin is off');
  if(message.type==='CGPT_OPEN_STUDIO'){const url=chrome.runtime.getURL('chatgpt-studio.html');const [open]=await chrome.tabs.query({url});if(open){await chrome.tabs.update(open.id,{active:true});await chrome.windows.update(open.windowId,{focused:true});}else await chrome.tabs.create({url});return {ok:true};}
  const url=new URL(String(message.url||''));if(url.protocol!=='https:'||!/(^|\.)(chatgpt\.com|openai\.com|oaiusercontent\.com)$/.test(url.hostname))throw new Error('不支持的图片地址 / Unsupported image URL');
  const response=await fetch(url,{credentials:'include',cache:'force-cache'});if(!response.ok)throw new Error('HTTP '+response.status);
  const type=(response.headers.get('content-type')||'').split(';')[0].trim();if(type&&!type.startsWith('image/'))throw new Error('不是图片 / Not an image');
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>20*1024*1024)throw new Error('图片超过 20 MB / Image over 20 MB');
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {dataUrl:'data:'+(type||'image/png')+';base64,'+btoa(binary)};
 })().then(respond,error=>respond({error:error.message}));
 return true;
});

// ---- the ChatGPT studio companion plugin (the Chrome build has no studio of its own) ----
// The companion has a fixed ID (its manifest key) and talks to this extension by external messaging: it reads the
// settings it shares with the studio, writes its runs and saved chatgpt.com images into this library (the cloud sync
// picks them up from here), and reaches the local cache through this extension's native host permission.
if(typeof importScripts==='function'&&!globalThis.IMAGEPROMPT_BUILD)try{importScripts('build.js');}catch{}
const COMPANION_ID='cglojadmkjmlgnonhddpgogdlmkmnnnk';
const COMPANION_SHARED_KEYS=['plugins','uiLanguage','appearanceMode','themeColor','cloudConfig','promptProfiles','activeProfiles','activeCloudSkill','localCacheEnabled','genOutputDir'];
const COMPANION_KINDS=/^(cgpt|imp|cgsave)-[-\w]{8,120}$/,COMPANION_NATIVE_ACTIONS=['cacheId','writeGenerated','put'];
function libraryDelete(id){return new Promise((resolve,reject)=>{const open=indexedDB.open('bilingual-image-prompts',2);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('tasks'))open.result.createObjectStore('tasks',{keyPath:'id'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('tasks','readwrite');tx.objectStore('tasks').delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});}
async function mirrorLocally(record){const {localCacheEnabled}=await chrome.storage.local.get(['localCacheEnabled']);if(localCacheEnabled===true)chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'put',record}).catch(()=>{});}
const COMPANION={
 async COMPANION_SHARED(){return {values:await chrome.storage.local.get(COMPANION_SHARED_KEYS)};},
 async COMPANION_PUT_RECORD(message){
  const record=message.record;if(!record||typeof record!=='object'||!COMPANION_KINDS.test(String(record.id))||!['chatgpt-studio','import','chatgpt-save'].includes(record.kind))throw new Error('Invalid record');
  if(JSON.stringify(record).length>200*1024*1024)throw new Error('Record too large');
  await libraryPut(record);return {ok:true,id:record.id};
 },
 async COMPANION_DELETE_RECORD(message){const id=String(message.id||'');if(!COMPANION_KINDS.test(id))throw new Error('Invalid record');await libraryDelete(id);return {ok:true};},
 async COMPANION_SAVE_IMAGE(message){
  const image=String(message.image||'');if(!/^data:image\/(png|jpeg|webp);base64,/.test(image)||image.length>14*1024*1024)throw new Error('图片无效或超过 10 MB / Invalid image or over 10 MB');
  const prompt=String(message.prompt||'').slice(0,20000),sourceUrl=/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(message.sourceUrl||'')?message.sourceUrl:undefined;
  const record={id:'cgsave-'+crypto.randomUUID(),kind:'chatgpt-save',createdAt:Date.now(),status:'done',source:'chatgpt',zh:prompt,en:prompt,prompts:{},focus:'',image,imageUrl:/^https:\/\//.test(message.imageUrl||'')?message.imageUrl:undefined,sourceUrl};
  await libraryPut(record);await mirrorLocally(record);return {ok:true,id:record.id};
 },
 async COMPANION_LIBRARY_RECENT(){const tasks=(await allLibraryTasks()).filter(task=>/^data:image\//.test(task.image||'')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,12);return {items:tasks.map(task=>({id:task.id,image:task.image}))};},
 async COMPANION_NATIVE(message){const request=message.message||{};if(!COMPANION_NATIVE_ACTIONS.includes(request.action))throw new Error('Not allowed');return chrome.runtime.sendNativeMessage('com.imageprompt.local',request);}
};
chrome.runtime.onMessageExternal?.addListener((message,sender,respond)=>{
 const handle=COMPANION[message?.type];if(!handle||sender.id!==COMPANION_ID)return;
 handle(message).then(respond,error=>respond({error:error.message}));return true;
});
// settings the studio shares follow along while the companion is installed (Chrome build only)
chrome.storage?.onChanged?.addListener((changes,area)=>{
 if(area!=='local'||globalThis.IMAGEPROMPT_BUILD?.chatgpt!=='companion'||!COMPANION_SHARED_KEYS.some(key=>key in changes))return;
 chrome.storage.local.get(COMPANION_SHARED_KEYS).then(values=>chrome.runtime.sendMessage(COMPANION_ID,{type:'COMPANION_SHARED',values})).catch(()=>{});
});
