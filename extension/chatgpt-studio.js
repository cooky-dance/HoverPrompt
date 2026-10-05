// ChatGPT image studio (extension page). Drives up to 10 chatgpt.com conversations, each in a background tab of one
// minimized window. A run's total is split evenly over the conversations (21 over 4 → 5, 5, 5, 6); each conversation sends
// one message that starts with n=<its share> (at most 10 per message, so a larger share becomes several messages) and waits
// for it to finish before sending the next. References and an optional skill (.md) go with each conversation's first
// message. Each run is one library record; with the local cache on, the original images are also written to disk with
// their prompt (without the n= line) so the CLI can read and download them.
(()=>{
 const $=id=>document.getElementById(id);
 let zh=true;const t=(cn,en)=>zh?cn:en;const T=pair=>{const [cn,en]=String(pair).split('|');return zh?cn:(en??cn);};
 const RATIOS=['9:21','9:16','2:3','3:4','4:5','1:1','5:4','4:3','3:2','16:9','21:9'],ORIENT={portrait:'2:3',square:'1:1',landscape:'3:2'};
 const HOME='https://chatgpt.com/',UPLOAD_WINDOW=3*3600000,UPLOAD_CAP=80,MAX_N=10,PAGE=20;
 const CLOUD_URL='https://hoverprompt.com';
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 let settings={ratio:'1:1',count:4,sessions:4,project:'',merge:true,maxRounds:10,everyRef:false,prefix:'',skill:'',thinking:true,libraryFolder:'',mention:true,rate:0,windowMode:'window'};
 let prefixes=[],skills=[],limits={maxFiles:10,maxImageMB:20},refs=[],sessions=[],workerWindow=null,batches=[],shown=PAGE,allRecords=[];

 // ---- language, appearance: the shared plugin kit (plugin-kit.js) ----
 function applyLanguage(){PluginKit.translate();document.title='Companion Studio · HoverPrompt';}
 if($('appearance'))$('appearance').onclick=()=>PluginKit.setAppearance(document.documentElement.dataset.appearance==='dark'?'light':'dark');
 function notice(text,kind='error'){const n=$('notice');n.hidden=!text;n.textContent=text||'';n.className='notice'+(kind==='info'?' info':'');}

 // ---- the split: total over conversations, n per message ----
 function plan(total,sessionCount){
  const used=Math.max(1,Math.min(sessionCount,total)),base=Math.floor(total/used),extra=total%used,out=[];
  for(let i=0;i<used;i++){const share=base+(i>=used-extra?1:0),messages=Math.ceil(share/MAX_N);for(let m=0;m<messages;m++)out.push({target:i,n:Math.floor(share/messages)+(m<share%messages?1:0)});}
  return {used,shares:Array.from({length:used},(_,i)=>base+(i>=used-extra?1:0)),messages:out};
 }
 function renderPlan(){const p=plan(settings.count,settings.sessions);$('plan').hidden=false;$('plan').textContent=t(p.used+' 个会话：','Conversations: '+p.used+' — ')+p.shares.join(' + ')+t(' 张',' images')+(p.messages.length>p.used?t('（超过 10 张的会话分多条发送）',' (shares over 10 are sent as several messages)'):'');}

 // ---- settings ----
 const save=()=>chrome.storage.local.set({cgptStudio:settings});
 function ratioSize(ratio){const [w,h]=ratio.split(':').map(Number),scale=Math.min(96/w,80/h);return [Math.round(w*scale),Math.round(h*scale)];}
 function renderSettings(){
  const [w,h]=ratioSize(settings.ratio);$('ratioBox').style.width=w+'px';$('ratioBox').style.height=h+'px';$('ratioText').textContent=settings.ratio.replace(':',' : ');
  $('ratioSlider').max=String(RATIOS.length-1);$('ratioSlider').value=String(Math.max(0,RATIOS.indexOf(settings.ratio)));$('ratioSlider').setAttribute('aria-valuetext',settings.ratio);
  const [a,b]=settings.ratio.split(':').map(Number),orientation=a===b?'square':a<b?'portrait':'landscape';
  $('orientation').replaceChildren(...[['portrait','竖图|Portrait'],['square','方图|Square'],['landscape','横图|Landscape']].map(([id,label])=>{const btn=document.createElement('button');btn.type='button';btn.textContent=T(label);btn.setAttribute('aria-pressed',String(orientation===id));btn.onclick=()=>{settings.ratio=ORIENT[id];save();renderSettings();};return btn;}));
  $('ratioTicks').replaceChildren(...['9:16','3:4','1:1','4:3','16:9'].map(r=>{const btn=document.createElement('button');btn.type='button';btn.textContent=r;btn.style.left=(RATIOS.indexOf(r)/(RATIOS.length-1)*100)+'%';btn.setAttribute('aria-pressed',String(settings.ratio===r));btn.onclick=()=>{settings.ratio=r;save();renderSettings();};return btn;}));
  $('count').value=String(settings.count);$('countOut').textContent=String(settings.count);
  $('sessionCount').value=String(settings.sessions);$('sessionOut').textContent=String(settings.sessions);
  $('rate').value=String(settings.rate||0);$('windowMode').value=settings.windowMode==='tabs'?'tabs':'window';
  $('project').value=settings.project||'';$('libraryFolder').value=settings.libraryFolder||'';$('mention').checked=settings.mention!==false;$('thinking').checked=settings.thinking!==false;$('merge').checked=!!settings.merge;$('maxRounds').value=String(settings.maxRounds);$('roundsOut').textContent=String(settings.maxRounds);$('roundsField').hidden=!settings.merge;$('everyRef').checked=!!settings.everyRef;
  $('prefix').replaceChildren(new Option(t('不用前缀','No prefix'),''),...prefixes.map(p=>new Option(p.name||String(p.text).slice(0,20),p.id)));$('prefix').value=prefixes.some(p=>p.id===settings.prefix)?settings.prefix:'';
  renderSkills();renderPlan();renderGenerate();
 }
 $('ratioSlider').oninput=()=>{settings.ratio=RATIOS[Number($('ratioSlider').value)]||'1:1';save();renderSettings();};
 $('count').oninput=()=>{settings.count=Number($('count').value);$('countOut').textContent=String(settings.count);save();renderPlan();renderGenerate();};
 $('sessionCount').oninput=()=>{settings.sessions=Number($('sessionCount').value);$('sessionOut').textContent=String(settings.sessions);save();renderPlan();};
 $('project').onchange=()=>{const value=$('project').value.trim();if(value&&!projectUrl(value)){notice(t('项目链接应是 chatgpt.com 上的项目地址，例如 https://chatgpt.com/g/g-p-…/project','The project link should be a chatgpt.com project address, like https://chatgpt.com/g/g-p-…/project'));return;}notice('');settings.project=value?projectUrl(value):'';$('project').value=settings.project;save();};
 $('rate').onchange=()=>{settings.rate=Math.max(0,Math.min(120,Math.floor(Number($('rate').value)||0)));$('rate').value=String(settings.rate);save();};
 $('windowMode').onchange=()=>{settings.windowMode=$('windowMode').value==='tabs'?'tabs':'window';save();};
 $('thinking').onchange=()=>{settings.thinking=$('thinking').checked;save();};
 $('mention').onchange=()=>{settings.mention=$('mention').checked;save();};
 $('libraryFolder').onchange=()=>{const value=$('libraryFolder').value.trim();if(value&&!folderUrl(value)){notice(t('资料库文件夹链接应形如 https://chatgpt.com/library/d/…?tab=folders','A library folder link looks like https://chatgpt.com/library/d/…?tab=folders'));return;}notice('');settings.libraryFolder=value?folderUrl(value):'';$('libraryFolder').value=settings.libraryFolder;save();for(const ref of refs)ref.failed=false;if(skillFile)skillFile.failed=false;preUpload();};
 function folderUrl(value){try{const url=new URL(value);if(url.protocol!=='https:'||!['chatgpt.com','chat.openai.com'].includes(url.hostname)||!url.pathname.startsWith('/library'))return '';return 'https://chatgpt.com'+url.pathname+url.search;}catch{return '';}}
 $('merge').onchange=()=>{settings.merge=$('merge').checked;$('roundsField').hidden=!settings.merge;save();};
 $('maxRounds').oninput=()=>{settings.maxRounds=Number($('maxRounds').value);$('roundsOut').textContent=String(settings.maxRounds);save();};
 $('everyRef').onchange=()=>{settings.everyRef=$('everyRef').checked;save();};
 $('prefix').onchange=()=>{settings.prefix=$('prefix').value;save();};
 $('skill').onchange=()=>{settings.skill=$('skill').value;save();prepareSkill();renderAttachments();};
 function projectUrl(value){try{const url=new URL(value);if(url.protocol!=='https:'||!['chatgpt.com','chat.openai.com'].includes(url.hostname)||!/^\/g\/g-p-[\w-]+/.test(url.pathname))return '';return 'https://chatgpt.com'+url.pathname.match(/^\/g\/g-p-[\w-]+/)[0]+'/project';}catch{return '';}}
 $('settingsToggle').onclick=()=>{const open=$('settings').hidden;$('settings').hidden=!open;$('settingsToggle').setAttribute('aria-expanded',String(open));};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('settings').hidden){$('settings').hidden=true;$('settingsToggle').setAttribute('aria-expanded','false');}});
 // a click outside the settings card, on something that is not a control, puts the card away
 const closeSettings=()=>{$('settings').hidden=true;$('settingsToggle').setAttribute('aria-expanded','false');};
 document.addEventListener('pointerdown',event=>{
  if($('settings').hidden||event.button!==0)return;const target=event.target;
  if($('settings').contains(target)||$('settingsToggle').contains(target))return;
  if(target.closest('button,a,input,select,textarea,label,summary,dialog,[role="button"],[role="option"],[contenteditable="true"],[tabindex]'))return;
  closeSettings();
 });

 // ---- skills: local profiles and the account's own skills, uploaded as one .md file ----
 const cloudBase=config=>{try{const url=new URL(config?.baseUrl||'');return url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)?url.origin:CLOUD_URL;}catch{return CLOUD_URL;}};
 async function cloudApi(path){const {cloudConfig}=await chrome.storage.local.get(['cloudConfig']);if(!cloudConfig?.token)throw new Error(t('未登录 HoverPrompt 账号','Not signed in to HoverPrompt'));const response=await fetch(cloudBase(cloudConfig)+'/api'+path,{headers:{Authorization:'Bearer '+cloudConfig.token},signal:AbortSignal.timeout(15000)});const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.error?.message||'HTTP '+response.status);return value;}
 async function loadSkills(){
  const list=[];
  if(globalThis.PromptProfiles){const {profiles}=await PromptProfiles.load();for(const p of profiles)if(PromptProfiles.compose(p).trim())list.push({value:'local:'+p.id,group:'local',name:p.name.split(' / ')[zh?0:1]||p.name,kind:p.kind});}
  try{const {skills:mine=[]}=await cloudApi('/skills?scope=mine');for(const s of mine)list.push({value:'cloud:'+s.id,group:'cloud',name:s.name});
   const {activeCloudSkill}=await chrome.storage.local.get(['activeCloudSkill']);if(activeCloudSkill?.id&&!list.some(s=>s.value==='cloud:'+activeCloudSkill.id))list.push({value:'cloud:'+activeCloudSkill.id,group:'cloud',name:activeCloudSkill.name+t('（当前使用）',' (in use)')});}
  catch{}
  skills=list;renderSkills();
 }
 function renderSkills(){
  const select=$('skill'),kinds={reverse:t('反推','Reverse'),i2i:t('图生图','Image to image'),t2i:t('文生图','Text to image')};
  select.replaceChildren(new Option(t('不用 Skill','No skill'),''));
  for(const [group,label] of [['local',t('本地配置','Local profiles')],['cloud',t('账号 Skill','Account skills')]]){const items=skills.filter(s=>s.group===group);if(!items.length)continue;const og=document.createElement('optgroup');og.label=label;for(const s of items)og.append(new Option((s.kind?kinds[s.kind]+' · ':'')+s.name,s.value));select.append(og);}
  select.value=skills.some(s=>s.value===settings.skill)?settings.skill:'';renderAttachments();
 }
 const utf8Base64=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);};
 const fileName=name=>(String(name||'skill').replace(/[\\/:*?"<>|\s]+/g,'-').slice(0,60)||'skill')+'.md';
 // ---- files in ChatGPT's library: named after their content (ip-ref-<hash>.png, ip-skill-<hash>.md), so one image keeps one
 // name, is uploaded once, and later messages refer to it with @name; cgptFiles remembers what is already uploaded ----
 let registry={},skillFile=null,libraryTab=null,uploading=false;
 async function identity(dataUrl,kind){
  const bytes=Uint8Array.from(atob(dataUrl.split(',')[1]||''),c=>c.charCodeAt(0)),digest=await crypto.subtle.digest('SHA-256',bytes);
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,12);
  const extension=kind==='skill'?'md':/^data:image\/png/.test(dataUrl)?'png':/^data:image\/webp/.test(dataUrl)?'webp':/^data:image\/gif/.test(dataUrl)?'gif':'jpg';
  return 'ip-'+kind+'-'+hash+'.'+extension;
 }
 async function loadRegistry(){registry=(await chrome.storage.local.get(['cgptFiles'])).cgptFiles||{};}
 async function remember(names,via){if(!names.length)return;const now=Date.now();for(const name of names)registry[name]={via,uploadedAt:now,folder:via==='library'?settings.libraryFolder:undefined};await chrome.storage.local.set({cgptFiles:registry});renderAttachments();}
 const inLibrary=name=>!!registry[name];
 async function prepareSkill(){skillFile=null;if(!settings.skill)return;try{const skill=await resolveSkill(settings.skill);skillFile={...skill,filename:await identity(skill.dataUrl,'skill')};renderAttachments();preUpload();}catch{}}
 const tick=(()=>{let worker=null,sequence=0;const waiting=new Map();try{worker=new Worker('timer-worker.js');worker.onmessage=({data})=>{const fn=waiting.get(data);waiting.delete(data);fn?.();};}catch{}
  // worker timers keep their pace while this tab is in the background
  return ms=>new Promise(resolve=>{if(!worker)return setTimeout(resolve,ms);const id=++sequence;waiting.set(id,resolve);worker.postMessage({id,ms});});})();
 async function libraryTabReady(){
  if(libraryTab!=null){try{const tab=await chrome.tabs.get(libraryTab);if(!String(tab.url).startsWith(settings.libraryFolder.split('?')[0]))await chrome.tabs.update(libraryTab,{url:settings.libraryFolder});}catch{libraryTab=null;}}
  if(libraryTab==null){libraryTab=(await openTab(settings.libraryFolder)).id;await saveWorkers();}
  for(let i=0;i<60;i++){try{if(await chrome.tabs.sendMessage(libraryTab,{type:'CGPT_PING'}))return true;}catch{}await tick(1000);}
  return false;
 }
 // as soon as a reference or the skill is added: upload whatever the library does not have yet to the chosen folder
 async function preUpload(){
  if(uploading||!settings.libraryFolder)return;uploading=true;
  try{for(let round=0;round<5;round++){
   const pending=[...refs.filter(r=>r.name&&!inLibrary(r.name)&&!r.failed&&!(r.alias&&!r.aliasFailed)).map(r=>({item:r,name:r.name,dataUrl:r.src})),...(skillFile&&!inLibrary(skillFile.filename)&&!skillFile.failed?[{item:skillFile,name:skillFile.filename,dataUrl:skillFile.dataUrl}]:[])];
   if(!pending.length)break;
   for(const file of pending)file.item.uploading=true;renderAttachments();
   let result;if(!(await libraryTabReady()))result={ok:false,error:t('资料库文件夹页面打不开','Could not open the library folder')};
   else result=await chrome.tabs.sendMessage(libraryTab,{type:'CGPT_LIBRARY_UPLOAD',files:pending.map(f=>({name:f.name,dataUrl:f.dataUrl}))}).catch(error=>({ok:false,error:error.message}));
   const done=result?.uploaded||[];for(const file of pending){file.item.uploading=false;if(!done.includes(file.name))file.item.failed=true;}
   await remember(done,'library');if(done.length)await uploads(done.length);
   if(!result?.ok||result.missing?.length)notice(result?.login?t('请在会话窗口登录 ChatGPT 后再上传（右侧「去登录」）。','Sign in to ChatGPT in the conversation window first.'):t('有文件没有传进资料库，生成时会直接上传：','Some files did not reach the library; they will be uploaded with the message: ')+(result?.error||result?.missing?.join(', ')||''),'info');
   renderAttachments();
  }}finally{uploading=false;}
 }
 async function resolveSkill(value){
  if(!value)return null;
  if(value.startsWith('local:')){const {profiles}=await PromptProfiles.load();const p=profiles.find(x=>'local:'+x.id===value);const text=p?PromptProfiles.compose(p).trim():'';if(!text)throw new Error(t('找不到这个本地配置','Local profile not found'));const name=p.name.split(' / ')[0];return {name,filename:fileName(name),dataUrl:'data:text/markdown;base64,'+utf8Base64(text)};}
  const file=await cloudApi('/skills/'+encodeURIComponent(value.slice(6))+'/file');return {name:file.name,filename:file.filename||fileName(file.name),dataUrl:'data:text/markdown;base64,'+utf8Base64(file.content)};
 }

 // ---- prompt ----
 const prompt=$('prompt');
 const grow=()=>{prompt.style.height='auto';prompt.style.height=Math.min(200,prompt.scrollHeight)+'px';};
 prompt.addEventListener('input',grow);
 prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();generate();}});
 // the stored prompt: everything except the n= line
 function body(text,skill){const head=String(prefixes.find(p=>p.id===settings.prefix)?.text||'').trim();return [skill?t('请按照附件 '+skill.filename+' 中的要求生成图片。','Follow the instructions in the attached '+skill.filename+'.'):'',head,String(text||'').trim(),t('画面比例 '+settings.ratio+'。','Aspect ratio '+settings.ratio+'.')].filter(Boolean).join('\n');}
 const messageText=(batch,n)=>[n>1?'n='+n:'',batch.body].filter(Boolean).join('\n');

 // ---- references and the skill file: picker, Ctrl+V, drop; drag or Alt+Arrow to reorder ----
 const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
 const fileSlots=()=>limits.maxFiles-(settings.skill?1:0);
 async function addFiles(files){
  const images=[...files].filter(f=>/^image\/(png|jpeg|webp|gif)$/.test(f.type));let skipped=0,large=0;
  for(const file of images){if(refs.length>=fileSlots()){skipped++;continue;}if(file.size>limits.maxImageMB*1048576){large++;continue;}const src=await readFile(file);refs.push({id:crypto.randomUUID(),src,name:await identity(src,'ref')});}
  const parts=[];if(skipped)parts.push(t('每条消息最多 '+limits.maxFiles+' 个文件（含 Skill），已跳过 '+skipped+' 张','At most '+limits.maxFiles+' files per message (skill included); skipped '+skipped));if(large)parts.push(t(large+' 张超过 '+limits.maxImageMB+' MB','over '+limits.maxImageMB+' MB: '+large));
  notice(parts.join(t('；','; ')));renderAttachments();preUpload();
 }
 $('refInput').onchange=async event=>{await addFiles(event.target.files);event.target.value='';};
 document.addEventListener('paste',event=>{const files=[...(event.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(!files.length)return;event.preventDefault();addFiles(files);});
 const dock=document.querySelector('.dock');
 dock.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();$('composer').classList.add('drop');}});
 dock.addEventListener('dragleave',event=>{if(!dock.contains(event.relatedTarget))$('composer').classList.remove('drop');});
 dock.addEventListener('drop',event=>{$('composer').classList.remove('drop');if(event.dataTransfer.files.length){event.preventDefault();addFiles(event.dataTransfer.files);}});
 function moveRef(from,to){if(to<0||to>=refs.length||from===to)return;const [item]=refs.splice(from,1);refs.splice(to,0,item);renderAttachments();document.querySelector('.ref[data-index="'+to+'"]')?.focus();}
 function renderAttachments(){
  const box=$('attachments');box.replaceChildren();let dragFrom=-1;
  refs.forEach((ref,i)=>{
   const item=document.createElement('div');item.className='ref';item.draggable=true;item.tabIndex=0;item.dataset.index=String(i);item.setAttribute('aria-label',t('参考图 '+(i+1)+'，Alt+方向键调整顺序','Reference '+(i+1)+', Alt+Arrow keys to reorder'));
   const img=document.createElement('img');img.src=ref.src;img.alt='';const n=document.createElement('b');n.textContent=String(i+1);
   const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label',t('移除','Remove'));x.onclick=()=>{refs.splice(i,1);renderAttachments();};
   const state=ref.alias&&!ref.aliasFailed||ref.name&&inLibrary(ref.name)?'library':ref.uploading?'uploading':ref.failed?'failed':'';if(state){const badge=document.createElement('span');badge.className='state '+state;badge.textContent=state==='library'?'@':state==='uploading'?'…':'!';badge.title=state==='library'?t('已在 ChatGPT 资料库，会用 @'+(ref.alias&&!ref.aliasFailed?ref.alias:ref.name)+' 引用','In the ChatGPT library; referred to as @'+(ref.alias&&!ref.aliasFailed?ref.alias:ref.name)):state==='uploading'?t('正在上传到资料库','Uploading to the library'):t('没有传进资料库，生成时会直接上传','Not in the library; uploaded with the message');item.append(badge);}
   item.title=ref.name||'';item.append(img,n,x);
   item.ondragstart=event=>{dragFrom=i;item.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(i));};
   item.ondragend=()=>item.classList.remove('dragging');
   item.ondragover=event=>{if(dragFrom<0)return;event.preventDefault();event.stopPropagation();item.classList.add('over');};
   item.ondragleave=()=>item.classList.remove('over');
   item.ondrop=event=>{if(dragFrom<0)return;event.preventDefault();event.stopPropagation();moveRef(dragFrom,i);dragFrom=-1;};
   item.onkeydown=event=>{if(!event.altKey)return;if(event.key==='ArrowLeft'){event.preventDefault();moveRef(i,i-1);}if(event.key==='ArrowRight'){event.preventDefault();moveRef(i,i+1);}};
   box.append(item);
  });
  const skill=skills.find(s=>s.value===settings.skill);
  if(skill){const chip=document.createElement('div');chip.className='ref file';chip.title=skill.name;const icon=document.createElement('b');icon.textContent='MD';const name=document.createElement('span');name.textContent=fileName(skill.name);const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label',t('不用这个 Skill','Remove the skill'));x.onclick=()=>{settings.skill='';save();renderSkills();};chip.append(icon,name,x);box.append(chip);}
  const used=refs.length+(skill?1:0);box.hidden=!used;
  if(used){const count=document.createElement('span');count.className='count';count.textContent=used+' / '+limits.maxFiles+t(' 个文件',' files');box.append(count);}
  renderGenerate();
 }

 // ---- uploads in the last 3 hours (ChatGPT allows 80 files per 3 hours) ----
 async function uploads(add=0){
  const now=Date.now();let {cgptUploads=[]}=await chrome.storage.local.get(['cgptUploads']);cgptUploads=cgptUploads.filter(time=>now-time<UPLOAD_WINDOW);
  if(add){cgptUploads.push(...Array(add).fill(now));await chrome.storage.local.set({cgptUploads});}
  const meter=$('uploadMeter');meter.hidden=!cgptUploads.length;meter.textContent=t('3 小时内已上传 ','Uploaded in 3 h: ')+cgptUploads.length+' / '+UPLOAD_CAP;meter.classList.toggle('warn',cgptUploads.length>=UPLOAD_CAP*.75);
  return cgptUploads.length;
 }

 // ---- library (IndexedDB shared with the extension) and the local cache ----
 function db(){return new Promise((resolve,reject)=>{const open=indexedDB.open('bilingual-image-prompts',2);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('tasks'))open.result.createObjectStore('tasks',{keyPath:'id'});};open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});}
 async function store(mode,fn){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('tasks',mode),request=fn(tx.objectStore('tasks'));tx.oncomplete=()=>{database.close();resolve(request?.result);};tx.onerror=()=>{database.close();reject(tx.error);};});}
 function recordOf(batch){
  const mode=batch.refs.length?'image':'text',generations=[];
  for(const job of batch.jobs){
   if(job.status==='done')(job.images||[]).forEach((image,k)=>generations.push({id:job.id+'-'+(k+1),job:job.id,n:job.n,mode,status:'done',prompt:batch.body,model:'ChatGPT',sourceName:'ChatGPT',image,path:job.paths?.[k]||undefined,refName:job.meta?.[k]?.refName,chatgptFileId:job.meta?.[k]?.chatgptFileId||undefined,chatgptName:job.meta?.[k]?.chatgptName||undefined,chatgptWidth:job.meta?.[k]?.width||undefined,chatgptHeight:job.meta?.[k]?.height||undefined,aspect:batch.ratio,references:batch.refs.length,skill:batch.skillName||undefined,createdAt:job.startedAt||batch.createdAt,finishedAt:job.finishedAt,runMs:job.runMs,conversationUrl:job.url}));
   else if(job.status==='failed'&&job.error)generations.push({id:job.id,job:job.id,n:job.n,mode,status:'failed',prompt:batch.body,model:'ChatGPT',sourceName:'ChatGPT',error:job.error,aspect:batch.ratio,createdAt:job.startedAt||batch.createdAt,conversationUrl:job.url});
   for(const [k,m] of (job.missing||[]).entries())generations.push({id:job.id+'-m'+(k+1),job:job.id,n:job.n,mode,status:'failed',prompt:batch.body,model:'ChatGPT',sourceName:'ChatGPT',error:t('图片没有取回，可点「同步会话」补回','Not fetched; use "Sync conversations"'),aspect:batch.ratio,createdAt:job.startedAt||batch.createdAt,conversationUrl:job.url,chatgptFileId:m.fileId,chatgptName:m.title?m.title+'.png':undefined});
  }
  if(!generations.some(g=>g.image)&&!batch.keepEmpty)return null;
  const studio={ratio:batch.ratio,count:batch.total,sessions:batch.sessions,prefix:batch.prefix||'',skill:batch.skillName||'',skillValue:batch.skillValue||'',plan:batch.jobs.map(j=>j.n)};
  const took=duration(batch);
  return {id:batch.id,kind:'chatgpt-studio',createdAt:batch.createdAt,status:'done',source:'chatgpt-studio',params:studio,timing:took!=null?{waitMs:0,runMs:took}:undefined,zh:batch.prompt,en:batch.prompt,prompts:{},focus:'',image:batch.refs[0]||generations.find(g=>g.image).image,generations,
   studio};
 }
 async function persist(batch){const record=recordOf(batch);if(!record)return;await store('readwrite',s=>s.put(record));batch.saved=true;await cacheLocally(batch,record).catch(()=>{});}
 // local cache (settings → local CLI): original images to the output folder with a JSON sidecar, then the record mirror
 async function cacheLocally(batch,record){
  const {localCacheEnabled,genOutputDir}=await chrome.storage.local.get(['localCacheEnabled','genOutputDir']);if(localCacheEnabled!==true||!chrome.runtime.sendNativeMessage)return;
  let wrote=false;
  // file names follow the record's backup name (six-digit sequence + short code), like every other generated image
  if(!batch.cacheId){const named=await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'cacheId',id:batch.id}).catch(()=>null);batch.cacheId=named?.ok?named.cacheId:batch.id.slice(5,13);}
  for(const job of batch.jobs){if(job.status!=='done')continue;job.paths=job.paths||[];
   for(const [k,image] of (job.images||[]).entries()){if(job.paths[k])continue;
    const result=await chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'writeGenerated',dir:genOutputDir||'',name:batch.cacheId+'-chatgpt-'+job.id.split('-').pop()+'-'+(k+1)+(job.meta?.[k]?.refName?'-'+job.meta[k].refName.replace(/^ip-ref-/,'').replace(/\.[^.]+$/,''):''),dataUrl:image,meta:{taskId:batch.id,prompt:batch.body,model:'ChatGPT',source:'ChatGPT',mode:batch.refs.length?'image':'text',aspect:batch.ratio,conversationUrl:job.url,refName:job.meta?.[k]?.refName,chatgptFileId:job.meta?.[k]?.chatgptFileId,chatgptName:job.meta?.[k]?.chatgptName}}).catch(()=>null);
    if(result?.ok){job.paths[k]=result.path;wrote=true;}}}
  const current=wrote?recordOf(batch):record;if(wrote)await store('readwrite',s=>s.put(current));
  const put=image=>chrome.runtime.sendNativeMessage('com.imageprompt.local',{action:'put',id:current.id,record:{...current,image}});
  const answer=await put(current.image).catch(()=>null);if(!answer?.ok)await put(undefined).catch(()=>null);
 }
 function batchFromRecord(r){
  const groups=new Map();for(const g of r.generations||[]){const key=g.job||g.id;if(!groups.has(key))groups.set(key,{id:key,n:g.n||1,status:g.status==='done'?'done':'failed',percent:100,images:[],paths:[],missing:[],error:g.error,url:g.conversationUrl});const job=groups.get(key);if(!job.url&&g.conversationUrl)job.url=g.conversationUrl;if(g.status==='failed'&&g.chatgptFileId)job.missing.push({fileId:g.chatgptFileId,title:g.chatgptName?g.chatgptName.replace(/\.png$/,''):null});if(g.image){job.images.push(g.image);job.paths.push(g.path);(job.meta||=[]).push({refName:g.refName,chatgptFileId:g.chatgptFileId,chatgptName:g.chatgptName,width:g.chatgptWidth||null,height:g.chatgptHeight||null});job.status='done';}
   if(g.createdAt&&(!job.startedAt||g.createdAt<job.startedAt))job.startedAt=g.createdAt;if(g.finishedAt&&(!job.finishedAt||g.finishedAt>job.finishedAt))job.finishedAt=g.finishedAt;if(g.runMs)job.runMs=Math.max(job.runMs||0,g.runMs);}
  const jobs=[...groups.values()];
  return {id:r.id,prompt:r.zh||'',body:r.generations?.[0]?.prompt||r.zh||'',ratio:r.studio?.ratio||r.generations?.[0]?.aspect||'',sessions:r.studio?.sessions,prefix:r.studio?.prefix,refCount:r.generations?.find(g=>g.references!=null)?.references,skillName:r.studio?.skill,skillValue:r.studio?.skillValue||'',total:r.studio?.count||jobs.reduce((n,j)=>n+(j.n||1),0),
   refs:r.generations?.[0]?.references&&r.image&&!r.generations.some(g=>g.image===r.image)?[r.image]:[],createdAt:r.createdAt,saved:true,jobs};
 }
 async function loadFeed(){
  allRecords=(await store('readonly',s=>s.getAll())||[]).filter(r=>['chatgpt-studio','import'].includes(RecordKinds.kindOf(r))).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  batches=allRecords.slice(0,shown).map(batchFromRecord);renderFeed();
 }
 $('more').onclick=()=>{shown+=PAGE;const running=run?[run.batch]:[];batches=[...running,...allRecords.slice(0,shown).filter(r=>!running.some(b=>b.id===r.id)).map(batchFromRecord)];renderFeed();};

 // ---- conversations (worker tabs) ----
 // They live in one browser window, reused across runs (or, by choice, as background tabs in this window). Nothing is
 // brought to the front: tabs open in the background and the window is created unfocused and minimized.
 const MAX_SESSIONS=10;
 const statusText=s=>({opening:t('正在打开','Opening'),ready:t('就绪','Ready'),busy:t('生成中','Generating'),login:t('需要登录','Sign-in needed'),limit:t('已达限额','Limit reached'),error:t('出错','Error')})[s.status]||s.status;
 async function saveWorkers(){await chrome.storage.local.set({cgptWorkers:{windowId:workerWindow,libraryTab,tabs:sessions.map(s=>s.tabId),rounds:Object.fromEntries(sessions.map(s=>[s.tabId,s.rounds||0]))}}).catch(()=>{});}
 async function restoreWorkers(){
  const {cgptWorkers}=await chrome.storage.local.get(['cgptWorkers']).catch(()=>({}));if(!cgptWorkers)return;
  workerWindow=cgptWorkers.windowId??null;libraryTab=cgptWorkers.libraryTab??null;
  for(const tabId of cgptWorkers.tabs||[]){try{const tab=await chrome.tabs.get(tabId);sessions.push({id:crypto.randomUUID(),tabId,status:'opening',url:tab.url,done:0,rounds:cgptWorkers.rounds?.[tabId]||0});}catch{}}
  await Promise.all(sessions.map(async s=>{const r=await ping(s);s.status=r?(r.state==='login'?'login':r.state==='ready'?'ready':'opening'):'error';if(r)s.url=r.url;}));renderSessions();
 }
 // drop closed tabs; a tab the browser put to sleep is reloaded (in the background) so it can work again
 async function alive(){
  for(const s of sessions){try{const tab=await chrome.tabs.get(s.tabId);s.url=tab.url||s.url;if(tab.discarded||tab.status==='unloaded'){await chrome.tabs.reload(s.tabId);s.status='opening';}}catch{s.dead=true;}}
  sessions=sessions.filter(s=>!s.dead);if(workerWindow!=null){try{await chrome.windows.get(workerWindow);}catch{workerWindow=null;}}
 }
 // where a new conversation tab goes: this window (setting), the remembered conversation window, a window that already holds
 // one of our tabs, or else a new unfocused, minimized window
 async function workerHost(){
  if(settings.windowMode==='tabs'){const win=await chrome.windows.getCurrent();return win.id;}
  if(workerWindow!=null){try{await chrome.windows.get(workerWindow);return workerWindow;}catch{workerWindow=null;}}
  for(const tabId of [...sessions.map(s=>s.tabId),libraryTab].filter(id=>id!=null)){try{const tab=await chrome.tabs.get(tabId);workerWindow=tab.windowId;return workerWindow;}catch{}}
  return null;
 }
 async function openTab(url){
  const windowId=await workerHost();let tab;
  if(windowId!=null)tab=await chrome.tabs.create({windowId,url,active:false});
  else{const win=await chrome.windows.create({url,focused:false,state:'minimized'});workerWindow=win.id;tab=win.tabs[0];}
  chrome.tabs.update(tab.id,{autoDiscardable:false}).catch(()=>{});return tab;
 }
 async function openSession(url){const tab=await openTab(url);const s={id:crypto.randomUUID(),tabId:tab.id,status:'opening',url,done:0,rounds:0};sessions.push(s);await saveWorkers();renderSessions();return s;}
 async function ping(s){try{return await chrome.tabs.sendMessage(s.tabId,{type:'CGPT_PING'});}catch{return null;}}
 async function waitReady(s,stopped=()=>false){
  const end=Date.now()+90000;
  while(Date.now()<end&&!stopped()){const answer=await ping(s);if(answer){s.url=answer.url;if(!answer.enabled){s.status='error';break;}if(answer.state==='ready'){s.status='ready';break;}if(answer.state==='login'){s.status='login';break;}}await tick(globalThis.__imagepromptTestPollMs??1500);}
  if(s.status==='opening')s.status='error';renderSessions();return s.status==='ready';
 }
 const isStart=(url,home)=>{try{const a=new URL(url),b=new URL(home);return a.origin===b.origin&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'');}catch{return false;}};
 // a new conversation in the same tab (home or the project page)
 async function renew(s,home=settings.project||HOME){await chrome.tabs.update(s.tabId,{url:home});Object.assign(s,{url:home,status:'opening',rounds:0});await saveWorkers();}
 // A batch takes free conversations from the shared pool (at most 10 in all), opening more while there is room; a
 // conversation stays with the batch until the batch has nothing left for it.
 async function claimSessions(batch,want){
  await alive();const home=settings.project||HOME;
  let free=sessions.filter(s=>!s.owner);
  while(free.length<want&&sessions.length<MAX_SESSIONS&&!batch.stopped){free.push(await openSession(home));}
  const take=free.slice(0,want);for(const s of take)s.owner=batch.id;
  for(const s of take){
   if(s.status==='limit'||s.status==='error')s.status='opening';
   const outside=settings.project&&!String(s.url).startsWith(settings.project.replace(/\/project$/,''));
   // reuse on: a conversation continues until its maximum rounds; reuse off: each batch starts new conversations
   if((outside||(settings.merge?(s.rounds||0)>=settings.maxRounds:s.lastBatch&&s.lastBatch!==batch.id))&&!isStart(s.url,home))await renew(s,home);
  }
  renderSessions();await Promise.all(take.map(s=>waitReady(s,()=>batch.stopped)));
  const ready=take.filter(s=>s.status==='ready');for(const s of take)if(s.status!=='ready')s.owner=null;
  return ready;
 }
 function renderSessions(){
  const ready=sessions.filter(s=>s.status==='ready'||s.status==='busy').length;$('sessionsToggle').replaceChildren();const dot=document.createElement('span');dot.className='dot '+(sessions.some(s=>s.status==='busy')?'busy':ready?'ready':sessions.length?'login':'');$('sessionsToggle').append(dot,t('会话 ','Conversations ')+ready+' / '+sessions.length);
  const list=$('sessionList');list.replaceChildren();
  if(!sessions.length){const p=document.createElement('p');p.className='hint';p.textContent=t('还没有会话。点击生成时按设置自动打开。','No conversations yet. They open when you generate.');list.append(p);}
  sessions.forEach((s,i)=>{const row=document.createElement('div');row.className='session';const name=document.createElement('span');const dot=document.createElement('span');dot.className='dot '+s.status;name.append(dot,t('会话 ','Conversation ')+(i+1)+' · '+statusText(s)+(s.rounds?' · '+t('第 '+s.rounds+' 轮','round '+s.rounds):'')+(s.done?' · '+s.done+t(' 张',' images'):''));
   const view=document.createElement('button');view.type='button';view.className='link';view.textContent=s.status==='login'?t('去登录','Sign in'):t('查看','View');
   // only this button (the user's own click) brings a conversation to the front
   view.onclick=async()=>{const tab=await chrome.tabs.update(s.tabId,{active:true});await chrome.windows.update(tab.windowId,{focused:true,state:'normal'});};
   const url=document.createElement('small');url.textContent=String(s.url||'').replace(/^https:\/\//,'');row.append(name,view,url);list.append(row);});
 }
 $('sessionsToggle').onclick=()=>{const hidden=document.body.classList.toggle('sessions-hidden');$('sessions').hidden=hidden;$('sessionsToggle').setAttribute('aria-expanded',String(!hidden));};
 $('closeSessions').onclick=async()=>{stopAll();for(const s of sessions)await chrome.tabs.remove(s.tabId).catch(()=>{});if(libraryTab!=null)await chrome.tabs.remove(libraryTab).catch(()=>{});
  if(workerWindow!=null&&settings.windowMode!=='tabs'){const left=await chrome.tabs.query({windowId:workerWindow}).catch(()=>[]);if(!left.length)workerWindow=null;}
  sessions=[];libraryTab=null;await saveWorkers();renderSessions();};

 // ---- runs: several batches at once, each stoppable; one rate limit for all of them ----
 const gap=()=>globalThis.__imagepromptTestGapMs??3000+Math.random()*4000;
 const running=()=>batches.filter(b=>b.running);
 function renderGenerate(){const btn=$('generate');btn.classList.remove('stop');btn.textContent=t('生成 ','Generate ')+settings.count+t(' 张','');const busy=running().length;$('runningChip').hidden=!busy;$('runningChip').textContent=t('进行中 '+busy+' 批','Running: '+busy);}
 // messages sent in the last minute, across all batches; at the limit a job waits (its card shows the countdown)
 const sentTimes=[],RATE_WINDOW=()=>globalThis.__imagepromptTestRateWindowMs||60000;
 async function rateGate(batch,job){
  if(!(settings.rate>0))return true;
  while(!batch.stopped){
   const now=Date.now();while(sentTimes.length&&now-sentTimes[0]>=RATE_WINDOW())sentTimes.shift();
   if(sentTimes.length<settings.rate){sentTimes.push(now);if(job.stage==='rate'){job.stage='';renderJob(batch,job);}return true;}
   job.stage='rate';job.waitUntil=sentTimes[0]+RATE_WINDOW();renderJob(batch,job);await tick(Math.min(1000,job.waitUntil-now));
  }
  return false;
 }
 async function generate(){
  const text=prompt.value.trim();if(!text&&!refs.length){notice(t('请输入提示词或添加参考图。','Enter a prompt or add a reference.'));prompt.focus();return;}
  const {plugins={},chatgptConsent}=await chrome.storage.local.get(['plugins','chatgptConsent']);
  if(plugins.chatgpt?.enabled!==true){notice(t('请先在「设置 → 插件市场」开启 ChatGPT 生图工作台。','Turn on the ChatGPT image studio in Settings → Plugins first.'));return;}
  if(!chatgptConsent){if(!confirm(t('这个工作台会替你在 ChatGPT 网页上输入提示词、上传参考图并点击发送。OpenAI 的使用条款限制自动化操作，账号可能被限制或封禁，风险由你自行承担。继续吗？','This studio types prompts, uploads references and presses Send on ChatGPT for you. OpenAI’s terms restrict automation; your account may be limited or banned, at your own risk. Continue?')))return;await chrome.storage.local.set({chatgptConsent:Date.now()});}
  let skill=null;try{if(settings.skill){if(!skillFile)await prepareSkill();if(!skillFile)throw new Error(t('读取失败','not readable'));skill=skillFile;}}catch(error){notice(t('Skill 读取失败：','Could not read the skill: ')+error.message);return;}
  if(settings.libraryFolder&&(refs.some(r=>!inLibrary(r.name)&&!r.failed&&!(r.alias&&!r.aliasFailed))||skill&&!inLibrary(skill.filename)&&!skill.failed)){notice(t('正在把附件传到 ChatGPT 资料库…','Uploading attachments to the ChatGPT library…'),'info');while(uploading)await tick(500);await preUpload();}
  const perMessage=refs.length+(skill?1:0);if(perMessage>limits.maxFiles){notice(t('每条消息最多 '+limits.maxFiles+' 个文件（参考图 + Skill）。','At most '+limits.maxFiles+' files per message (references + skill).'));return;}
  const p=plan(settings.count,settings.sessions);
  if(perMessage&&(await uploads())+perMessage*(settings.everyRef?p.messages.length:p.used)>UPLOAD_CAP)notice(t('3 小时内的上传可能超过 ChatGPT 的 80 个文件上限，附件可能传不上去。','Uploads in the last 3 hours may pass ChatGPT’s 80-file cap; attachments may fail.'),'info');else notice('');
  const id=RecordKinds.newId('chatgpt-studio');
  const batch={id,prompt:text,body:body(text,skill),ratio:settings.ratio,prefix:settings.prefix,skillName:skill?.name||'',skillValue:skill?settings.skill:'',skill,refs:refs.map(r=>r.src),refCount:refs.length,refFiles:refs.map(r=>({name:r.name,alias:r.alias||null,aliasFailed:!!r.aliasFailed,dataUrl:r.src})),createdAt:Date.now(),sessions:p.used,total:settings.count,
   jobs:p.messages.map((m,i)=>({id:id+'-'+(i+1),target:m.target,n:m.n,status:'queued',percent:0,stage:''}))};
  batches.unshift(batch);runBatch(batch);
 }
 // the images a finished batch is still short of are asked for again in the same card
 function continueBatch(batch){
  if(batch.running)return;const got=batch.jobs.reduce((n,j)=>n+(j.images?.length||0),0),rest=(batch.total||0)-got;if(rest<=0)return;
  batch.stopped=false;batch.skill=batch.skill||null;batch.refFiles=batch.refFiles||(batch.refs||[]).map((src,k)=>({name:batch.refNames?.[k]||'',dataUrl:src}));
  const p=plan(rest,batch.sessions||settings.sessions),base=batch.jobs.length;
  for(const [i,m] of p.messages.entries())batch.jobs.push({id:batch.id+'-'+(base+i+1),target:m.target,n:m.n,status:'queued',percent:0,stage:''});
  runBatch(batch);
 }
 async function runBatch(batch){
  batch.running=true;batch.stopped=false;batch.attached=new Set();batch.queue=batch.jobs.filter(j=>j.status==='queued');renderFeed();renderGenerate();
  try{
   for(const ref of batch.refFiles)if(!ref.name)ref.name=await identity(ref.dataUrl,'ref');
   while(batch.queue.length&&!batch.stopped){
    const claimed=await claimSessions(batch,Math.min(batch.sessions||1,batch.queue.length));
    if(!claimed.length){
     if(batch.stopped)break;
     // every conversation is working for another batch: wait for one to come free
     if(sessions.some(s=>s.owner&&s.owner!==batch.id)){batch.waiting=true;renderBatch(batch);await tick(1500);continue;}
     throw new Error(sessions.some(s=>s.status==='login')?t('请在会话窗口登录 ChatGPT，然后再点生成（右侧「去登录」）。','Sign in to ChatGPT in the conversation window, then generate again (“Sign in” on the right).'):t('ChatGPT 会话没有准备好，请稍后再试。','The ChatGPT conversations are not ready; try again shortly.'));
    }
    batch.waiting=false;
    for(const job of batch.queue)if(job.target!=null&&job.target>=claimed.length)job.target=null;
    await Promise.all(claimed.map((s,i)=>sessionLoop(s,i,batch)));
    for(const s of claimed){if(s.owner===batch.id)s.owner=null;s.lastBatch=batch.id;}
    if(batch.queue.length&&sessions.every(s=>s.status==='login'||s.status==='error'||s.status==='limit'))break;
   }
   if(batch.queue.length&&!batch.stopped&&sessions.some(s=>s.status==='login'))notice(t('有会话需要登录 ChatGPT，剩下的图没有发出。','A conversation needs a ChatGPT sign-in; the remaining images were not sent.'));
  }catch(error){notice(error.message);}
  finally{
   for(const s of sessions)if(s.owner===batch.id)s.owner=null;
   for(const job of batch.jobs)if(job.status==='queued'||job.status==='running'){job.status='failed';job.percent=100;job.error=job.error||batch.limit||t('已停止','Stopped');}
   batch.running=false;batch.waiting=false;batch.queue=[];renderBatch(batch);renderGenerate();renderSessions();
   await persist(batch).catch(error=>notice(error.message));await logRun(batch);await loadRecordsIndex();renderFeed();
  }
 }
 async function sessionLoop(s,index,batch){
  const take=()=>{let i=batch.queue.findIndex(j=>j.target===index);if(i<0)i=batch.queue.findIndex(j=>j.target==null);return i<0?null:batch.queue.splice(i,1)[0];};
  let job;
  while(!batch.stopped&&(job=take())){
   // past the maximum rounds this conversation moves to a new one before sending
   if(settings.merge&&(s.rounds||0)>=settings.maxRounds){await renew(s);if(!(await waitReady(s,()=>batch.stopped))){job.target=null;batch.queue.unshift(job);for(const other of batch.queue)if(other.target===index)other.target=null;return;}}
   Object.assign(job,{status:'running',percent:Math.max(job.percent,1),stage:'',startedAt:Date.now(),session:s.id});s.status='busy';renderSessions();renderJob(batch,job);
   if(!(await rateGate(batch,job))){Object.assign(job,{status:'queued'});batch.queue.unshift(job);break;}
   // attachments go with this batch's first message in each conversation (or every message); a file the library already
   // has is referred to with @name, anything else is uploaded with the message
   const attach=!batch.attached.has(s.id)||settings.everyRef,useMention=name=>settings.mention!==false&&inLibrary(name);
   const all=attach?[...batch.refFiles.map(f=>({...f,kind:'ref'})),...(batch.skill?[{name:batch.skill.filename,dataUrl:batch.skill.dataUrl,kind:'skill'}]:[])]:[];
   const viaAlias=f=>settings.mention!==false&&f.alias&&!f.aliasFailed,referred=f=>viaAlias(f)||useMention(f.name);
   const mentions=all.filter(referred).map(f=>({name:viaAlias(f)?f.alias:f.name,uploadName:f.name,dataUrl:f.dataUrl})),references=all.filter(f=>f.kind==='ref'&&!referred(f)).map(({name,dataUrl})=>({name,dataUrl})),files=all.filter(f=>f.kind==='skill'&&!referred(f)).map(({name,dataUrl})=>({name,dataUrl}));
   let result;try{result=await chrome.tabs.sendMessage(s.tabId,{type:'CGPT_SEND',job:{id:job.id,n:job.n,text:messageText(batch,job.n),references,files,mentions,thinking:settings.thinking!==false?'high':'',finishWaitMs:globalThis.__imagepromptTestFinishWaitMs}});}catch(error){result={ok:false,error:error.message,lost:true};}
   result=result||{ok:false,error:t('会话没有响应','The conversation did not answer'),lost:true};
   if(result.ok){const fallback=result.mentionFallback||[];const uploaded=[...references,...files].map(f=>f.name).concat(fallback.map(f=>f.uploaded));await remember(uploaded,'chat');if(uploaded.length)await uploads(uploaded.length);
    // a ChatGPT name that could not be found is not used again; the image now lives in the library under its content name
    for(const f of fallback)if(f.mention!==f.uploaded)for(const ref of [...refs,...batch.refFiles])if(ref.alias===f.mention)ref.aliasFailed=true;
    batch.attached.add(s.id);job.url=result.url;job.conversationId=result.conversationId||conversationOf(result.url);result=await poll(s,job,batch);}
   job.finishedAt=Date.now();
   if(!result.login&&!result.lost&&!result.busy&&!result.stopped){s.rounds=(s.rounds||0)+1;saveWorkers();}
   if(result.ok){
    Object.assign(job,{status:'done',percent:100,images:result.images||[],url:result.url||job.url,runMs:result.runMs,conversationId:result.conversationId||job.conversationId||conversationOf(result.url)});
    job.meta=await Promise.all(job.images.map(async(image,k)=>{const m=result.meta?.[k]||{};return {refName:await identity(image,'ref'),chatgptFileId:m.fileId||null,width:m.width||null,height:m.height||null,chatgptName:m.title?m.title+(/\.(png|jpe?g|webp)$/i.test(m.title)?'':'.png'):null};}));
    // images ChatGPT made but that could not be read are kept by file ID, so "Sync conversations" can bring them back
    job.missing=(result.missing||[]).filter(m=>m.fileId);if(!job.images.length){job.status='failed';job.error=t('图片没有取回，可点「同步会话」补回','Images not fetched; use "Sync conversations" to bring them back');}
    s.status='ready';s.url=job.url;s.done=(s.done||0)+job.images.length;await persist(batch).catch(()=>{});
    // n= was not fully followed: ask once more in the same conversation for the rest (images that exist but could not be read count as made)
    const made=job.images.length+(result.missing||[]).reduce((n,m)=>n+(m.count||1),0);
    if(made<job.n&&!job.topup&&!batch.stopped){const rest={id:job.id+'b',target:index,n:job.n-made,topup:true,status:'queued',percent:0,stage:''};batch.jobs.splice(batch.jobs.indexOf(job)+1,0,rest);job.n=made||job.n;batch.queue.unshift(rest);renderBatch(batch);}}
   else if(result.stopped){Object.assign(job,{status:'failed',percent:100,error:t('已停止','Stopped')});s.status='ready';}
   else if(result.login||result.lost||result.busy){Object.assign(job,{status:'queued',percent:0,stage:'',target:null});batch.queue.unshift(job);for(const other of batch.queue)if(other.target===index)other.target=null;s.status=result.login?'login':'error';renderJob(batch,job);renderSessions();return;}
   else if(result.limit){Object.assign(job,{status:'failed',percent:100,error:result.error});s.status='limit';const limit=t('ChatGPT 限额：','ChatGPT limit: ')+result.error;notice(limit);for(const b of running()){b.limit=limit;stopBatch(b);}}
   else if(!job.retried&&!batch.stopped){Object.assign(job,{status:'queued',percent:0,stage:t('重试','Retrying'),retried:true,error:result.error,target:null});batch.queue.push(job);s.status='ready';}
   else{Object.assign(job,{status:'failed',percent:100,error:result.error});s.status='ready';}
   renderJob(batch,job);renderSessions();
   if(batch.queue.length&&!batch.stopped)await tick(gap());
  }
  if(s.status==='busy')s.status='ready';renderSessions();
 }
 const conversationOf=url=>(/\/c\/([0-9a-z-]{8,})/i.exec(url||'')||[])[1]||null;
 // the conversation tab is asked for news every 2.5 s; it reads ChatGPT's conversation data (or the page) and answers
 async function poll(s,job,batch){
  let misses=0;const deadline=Date.now()+(globalThis.__imagepromptTestJobMs||Math.max(10,4+job.n*2)*60000);
  while(true){
   await tick(globalThis.__imagepromptTestPollMs??1200);
   if(batch.stopped)return {ok:false,stopped:true,error:t('已停止','Stopped')};
   if(Date.now()>deadline)return {ok:false,error:t('等待出图超时，可点「同步会话」补回','Timed out; use "Sync conversations" to bring the images back')};
   const st=await chrome.tabs.sendMessage(s.tabId,{type:'CGPT_STATUS',id:job.id}).catch(()=>null);
   if(!st||st.state==='unknown'){if(++misses>=4)return {ok:false,error:t('会话没有响应','The conversation did not answer'),lost:true};continue;}
   misses=0;
   if(st.state==='done')return {ok:true,images:st.images||[],meta:st.meta||[],missing:st.missing||[],conversationId:st.conversationId,url:st.url,runMs:st.runMs};
   if(st.state==='limit')return {ok:false,limit:true,error:st.error};
   if(st.state==='failed')return {ok:false,error:st.error};
   job.percent=Math.max(job.percent,Math.min(99,Number(st.percent)||0));job.stage=st.stage||(st.state==='sent'?'sent':'drawing');job.found=st.found;renderJob(batch,job);
  }
 }
 // one batch: nothing more is sent, its running message is let go, the conversations return to the pool
 function stopBatch(batch){
  if(!batch.running)return;batch.stopped=true;
  for(const job of batch.jobs)if(job.status==='running'){const s=sessions.find(x=>x.id===job.session);if(s)chrome.tabs.sendMessage(s.tabId,{type:'CGPT_STOP',id:job.id}).catch(()=>{});}
  renderBatch(batch);
 }
 function stopAll(){for(const batch of running())stopBatch(batch);}
 $('generate').onclick=generate;
 chrome.runtime.onMessage.addListener(message=>{
  if(message?.type!=='CGPT_PROGRESS')return;
  for(const batch of running()){const job=batch.jobs.find(j=>j.id===message.jobId);if(!job||job.status!=='running')continue;
   job.percent=Math.max(job.percent,Math.min(99,Number(message.percent)||0));job.stage=message.stage;job.found=message.found;const s=sessions.find(x=>x.id===job.session);if(s&&message.url)s.url=message.url;renderJob(batch,job);}
 });

 // ---- sync conversations into the history (manual repair) ----
 // Every conversation the studio remembers (each message's conversation, also of runs that made nothing) and, with a
 // project link, the project's conversations are read through a conversation tab. Images not yet in the history are
 // fetched as originals and attached to the run they answered (matched by file ID, else by conversation, time and
 // prompt), replacing its "not fetched" entries; images of no known run become "Imported from a conversation" records.
 const stripN=text=>String(text||'').split('\n').filter((line,i)=>!(i===0&&/^n=\d+$/.test(line.trim()))).join('\n').trim();
 const sameText=(a,b)=>{const x=stripN(a).replace(/\s+/g,''),y=stripN(b).replace(/\s+/g,'');return !!x&&!!y&&(x===y||x.startsWith(y.slice(0,40))||y.startsWith(x.slice(0,40)));};
 async function readerSession(){
  await alive();let s=sessions.find(x=>x.status==='ready'||x.status==='busy');
  if(!s){s=await openSession(settings.project||HOME);if(!(await waitReady(s)))throw new Error(s.status==='login'?t('请先在会话窗口登录 ChatGPT（右侧「去登录」）。','Sign in to ChatGPT in the conversation window first.'):t('ChatGPT 会话没有准备好。','The ChatGPT conversation is not ready.'));}
  return s;
 }
 function ownerOf(records,cid,turn,log){
  const ids=new Set(turn.images.map(i=>i.fileId));
  for(const r of records)for(const g of r.generations||[])if(g.chatgptFileId&&ids.has(g.chatgptFileId))return {record:r,job:g.job||g.id};
  let best=null;
  for(const r of records)for(const g of r.generations||[]){
   if(!String(g.conversationUrl||'').includes(cid)||!sameText(turn.text,g.prompt))continue;
   const gap=Math.abs((g.createdAt||r.createdAt||0)-turn.createdAt);if(gap<=10*60000&&(!best||gap<best.gap))best={record:r,job:g.job||g.id,gap};
  }
  if(best)return best;
  for(const e of log)if((e.urls||[]).some(u=>u.includes(cid))&&Math.abs((e.createdAt||0)-turn.createdAt)<=30*60000&&sameText(turn.text,e.prompt)){
   const record={id:e.id,kind:'chatgpt-studio',source:'chatgpt-studio',createdAt:e.createdAt,status:'done',zh:e.prompt,en:e.prompt,prompts:{},focus:'',generations:[],params:{count:e.total}};
   records.push(record);return {record,job:e.id+'-1',created:true};
  }
  return null;
 }
 async function syncConversations(){
  const button=$('syncConversations');button.disabled=true;notice(t('正在读取会话…','Reading conversations…'),'info');
  let added=0,imported=0,read=0,failed=0;
  try{
   const s=await readerSession(),ask=message=>chrome.tabs.sendMessage(s.tabId,message).catch(error=>({ok:false,error:error.message}));
   const records=(await store('readonly',st=>st.getAll())||[]).filter(r=>['chatgpt-studio','import'].includes(RecordKinds.kindOf(r)));
   const {cgptLog=[]}=await chrome.storage.local.get(['cgptLog']);
   const conversations=new Map(),note=(url)=>{const cid=conversationOf(url);if(cid&&!conversations.has(cid))conversations.set(cid,url);};
   for(const r of records)for(const g of r.generations||[])note(g.conversationUrl);
   for(const e of cgptLog)for(const url of e.urls||[])note(url);
   const projectId=(/\/g\/(g-p-[\w-]+)/.exec(settings.project||'')||[])[1];
   if(projectId){const listed=await ask({type:'CGPT_PROJECT_CONVERSATIONS',projectId});if(listed?.ok)for(const c of listed.items)note('https://chatgpt.com/g/'+projectId+'/c/'+c.id);else notice(t('项目里的会话列表读不到，只同步记住的会话。','The project conversation list could not be read; syncing remembered conversations only.'),'info');}
   const known=new Set(records.flatMap(r=>(r.generations||[]).filter(g=>g.image||g.status==='done').map(g=>g.chatgptFileId).filter(Boolean)));
   let index=0;
   for(const [cid,url] of conversations){
    notice(t('正在读取会话 '+(++index)+' / '+conversations.size+'…','Reading conversation '+index+' / '+conversations.size+'…'),'info');
    const conversation=await ask({type:'CGPT_READ_CONVERSATION',conversationId:cid});if(!conversation?.ok){failed++;continue;}read++;
    for(const turn of conversation.turns){
     const fresh=turn.images.filter(i=>!known.has(i.fileId));if(!fresh.length)continue;
     const got=await ask({type:'CGPT_DOWNLOAD_FILES',conversationId:cid,files:fresh});const files=(got?.files||[]).filter(f=>f.dataUrl);if(!files.length)continue;
     let owner=ownerOf(records,cid,turn,cgptLog);
     if(!owner){const id=RecordKinds.newId('import'),text=stripN(turn.text);const record={id,kind:'import',source:'chatgpt-import',createdAt:turn.createdAt||Date.now(),status:'done',zh:text,en:text,prompts:{},focus:'',generations:[],params:{conversationTitle:conversation.title}};records.push(record);owner={record,job:id+'-1',created:true};imported++;}
     const record=owner.record,base=(record.generations||[]).find(g=>g.job===owner.job);
     for(const f of files){const image=fresh.find(i=>i.fileId===f.fileId);known.add(f.fileId);
      record.generations=(record.generations||[]).filter(g=>!(g.status==='failed'&&(g.chatgptFileId===f.fileId||g.job===owner.job&&!g.chatgptFileId)));
      record.generations.push({id:owner.job+'-s'+f.fileId.slice(-8),job:owner.job,n:base?.n||turn.images.length,mode:base?.mode||'text',status:'done',prompt:base?.prompt||stripN(turn.text),model:'ChatGPT',sourceName:'ChatGPT',image:f.dataUrl,aspect:base?.aspect,createdAt:turn.createdAt||Date.now(),conversationUrl:url,chatgptFileId:f.fileId,chatgptName:image?.title?image.title+'.png':undefined,refName:await identity(f.dataUrl,'ref')});added++;}
     record.generations.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));if(!record.image)record.image=record.generations.find(g=>g.image)?.image;
     await store('readwrite',st=>st.put(record));
    }
   }
   notice(t('同步完成：读取 '+read+' 个会话，补回 '+added+' 张图'+(imported?'，新导入 '+imported+' 条记录':'')+(failed?'，'+failed+' 个会话读取失败':'')+'。','Synced: '+read+' conversations read, '+added+' images added'+(imported?', '+imported+' records imported':'')+(failed?', '+failed+' conversations could not be read':'')+'.'),'info');
  }catch(error){notice(error.message);}
  finally{button.disabled=false;shown=Math.max(shown,PAGE);await loadFeed();}
 }
 $('syncConversations').onclick=syncConversations;

 // ---- feed ----
 const stageText=(job)=>job.stage==='rate'?t('速率限制，'+Math.max(0,Math.ceil(((job.waitUntil||0)-Date.now())/1000))+' 秒后发送','Rate limit: sending in '+Math.max(0,Math.ceil(((job.waitUntil||0)-Date.now())/1000))+' s'):({waiting:t('等待会话','Waiting'),uploading:t('上传附件','Uploading'),sent:t('已发送','Sent'),drawing:job.n>1&&job.found!=null?t('生成中 '+job.found+'/'+job.n,'Drawing '+job.found+'/'+job.n):t('生成中','Drawing'),saving:t('保存中','Saving')})[job.stage]||job.stage||t('排队中','Queued');
 const weight=j=>j.n||1;
 const batchPercent=b=>{const total=b.jobs.reduce((n,j)=>n+weight(j),0)||1;return Math.round(b.jobs.reduce((sum,j)=>sum+weight(j)*(j.status==='done'||j.status==='failed'?100:j.percent||0),0)/total);};
 function dayLabel(time){const d=new Date(time),today=new Date();const same=(a,b)=>a.toDateString()===b.toDateString();if(same(d,today))return t('今天','Today');const y=new Date(today);y.setDate(today.getDate()-1);if(same(d,y))return t('昨天','Yesterday');return d.toLocaleDateString(zh?'zh-CN':'en',{month:'long',day:'numeric'});}
 function cells(batch){
  const out=[];let number=0;
  for(const job of batch.jobs){
   if(job.status==='done'&&job.images?.length){job.images.forEach((image,k)=>{const meta=job.meta?.[k];
    const cell=document.createElement('div');cell.className='cell done';cell.dataset.job=job.id;const label=t('生成图 ','Generated image ')+(++number);
    const index=number;
    const pick=document.createElement('button');pick.type='button';pick.className='cell-pick';pick.title=t('点击查看大图','Click to view');pick.setAttribute('aria-label',label+' · '+pick.title);
    const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';pick.append(img);pick.onclick=()=>openViewer(batch,job,k,index);
    const ref=document.createElement('button');ref.type='button';ref.className='cell-ref';ref.title=t('加为参考图','Use as a reference');ref.setAttribute('aria-label',label+' · '+ref.title);ref.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';ref.onclick=event=>{event.stopPropagation();addReference(image,cell,meta);};
    const tools=document.createElement('div');tools.className='cell-tools';
    const tool=(icon,title,fn)=>{const b=document.createElement('button');b.type='button';b.title=title;b.setAttribute('aria-label',title);b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg>';b.onclick=event=>{event.stopPropagation();fn();};tools.append(b);};
    tool('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',t('下载原图','Download the original'),()=>downloadBest(batch,job,k,index));
    cell.append(pick,ref,tools);out.push(cell);});continue;}
   if(job.status==='failed'){const c=document.createElement('div');c.dataset.job=job.id;c.className='cell failed';c.textContent=(job.n>1?'n='+job.n+' · ':'')+(job.error||t('失败','Failed'));out.push(c);continue;}
   for(let k=0;k<(job.n||1);k++){const c=document.createElement('div');c.dataset.job=job.id;c.className='cell pending';const pct=document.createElement('span');pct.className='pct';pct.textContent=(job.percent||0)+'%';const stage=document.createElement('span');stage.className='stage';stage.textContent=stageText(job);c.append(pct,stage);out.push(c);}
  }
  return out;
 }
 // a generated image becomes a reference in the composer (content-named, so it can be pre-uploaded and @-referred)
 // ChatGPT names are used only when no other recorded image has the same one (titles can repeat; a wrong match must not happen)
 function uniqueChatgptName(name){if(!name)return false;const images=new Set();for(const b of [...batches,...allRecords.map(batchFromRecord)])for(const j of b.jobs)for(const m of j.meta||[])if(m?.chatgptName===name)images.add(m.refName);return images.size===1;}
 async function addReference(src,cell,meta){
  const name=meta?.refName||await identity(src,'ref');
  if(refs.some(r=>r.name===name)){notice(t('这张图已经在参考图里','This image is already a reference'),'info');return;}
  if(refs.length>=fileSlots()){notice(t('每条消息最多 '+limits.maxFiles+' 个文件（含 Skill）','At most '+limits.maxFiles+' files per message (skill included)'));return;}
  const alias=meta?.chatgptName&&uniqueChatgptName(meta.chatgptName)?meta.chatgptName:null;
  refs.push({id:crypto.randomUUID(),src,name,alias});renderAttachments();preUpload();
  cell?.classList.add('picked');setTimeout(()=>cell?.classList.remove('picked'),900);
  notice(t('已加为参考图（第 '+refs.length+' 张）','Added as reference '+refs.length),'info');
 }
 // ---- large view: the cached image at once; ChatGPT's original (by file ID) is fetched when the cache may not be it ----
 let viewing=null;
 const sizeOf=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({w:i.naturalWidth,h:i.naturalHeight});i.onerror=()=>resolve(null);i.src=src;});
 const sizeText=v=>v?v.w+'×'+v.h:'',sameSize=(a,b)=>!!(a&&b&&a.w===b.w&&a.h===b.h);
 // the cache is the original when its size matches the size ChatGPT reported for the file
 const cacheIsOriginal=v=>sameSize(v.cacheSize,v.meta?.width&&v.meta?.height?{w:v.meta.width,h:v.meta.height}:null);
 async function originalOf(v,{open=false}={}){
  if(v.original)return v.original;const fileId=v.meta?.chatgptFileId,cid=v.job.conversationId||conversationOf(v.job.url);if(!fileId||!cid)return null;
  let s=sessions.find(x=>x.status==='ready'||x.status==='busy');if(!s&&open){try{s=await readerSession();}catch{return null;}}if(!s)return null;
  const got=await chrome.tabs.sendMessage(s.tabId,{type:'CGPT_DOWNLOAD_FILES',conversationId:cid,files:[{fileId,pointer:'file-service://'+fileId}]}).catch(()=>null);
  const dataUrl=got?.files?.[0]?.dataUrl;if(!dataUrl)return null;
  const size=await sizeOf(dataUrl);v.original={src:dataUrl,size};
  // the original's size is remembered (no second fetch next time); a larger original replaces the cached copy
  await keepOriginal(v,size&&v.cacheSize&&size.w*size.h>v.cacheSize.w*v.cacheSize.h?dataUrl:null,size).catch(()=>{});return v.original;
 }
 async function keepOriginal(v,dataUrl,size){
  const m=(v.job.meta||=[])[v.k]||(v.job.meta[v.k]={});v.meta=m;if(size){m.width=size.w;m.height=size.h;}const old=v.job.images[v.k];if(dataUrl)v.job.images[v.k]=dataUrl;
  const record=await store('readonly',st=>st.get(v.batch.id));if(!record)return;
  const g=(record.generations||[]).find(x=>m.chatgptFileId&&x.chatgptFileId===m.chatgptFileId)||(record.generations||[]).find(x=>x.image===old);if(!g)return;
  if(size){g.chatgptWidth=size.w;g.chatgptHeight=size.h;}if(dataUrl){if(record.image===g.image)record.image=dataUrl;g.image=dataUrl;}
  await store('readwrite',st=>st.put(record));
 }
 function paintViewer(){const v=viewing;if(!v)return;
  $('viewerInfo').textContent=v.original&&!sameSize(v.original.size,v.cacheSize)?t('原图 ','Original ')+sizeText(v.original.size):v.original||cacheIsOriginal(v)?t('原图（本地缓存）','Original (local cache) ')+sizeText(v.cacheSize):v.checking?t('缓存 '+sizeText(v.cacheSize)+' · 正在获取原图…','Cached '+sizeText(v.cacheSize)+' · fetching the original…'):t('缓存 ','Cached ')+sizeText(v.cacheSize);
  $('viewerCopy').disabled=!v.batch.prompt;}
 async function openViewer(batch,job,k,index){
  const v=viewing={batch,job,k,index,image:job.images[k],meta:job.meta?.[k]||null,original:null};
  $('viewerImage').src=v.image;if(!$('viewer').open)$('viewer').showModal();paintViewer();
  v.cacheSize=await sizeOf(v.image);if(viewing!==v)return;paintViewer();
  if(cacheIsOriginal(v)||!v.meta?.chatgptFileId)return;
  v.checking=true;paintViewer();const original=await originalOf(v);v.checking=false;if(viewing!==v)return;
  if(original&&!sameSize(original.size,v.cacheSize))$('viewerImage').src=original.src;paintViewer();
 }
 const extOf=src=>src.startsWith('data:image/png')?'.png':src.startsWith('data:image/webp')?'.webp':'.jpg';
 function saveFile(src,name){const a=document.createElement('a');a.href=src;a.download=name;document.body.append(a);a.click();a.remove();}
 // download: ChatGPT's original, or the cache when it already has the original's size (or the original cannot be reached)
 async function downloadBest(batch,job,k,index){
  const v=viewing&&viewing.job===job&&viewing.k===k?viewing:{batch,job,k,image:job.images[k],meta:job.meta?.[k]||null,original:null};
  v.cacheSize||=await sizeOf(v.image);let src=v.image;
  if(!cacheIsOriginal(v)&&v.meta?.chatgptFileId){const original=await originalOf(v,{open:true});if(original&&!sameSize(original.size,v.cacheSize))src=original.src;}
  saveFile(src,'chatgpt-'+batch.id.slice(5,13)+'-'+(index??k+1)+extOf(src));
 }
 $('viewer').addEventListener('close',()=>{viewing=null;});
 $('viewer').addEventListener('click',event=>{if(event.target===$('viewer'))$('viewer').close();});
 $('viewerDownload').onclick=()=>{const v=viewing;if(v)downloadBest(v.batch,v.job,v.k,v.index);};
 $('viewerCopy').onclick=async()=>{const v=viewing;if(!v)return;await navigator.clipboard.writeText(v.batch.prompt||'');$('viewerCopy').textContent=t('已复制','Copied');setTimeout(()=>{$('viewerCopy').textContent=t('复制提示词','Copy prompt');},1400);};
 $('viewerRef').onclick=()=>{const v=viewing;if(!v)return;addReference(v.job.images[v.k],null,v.meta);$('viewer').close();};
 const clock=ms=>{const sec=Math.max(0,Math.round(ms/1000));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
 // a run's time: from its first message to its last image (while running: until now)
 function duration(batch){const starts=batch.jobs.map(j=>j.startedAt).filter(Boolean);if(!starts.length)return null;const first=Math.min(...starts),ends=batch.jobs.map(j=>j.finishedAt).filter(Boolean),end=batch.running?Date.now():ends.length?Math.max(...ends):first+Math.max(0,...batch.jobs.map(j=>j.runMs||0));return end>first?end-first:null;}
 function stateOf(batch){const base=stateText(batch),took=duration(batch);return took!=null&&base.cls!=='failed'?{...base,text:base.text+' · '+t('用时 ','')+clock(took)}:base;}
 function stateText(batch){const running=!!batch.running,got=batch.jobs.reduce((n,j)=>n+(j.images?.length||0),0),total=batch.total||batch.jobs.reduce((n,j)=>n+weight(j),0),failed=batch.jobs.filter(j=>j.status==='failed').length;
  if(running)return {cls:'',text:batch.stopped?t('正在停止…','Stopping…'):batch.waiting?t('排队中（等空闲会话）','Queued (waiting for a free conversation)'):t('生成中 ','Generating ')+batchPercent(batch)+'%'};if(!got)return {cls:'failed',text:t('生成失败','Failed')};return {cls:'done',text:t('完成 ','Done ')+got+' / '+total+(failed?t('，失败 ',', failed ')+failed+t(' 条',''):'')};}
 function batchCard(batch){
  const card=document.createElement('article');card.className='batch glass';card.dataset.batch=batch.id;
  const grid=document.createElement('div');grid.className='grid';grid.append(...cells(batch));
  // portrait and square runs: 4 per row; landscape: 2 per row; every cell keeps the run's aspect ratio
  const [rw,rh]=String(batch.ratio||'1:1').split(':').map(Number),wide=rw>rh;
  grid.dataset.orientation=rw<rh?'portrait':wide?'landscape':'square';grid.style.setProperty('--cols',String(wide?2:4));if(rw&&rh)grid.style.setProperty('--ar',rw+'/'+rh);
  const meta=document.createElement('div');meta.className='meta';
  const status=document.createElement('div');status.className='status';const state=document.createElement('span');const s=stateOf(batch);state.className='state '+s.cls;state.textContent=s.text;const time=document.createElement('span');time.className='hint';time.textContent=new Date(batch.createdAt).toLocaleTimeString(zh?'zh-CN':'en',{hour:'2-digit',minute:'2-digit'});status.append(state,time);
  // a running batch has its own Stop, next to its state
  if(batch.running&&!batch.stopped){const capsule=document.createElement('button');capsule.type='button';capsule.className='capsule';capsule.textContent=t('停止','Stop');capsule.setAttribute('aria-label',t('停止这一批','Stop this run'));capsule.onclick=()=>stopBatch(batch);state.after(capsule);}
  const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=batchPercent(batch)+'%';bar.append(fill);bar.hidden=!batch.running;
  const text=document.createElement('p');text.className='prompt-text';text.textContent=batch.prompt||t('（仅参考图）','(references only)');
  const chips=document.createElement('div');chips.className='chips';
  for(const label of [batch.ratio&&'ar '+batch.ratio,(batch.total||batch.jobs.reduce((n,j)=>n+(j.n||1),0))+t(' 张',' images'),batch.sessions&&batch.sessions+t(' 个会话',' conversations'),(batch.refCount??batch.refs?.length)&&(batch.refCount??batch.refs.length)+t(' 张参考图',' references'),batch.skillName&&'Skill · '+batch.skillName,batch.prefix&&prefixes.find(p=>p.id===batch.prefix)?.name])if(label){const chip=document.createElement('span');chip.textContent=label;chips.append(chip);}
  const actions=document.createElement('div');actions.className='actions';
  // Midjourney-style actions: icon + label; reuse buttons are greyed out when this run had no prefix / skill
  const ICONS={copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',use:'<path d="M4 6V4h16v2M12 4v16M9 20h6"/>',rerun:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',open:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',prefix:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',continue:'<path d="M7 5l11 7-11 7z"/>',skill:'<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 14h8M9 17h5"/>',share:'<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5"/>'};
  const act=(icon,label,fn,{disabled=false,title=''}={})=>{const b=document.createElement('button');b.type='button';b.className='act';b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[icon]+'</svg>';b.append(label);b.disabled=disabled;if(title)b.title=title;b.onclick=fn;actions.append(b);return b;};
  const prefixEntry=batch.prefix&&prefixes.find(p=>p.id===batch.prefix),skillEntry=batch.skillValue&&skills.find(x=>x.value===batch.skillValue);
  act('prefix',t('复用前缀','Reuse prefix'),()=>{settings.prefix=batch.prefix;save();renderSettings();notice(t('已选用前缀：','Prefix selected: ')+prefixEntry.name,'info');},{disabled:!prefixEntry,title:prefixEntry?prefixEntry.name:batch.prefix?t('这个前缀已删除','This prefix was deleted'):t('这次没有用前缀','No prefix in this run')});
  act('skill',t('复用 Skill','Reuse skill'),()=>{settings.skill=batch.skillValue;save();renderSkills();prepareSkill();notice(t('已选用 Skill：','Skill selected: ')+skillEntry.name,'info');},{disabled:!skillEntry,title:skillEntry?skillEntry.name:batch.skillName?t('这个 Skill 已不在列表里','This skill is no longer listed'):t('这次没有用 Skill','No skill in this run')});
  {const got=batch.jobs.reduce((n,j)=>n+(j.images?.length||0),0),rest=(batch.total||0)-got;act('continue',t('继续生成','Continue'),()=>continueBatch(batch),{disabled:batch.running||rest<=0,title:batch.running?t('正在生成','Running'):rest>0?t('补齐剩下的 '+rest+' 张','Make the remaining '+rest):t('这一批已经齐了','This run is complete')});}
  act('copy',t('复制提示词','Copy prompt'),async()=>{await navigator.clipboard.writeText(batch.prompt);notice(t('已复制提示词','Prompt copied'),'info');});
  const use=async()=>{prompt.value=batch.prompt;grow();refs=await Promise.all((batch.refs||[]).map(async src=>({id:crypto.randomUUID(),src,name:await identity(src,'ref')})));if(batch.ratio){settings.ratio=batch.ratio;save();}renderSettings();renderAttachments();};
  act('use',t('使用','Use'),async()=>{await use();prompt.focus();scrollTo({top:0,behavior:'smooth'});});
  act('rerun',t('重新生成','Rerun'),async()=>{await use();generate();});
  act('download',t('下载全部','Download all'),async()=>{let n=0;for(const job of batch.jobs)for(const k of (job.images||[]).keys())await downloadBest(batch,job,k,++n);});
  {const images=batch.jobs.flatMap(j=>j.images||[]);if(images.length&&globalThis.CommunityShare)act('share',t('发到社区','Post to community'),()=>CommunityShare.open({images,prompt:batch.prompt||'',model:'ChatGPT',aspect:batch.ratio||''}),{title:t('发布到社区「作品展示」（最多 12 张）','Post to the community showcase (up to 12 images)')});}
  const firstUrl=batch.jobs.find(j=>j.url)?.url;if(firstUrl)act('open',t('打开会话','Open conversation'),()=>chrome.tabs.create({url:firstUrl}));
  act('trash',t('删除','Delete'),async()=>{if(batch.running||!confirm(t('从资料库删除这次生成？','Delete this run from the library?')))return;await store('readwrite',s=>s.delete(batch.id));batches=batches.filter(b=>b!==batch);allRecords=allRecords.filter(r=>r.id!==batch.id);renderFeed();});
  meta.append(status,bar,text,chips,actions);card.append(grid,meta);return card;
 }
 // every run, with its conversations: runs that produced no image are listed on the right instead of the feed
 async function logRun(batch){
  const got=batch.jobs.reduce((n,j)=>n+(j.images?.length||0),0),urls=[...new Set(batch.jobs.map(j=>j.url).filter(Boolean))];
  const entry={id:batch.id,prompt:batch.prompt,createdAt:batch.createdAt,total:batch.total,got,urls,error:batch.jobs.find(j=>j.error)?.error||''};
  const {cgptLog=[]}=await chrome.storage.local.get(['cgptLog']);await chrome.storage.local.set({cgptLog:[entry,...cgptLog.filter(e=>e.id!==batch.id)].slice(0,100)});
  batches=batches.filter(b=>b!==batch||got);renderFeed();await renderLog();
 }
 async function renderLog(){
  const {cgptLog=[]}=await chrome.storage.local.get(['cgptLog']);const list=cgptLog.filter(e=>!e.got);$('historyBox').hidden=!list.length;const box=$('historyList');box.replaceChildren();
  for(const e of list.slice(0,20)){const item=document.createElement('div');item.className='log';const p=document.createElement('p');p.textContent=e.prompt||t('（仅参考图）','(references only)');
   const row=document.createElement('div');row.className='row';const when=document.createElement('span');when.textContent=new Date(e.createdAt).toLocaleString(zh?'zh-CN':'en',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' · '+e.total+t(' 张',' images');const state=document.createElement('span');state.className='failed';state.textContent=t('没有出图','No image');state.title=e.error||'';row.append(when,state);item.append(p,row);
   if(e.urls.length){const open=document.createElement('button');open.type='button';open.className='link';open.textContent=t('打开会话','Open conversation')+(e.urls.length>1?' ('+e.urls.length+')':'');open.onclick=()=>{for(const url of e.urls)chrome.tabs.create({url,active:false});};item.append(open);}
   box.append(item);}
 }
 function renderFeed(){
  const feed=$('feed');feed.replaceChildren();
  // runs without any image (failed, stopped) are listed in the conversation log instead
  const visible=batches.filter(b=>b.running||b.jobs.some(j=>j.status!=='failed'));
  if(!visible.length){const empty=document.createElement('div');empty.className='empty glass';const b=document.createElement('b');b.textContent=t('从一句提示词开始','Start with a prompt');empty.append(b,t('写下提示词，或 Ctrl+V 粘贴参考图，然后点「生成」。结果和历史都在这里，也存在资料库。','Write a prompt or paste references with Ctrl+V, then Generate. Results and history stay here and in your library.'));feed.append(empty);}
  let day='';for(const batch of visible){const label=dayLabel(batch.createdAt);if(label!==day){day=label;const h=document.createElement('h2');h.className='day';h.textContent=label;feed.append(h);}feed.append(batchCard(batch));}
  $('more').hidden=allRecords.length<=shown;
 }
 async function loadRecordsIndex(){allRecords=(await store('readonly',s=>s.getAll())||[]).filter(r=>['chatgpt-studio','import'].includes(RecordKinds.kindOf(r))).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));$('more').hidden=allRecords.length<=shown;}
 function renderBatch(batch){const old=document.querySelector('.batch[data-batch="'+batch.id+'"]');if(old)old.replaceWith(batchCard(batch));}
 function renderJob(batch,job){
  const card=document.querySelector('.batch[data-batch="'+batch.id+'"]');if(!card)return;
  if(job.status==='done'||job.status==='failed'){renderBatch(batch);return;}
  const cellsOfJob=card.querySelectorAll('[data-job="'+job.id+'"]');if(!cellsOfJob.length||cellsOfJob[0].classList.contains('failed')||cellsOfJob[0].classList.contains('done')){renderBatch(batch);return;}
  for(const cell of cellsOfJob){cell.querySelector('.pct').textContent=(job.percent||0)+'%';cell.querySelector('.stage').textContent=stageText(job);}
  card.querySelector('.state').textContent=stateOf(batch).text;card.querySelector('.bar i').style.width=batchPercent(batch)+'%';
 }

 // the side panel sticks just under the header, whatever height the header has (references, notices, settings)
 new ResizeObserver(([entry])=>document.documentElement.style.setProperty('--head-h',Math.round(entry.target.offsetHeight-18)+'px')).observe($('head'));
 // ---- start ----
 async function start(){
  // inside the settings page (?embed=1): no own background or brand, the page around it provides them
  if(new URLSearchParams(location.search).get('embed')==='1'){document.documentElement.classList.add('in-settings');
   const row=document.createElement('div');row.className='dock-meta';$('plan').before(row);row.append($('plan'),$('runningChip'),$('uploadMeter'),$('sessionsToggle'));$('appearance').remove();document.querySelector('.head .top').remove();}
  zh=(await PluginKit.start()).zh;applyLanguage();
  PluginKit.onLanguage(value=>{zh=value;applyLanguage();renderSettings();renderSessions();renderFeed();renderLog();});
  const saved=await chrome.storage.local.get(['cgptStudio','studio','plugins']);
  settings={...settings,...(saved.cgptStudio||{})};settings.count=Math.min(40,Math.max(1,Number(settings.count)||4));settings.sessions=Math.min(10,Math.max(1,Number(settings.sessions)||4));
  prefixes=Array.isArray(saved.studio?.prefixes)?saved.studio.prefixes:[];if(!settings.prefix&&saved.studio?.activePrefix)settings.prefix=saved.studio.activePrefix;
  const custom=saved.plugins?.chatgpt?.limits||{};limits={maxFiles:Math.min(20,Math.max(1,Number(custom.maxFiles)||10)),maxImageMB:Math.min(50,Math.max(1,Number(custom.maxImageMB)||20))};
  if(saved.plugins?.chatgpt?.enabled!==true)notice(t('ChatGPT 生图工作台插件未开启：请在「设置 → 插件市场」打开。','The ChatGPT image studio plugin is off: turn it on in Settings → Plugins.'));
  renderSettings();renderSessions();await uploads();await restoreWorkers();await loadRegistry();await loadFeed();renderLog();loadSkills();prepareSkill();
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.studio){prefixes=changes.studio.newValue?.prefixes||[];renderSettings();}if(changes.promptProfiles||changes.activeCloudSkill)loadSkills();});
  addEventListener('beforeunload',event=>{if(running().length){event.preventDefault();event.returnValue='';}});
 }
 globalThis.__imagepromptStudioPlan=plan;
 start();
})();
