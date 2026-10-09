const $ = (id) => document.getElementById(id);
const DB_NAME = "bilingual-image-prompts";
let selectedImage = null;
// the full-size original of the selected image, kept beside the 1600 px copy (see originalImageOf)
let selectedOriginal = null;
let currentId = null;
let busy = false;
const submitting = new Set();
const deletedTasks = new Set();
const expandedHistory=new Set(),activeTaskTimings=new Map(),historyTimingTasks=new Map(),historyLanguageChoices=new Map();
let currentTimingTask=null,historyRenderVersion=0;
function wholeSeconds(ms){const total=Math.round(Math.max(0,ms||0)/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),sec=total%60;return h?h+'h '+m+'m '+sec+'s':m?m+'m '+sec+'s':sec+'s';}
// the prompt an enlarged image copies: the preferred language, else any saved one
function promptOf(task){return LanguageUI.preferred?.(task)?.prompt||task?.zh||task?.en||'';}
// Floating cards: copy sits in the image's top-left corner and delete is a plain × in the top-right corner.
function cornerControls(row,remove,copy){if(!embedded)return;remove.classList.remove('icon-btn');remove.classList.add('card-corner','card-delete');remove.setAttribute('aria-label',remove.title);remove.textContent='×';copy.classList.add('card-corner','card-copy');row.append(remove,copy);}
function timingText(task){
  const value=TaskTiming.snapshot(task);if(!value)return LanguageUI.text('用时未记录 / Timing not recorded');
  // Whole seconds only, no total (wait + run are shown).
  const wait=wholeSeconds(value.waitMs),run=wholeSeconds(value.runMs);
  return LanguageUI.text('等待 '+wait+' · 运行 '+run+' / Wait '+wait+' · Run '+run);
}
function updateTimingDisplays(){
  for(const node of document.querySelectorAll('[data-timing-id]')){
    const task=activeTaskTimings.get(node.dataset.timingId)||historyTimingTasks.get(node.dataset.timingId)||currentTimingTask;
    if(!task||task.id!==node.dataset.timingId)continue;const value=timingText(task);if(node.textContent!==value)node.textContent=value;
  }
}
setInterval(()=>{if(document.visibilityState==='visible')updateTimingDisplays();},1000);
document.addEventListener('prompt-presentation-changed',()=>{historyLanguageChoices.clear();updateTimingDisplays();renderHistory().catch(error=>setStatus(error.message));});
const launchParams = new URL(location.href).searchParams;
const embedded = launchParams.get("embed") === "1";
if (embedded) {
  document.documentElement.classList.add("embedded-root");
  if(window.self!==window.top)document.documentElement.classList.add('framed-root');
  document.body.classList.add("embedded");
}
if(!embedded)chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.type!=='OPEN_IMAGE_IN_SETTINGS')return;
  SettingsLayout.navigate('history');loadWebImage(message.imageUrl,true).then(()=>respond({opened:true})).catch(error=>respond({error:error.message}));return true;
});

function openDb() {
  return new Promise((resolve, reject) => {
    // Version 2 repairs a database created without the task store (opened by another page before this one could
    // create it); every opener creates the store when it is missing.
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("tasks")) request.result.createObjectStore("tasks", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbCall(mode, action, keepCache = false) {
  // Writes that bypass saveTask/deleteTask (e.g. cloud sync) drop the in-memory copy so the next read is fresh.
  if (mode === "readwrite" && !keepCache) taskCache = null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tasks", mode);
    const request = action(tx.objectStore("tasks"));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => reject(tx.error);
  });
}

// In-memory copy of the task store. The library re-renders on every status change, and reading every record
// (each carrying its image) from IndexedDB each time made the floating window slow to open and laggy.
// Open extension pages keep their copies in sync through a BroadcastChannel.
let taskCache = null;
const taskSync = globalThis.BroadcastChannel ? new BroadcastChannel("imageprompt-task-sync") : null;
const saveTask = async (task) => {const result=await dbCall("readwrite", store => store.put(task), true);taskCache?.set(task.id,task);taskSync?.postMessage({id:task.id});LocalBridge.put(task);return result;};
const getTask = async (id) => {const task=await dbCall("readonly", store => store.get(id));if(taskCache){if(task)taskCache.set(id,task);else taskCache.delete(id);}return task;};
const deleteTask = async (id) => {const result=await dbCall("readwrite", store => store.delete(id), true);taskCache?.delete(id);taskSync?.postMessage({id,deleted:true});LocalBridge.remove(id);return result;};
const allTasks = async () => {if(!taskCache){const list=await dbCall("readonly", store => store.getAll());taskCache=new Map(list.map(task=>[task.id,task]));}return [...taskCache.values()];};
// Restore from a backup (the local CLI cache): adds records that are missing, never overwrites existing ones.
// Older records get a kind (reverse / generation / chatgpt-studio / chatgpt-save ...) derived from their source and ID.
// Only the field is added; IDs stay as they are, so the local backup and the cloud copies keep matching.
async function migrateRecordKinds(){
 try{
  const {recordKindsV1}=await chrome.storage.local.get(['recordKindsV1']);if(recordKindsV1)return;
  const missing=(await allTasks()).filter(task=>!task.kind);
  if(missing.length){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks');for(const task of missing)store.put({...task,kind:RecordKinds.kindOf(task)});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});taskCache=null;}
  await chrome.storage.local.set({recordKindsV1:Date.now()});
 }catch{}
}
globalThis.migrateRecordKinds=migrateRecordKinds;
globalThis.importTasks=async tasks=>{
 const existing=new Set((await allTasks()).map(task=>task.id)),fresh=tasks.filter(task=>task&&typeof task.id==='string'&&!existing.has(task.id));
 if(!fresh.length)return 0;
 const db=await openDb();
 await new Promise((resolve,reject)=>{const tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks');for(const task of fresh)store.put(task);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 taskCache=null;return fresh.length;
};
globalThis.libraryCount=async()=>(await allTasks()).length;
// The image studio saves each batch as a library record (upsert; also mirrored to the local backup).
globalThis.saveLibraryTask=async task=>{await saveTask(task);clearTimeout(globalThis.saveLibraryTask.timer);globalThis.saveLibraryTask.timer=setTimeout(()=>renderHistory().catch(()=>{}),300);};
globalThis.refreshLibrary=()=>renderHistory();
// Ask the browser to keep this data (with unlimitedStorage the store is not evicted when the disk is low).
navigator.storage?.persist?.().catch(()=>{});
let historyRefreshTimer=null;
const scheduleHistoryRefresh=()=>{clearTimeout(historyRefreshTimer);historyRefreshTimer=setTimeout(()=>renderHistory().catch(()=>{}),200);};
if(taskSync)taskSync.onmessage=async({data})=>{if(!taskCache||!data?.id)return;if(data.deleted)taskCache.delete(data.id);else{const task=await dbCall("readonly",store=>store.get(data.id));if(task)taskCache.set(data.id,task);else taskCache.delete(data.id);}scheduleHistoryRefresh();};

function setStatus(message) { $("status").textContent = LanguageUI.text(message); }
function setBusy() {
  const counts = RequestControl.counts();
  busy = counts.active > 0;
  const selectedRunning = currentId && (RequestControl.has(currentId) || submitting.has(currentId));
  document.body.classList.toggle("is-running", !!selectedRunning);
  $("analyze").disabled = !selectedImage || !!selectedRunning;
  const uploads=globalThis.LibraryUpload?.count()||0;
  $("analyze").textContent = selectedRunning ? "此任务处理中 / Processing" : uploads>1 ? LanguageUI.text("为 {n} 张图生成提示词 / Generate prompts for {n} images").replace(/\{n\}/g,uploads) : "生成提示词 / Generate";
  $("jobCounts").textContent = LanguageUI.text("运行 " + counts.active + " · 等待 " + counts.queued+" / Running "+counts.active+" · Queued "+counts.queued);
}

async function imageToDataUrl(blob) {
  if (!blob.type.startsWith("image/")) throw new Error("所选内容不是图片 / Not an image");
  if (blob.size > 25 * 1024 * 1024) throw new Error("图片超过 25 MB，请先压缩 / Image exceeds 25 MB");
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

// The full-size original kept beside the 1600 px copy: analysis reads the copy; image to image, cloud analysis and cloud
// sync use the original (Cloud.syncOriginals, on by default). PNG/JPEG/WebP up to 15 MB are kept as they are; other
// formats (AVIF, GIF, BMP…) are redrawn as PNG (at most 4096 px). Not kept when it is no larger than the copy.
async function originalImageOf(blob,copy){
  if(!blob||!blob.type.startsWith('image/')||blob.size<=String(copy||'').length*0.8)return null;
  const read=value=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>resolve(null);reader.readAsDataURL(value);});
  if(/^image\/(png|jpeg|webp)$/.test(blob.type))return blob.size>15*1024*1024?null:read(blob);
  try{const bitmap=await createImageBitmap(blob),scale=Math.min(1,4096/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   if(Math.max(canvas.width,canvas.height)<=1600)return null;
   const png=canvas.toDataURL('image/png');return png.length*.75<=15*1024*1024?png:null;}
  catch{return null;}
}
// The original of a record for image to image: the cached one, else fetched once from its original or page address
// (Pinterest originals first) and kept on the record, so the next time needs no download.
async function originalFor(task){
  if(task.originalImage)return task.originalImage;
  const address=[task.originalUrl,task.imageUrl].find(url=>/^https?:\/\//.test(url||''));if(!address)return null;
  try{const best=await OriginalImages.fetchBest(address,20000),original=await originalImageOf(best.blob,task.image);if(!original)return null;
   const fresh=await getTask(task.id);if(fresh){fresh.originalImage=original;fresh.originalUrl=fresh.originalUrl||best.url;await saveTask(fresh);}
   return original;}
  catch{return null;}
}
globalThis.originalImageOf=originalImageOf;

async function selectBlob(blob) {
  selectedImage = await imageToDataUrl(blob);
  selectedOriginal = await originalImageOf(blob,selectedImage);
  currentId = null;currentTimingTask=null;$("taskTime").textContent="";delete $("taskTime").dataset.timingId;
  $("preview").src = selectedImage;
  $("preview").hidden = false;
  $("result").hidden = true;
  setBusy(false);
  setStatus("图片已准备 / Image ready");
}

function endpoint(base) {
  const url = new URL(base.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("接口地址必须以 https:// 或 http:// 开头");
  if (url.username || url.password || url.search || url.hash) throw new Error("接口地址不能包含用户名、查询参数或片段");
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname) && url.protocol !== "https:") {
    throw new Error("远程接口请使用 HTTPS");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions") ? path : path + "/chat/completions";
  return url.toString();
}

function parsePrompts(content, requested = LanguageUI.selected()) {
  if (Array.isArray(content)) content = content.map(part => part.text || "").join("\n");
  if (typeof content !== "string") throw new Error("接口没有返回文本内容");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error("模型未返回约定的 JSON 格式，请换用支持图片的聊天模型"); }
  const zh = parsed.zh?.prompt || parsed.zh || parsed.chinese;
  const en = parsed.en?.prompt || parsed.en || parsed.english;
  if (typeof zh !== "string" || typeof en !== "string" || !zh.trim() || !en.trim()) {
    throw new Error("接口返回结果缺少中文或英文提示词");
  }
  const prompts=Object.fromEntries(Object.entries(parsed.prompts||{}).filter(([code,value])=>/^[a-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(code)&&typeof value==='string'&&value.trim()).map(([code,value])=>[code,value.trim()]));for(const language of requested){const text=parsed.prompts?.[language.code]||(language.code==='zh-CN'?zh:language.code==='en'?en:null);if(typeof text!=='string'||!text.trim())throw new Error('缺少语言版本 / Missing language: '+language.code);prompts[language.code]=text.trim();}return { zh: zh.trim(), en: en.trim(),prompts };
}

async function analyze(savedTask = null) {
  const image = savedTask?.image || selectedImage;
  const original = savedTask?.image ? savedTask.originalImage || null : selectedOriginal;
  if (!image) return;
  const id = savedTask?.image ? savedTask.id : (currentId || RecordKinds.newId('reverse'));
  if (RequestControl.has(id) || submitting.has(id)) {
    $("historyStatus").textContent = "此记录正在处理，不重复提交；其他记录可并行运行";
    return;
  }
  const submittedAt=Date.now();
  const focus = savedTask?.image ? savedTask.focus || '' : $("focus").value.trim();
  submitting.add(id);currentId=id;setBusy();
  let task;
  try {
    const settings = await SourceUI.getSettings();
    RequestControl.configure(settings.requestControl);
    settings.promptLanguages=LanguageUI.selected();
    settings.reverseSystem=typeof PromptProfiles!=='undefined'?PromptProfiles.compose(await PromptProfiles.current('reverse')):'';
    const channel=await chrome.storage.local.get(['channelOrder','activeCloudSkill']);
    if (Cloud.mode()==='local' && !PromptAPI.routeCandidates(settings).length) {
      $("settings").hidden=false;SettingsLayout.navigate("sources");
      throw new Error("请先保存启用的 API 来源并选择模型");
    }
    task = (await getTask(id)) || {id,kind:'reverse',source:'reverse',createdAt:Date.now()};
    if(deletedTasks.has(id)) return;
    Object.assign(task,{image,focus,status:'queued',error:'',zh:'',en:'',prompts:{},retryCount:0},original?{originalImage:original}:{});
    TaskTiming.begin(task,submittedAt);activeTaskTimings.set(id,task);
    await saveTask(task);
    if(currentId===id)showTask(task);
    const scheduled = RequestControl.schedule(id, async signal => {
      task.status='running';if(!deletedTasks.has(id))await saveTask(task);
      setBusy();await renderHistory();
      // Channels. Local mode: personal API / Ollama only (never cloud credits). Cloud mode follows channelOrder:
      // local-first (default: Ollama/API by source priority, then cloud), cloud-first, or cloud-only; a failed channel falls through.
      const viaCloud=()=>Cloud.analyze(image,focus,signal,settings.promptLanguages,remote=>{
        const timing=TaskTiming.clean(remote);if(!timing)return;timing.waitMs+=Math.max(0,timing.queuedAt-submittedAt);timing.queuedAt=submittedAt;task.timing=timing;
        if(!deletedTasks.has(id))saveTask(task).catch(()=>{});updateTimingDisplays();
      },channel.activeCloudSkill?.id||'',channel.activeCloudSkill?.part||'',id,Cloud.syncOriginals?.()!==false?original:null);
      const viaLocal=()=>PromptAPI.route(settings,image,focus,(source,index,total,info={})=>{
        task.retryCount=info.retries || 0;
        task.status=info.retrying?'retrying':'running';
        if(!deletedTasks.has(id))saveTask(task).catch(()=>{});
        if(currentId===id)setStatus((info.retrying ? "超时，自动重试 " + info.retries + "/" + RequestControl.normalize(settings.requestControl).maxRetries : "已提交") + "：" + source.name + " · " + source.model + (info.batched>1 ? LanguageUI.text("（与其他图合并为一次请求，共 "+info.batched+" 张） / (merged with other images: "+info.batched+" in one request)").replace(/^/," ") : ""));
      },signal,phase=>{TaskTiming.phase(task,phase);if(!deletedTasks.has(id))saveTask(task).catch(()=>{});updateTimingDisplays();});
      if(Cloud.mode()!=='cloud')return viaLocal();
      const order=channel.channelOrder||'local-first',hasLocal=PromptAPI.routeCandidates(settings).length>0;
      const chain=order==='cloud-only'||!hasLocal?[viaCloud]:order==='cloud-first'?[viaCloud,viaLocal]:[viaLocal,viaCloud];
      let lastError;
      for(const [index,run] of chain.entries()){
        try{return await run();}catch(error){if(signal?.aborted||error.name==='AbortError')throw error;lastError=error;
          // Paywall: cloud credits exhausted → the credits window with packs and Plus.
          if(error.code==='quota_exceeded'&&globalThis.CreditsPanel)CreditsPanel.open({reason:'quota'});if(index<chain.length-1&&currentId===id)setStatus(LanguageUI.text('当前渠道失败，改用下一渠道： / Channel failed; trying the next one:')+' '+error.message);}
      }
      throw lastError;
    });
    scheduled.catch(()=>{});
    submitting.delete(id);setBusy();await renderHistory();
    const routed=await scheduled;
    if(deletedTasks.has(id))return;
    TaskTiming.finish(task);
    Object.assign(task,parsePrompts(routed.content,settings.promptLanguages),{status:'done',error:'',apiSource:routed.source,retryCount:routed.retries || 0,apiAttempts:routed.attempts || []});
    await saveTask(task);
    // fetch and keep the full-size original now (Pinterest originals first), so image to image later starts from it
    if(!task.originalImage)originalFor(task).catch(()=>{});
    if(currentId===id){showTask(task);setStatus("完成 / Done");}
  } catch(error) {
    if(task && !deletedTasks.has(id)) {
      TaskTiming.finish(task);
      Object.assign(task,{status:'failed',error:error.message,failCount:(task.failCount||0)+1,retryCount:error.retries || task.retryCount || 0,apiAttempts:error.attempts || []});
      await saveTask(task);
    }
    if(!deletedTasks.has(id) && currentId===id)setStatus("失败，可重试 / Failed\n"+error.message);
  } finally {
    activeTaskTimings.delete(id);submitting.delete(id);setBusy();await renderHistory();updateTimingDisplays();
  }
}

function showTask(task) {
  // A result exists when any language version exists (records with only e.g. Japanese never showed the card).
  const hasResult=!!(task.zh||task.en||Object.values(task.prompts||{}).some(Boolean));
  document.body.classList.toggle("has-result", hasResult);
  currentId = task.id;currentTimingTask=task;$("taskTime").dataset.timingId=task.id;$("taskTime").textContent=timingText(task);
  selectedImage = task.image;selectedOriginal = task.originalImage || null;
  $("resultImage").src = task.image;
  $("preview").src = task.image;
  $("preview").hidden = false;
  $("focus").value = task.focus || "";
  $("zh").value = task.zh || "";
  $("en").value = task.en || "";
  $("result").hidden = !hasResult;
  setBusy(busy);
  LanguageUI.show(task);
  // Large view of the original from the result card; generated images and generate buttons below the prompt.
  $('resultImage').style.cursor='zoom-in';$('resultImage').onclick=()=>GenFlow.lightbox(task.image,LanguageUI.text('原图 / Original'),{prompt:promptOf(task),name:task.id});
  GenFlow.showGenerations(task);
}

function fillHistoryDetails(task,details){
  // Only generated languages, in priority order (the default language first); "全部" last. The display setting
  // picks the initial tab: "all" opens on 全部, otherwise on the default language.
  details.replaceChildren();const available=LanguageUI.versions(task),preset=LanguageUI.historyVersions(task),initial=preset.length>1?'__all':preset[0]?.code||available[0]?.code||'__all';
  let choice=historyLanguageChoices.get(task.id)||initial;if(choice!=='__all'&&!available.some(language=>language.code===choice))choice=initial;
  const versions=choice==='__all'?available:available.filter(language=>language.code===choice);
  const tabs=document.createElement('div');tabs.className='history-language-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label',LanguageUI.text('历史提示词语言 / History prompt languages'));
  function languageTab(code,name,enabled=true){const button=document.createElement('button');button.type='button';button.dataset.language=code;button.className='prompt-language-name';button.textContent=name;button.disabled=!enabled;button.setAttribute('aria-pressed',String(code===choice));button.onclick=()=>{historyLanguageChoices.set(task.id,code);fillHistoryDetails(task,details);};tabs.append(button);return button;}
  for(const language of available)languageTab(language.code,language.name);
  if(available.length>1)languageTab('__all',LanguageUI.text('全部 / All'));
  if(available.length)details.append(tabs);
  if(!versions.length){const message=document.createElement('p');message.textContent=LanguageUI.text(task.error||'没有所选语言的提示词，或任务尚无结果 / No selected language version or no result yet');details.append(message);return;}
  // One copy button, right-aligned in the language row: copies the shown language, or every language under 全部.
  const feedback=document.createElement('span');feedback.className='copy-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');CopyUI.bind(feedback,'history-details:'+task.id);
  const copy=document.createElement('button');copy.type='button';copy.className='history-details-copy';copy.textContent=LanguageUI.text('复制 / Copy');
  copy.onclick=()=>CopyUI.copy(versions.length===1?versions[0].prompt:versions.map(version=>version.name+'\n'+version.prompt).join('\n\n'),feedback);
  if(available.length)tabs.append(copy);else details.append(copy);
  details.append(feedback);
  for(const version of versions){
    const block=document.createElement('div');block.className='history-prompt-version';block.dataset.language=version.code;
    const prompt=document.createElement('div');prompt.className='history-prompt-text';prompt.textContent=version.prompt;block.append(prompt);details.append(block);
  }
}
// Library paging: start with the newest 10 cards and add 20 more each time the end of the list comes into view.
let historyLimit=10,historyMoreObserver=null;
globalThis.resetHistoryLimit=()=>{historyLimit=10;};
// "Generated" view: images made from the same prompt share one card (image to image: also the same references, i.e. the
// same record); the card shows every image (up to 3 rows, then it scrolls sideways) with view / regenerate / delete / copy.
function generationGroups(list){
  const groups=new Map();
  for(const item of list){const {task,generation:g}=item,text=String(g.prompt||'').replace(/\s+/g,' ').trim();
    const key=(g.mode==='image'?'i|'+task.id:'t')+'|'+(text||'#'+task.id);
    if(!groups.has(key))groups.set(key,{key,items:[]});groups.get(key).items.push(item);}
  return [...groups.values()];
}
async function renderGenerations(root){
  const items=[];for(const task of await allTasks())for(const generation of task.generations||[])items.push({task,generation});
  const list=HistoryTools.applyGenerations(items),groups=generationGroups(list);root.replaceChildren();if($('historyCount'))$('historyCount').textContent=LanguageUI.text(list.length+'/'+items.length+' 张生成图 / '+list.length+' of '+items.length+' images');
  if(!list.length){root.textContent=LanguageUI.text('还没有生成图。在反推卡片上点“生图”或“图生图”。 / No generated images yet. Use Generate or Image to image on a reverse card.');return;}
  const button=(cls,label,handler)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=LanguageUI.text(label);b.title=b.textContent;b.setAttribute('aria-label',b.textContent);b.onclick=event=>{event.stopPropagation();handler();};return b;};
  for(const group of groups.slice(0,historyLimit)){
    const first=group.items[0],{task,generation:g}=first,keys=group.items.map(({task,generation})=>task.id+':'+generation.id);
    const row=document.createElement('div');row.className='item gen-item gen-group';row.dataset.taskId=task.id;row.dataset.generationId=g.id;row.dataset.selectKey=keys[0];row.dataset.selectKeys=keys.join('|');row.dataset.status=g.status;
    const check=document.createElement('input');check.type='checkbox';check.className='history-check gen-group-check';check.dataset.keys=keys.join('|');check.setAttribute('aria-label',LanguageUI.text('选择这组生成图 / Select these images'));
    check.onclick=()=>HistoryTools.selectMany(keys,check.checked);
    const view=generation=>GenFlow.lightbox(generation.image,[generation.model,generation.size,generation.path].filter(Boolean).join(' · '),{prompt:generation.prompt,name:generation.path?.split(/[\\/]/).pop()||generation.id});
    const cover=group.items.find(item=>item.generation.image)?.generation;
    const thumb=document.createElement('div');thumb.className='history-thumb';
    if(cover){const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=cover.image;img.alt='';img.style.cursor='zoom-in';img.onclick=()=>view(cover);thumb.append(img);}
    else{const placeholder=document.createElement('div');placeholder.className='gen-placeholder';placeholder.dataset.status=g.status;placeholder.textContent=LanguageUI.text(g.status==='failed'?'失败 / Failed':'生成中 / Working');thumb.append(placeholder);}
    if(group.items.length>1){const count=document.createElement('span');count.className='gen-group-count';count.textContent=String(group.items.length);thumb.append(count);}
    const main=document.createElement('div');main.className='item-main';
    const mode=LanguageUI.text(g.mode==='image'?'图生图 / Image to image':'文生图 / Text to image'),tally={};for(const item of group.items)tally[item.generation.status]=(tally[item.generation.status]||0)+1;
    const states=Object.entries(tally).map(([state,n])=>LanguageUI.text({done:'完成 / Done',failed:'失败 / Failed',queued:'等待发送 / Queued',running:'运行中 / Running'}[state]||state)+(group.items.length>1?' '+n:'')).join(' · ');
    const title=document.createElement('p');title.textContent=new Date(g.createdAt).toLocaleString()+' · '+mode+' · '+LanguageUI.text(group.items.length+' 张 / '+group.items.length+' images')+' · '+states;
    const models=[...new Set(group.items.map(item=>item.generation.model).filter(Boolean))],runs=group.items.map(item=>item.generation.runMs).filter(Boolean);
    const meta=document.createElement('p');meta.className='hint';meta.textContent=[g.profile&&LanguageUI.text(g.profile),models.join(' / '),g.size,runs.length?Math.round(runs.reduce((x,y)=>x+y,0)/runs.length/1000)+'s':''].filter(Boolean).join(' · ');
    const failed=group.items.find(item=>item.generation.status==='failed'&&item.generation.error)?.generation;
    const summary=document.createElement('p');summary.className='muted history-summary'+(!cover&&failed?' gen-error':'');summary.textContent=!cover&&failed?failed.error:g.prompt||'';
    const failure=cover&&failed?Object.assign(document.createElement('p'),{className:'hint gen-error',textContent:LanguageUI.text('失败 / Failed')+' '+(tally.failed||0)+'：'+failed.error}):null;
    // every image of the group (newest first); a click opens it large
    const strip=GenFlow.strip(group.items.map(item=>item.generation),{onOpen:view});
    const actions=document.createElement('div');actions.className='history-actions';
    actions.append(check);
    if(cover)actions.append(button('history-view icon-btn','查看大图 / View image',()=>view(cover)));
    actions.append(button('secondary history-retry icon-btn','重新生成 / Generate again',()=>GenFlow.start(task.id,g.mode)));
    actions.append(button('danger history-delete icon-btn','删除这组生成图 / Delete these images',async()=>{if(group.items.length>1&&!confirm(LanguageUI.text('删除这组 '+group.items.length+' 张生成图？ / Delete these '+group.items.length+' images?')))return;
      for(const [taskId,ids] of Object.entries(group.items.reduce((map,item)=>((map[item.task.id]||=[]).push(item.generation.id),map),{}))){const saved=await getTask(taskId);if(!saved)continue;saved.generations=(saved.generations||[]).filter(item=>!ids.includes(item.id));await saveTask(saved);}
      await renderHistory();}));
    const feedback=document.createElement('span');feedback.className='copy-feedback history-copy-feedback';
    actions.append(button('history-copy','复制提示词 / Copy prompt',()=>CopyUI.copy(g.prompt||'',feedback)),feedback);
    if(cover&&globalThis.CommunityShare)actions.append(button('history-share icon-btn','发布到作品展示 / Post to showcase',()=>CommunityShare.open({images:group.items.map(item=>item.generation.image).filter(Boolean),prompt:g.prompt||'',model:g.model||g.sourceName||'',aspect:g.aspect||''})));
    main.append(title,meta,summary);if(failure)main.append(failure);if(group.items.length>1)main.append(strip);main.append(actions);row.append(thumb,main);cornerControls(row,actions.querySelector('.history-delete'),actions.querySelector('.history-copy'));root.append(row);
  }
  queueMicrotask(()=>HistoryTools.update());
  if(groups.length>historyLimit){const more=document.createElement('div');more.className='history-more';more.textContent=LanguageUI.text('继续下滑加载更多（剩余 '+(groups.length-historyLimit)+' 组）/ Scroll for more ('+(groups.length-historyLimit)+' left)');root.append(more);historyMoreObserver?.disconnect();historyMoreObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){historyMoreObserver.disconnect();historyLimit+=20;renderHistory();}},{root:embedded?$('historySection'):null,rootMargin:'400px'});historyMoreObserver.observe(more);}
}
async function renderHistory() {
  if (embedded && $('historySection').hidden) return;
  if (HistoryTools.view?.()==='generated'){const version=++historyRenderVersion;await allTasks();if(version!==historyRenderVersion)return;await renderGenerations($('history'));return;}
  const version=++historyRenderVersion,scrollTop=$('historySection').scrollTop,pageY=scrollY;
  const records=await allTasks();if(version!==historyRenderVersion)return;const list=HistoryTools.apply(records.sort((a,b)=>b.createdAt-a.createdAt));
  const root=$('history');root.replaceChildren();historyTimingTasks.clear();
  if(!list.length){root.textContent=LanguageUI.text('没有匹配的记录。选择图片开始识别，或调整搜索条件。 / No matching records. Analyze an image or change your search.');return;}
  for(const task of list.slice(0,historyLimit)){
    historyTimingTasks.set(task.id,task);
    const row=document.createElement('div');row.className='item'+(task.id===currentId?' selected':'');row.dataset.taskId=task.id;
    const thumb=document.createElement('div');thumb.className='history-thumb';
    const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=task.image;img.alt='历史图片';
    const main=document.createElement('div');main.className='item-main';
    const title=document.createElement('p');title.textContent=new Date(task.createdAt).toLocaleString()+' · '+LanguageUI.text({done:'完成 / Done',failed:'失败 / Failed',queued:'等待发送 / Queued',running:'运行中 / Running',retrying:'超时重试 '+(task.retryCount||0)+' / Timeout retry '+(task.retryCount||0)}[task.status]||task.status);
    const timing=document.createElement('p');timing.className='task-time';timing.dataset.timingId=task.id;timing.textContent=timingText(activeTaskTimings.get(task.id)||task);
    const summary=document.createElement('p');summary.className='muted history-summary';summary.textContent=LanguageUI.preferred(task)?.prompt||task.error||LanguageUI.text('可重新提交 / Can be resubmitted');
    const details=document.createElement('div');details.className='history-details';details.hidden=!expandedHistory.has(task.id);fillHistoryDetails(task,details);
    const open=document.createElement('button');open.textContent=LanguageUI.text(!embedded&&expandedHistory.has(task.id)?'收起 / Collapse':embedded?'查看 / Open':'展开 / Expand');if(!embedded){open.className='history-expand icon-btn';open.title=LanguageUI.text('展开或收起提示词 / Expand or collapse prompts');open.setAttribute('aria-expanded',String(expandedHistory.has(task.id)));}
    const toggleDetails=async()=>{
      const saved=await getTask(task.id);if(!saved)return;const show=details.hidden;details.hidden=!show;
      show?expandedHistory.add(task.id):expandedHistory.delete(task.id);fillHistoryDetails(saved,details);
      if(!embedded){open.textContent=LanguageUI.text(show?'收起 / Collapse':'展开 / Expand');open.setAttribute('aria-expanded',String(show));}
    };
    open.onclick=async()=>{
      try{
        if(!embedded){await toggleDetails();return;}
        const saved=await getTask(task.id);if(!saved){$('historyStatus').textContent=LanguageUI.text('记录已删除 / Record deleted');return;}
        showTask(saved);setStatus(LanguageUI.preferred(saved)?'已打开历史提示词 / History prompt opened':saved.error||'此任务尚无结果，可重试 / No result yet; retry this task');await renderHistory();
      }catch(error){$('historyStatus').textContent=LanguageUI.text('读取历史失败 / Could not read history')+': '+error.message;}
    };
    const check=document.createElement('input');check.type='checkbox';check.className='history-check';check.checked=globalThis.historySelection?.has(task.id)||false;check.setAttribute('aria-label','选择记录 / Select record');check.dataset.recordId=task.id;check.title=LanguageUI.text('Shift 点选连续多选，Ctrl/⌘ 点选单独加选 / Shift-click selects a range; Ctrl/⌘-click adds one');let shiftedPointer=false;check.onpointerdown=event=>shiftedPointer=event.shiftKey;check.onclick=event=>{HistoryTools.select(task.id,check.checked,event.shiftKey||shiftedPointer);shiftedPointer=false;};
    const quickCopy=document.createElement('button');quickCopy.className='history-copy';quickCopy.title=LanguageUI.text('复制默认优先语言 / Copy preferred language');quickCopy.setAttribute('aria-label',quickCopy.title);quickCopy.disabled=!LanguageUI.preferred(task);
    const copyFeedback=document.createElement('span');copyFeedback.className='copy-feedback history-copy-feedback';copyFeedback.setAttribute('role','status');copyFeedback.setAttribute('aria-live','polite');CopyUI.bind(copyFeedback,'history-image:'+task.id);
    quickCopy.onclick=async event=>{event.stopPropagation();const saved=await getTask(task.id);await CopyUI.copy(saved?LanguageUI.preferred(saved)?.prompt:'',copyFeedback);};
    thumb.append(img);
    img.style.cursor='pointer';img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','打开此图片的提示词 / Open image prompt');img.onclick=()=>open.onclick();img.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open.onclick();}};
    const retry=document.createElement('button');retry.textContent=LanguageUI.text('重试 / Retry');retry.className='secondary history-retry icon-btn';retry.title=retry.textContent;
    retry.onclick=async()=>{try{const saved=await getTask(task.id);if(!saved){$('historyStatus').textContent=LanguageUI.text('记录已删除 / Record deleted');return;}$('historyStatus').textContent=LanguageUI.text('重试已提交至并行队列 / Retry submitted');showTask(saved);await analyze(saved);}catch(error){$('historyStatus').textContent=LanguageUI.text('重试失败 / Retry failed')+': '+error.message;}};
    const remove=document.createElement('button');remove.textContent=LanguageUI.text('删除 / Delete');remove.className='danger history-delete icon-btn';remove.title=remove.textContent;
    remove.onclick=async()=>{
      try{
          historyLanguageChoices.delete(task.id);historySelection.delete(task.id);deletedTasks.add(task.id);expandedHistory.delete(task.id);RequestControl.cancel(task.id);await Cloud.deleted(task.id);await deleteTask(task.id);
        if(currentId===task.id){currentId=null;currentTimingTask=null;selectedImage=null;$('preview').hidden=true;$('result').hidden=true;$('zh').value='';$('en').value='';$('taskTime').textContent='';delete $('taskTime').dataset.timingId;document.body.classList.remove('has-result');setBusy();setStatus('记录已删除 / Deleted');}
        $('historyStatus').textContent=LanguageUI.text('已删除记录 / Record deleted');await renderHistory();
      }catch(error){deletedTasks.delete(task.id);$('historyStatus').textContent=LanguageUI.text('删除失败 / Delete failed')+': '+error.message;}
    };
    main.append(title,timing,summary);const actions=document.createElement('div');actions.className='history-actions';
    // Eye: the high-resolution original (cached original URL, Pinterest originals/736x, then the stored copy).
    const view=document.createElement('button');view.type='button';view.className='history-view icon-btn';view.textContent=LanguageUI.text('查看原图 / View original');view.title=view.textContent;view.setAttribute('aria-label',view.textContent);
    view.onclick=async event=>{event.stopPropagation();const saved=await getTask(task.id)||task;GenFlow.lightbox([saved.originalUrl,...(saved.imageUrl?OriginalImages.candidates(saved.imageUrl):[]),saved.image].filter(Boolean),LanguageUI.text('原图 / Original'),{prompt:promptOf(saved),name:saved.id});};
    actions.append(check,view);if(!embedded)actions.append(open);
    
    const genText=document.createElement('button');genText.type='button';genText.className='gen-action gen-t2i';genText.textContent=LanguageUI.text('生图 / Generate');genText.title=LanguageUI.text('用提示词文生图 / Text to image from the prompt');genText.disabled=!(task.prompts?.en||task.en);genText.onclick=event=>{event.stopPropagation();GenFlow.start(task.id,'text');};
    const genImage=document.createElement('button');genImage.type='button';genImage.className='gen-action gen-i2i';genImage.textContent=LanguageUI.text('图生图 / Image to image');genImage.title=LanguageUI.text('以原图为参考生成 / Generate with this image as reference');genImage.disabled=false;genImage.onclick=event=>{event.stopPropagation();GenFlow.start(task.id,'image');};
    // Settings page: one row. Floating window (narrow cards): generation buttons on their own row.
    // One action row everywhere; on the narrow floating cards the generate buttons become coloured round icons.
    if(embedded){genText.classList.add('icon-btn','gen-icon');genImage.classList.add('icon-btn','gen-icon');}
    actions.append(retry,genText,genImage,remove,quickCopy,copyFeedback);main.append(actions);if(task.generations?.length)main.append(GenFlow.thumbs(task));
    row.append(thumb,main,details);cornerControls(row,remove,quickCopy);row.classList.toggle("export-selected",check.checked);
    root.append(row);
  }
  if(list.length>historyLimit){
    const more=document.createElement('div');more.className='history-more';more.textContent=LanguageUI.text('继续下滑加载更多（剩余 '+(list.length-historyLimit)+' 条）/ Scroll for more ('+(list.length-historyLimit)+' left)');root.append(more);
    historyMoreObserver?.disconnect();historyMoreObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){historyMoreObserver.disconnect();historyLimit+=20;renderHistory();}},{root:embedded?$('historySection'):null,rootMargin:'400px'});historyMoreObserver.observe(more);
  }
  $('historySection').scrollTop=scrollTop;if(!embedded&&Math.abs(scrollY-pageY)>1)window.scrollTo({top:pageY,behavior:'instant'});
}

$("saveSettings").onclick = async () => {
  try {
    const saved = await SourceUI.save();
    $("settingsState").textContent = saved.model ? "已配置 / Configured" : "已保存，请选择模型";
    setStatus("来源设置已保存 / Source saved");
  } catch (error) { setStatus(error.message); }
};
$("file").onchange = async (event) => {
  try { if (event.target.files[0]) { await selectBlob(event.target.files[0]); if (embedded) { document.getElementById("localUploadPane")?.removeAttribute("data-open");await analyze(); } } }
  catch (error) { setStatus(error.message); }
};
$("dropzone").ondragover = (event) => { event.preventDefault(); $("dropzone").classList.add("over"); };
$("dropzone").ondragleave = () => $("dropzone").classList.remove("over");
$("dropzone").ondrop = async (event) => {
  event.preventDefault(); $("dropzone").classList.remove("over");
  try { if (event.dataTransfer.files[0]) { event.stopPropagation(); await selectBlob(event.dataTransfer.files[0]); if(embedded){document.getElementById("localUploadPane")?.removeAttribute("data-open");await analyze();} } }
  catch (error) { setStatus(error.message); }
};
$("analyze").onclick = () => analyze();
let requestDraftDirty=false,requestDraftConflict=false;
function fillRequestSettings(value){const control=RequestControl.normalize(value);for(const id of ['concurrency','requestsPerMinute','timeoutSeconds','maxRetries','batchSize'])$(id).value=control[id];$("autoRetryTimeout").checked=control.autoRetryTimeout;$("maxRetries").disabled=!control.autoRetryTimeout;}
for(const id of ['concurrency','requestsPerMinute','timeoutSeconds','maxRetries','autoRetryTimeout','batchSize'])$(id).addEventListener('input',()=>{requestDraftDirty=true;$("requestSaveStatus").textContent='有未保存的更改 / Unsaved changes';});
chrome.storage.onChanged?.addListener((changes,area)=>{if(area!=='local'||!changes.requestControl)return;if(requestDraftDirty){requestDraftConflict=true;$("requestSaveStatus").textContent='配置已在其他窗口变化；取消后重新载入 / Settings changed elsewhere; discard and reload';}else{fillRequestSettings(changes.requestControl.newValue);RequestControl.configure(changes.requestControl.newValue);setBusy();}});
async function saveRequestSettings() {
  if(requestDraftConflict)throw new Error('请求配置已在其他窗口改变，请取消并重新载入 / Request settings changed elsewhere; discard and reload');
  for(const [id,min,max] of [['concurrency',1,1000],['requestsPerMinute',1,600],['timeoutSeconds',1,600],['maxRetries',0,10],['batchSize',1,4]]){
    const field=$(id),value=Number(field.value);
    if(!field.value.trim()||!Number.isInteger(value)||value<min||value>max){field.focus();throw new Error(`${id}: ${min}–${max}`);}
  }
  const requestControl = RequestControl.normalize({
    concurrency:$("concurrency").value, requestsPerMinute:$("requestsPerMinute").value,
    timeoutSeconds:$("timeoutSeconds").value, autoRetryTimeout:$("autoRetryTimeout").checked, maxRetries:$("maxRetries").value, batchSize:$("batchSize").value
  });
  requestDraftDirty=false;try{await chrome.storage.local.set({requestControl});}catch(error){requestDraftDirty=true;throw error;}RequestControl.configure(requestControl);setBusy();
  // Read back what storage actually holds so the confirmation reflects the saved values, not the form.
  const stored=RequestControl.normalize((await chrome.storage.local.get(['requestControl'])).requestControl);
  $("requestSaveStatus").textContent=`已保存：并发 ${stored.concurrency}，${stored.requestsPerMinute} 次/分钟，超时 ${stored.timeoutSeconds} 秒，每次合并 ${stored.batchSize} 张 / Saved: ${stored.concurrency} parallel, ${stored.requestsPerMinute}/min, ${stored.timeoutSeconds}s timeout, ${stored.batchSize} per request`;
}
$("saveRequestControl").onclick = async () => {try{await saveRequestSettings();}catch(error){$("requestSaveStatus").textContent='保存失败 / Save failed: '+error.message;}};
$("cancelRequestControl").onclick=async()=>{const latest=await chrome.storage.local.get(['requestControl']);fillRequestSettings(latest.requestControl);requestDraftDirty=false;requestDraftConflict=false;$("requestSaveStatus").textContent='更改已取消 / Changes discarded';};
$("autoRetryTimeout").onchange=()=>{$("maxRetries").disabled=!$("autoRetryTimeout").checked;};
$("defaultHistoryOpen").onchange = async () => {
  await chrome.storage.local.set({ defaultHistoryOpen: $("defaultHistoryOpen").checked });
  setStatus("历史列表默认显示设置已保存 / History preference saved");
};
async function saveImageFilter(){
  $("imageMinSize").disabled=!$("filterSmallImages").checked;
  const imageFilter=ImagePromptFilter.configure({enabled:$("filterSmallImages").checked,minSize:$("imageMinSize").value,pinterest:$("filterPinterest").checked});
  $("imageMinSize").value=imageFilter.minSize;
  await chrome.storage.local.set({imageFilter});
  if(embedded)parent.postMessage({type:'PROMPT_IMAGE_FILTER',filter:imageFilter,bridgeToken:new URLSearchParams(location.search).get('bridge')},'*');
  setStatus("小图片过滤设置已保存，请重新采集已打开的批量列表 / Image filter saved; rescan existing batch lists");
}
$("filterPinterest").onchange=saveImageFilter;
$("filterSmallImages").onchange=saveImageFilter;
$("imageMinSize").onchange=saveImageFilter;
$("imageButtonMode").onchange = async () => {
  const imageButtonMode=$("imageButtonMode").value;
  await chrome.storage.local.set({imageButtonMode});
  if(embedded)parent.postMessage({type:'PROMPT_BUTTON_MODE',mode:imageButtonMode},'*');
  setStatus("图片按钮显示模式已保存 / Image button mode saved");
};
$("tabZh").onclick = () => { $("zhGroup").hidden = false; $("enGroup").hidden = true; };
$("tabEn").onclick = () => { $("zhGroup").hidden = true; $("enGroup").hidden = false; };
$("copyZh").onclick = () => CopyUI.copy($("zh").value);
$("copyEn").onclick = () => CopyUI.copy($("en").value);
$("copyCurrent").onclick = () => CopyUI.copy($("zhGroup").hidden ? $("en").value : $("zh").value);

(async () => {
  const settings = await chrome.storage.local.get(["baseUrl", "model", "apiKey", "defaultHistoryOpen", "requestControl", "imageButtonMode"]);
  const imageFilter=await ImagePromptFilter.ready;
  $("filterPinterest").checked=imageFilter.pinterest;$("filterSmallImages").checked=imageFilter.enabled;$("imageMinSize").value=imageFilter.minSize;
  $("imageMinSize").disabled=!imageFilter.enabled;
  $("baseUrl").value = settings.baseUrl || "";
  $("model").value = settings.model || "";
  $("apiKey").value = settings.apiKey || "";
  $("defaultHistoryOpen").checked = settings.defaultHistoryOpen !== false;
  $("imageButtonMode").value = settings.imageButtonMode==='hover'?'hover':'all';
  $("settingsState").textContent = settings.baseUrl && settings.apiKey && settings.model ? "已配置 / Configured" : "尚未配置 / Not configured";
  await SourceUI.init();
  await migrateRecordKinds();await LanguageUI.init();await Cloud.init();await LocalBridge.init();if(!embedded){try{AccountUI.init();SkillsUI.init();}catch(error){console.warn('Account/skills:',error.message);}await ImageGenUI.init().catch(error=>console.warn('ImageGen settings:',error.message));await PromptProfilesUI.init().catch(error=>console.warn('Prompt profiles:',error.message));}
  if(!embedded)chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!['CLI_SUBMIT_IMAGES','CLI_FILTER_IMAGE_URLS'].includes(message.type))return;
    if(sender.id!==chrome.runtime.id){respond({error:'Invalid CLI sender'});return;}
    const operation=message.type==='CLI_FILTER_IMAGE_URLS'?filterCliImages(message.images):submitCliImages(message.command);
    operation.then(respond).catch(error=>respond({error:error.message}));return true;
  });
  const control = RequestControl.configure(settings.requestControl);
  fillRequestSettings(control);
  TaskRecovery.listen();
  if(!embedded)TaskRecovery.resume().catch(error=>console.warn('HoverPrompt recovery:',error.message));
  setBusy();
  if (!embedded) await renderHistory();
  const url = new URL(location.href);
  const imageUrl = url.searchParams.get("image");
  const auto = url.searchParams.get("auto") === "1";
  if (url.searchParams.get("embed") === "1") {
    $("enGroup").hidden = true;
    $("result").querySelector("h2").textContent = "分析结果 / Analysis result";
    $("tabZh").textContent = "中 / ZH";
    $("tabEn").textContent = "EN";
    $("copyCurrent").textContent = "复制 / Copy";
    $("historySection").hidden = settings.defaultHistoryOpen === false;
    document.body.classList.toggle("history-open", !$("historySection").hidden);
    parent.postMessage({ type: "prompt-history-width", open: !$("historySection").hidden }, "*");
    await renderHistory();
    const historyButton = document.createElement("button");
    historyButton.textContent = "◷";historyButton.id = "toggleHistory";
    historyButton.title = "历史 / History";
    historyButton.onclick = async () => {
      $("historySection").hidden = !$("historySection").hidden;
      document.body.classList.toggle("history-open", !$("historySection").hidden);
      parent.postMessage({ type: "prompt-history-width", open: !$("historySection").hidden }, "*");
      await renderHistory();
    };
    document.querySelector("header").append(historyButton);
    const uploadButton = document.createElement("button");
    uploadButton.textContent = "＋";
    uploadButton.id = 'screenshotPage';
    uploadButton.title = "鼠标框选截图 / Select screenshot area";
    uploadButton.onclick = () => {
      if(uploadButton.disabled)return;
      uploadButton.disabled=true;
      const requestId=crypto.randomUUID();
      setStatus('拖动鼠标框选截图，Esc 退出 / Drag to select; Esc to exit');
      async function receive(event){
        if(event.source!==parent||event.data?.type!=='PROMPT_SCREENSHOT_RESULT'||event.data.bridgeToken!==launchParams.get('bridge')||event.data.requestId!==requestId)return;
        window.removeEventListener('message',receive);if(event.data.cancelled){uploadButton.disabled=false;setStatus('已退出截图 / Capture cancelled');return;}
        try{if(event.data.error)throw new Error(event.data.error);if(!/^data:image\/png;base64,/.test(event.data.dataUrl))throw new Error('Invalid screenshot');await selectBlob(await (await fetch(event.data.dataUrl)).blob());await analyze();}catch(error){setStatus(error.message);}finally{uploadButton.disabled=false;}
      }
      window.addEventListener('message',receive);
      parent.postMessage({type:'PROMPT_SCREENSHOT',requestId,bridgeToken:launchParams.get('bridge')},'*');
    };
    document.querySelector("header").append(uploadButton);
    const pane=document.createElement('aside');pane.id='localUploadPane';pane.className='local-upload-pane';
    const dismiss=document.createElement('button');dismiss.textContent='×';dismiss.title='关闭 / Close';dismiss.onclick=()=>pane.removeAttribute('data-open');
    const choose=document.createElement('button');choose.textContent='选择本地图片 / Choose local image';choose.onclick=()=>$('file').click();
    pane.append(dismiss,$('dropzone'),choose);document.body.append(pane);
    const localFile=document.createElement('button');localFile.id='uploadLocalFile';localFile.textContent='▱';localFile.title='本地图片：拖入或选择 / Drop or choose local image';localFile.onclick=()=>pane.toggleAttribute('data-open');document.querySelector('header').append(localFile);

    if (true) {
      $("settings").hidden = true;
      const configure = document.createElement("button");
      configure.textContent = "⚙";configure.id = "openSettings";
      configure.title = "接口设置 / API";
      configure.onclick = () => chrome.runtime.openOptionsPage();
      // sync with the cloud library now (shown while signed in to the cloud account; spins while it runs)
      const syncNow=document.createElement("button");syncNow.id="syncNow";syncNow.title=LanguageUI.text("立即同步云端图库 / Sync with the cloud library now");
      const paintSync=()=>{syncNow.hidden=!(typeof Cloud!=='undefined'&&Cloud.signedIn?.());};paintSync();document.addEventListener('imageprompt-cloud',paintSync);
      syncNow.onclick=async()=>{if(syncNow.classList.contains('busy'))return;syncNow.classList.add('busy');syncNow.setAttribute('aria-busy','true');
       try{const r=await Cloud.sync();syncNow.title=LanguageUI.text('已同步：上传 '+r.uploaded+' 条，下载 '+r.pulled+' 条 / Synced: '+r.uploaded+' up, '+r.pulled+' down');syncNow.classList.add('done');setTimeout(()=>syncNow.classList.remove('done'),1600);}
       catch(e){syncNow.title=e.message;syncNow.classList.add('failed');setTimeout(()=>syncNow.classList.remove('failed'),2400);}
       finally{syncNow.classList.remove('busy');syncNow.removeAttribute('aria-busy');syncNow.setAttribute('aria-label',syncNow.title);}};
      document.querySelector("header").append(syncNow,configure);
      const headerIcons={toggleHistory:'history',uploadLocalFile:'folder',toggleBatch:'batch',screenshotPage:'capture',syncNow:'sync',openSettings:'settings'};
      const iconize=()=>{for(const [id,icon] of Object.entries(headerIcons)){const button=$(id);if(!button||button.dataset.icon)continue;button.dataset.icon=icon;button.setAttribute('aria-label',button.title);button.textContent='';}};
      iconize();new MutationObserver(iconize).observe(document.querySelector("header"),{childList:true});
      // Shift / Ctrl hint (overlay, no layout shift): 0.5 s on the first scroll after the extension loads
      // (remembered in session storage, reset when the extension reloads), then once per checkbox click.
      {let hintTimer=0;const flash=ms=>{const hint=$('selectionHint');if(!hint)return;hint.classList.add('flash');clearTimeout(hintTimer);hintTimer=setTimeout(()=>hint.classList.remove('flash'),ms);};
       const session=chrome.storage.session;let shown=false;
       session?.get(['selectionHintShown']).then(saved=>{shown=shown||!!saved.selectionHintShown;}).catch(()=>{});
       const onScroll=()=>{if(shown){$('historySection').removeEventListener('scroll',onScroll);return;}shown=true;$('historySection').removeEventListener('scroll',onScroll);flash(500);session?.set({selectionHintShown:true}).catch(()=>{});};
       $('historySection').addEventListener('scroll',onScroll,{passive:true});
       $('history').addEventListener('click',event=>{if(event.target.closest('.history-check'))flash(1000);});}
    }
  }
  if(embedded) {
    window.addEventListener('message', event=>{
      if(event.source!==parent || event.data?.type!=='PROMPT_IMAGE' || event.data.bridgeToken!==launchParams.get('bridge'))return;
      loadWebImage(event.data.imageUrl,true,event.data.action).catch(error=>setStatus(error.message));
    });
    parent.postMessage({type:'PROMPT_READY'},'*');
  }
  if(imageUrl) {
    history.replaceState(null,"",location.pathname+(embedded?'?embed=1'+(launchParams.get('bridge')?'&bridge='+encodeURIComponent(launchParams.get('bridge')):''):''));
    await loadWebImage(imageUrl,auto);
  }
})().catch(error=>{setStatus(error.message);if(embedded)parent.postMessage({type:'PROMPT_INIT_FAILED',error:error.message},'*');});

// Originals: Pinterest thumbnails (236x/474x/…) are swapped for /originals/, then /736x/, then the given URL.
// The analysis still uses the 1600px normalized copy; the full file is written to <cache>/originals via the bridge.
const OriginalImages=(()=>{
 function candidates(url){try{const u=new URL(url);
  // X: the same picture at name=orig, then 4096x4096 and large
  if(/(^|\.)twimg\.com$/i.test(u.hostname)&&/^\/media\//.test(u.pathname)){const at=name=>{const v=new URL(u);v.searchParams.set('name',name);return v.toString();};return [...new Set([at('orig'),at('4096x4096'),at('large'),u.toString()])];}
  if(/(^|\.)pinimg\.com$/i.test(u.hostname)){const m=/^\/(?:\d+x\d*|originals)\/(.+)$/.exec(u.pathname);if(m)return [...new Set([u.origin+'/originals/'+m[1],u.origin+'/736x/'+m[1],u.toString()])];}}catch{}return [url];}
 async function enabled(){return (await chrome.storage.local.get(['cacheOriginalImages'])).cacheOriginalImages!==false;}
 async function fetchBest(url,timeoutMs=30000){
  const list=await enabled()?candidates(url):[url];let last=null;
  for(const candidate of list){
   try{const response=await fetch(candidate,{credentials:'omit',signal:AbortSignal.timeout(timeoutMs)});
    if(response.ok){const blob=await response.blob();if(blob.type.startsWith('image/'))return {blob,url:candidate};last=new Error('Not an image');}
    else last=new Error('HTTP '+response.status);}
   catch(error){last=error;}
  }
  throw last||new Error('Image download failed');
 }
 async function save(taskId,blob,sourceUrl){
  if(!blob||!await enabled())return null;
  try{
   const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
   const result=await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'putOriginal',id:taskId,dataUrl});
   const task=await getTask(taskId);if(!task)return null;
   if(result?.ok)task.originalPath=result.path;task.originalUrl=sourceUrl||task.originalUrl;await saveTask(task);return result?.ok?result.path:null;
  }catch{return null;}
 }
 return {candidates,fetchBest,save,enabled};
})();
globalThis.OriginalImages=OriginalImages;

// Library lookup by image URL (Pinterest size variants count as the same picture).
function imageKey(url){try{const u=new URL(url);const m=/^\/(?:\d+x\d*|originals)\/(.+?)(?:\.[a-z0-9]+)?$/i.exec(u.pathname);return /pinimg\.com$/i.test(u.hostname)&&m?'pin:'+m[1]:u.origin+u.pathname;}catch{return String(url||'');}}
async function findTaskByUrl(url){const key=imageKey(url);return (await allTasks()).filter(task=>[task.imageUrl,task.originalUrl].some(value=>value&&imageKey(value)===key)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0]||null;}
// Shortcuts inside extension pages: the hovered library card, or the result card in the floating window.
let hoveredTaskId=null;
document.addEventListener('mouseover',event=>{const item=event.target.closest?.('#history .item');hoveredTaskId=item?.dataset.taskId||(event.target.closest?.('#result,#genResults')?currentId:null);},true);
async function runShortcut(action,{fromParent=false}={}){
  const id=hoveredTaskId;if(!id)return;const task=await getTask(id);if(!task)return;
  const say=text=>setStatus(LanguageUI.text(text));
  if(action==='copy'){const text=LanguageUI.preferred(task)?.prompt||'';if(fromParent){parent.postMessage({type:'PROMPT_SHORTCUT_COPY',text,message:text?'':'没有可复制的提示词 / Nothing to copy',bridgeToken:launchParams.get('bridge')},'*');return;}if(text){await CopyUI.copy(text,document.getElementById('copyFeedback'));say('已复制提示词 / Prompt copied');}else say('没有可复制的提示词 / Nothing to copy');return;}
  if(action==='expand'){if(embedded){showTask(task);say('已打开提示词 / Prompts opened');}else document.querySelector('#history .item[data-task-id="'+CSS.escape(id)+'"] .history-expand')?.click();return;}
  if(action==='reverse'){say('重新反推 / Reverse again');showTask(task);await analyze(task);return;}
  if(action==='generate'){await GenFlow.start(id,'text');return;}
  if(action==='i2i'){await GenFlow.start(id,'image');}
}
document.addEventListener('keydown',event=>{const action=globalThis.ImagePromptShortcuts?.action(event);if(!action||!hoveredTaskId)return;event.preventDefault();runShortcut(action).catch(error=>setStatus(error.message));});
window.addEventListener('message',event=>{if(!embedded||event.source!==parent||event.data?.type!=='PROMPT_SHORTCUT'||event.data.bridgeToken!==launchParams.get('bridge'))return;runShortcut(event.data.action,{fromParent:true}).catch(error=>setStatus(error.message));});

async function loadWebImage(imageUrl, auto, action) {
  try {
    if(action==='open'){const task=await findTaskByUrl(imageUrl);if(task){showTask(task);setStatus(LanguageUI.text('已打开历史提示词 / History prompt opened'));}else setStatus(LanguageUI.text('这张图片还没有提示词，按 R 反推 / No prompt yet; press R to reverse'));return;}
    setStatus("正在读取网页图片 / Loading image…");
    const remote=new URL(imageUrl);
    if(!/^https?:$/.test(remote.protocol))throw new Error("仅支持 HTTP/HTTPS 网页图片，请改用文件上传");
    let best;try{best=await OriginalImages.fetchBest(remote.toString());}catch(error){throw new Error("读取图片失败："+error.message);}
    await selectBlob(best.blob);
    const keepOriginal=async()=>{const id=currentId;if(id)await OriginalImages.save(id,best.blob,best.url);};
    if(action==='image-to-image'){
      // Image-to-image does not need the reverse prompt: queue the analysis and start generating as soon as the record exists.
      const running=analyze();let task=null;
      for(let i=0;i<40&&!task;i++){task=currentId&&await getTask(currentId);if(!task)await new Promise(r=>setTimeout(r,150));}
      if(task){task.imageUrl=task.imageUrl||remote.toString();await saveTask(task);keepOriginal();await GenFlow.start(task.id,'image');}
      await running;return;
    }
    if(auto){await analyze();keepOriginal();}
    // Page mini buttons: reverse then text-to-image, or reverse then image-to-image with this picture as reference.
    if(action==='reverse-generate'){const task=currentId&&await getTask(currentId);if(task){task.imageUrl=task.imageUrl||remote.toString();await saveTask(task);if(task.status==='done')await GenFlow.start(task.id,'text');}}
  }catch(error){setStatus(error.message+"\n可下载图片后从本地选择 / Save and upload the image instead");}
}

// Queued work only lives in the page that scheduled it. After an extension reload or a closed task page,
// IndexedDB keeps those tasks as queued/running forever; re-run the ones no open extension page still owns.
const TaskRecovery=(()=>{
 const channel=globalThis.BroadcastChannel?new BroadcastChannel('imageprompt-tasks'):null;
 const listen=()=>{if(channel)channel.onmessage=event=>{if(event.data?.type==='who-owns'&&Array.isArray(event.data.ids))channel.postMessage({type:'owned',nonce:event.data.nonce,ids:event.data.ids.filter(id=>RequestControl.has(id)||submitting.has(id))});};};
 async function owned(ids){
  if(!channel||!ids.length)return new Set();
  const nonce=crypto.randomUUID(),claimed=new Set(),probe=new BroadcastChannel('imageprompt-tasks');
  probe.onmessage=event=>{if(event.data?.type==='owned'&&event.data.nonce===nonce)event.data.ids.forEach(id=>claimed.add(id));};
  probe.postMessage({type:'who-owns',nonce,ids});await new Promise(resolve=>setTimeout(resolve,800));probe.close();return claimed;
 }
 async function run(){
  const stuck=(await allTasks()).filter(task=>task.image&&['queued','running','retrying'].includes(task.status)&&!RequestControl.has(task.id)&&!submitting.has(task.id)&&!deletedTasks.has(task.id));
  const claimed=await owned(stuck.map(task=>task.id));let resumed=0;
  for(const task of stuck.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))){if(claimed.has(task.id))continue;analyze(task).catch(()=>{});resumed++;}
  if(resumed)console.info('HoverPrompt resumed '+resumed+' interrupted tasks');return resumed;
 }
 const resume=()=>navigator.locks?.request?navigator.locks.request('imageprompt-task-recovery',run):run();
 return {listen,resume,owned};
})();

// Image generation for library records: text-to-image from the reverse prompt, or image-to-image with the record
// image as reference. Results are kept on the record (for display) and written to the output folder via the bridge.
const GenFlow=(()=>{
 let active=0;const waiting=[];
 async function slot(){const {genConcurrency}=await ImageGen.settings();if(active<genConcurrency){active++;return;}await new Promise(resolve=>waiting.push(resolve));active++;}
 function release(){active--;waiting.shift()?.();}
 async function updateGeneration(taskId,generation){
  const task=await getTask(taskId);if(!task||deletedTasks.has(taskId))return null;
  task.generations=[...(task.generations||[]).filter(item=>item.id!==generation.id),generation].sort((a,b)=>a.createdAt-b.createdAt);
  await saveTask(task);return task;
 }
 async function writeToDisk(task,generation){
  // Separate output folder (user choice); needs the native bridge. Without it the image stays in the library only.
  try{
   const {genOutputDir}=await ImageGen.settings();
   if(!task.cacheId){const named=await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'cacheId',id:task.id}).catch(()=>null);if(named?.ok)task.cacheId=named.cacheId;}
   const stem=(task.cacheId||task.id.slice(0,8))+'-'+(generation.mode==='image'?'i2i':'t2i')+'-'+new Date(generation.createdAt).toISOString().replace(/[-:T]/g,'').slice(0,14);
   const result=await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'writeGenerated',dir:genOutputDir||'',name:stem,dataUrl:generation.image,meta:{taskId:task.id,prompt:generation.prompt,model:generation.model,source:generation.sourceName,mode:generation.mode,size:generation.size}});
   return result?.ok?result.path:null;
  }catch{return null;}
 }
 async function start(taskId,mode){
  const task=await getTask(taskId);if(!task)return null;
  const reverse=String(task.prompts?.en||task.en||LanguageUI.preferred(task)?.prompt||'').trim();
  const status=$('historyStatus');
  // Image-to-image: the active i2i profile is the instruction (optionally plus the reverse prompt), original as reference.
  // Text-to-image: the reverse prompt, followed by the active t2i profile text if any.
  const profile=await PromptProfiles.current(mode==='image'?'i2i':'t2i'),extra=PromptProfiles.compose(profile);
  const prompt=(mode==='image'?[extra,profile?.includeReverse||!extra?reverse:''] : [reverse,extra]).filter(Boolean).join('\n\n').trim();
  if(!prompt||(mode!=='image'&&!reverse)){if(status)status.textContent=LanguageUI.text('这条记录还没有提示词，先完成反推 / Reverse the prompt first');return null;}
  const generation={id:crypto.randomUUID(),mode:mode==='image'?'image':'text',status:'queued',createdAt:Date.now(),prompt,profile:profile?.name||'',aspect:profile?.aspect||''};
  await updateGeneration(taskId,generation);await renderHistory();refreshResult(taskId);setStatus('已加入生图队列，可在历史的「生成图」中查看 / Queued; see Generated in history');
  await slot();
  try{
   Object.assign(generation,{status:'running',startedAt:Date.now()});await updateGeneration(taskId,generation);await renderHistory();refreshResult(taskId);
   // URL-mode sources get the high-resolution original when known, else the page image address.
   // image to image starts from the original (cached, or fetched and cached now), the 1600 px copy when there is none
   const reference=generation.mode==='image'?(await originalFor(task))||task.image:null;
   // a hosted copy of the reference (ImgBB, for URL-mode sources) is kept on the record and synced, so the same image is
   // not uploaded again by the next generation or on another device while it has not expired
   const keepHosted=async info=>{task.hostedRef=info;const fresh=await getTask(task.id);if(fresh){fresh.hostedRef=info;await saveTask(fresh);}};
   const result=await ImageGen.route({prompt,image:reference,imageUrl:generation.mode==='image'?task.imageUrl:undefined,originalUrl:generation.mode==='image'?task.originalUrl:undefined,aspect:generation.aspect||undefined,...(generation.mode==='image'?{hosted:task.hostedRef,onHosted:keepHosted}:{})});
   Object.assign(generation,{status:'done',image:result.images[0],model:result.model,sourceName:result.sourceName,size:result.size,runMs:result.runMs,finishedAt:Date.now()});
   generation.path=await writeToDisk(task,generation);
  }catch(error){Object.assign(generation,{status:'failed',error:error.message,finishedAt:Date.now()});}
  finally{release();}
  await updateGeneration(taskId,generation);await renderHistory();refreshResult(taskId);
  if(status)status.textContent=generation.status==='done'?LanguageUI.text('生图完成 / Image generated')+(generation.path?' · '+generation.path:''):LanguageUI.text('生图失败 / Generation failed')+': '+generation.error;
  setStatus(generation.status==='done'?'生图完成，可在历史的「生成图」中查看 / Done; see Generated in history':'生图失败 / Generation failed: '+generation.error);
  return generation;
 }
 // the enlarged image always offers Download and Copy prompt (disabled when the image has no prompt)
 function lightbox(src,caption,{prompt='',name=''}={}){
  const sources=Array.isArray(src)?[...src]:[src];src=sources.shift()||'';
  let box=document.getElementById('imageLightbox');
  if(!box){box=document.createElement('div');box.id='imageLightbox';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.innerHTML='<figure><img alt=""><figcaption></figcaption><div class="lightbox-actions"><button type="button" class="lightbox-download">下载 / Download</button><button type="button" class="lightbox-copy">复制提示词 / Copy prompt</button><button type="button" class="lightbox-copy-image">复制图片 / Copy image</button><button type="button" class="lightbox-share">发布到社区 / Post to community</button></div></figure><button type="button" class="lightbox-close" aria-label="关闭 / Close">×</button>';document.body.append(box);
   const close=()=>{box.hidden=true;};box.onclick=event=>{if(event.target===box||event.target.closest('.lightbox-close'))close();};document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!box.hidden)close();});
   box.querySelector('.lightbox-share').onclick=()=>{const img=box.querySelector('img');globalThis.CommunityShare?.open({images:[img.currentSrc||img.src],prompt:box.dataset.prompt||''});};
   box.querySelector('.lightbox-download').onclick=()=>downloadImage(box.querySelector('img').currentSrc||box.querySelector('img').src,box.dataset.name);
   // the picture itself on the clipboard as PNG (downloaded where the clipboard refuses it)
   box.querySelector('.lightbox-copy-image').onclick=async event=>{const button=event.currentTarget,img=box.querySelector('img'),src=img.currentSrc||img.src;button.disabled=true;
    let text;try{text=(await copyImage(src,box.dataset.name))==='copied'?LanguageUI.text('图片已复制 / Image copied'):LanguageUI.text('无法复制图片，已下载 / Could not copy the image, so it was downloaded');}catch{text=LanguageUI.text('复制失败 / Copy failed');}
    button.textContent=text;button.disabled=false;setTimeout(()=>{button.textContent=LanguageUI.text('复制图片 / Copy image');},1800);};
   box.querySelector('.lightbox-copy').onclick=async event=>{const button=event.currentTarget;try{await navigator.clipboard.writeText(box.dataset.prompt||'');button.textContent=LanguageUI.text('已复制 / Copied');}catch{button.textContent=LanguageUI.text('复制失败 / Copy failed');}setTimeout(()=>{button.textContent=LanguageUI.text('复制提示词 / Copy prompt');},1400);};}
  const img=box.querySelector('img');img.onerror=()=>{const next=sources.shift();if(next)img.src=next;else img.onerror=null;};img.src=src;box.querySelector('figcaption').textContent=caption||'';
  box.dataset.prompt=String(prompt||'').trim();box.dataset.name=name||'';const copy=box.querySelector('.lightbox-copy');copy.disabled=!box.dataset.prompt;copy.textContent=LanguageUI.text('复制提示词 / Copy prompt');box.querySelector('.lightbox-download').textContent=LanguageUI.text('下载 / Download');box.querySelector('.lightbox-copy-image').textContent=LanguageUI.text('复制图片 / Copy image');box.querySelector('.lightbox-copy-image').hidden=!src;box.querySelector('.lightbox-share').textContent=LanguageUI.text('发布到社区 / Post to community');box.querySelector('.lightbox-share').hidden=!globalThis.CommunityShare;box.hidden=false;
 }
 // an image (data:, blob:, extension or web address; the extension may read any site) as PNG on the clipboard: a JPEG or
 // WebP is redrawn on a canvas first, since the clipboard takes PNG only. 'copied', or 'downloaded' when the clipboard
 // refused (or cannot take images); throws when the image cannot be read at all.
 async function copyImage(src,name){
  if(!src)throw new Error('no image');
  const png=(async()=>{const blob=await (await fetch(src)).blob();if(blob.size>25*1024*1024)throw new Error('too large');if(blob.type==='image/png')return blob;
   const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close?.();
   return new Promise((resolve,reject)=>canvas.toBlob(out=>out?resolve(out):reject(new Error('encode')),'image/png'));})();
  png.catch(()=>{});
  if(navigator.clipboard?.write&&globalThis.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);return 'copied';}catch{}}
  await png; // unreadable: nothing to download either
  await downloadImage(src,name);return 'downloaded';
 }
 async function downloadImage(src,name){
  if(!src)return;const ext=/^data:image\/png|\.png(\?|$)/i.test(src)?'png':/^data:image\/webp|\.webp(\?|$)/i.test(src)?'webp':'jpg';
  const file=(String(name||'hoverprompt-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'')).replace(/[\\/:*?"<>|]+/g,'-').replace(/\.(png|jpe?g|webp)$/i,''))+'.'+ext;
  let href=src,revoke=false;if(!src.startsWith('data:')&&!src.startsWith('blob:')){try{href=URL.createObjectURL(await (await fetch(src)).blob());revoke=true;}catch{}}
  const a=document.createElement('a');a.href=href;a.download=file;document.body.append(a);a.click();a.remove();if(revoke)setTimeout(()=>URL.revokeObjectURL(href),5000);
 }
 // up to 3 rows of thumbnails; with more than fit in 3 rows the strip becomes 3 rows that scroll sideways
 const stripRows=typeof ResizeObserver!=='function'?{observe(){}}:new ResizeObserver(entries=>{for(const entry of entries){const strip=entry.target,cell=strip.firstElementChild;if(!cell)continue;const size=cell.getBoundingClientRect().width||48,per=Math.max(1,Math.floor((entry.contentRect.width+6)/(size+6)));strip.classList.toggle('gen-strip-scroll',strip.children.length>per*3);}});
 function strip(generations,{onOpen}={}){
  const box=document.createElement('div');box.className='gen-strip';
  for(const generation of generations){const cell=document.createElement('button');cell.type='button';cell.className='gen-thumb';cell.dataset.status=generation.status;cell.title=[generation.model,generation.error].filter(Boolean).join(' · ');
   if(generation.image){const img=document.createElement('img');img.src=generation.image;img.alt='';img.loading='lazy';cell.append(img);cell.onclick=event=>{event.stopPropagation();onOpen?.(generation);};}
   else{cell.textContent=LanguageUI.text(generation.status==='failed'?'失败 / Failed':'生成中 / Working');cell.disabled=generation.status!=='failed';if(generation.status==='failed')cell.onclick=event=>{event.stopPropagation();lightbox('',generation.error);};}
   box.append(cell);}
  stripRows.observe(box);return box;
 }
 function thumbs(task,{large=false}={}){
  const strip=document.createElement('div');strip.className='gen-strip'+(large?' gen-strip-large':'');stripRows.observe(strip);
  for(const generation of [...(task.generations||[])].reverse()){
   const cell=document.createElement('button');cell.type='button';cell.className='gen-thumb';cell.dataset.status=generation.status;
   const label=(generation.mode==='image'?'图生图 / I2I':'文生图 / T2I');
   cell.title=LanguageUI.text(label)+(generation.model?' · '+generation.model:'')+(generation.error?' · '+generation.error:'');
   if(generation.image){const img=document.createElement('img');img.src=generation.image;img.alt='';cell.append(img);cell.onclick=event=>{event.stopPropagation();lightbox(generation.image,[LanguageUI.text(label),generation.model,generation.size,generation.path].filter(Boolean).join(' · '),{prompt:generation.prompt,name:generation.path?.split(/[\\/]/).pop()||generation.id});};}
   else{cell.textContent=LanguageUI.text(generation.status==='failed'?'失败 / Failed':'生成中 / Working');cell.disabled=generation.status!=='failed';if(generation.status==='failed')cell.onclick=event=>{event.stopPropagation();lightbox('',generation.error);};}
   strip.append(cell);
  }
  return strip;
 }
 function refreshResult(taskId){if(currentId!==taskId)return;getTask(taskId).then(task=>{if(task&&currentId===taskId)showGenerations(task);});}
 function showGenerations(task){
  const host=$('result');if(!host)return;let box=document.getElementById('genResults');
  if(!box){box=document.createElement('div');box.id='genResults';host.append(box);}
  box.replaceChildren();
  const actions=document.createElement('div');actions.className='gen-actions';
  for(const [mode,label] of [['text','生图 / Generate'],['image','图生图 / Image to image']]){const button=document.createElement('button');button.type='button';button.textContent=LanguageUI.text(label);button.onclick=()=>start(task.id,mode);actions.append(button);}
  // Quick switch of the active image-to-image profile (e.g. 真人人设图) right next to the buttons.
  const pick=document.createElement('select');pick.className='gen-profile-pick';pick.title=LanguageUI.text('图生图配置 / Image-to-image profile');
  // The profile picker belongs to 图生图: render them as one split control so it is clear what it configures.
  const split=document.createElement('div');split.className='split-button';split.append(actions.children[1],pick);actions.append(split);
  PromptProfiles.load().then(({profiles,active})=>{for(const p of profiles.filter(x=>x.kind==='i2i'))pick.add(new Option(LanguageUI.text(p.name),p.id));pick.value=active.i2i;});
  pick.onchange=async()=>{const {profiles,active}=await PromptProfiles.load();active.i2i=pick.value;await PromptProfiles.save(profiles,active);};
  box.append(actions);
 }
 return {start,thumbs,strip,lightbox,downloadImage,showGenerations};
})();
globalThis.GenFlow=GenFlow;

// Library "Retry": start failed tasks and tasks stuck as queued/running that no open extension page is processing.
// Scope is the selection, otherwise the filtered list. Tasks already waiting in this page's queue are left alone.
globalThis.retryHistoryTasks=async()=>{
 const status=$('historyStatus'),scope=new Set(globalThis.historySelection?.size?[...historySelection]:HistoryTools.visible());
 const candidates=(await allTasks()).filter(task=>scope.has(task.id)&&task.image&&!deletedTasks.has(task.id)&&['failed','queued','running','retrying'].includes(task.status));
 const local=candidates.filter(task=>RequestControl.has(task.id)||submitting.has(task.id)).length;
 const free=candidates.filter(task=>!RequestControl.has(task.id)&&!submitting.has(task.id));
 const claimed=await TaskRecovery.owned(free.filter(task=>task.status!=='failed').map(task=>task.id));
 const todo=free.filter(task=>!claimed.has(task.id)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
 const busy=local+claimed.size,note=busy?LanguageUI.text('；另有 '+busy+' 个正在排队或处理，已跳过 / ; '+busy+' already queued or running were skipped'):'';
 if(!todo.length){status.textContent=LanguageUI.text('没有需要重试的任务 / Nothing to retry')+note;return;}
 const failed=todo.filter(task=>task.status==='failed').length;
 if(!confirm(LanguageUI.text('立即开始 '+todo.length+' 个任务（失败 '+failed+'，等待或中断 '+(todo.length-failed)+'），会调用已配置的 API。继续？ / Start '+todo.length+' tasks now ('+failed+' failed, '+(todo.length-failed)+' waiting or interrupted)? This calls your configured API.')))return;
 for(const task of todo)analyze(task).catch(()=>{});
 status.textContent=LanguageUI.text('已加入队列 '+todo.length+' 个任务 / Queued '+todo.length+' tasks')+note;
};

let cliSubmitQueue=Promise.resolve();
async function filterCliImages(images){
 if(!Array.isArray(images)||images.length>5000)throw new Error('Invalid search images');
 const known=new Set((await allTasks()).filter(task=>['done','queued','running','retrying'].includes(task.status)&&task.imageUrl).map(task=>task.imageUrl));
 const seen=new Set(),available=[];let skipped=0;
 for(const image of images){
  const url=image?.url;
  if(typeof url!=='string'||!/^https?:\/\//.test(url))continue;
  if(known.has(url)||seen.has(url)){skipped++;continue;}
  seen.add(url);available.push(image);
 }
 return {images:available,skipped};
}
function submitCliImages(command){
 const operation=cliSubmitQueue.then(async()=>{
  const prefs=await chrome.storage.local.get(['localCacheEnabled','cliControlEnabled']);if(!prefs.localCacheEnabled||!prefs.cliControlEnabled)throw new Error('Enable local cache and CLI control in Local CLI settings');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(command?.id||'')||!Array.isArray(command.urls)||command.urls.length>100||!command.urls.length||!Number.isFinite(command.expiresAt))throw new Error('Invalid CLI submission');
  const settings=await SourceUI.getSettings();if(Cloud.mode()==='local'&&!PromptAPI.routeCandidates(settings).length)throw new Error('Configure an enabled API source first');
  const urls=[...new Set(command.urls)];for(const value of urls){if(typeof value!=='string'||!/^https?:$/.test(new URL(value).protocol))throw new Error('Only HTTP/HTTPS image URLs are supported');}
  const knownUrls=new Set(),hashes=new Set(),jobs=[],failed=[];let skipped=0,stopped=false;
  const hash=async image=>'normalized-jpeg-sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image))),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(command.skipDuplicates!==false)for(const task of await allTasks()){if(task.image&&['done','queued','running','retrying'].includes(task.status)){if(task.imageUrl)knownUrls.add(task.imageUrl);hashes.add(task.imageHash||await hash(task.image));}}
  for(let index=0;index<urls.length;index++){
   if(Date.now()>command.expiresAt-2000){stopped=true;break;}
   const url=urls[index],id=command.id+'-'+index,existing=await getTask(id);
   if(existing){jobs.push({id,status:existing.status,reused:true});continue;}
   if(command.skipDuplicates!==false&&knownUrls.has(url)){skipped++;continue;}
   try{
    const best=await OriginalImages.fetchBest(url,Math.max(1,Math.min(30000,command.expiresAt-Date.now()-2000)));
    const image=await imageToDataUrl(best.blob),imageHash=await hash(image),originalImage=await originalImageOf(best.blob,image);
    if(command.skipDuplicates!==false&&hashes.has(imageHash)){skipped++;continue;}
    const task={id,createdAt:Date.now(),image,imageHash,imageUrl:url,focus:String(command.focus||'').slice(0,2000),status:'queued',...(originalImage?{originalImage}:{})};
    await saveTask(task);await LocalBridge.put(task);knownUrls.add(url);hashes.add(imageHash);jobs.push({id,status:'queued'});analyze(task).catch(()=>{});OriginalImages.save(id,best.blob,best.url);
   }catch(error){failed.push({url,error:error.message});}
  }
  await renderHistory();return {accepted:true,jobs,skipped,failed,stopped,note:'Jobs are queued, not completed. Poll local get ID for done/failed.'};
 });cliSubmitQueue=operation.catch(()=>{});return operation;
}
