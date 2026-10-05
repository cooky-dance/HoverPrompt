const Cloud=(()=>{
  // The cloud service address is fixed (not user-editable). Only a local development server (localhost / 127.0.0.1,
  // used by the tests) may override it through storage.
  const CLOUD_URL='https://hoverprompt.com';
  const serviceUrl=value=>{try{const url=new URL(value);return url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)?url.origin:CLOUD_URL;}catch{return CLOUD_URL;}};
  const $=id=>document.getElementById(id);let config={mode:'local',baseUrl:CLOUD_URL,token:''},account=null;
  let syncing=false;const delay=ms=>new Promise(r=>setTimeout(r,ms));
  async function init(){const saved=await chrome.storage.local.get(['cloudConfig']);config={...config,...saved.cloudConfig};config.baseUrl=serviceUrl(config.baseUrl);$('serviceMode').value=config.mode;$('cloudUrl').value=config.baseUrl;$('syncImages').checked=true;
   status().then(async()=>{if(account&&config.mode==='cloud'&&typeof allTasks==='function'&&!(await allTasks()).length)await sync();}).catch(()=>{});}
  function base(){const url=new URL(config.baseUrl);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('服务地址请填写 HTTPS 根地址 / Use an HTTPS service origin');return url.origin;}
  async function save(){config={...config,baseUrl:serviceUrl(config.baseUrl),mode:$('serviceMode').value,syncImages:true};if(config.baseUrl)base();await chrome.storage.local.set({cloudConfig:config});$('cloudStatus').textContent='已保存 / Saved';}
  async function api(path,data){const response=await fetch(base()+'/api'+path,{signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(config.token?{Authorization:'Bearer '+config.token}:{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const value=await response.json();if(!response.ok){const error=new Error(value.error?.message||'Cloud request failed');error.status=response.status;error.code=value.error?.code;throw error;}return value;}
  async function status(){if(!config.baseUrl||!config.token){$('cloudStatus').textContent='离线模式可直接使用个人 API / Local API works without signing in';await chrome.storage.local.remove?.('cloudCredits');account=null;announce();return;}try{account=await api('/me');}catch(error){if(error.status===401){account=null;await chrome.storage.local.remove?.('cloudCredits');announce();}throw error;}const q=account.quota;syncLanguage().catch(()=>{});if(globalThis.AccountUI){$('cloudStatus').textContent='';await chrome.storage.local.set({cloudCredits:globalThis.CreditsBadge?CreditsBadge.fromQuota(q):null});announce();return;}await chrome.storage.local.set({cloudCredits:globalThis.CreditsBadge?CreditsBadge.fromQuota(q):null});announce();$('cloudStatus').textContent=account.user.email+' · '+q.plan+'\n月额度 / Monthly: '+q.monthly.remaining+'/'+q.monthly.limit+' · 赠送 / Gift: '+q.bonus.remaining+' · 空间 / Storage: '+(q.storageBytes/1048576).toFixed(1)+'/'+q.policy.storageMB+' MB'+(q.bonus.expiresAt?'\n赠送到期 / Gift expires: '+new Date(q.bonus.expiresAt).toLocaleDateString():'');}
  function announce(){if(typeof document!=='undefined'&&typeof document.dispatchEvent==='function')document.dispatchEvent(new CustomEvent('imageprompt-cloud',{detail:{account,mode:config.mode}}));}
  async function setMode(mode){config={...config,mode:mode==='cloud'?'cloud':'local'};if($('serviceMode'))$('serviceMode').value=config.mode;await chrome.storage.local.set({cloudConfig:config});announce();}
  async function profile(data){const result=await api('/profile',data);if(account)account.user={...account.user,...result.user};announce();return result.user;}
  // Cloud image generation (the website workbench's /api/generate, paid with cloud credits): one image, the default model,
  // reference images as data URLs. Waits for the result and returns the images as data URLs, like a local source.
  async function generate({prompt,aspect,refs=[],signal,model}={}){
   const started=Date.now(),toData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
   const ratios=['1:1','16:9','9:16','4:3','3:4','3:2','2:3','21:9','9:21'];
   let r=await api('/generate',{prompt:String(prompt||'').slice(0,4000),ratio:ratios.includes(aspect)?aspect:'1:1',count:1,refs:refs.slice(0,10),...(model?{model}:{})}).catch(error=>{if(error.status===502)throw new Error('云端生图服务繁忙，请稍后再试 / Cloud generation is busy');throw error;});
   let g=r.generation;
   while(g.status==='running'){if(signal?.aborted){const e=new Error('Aborted');e.name='AbortError';throw e;}await delay(3000);g=(await api('/generate/'+g.id)).generation;}
   const urls=(g.images||[]).filter(i=>i.url).map(i=>i.url);
   if(g.status!=='done'||!urls.length)throw new Error(g.error||'云端生图失败 / Cloud generation failed');
   const images=[];for(const url of urls){const response=await fetch(base()+url,{headers:{Authorization:'Bearer '+config.token}});if(!response.ok)throw new Error('云端图片下载失败 / Could not download the cloud image');images.push(await toData(await response.blob()));}
   status().catch(()=>{});
   return {images,model:g.modelName||g.model,sourceId:'cloud',sourceName:'HoverPrompt 云端 / Cloud',protocol:'cloud',runMs:Date.now()-started,cost:r.cost};
  }
  // the 7-day Plus trial: once per account, device (this install), browser and network
  async function claimTrial(){const s=await chrome.storage.local.get(['installId']);const installId=s.installId||crypto.randomUUID();if(!s.installId)await chrome.storage.local.set({installId});const quota=await api('/trial/claim',{installId});await status();return quota;}
  // packs are bought on the website's account page (it runs the human check before the payment page)
  async function buyPack(pack,kind='sync'){const url=base()+'/account?buy='+encodeURIComponent(kind+'-'+pack);await chrome.tabs.create({url});return {url};}
  const skills={
   list:(scope='market',q='')=>api('/skills?scope='+encodeURIComponent(scope)+'&q='+encodeURIComponent(q)),
   upload:data=>api('/skills',data),
   importRepo:(repo,path)=>api('/skills/import',{repo,...(path?{path}:{})}),
   remove:id=>api('/skills/'+id+'/delete',{})
  };
  // Device sign-in: the web page (GitHub or email) approves this extension; we poll until a token arrives.
  // While waiting, the profile card shows the code, "open the page again" and "cancel".
  let pending=null;
  async function login(){
   if(pending){await chrome.tabs.create({url:pending.verificationUrl});return;}
   await save();
   const device=await api('/device/start',{label:'HoverPrompt extension',scopes:['analyze','library:read','library:write']});
   pending={userCode:device.userCode,verificationUrl:device.verificationUrl,expiresAt:Date.now()+device.expiresIn*1000,cancelled:false};announce();
   const lang=await uiLanguage();pending.verificationUrl=device.verificationUrl+(lang?'&lang='+encodeURIComponent(lang):'');
   await chrome.tabs.create({url:pending.verificationUrl});$('cloudStatus').textContent='';
   try{
    while(Date.now()<pending.expiresAt&&!pending.cancelled){
     await delay(Math.max(2,device.interval||5)*1000);if(pending.cancelled)break;
     const result=await api('/device/poll',{deviceCode:device.deviceCode});
     if(result.accessToken){config={...config,mode:'cloud',token:result.accessToken,expiresAt:result.expiresAt};await chrome.storage.local.set({cloudConfig:config});pending=null;await status();
      // First sign-in on this device: bring the cloud library down right away.
      sync().catch(error=>{$('cloudStatus').textContent=error.message;});return;}
    }
    if(pending?.cancelled){$('cloudStatus').textContent='已取消登录 / Sign-in cancelled';return;}
    throw new Error('授权已过期，请重新点击“注册或登录” / Authorization expired; start again');
   }finally{pending=null;announce();}
  }
  const cancelLogin=()=>{if(pending)pending.cancelled=true;announce();};
  const reopenLogin=()=>pending&&chrome.tabs.create({url:pending.verificationUrl});
  const loginState=()=>pending&&!pending.cancelled?{userCode:pending.userCode,expiresAt:pending.expiresAt}:null;
  async function analyze(image,focus,signal,requested,onTiming=()=>{},skillId='',skillPart='',recordId='',original=null){
    if(!config.token)throw new Error('请先登录云端账号 / Sign in to cloud');
    const id=crypto.randomUUID(),queued=await api('/jobs',{id,image,...(original?{original}:{}),focus,languages:requested,...(recordId?{recordId}:{}),...(skillId?{skillId,...(skillPart&&skillPart!=='auto'?{skillPart}:{})}:{})});onTiming(queued.timing);
    while(true){if(signal?.aborted)throw new Error('本地已停止等待，云端任务可能继续执行 / Cloud task may continue');await delay(2000);const task=await api('/jobs/'+id);onTiming(task.timing);if(task.status==='done'){await status();return {content:JSON.stringify(task.result),source:{name:'HoverPrompt cloud'+(task.result.skill?' · '+task.result.skill:''),model:task.result.model},cloudId:id};}if(['failed','cancelled'].includes(task.status)){await status();throw new Error(task.error||task.status);}}
  }
  // Record images always sync: the full-size original when there is one and "sync originals" is on (the default),
  // otherwise the 1600 px copy. With "sync generated images" on, generated images go up too: as made with originals on,
  // else JPEG ≤ 1600 px; about 20 MB per request, the rest follows on the next sync. Pulled records keep local generated images.
  const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
  async function compactImage(dataUrl){
   try{if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')return dataUrl;
    const bitmap=await createImageBitmap(await (await fetch(dataUrl)).blob()),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return await blobToDataUrl(await canvas.convertToBlob({type:'image/jpeg',quality:0.85}));}
   catch{return dataUrl;}
  }
  async function download(path){const response=await fetch(base()+path,{headers:{Authorization:'Bearer '+config.token}});return response.ok?blobToDataUrl(await response.blob()):'';}
  async function sync(){
    if(syncing)throw new Error('同步正在进行 / Sync is running');if(!config.token)throw new Error('请先登录 / Sign in first');syncing=true;
    try{
      await status();const userId=account.user.id,key='cloudSync:'+userId,saved=await chrome.storage.local.get([key]),state={cursor:0,revisions:{},fingerprints:{},deleted:[],genUploaded:{},...saved[key]};let conflicts=0,uploaded=0,pulled=0;
      const withGenerations=config.syncGenerations===true,originals=config.syncOriginals!==false;
      const limit=account.quota?.sync?.limit??Infinity,tasks=(await allTasks()).filter(task=>!['queued','running','retrying'].includes(task.status)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,limit),conflictIds=new Set();
      for(const task of tasks){
        // the shared sync fields (see the plugin docs, "Sync fields"); local-only fields such as file paths stay on this device
        const record={id:task.id,kind:globalThis.RecordKinds?RecordKinds.kindOf(task):task.kind,source:task.source,plugin:task.plugin,params:task.params||task.studio,createdAt:task.createdAt,zh:task.zh,en:task.en,prompts:task.prompts,focus:task.focus,status:task.status,error:task.error,sourceUrl:task.sourceUrl,timing:task.timing};
        const finished=(task.generations||[]).filter(g=>['done','failed'].includes(g.status)),sent=new Set(state.genUploaded[task.id]||[]),genImages={};
        const original=originals&&task.originalImage||null,sendImage=task.image&&(state.fingerprints[task.id]===undefined||!state.imageSent?.[task.id]||original&&!state.originalSent?.[task.id]),imagePayload=sendImage?original||task.image:null;let budget=20*1024*1024-(imagePayload?.length||0);
        if(withGenerations){
         record.generations=finished.map(({id,mode,status,prompt,model,size,profile,error,createdAt,runMs,sourceName,aspect,references,n,job,skill,conversationUrl,refName,chatgptName,chatgptFileId})=>({id,mode,status,prompt,model,size,profile,error,createdAt,runMs,sourceName,aspect,references,n,job,skill,conversationUrl,refName,chatgptName,chatgptFileId}));
         for(const g of finished)if(g.image&&!sent.has(g.id)){let image=originals&&g.image.length<=15*1024*1024?g.image:await compactImage(g.image);if(image.length>budget&&Object.keys(genImages).length)break;if(image.length>budget)image=await compactImage(g.image);if(image.length>budget)break;budget-=image.length;genImages[g.id]=image;}
        }
        const fingerprint=JSON.stringify(record)+(task.image?task.image.length+':'+task.image.slice(-32):'')+(withGenerations?'|'+finished.filter(g=>g.image).map(g=>g.id).filter(id=>!sent.has(id)&&!genImages[id]).join(','):'');
        if(state.fingerprints[task.id]===fingerprint&&!Object.keys(genImages).length)continue;
        try{const result=await api('/records',{record,baseRevision:state.revisions[task.id]||0,...(imagePayload?{image:imagePayload}:{}),...(Object.keys(genImages).length?{genImages}:{})});
         state.revisions[task.id]=result.revision;state.fingerprints[task.id]=fingerprint;(state.imageSent||={})[task.id]=true;if(original&&imagePayload===original)(state.originalSent||={})[task.id]=true;state.genUploaded[task.id]=[...sent,...Object.keys(genImages)];uploaded++;}
        catch(e){if(e.status===409){conflicts++;conflictIds.add(task.id);continue;}throw e;}
      }
      for(const deletion of state.deleted||[]){try{const result=await api('/records',{record:{id:deletion.id},deleted:true,baseRevision:deletion.revision});state.revisions[deletion.id]=result.revision;state.deleted=state.deleted.filter(x=>x.id!==deletion.id);}catch(e){if(e.status===409){conflicts++;conflictIds.add(deletion.id);continue;}throw e;}}
      let more=true;while(more){const page=await api('/records?after='+state.cursor);for(const record of page.records){
        if(conflictIds.has(record.id))continue;
        const existing=await getTask(record.id);
        if(state.revisions[record.id]&&record.revision<=state.revisions[record.id])continue;
        // Evicted = the cloud dropped its copy (outside the latest-N limit); the local record stays.
        if(record.deleted&&record.evicted){delete state.fingerprints[record.id];delete state.revisions[record.id];continue;}
        if(record.deleted){await dbCall('readwrite',store=>store.delete(record.id));delete state.fingerprints[record.id];}
        else {
         const image=record.hasImage&&!existing?.image?await download('/api/images/'+record.id):existing?.image||'';
         // Generated images: keep local ones, download the ones only the cloud has.
         const local=new Map((existing?.generations||[]).map(g=>[g.id,g]));const generations=[...local.values()];
         for(const g of record.generations||[]){if(local.has(g.id)){if(g.model)local.get(g.id).model=g.model;continue;}const {imageHash,...meta}=g;const genImage=imageHash?await download('/api/images/'+record.id+'?gen='+encodeURIComponent(g.id)):'';generations.push({...meta,...(genImage?{image:genImage}:{})});}
         const {revision,deleted,evicted,hasImage,updatedAt,generations:_,...fields}=record;
         await saveTask({...existing,...fields,image,generations:generations.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))});pulled++;if(record.hasImage)(state.imageSent||={})[record.id]=true;
        }
        state.revisions[record.id]=record.revision;
      }state.cursor=page.cursor;more=page.hasMore;await chrome.storage.local.set({[key]:state});}
      await chrome.storage.local.set({[key]:state});await renderHistory();await status();
      $('cloudStatus').textContent='同步完成 / Synced'+(Number.isFinite(limit)?' · 云端保留最近 '+limit+' 条 / Cloud keeps the latest '+limit:'')+(conflicts?' · 冲突保留本地，未覆盖 / Local conflicts kept: '+conflicts:'');
      return {uploaded,pulled,conflicts};
    }finally{syncing=false;}
  }
  // The account remembers the extension's interface language, so the web page opens in the same language.
  async function uiLanguage(){const {uiLanguage:value}=await chrome.storage.local.get(['uiLanguage']);return ['en','zh-CN','ru','ja','ko','hi','ar'].includes(value)?value:null;}
  async function syncLanguage(){const lang=await uiLanguage();if(lang&&account&&account.user.lang!==lang){await api('/profile',{lang});account.user.lang=lang;}}
  const usage=(days=14)=>api('/usage?days='+days);
  // Public plan allowances and Stripe prices (same data as the web pricing page).
  const pricing=()=>api('/pricing');
  async function setSyncGenerations(on){config={...config,syncGenerations:!!on};await chrome.storage.local.set({cloudConfig:config});announce();}
  async function setSyncOriginals(on){config={...config,syncOriginals:!!on};await chrome.storage.local.set({cloudConfig:config});announce();}
  async function deleted(id){if(!account)return;const key='cloudSync:'+account.user.id,saved=await chrome.storage.local.get([key]),state=saved[key];if(!state?.revisions[id])return;state.deleted=[...(state.deleted||[]).filter(x=>x.id!==id),{id,revision:state.revisions[id]}];await chrome.storage.local.set({[key]:state});}
  const mode=()=>config.mode;
  const bind=(id,fn)=>$(id).onclick=async()=>{const button=$(id);button.disabled=true;try{await fn();}catch(e){$('cloudStatus').textContent=e.message;}finally{button.disabled=false;}};
  bind('saveCloud',save);bind('cloudLogin',login);bind('refreshCloud',status);bind('syncCloud',sync);
  bind('cloudAccount',async()=>{await save();await chrome.tabs.create({url:base()+'/account?view=account'});});
  bind('claimGift',async()=>{const s=await chrome.storage.local.get(['installId']);const installId=s.installId||crypto.randomUUID();if(!s.installId)await chrome.storage.local.set({installId});await api('/install/claim',{installId});await status();});
  bind('cloudLogout',async()=>{config.token='';account=null;await chrome.storage.local.set({cloudConfig:config});await chrome.storage.local.remove?.('cloudCredits');announce();$('cloudStatus').textContent='已退出此设备 / Signed out locally; revoke token in account page';});
  return {init,analyze,mode,deleted,sync,status,setMode,profile,buyPack,claimTrial,generate,skills,account:()=>account,signedIn:()=>!!(config.token&&account),usage,pricing,syncGenerations:()=>config.syncGenerations===true,setSyncGenerations,syncOriginals:()=>config.syncOriginals!==false,setSyncOriginals,login,cancelLogin,reopenLogin,loginState,base:()=>{try{return base();}catch{return '';}}};
})();
