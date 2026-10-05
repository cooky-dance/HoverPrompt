/* The library composer: one reference window for both jobs. "Generate prompts" reverses the uploaded images; "Generate"
   makes images — text to image when there are no references, image to image with the references (in the strip's order).
   The prompt is what you type, else the current record's reversed prompt; a saved prefix always goes first. Ratio
   (preview box + portrait/square/landscape + slider), 1–10 images, long-side pixels (the source's, a preset or custom).
   Results attach to the current record (its Generated images) or, without one, to a new generation record.
   The generation half belongs to the "Image studio" plugin (on by default; Plugins can switch it off). The floating
   window keeps its compact layout. Loaded after app.js (uses its globals). */
globalThis.StudioUI=(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):String(value).split(' / ')[0];
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 const RATIOS=['9:21','9:16','2:3','3:4','4:5','1:1','5:4','4:3','3:2','16:9','21:9'],ORIENT={portrait:'2:3',square:'1:1',landscape:'3:2'},TICKS=['9:16','3:4','1:1','4:3','16:9'];
 const COUNTS=[1,2,3,4,5,6,7,8,9,10],PIXELS=[1024,1536,2048],POOL=3;
 const embedded=new URLSearchParams(location.search).get('embed')==='1';
 let pane=null,controls=null,state={ratio:'1:1',count:4,pixels:0,prefixes:[],activePrefix:'',prompt:''},jobs=[],batch=null,controller=null,editing=false,enabled=true;
 async function load(){const saved=await chrome.storage.local.get(['studio','plugins']);state={...state,...(saved.studio||{})};if(!RATIOS.includes(state.ratio))state.ratio='1:1';if(!COUNTS.includes(state.count))state.count=4;state.pixels=Math.max(0,Math.round(Number(state.pixels)||0));enabled=saved.plugins?.studio?.enabled!==false;}
 const save=()=>chrome.storage.local.set({studio:{ratio:state.ratio,count:state.count,pixels:state.pixels,prefixes:state.prefixes,activePrefix:state.activePrefix,prompt:state.prompt}});
 const prefix=()=>state.prefixes.find(p=>p.id===state.activePrefix)||null;
 // The prompt: what the user typed, else the current record's reversed prompt. The prefix always comes first.
 async function basePrompt(){
  const typed=String(state.prompt||'').trim();if(typed)return typed;
  if(!currentId)return '';const task=await getTask(currentId);if(!task)return '';
  return String(task.prompts?.en||task.en||LanguageUI.preferred?.(task)?.prompt||task.zh||'').trim();
 }
 const compose=body=>[String(prefix()?.text||'').trim(),body].filter(Boolean).join('\n');
 // references are the images in the window above (nothing there: text to image)
 const references=()=>globalThis.LibraryUpload?.images()||[];
 const mode=()=>references().length?'image':'text';
 // ---- layout: one bar like the ChatGPT studio — attach / prompt / settings / "Generate prompts" / "Generate" — with the
 // references under it; the settings open from the gear or the prompt box and fold away on a click elsewhere ----
 let bar=null,area=null,chipSlot=null,panel=null,toggle=null,go=null,panelOpen=false;
 const ICON={clip:'<path d="M21 11.5 12.6 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>',gear:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'};
 const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
 function build(){
  const card=document.getElementById('imageSelection');if(!card||document.getElementById('libraryGen'))return false;
  pane=el('div','studio');pane.id='libraryGen';
  if(embedded){document.getElementById('status').after(pane);return true;}
  card.classList.add('unified','compact');
  bar=el('div','lib-bar');
  const attach=el('label','lib-icon lib-attach');attach.innerHTML=svg(ICON.clip);const file=document.getElementById('file');if(file){file.hidden=true;attach.append(file);}
  chipSlot=el('div','lib-chip');
  area=el('textarea');area.id='studioText';area.rows=1;area.value=state.prompt;
  area.oninput=()=>{state.prompt=area.value;grow();clearTimeout(area.timer);area.timer=setTimeout(save,400);};
  area.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();start();}};
  area.onfocus=()=>openPanel(true);
  const promptBox=el('div','lib-prompt');promptBox.append(chipSlot,area);
  toggle=el('button','lib-icon lib-settings-toggle');toggle.type='button';toggle.id='libSettingsToggle';toggle.innerHTML=svg(ICON.gear);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','libSettings');toggle.onclick=()=>openPanel(!panelOpen);
  const analyze=document.getElementById('analyze');
  go=el('button','primary studio-go');go.type='button';go.id='studioGenerate';go.onclick=()=>controller?controller.abort():start();
  bar.append(attach,promptBox,toggle,...(analyze?[analyze]:[]),go);
  // references: the thumbnail strip appears here once images are added (drop or paste them on the bar)
  const refsArea=el('div','lib-refs');refsArea.append(el('span','hint composer-mode'));
  for(const id of ['dropzone','uploadStrip','preview']){const node=document.getElementById(id);if(node)refsArea.append(node);}
  panel=el('div','lib-settings');panel.id='libSettings';panel.hidden=true;controls=el('div','composer-gen');
  const focus=document.getElementById('focus')?.closest('label');panel.append(controls,...(focus?[focus]:[]));
  const statusLine=el('div','lib-status');for(const id of ['status','taskTime','jobCounts']){const node=document.getElementById(id);if(node)statusLine.append(node);}
  card.replaceChildren(bar,refsArea,panel,statusLine,pane);addEventListener('resize',grow);
  for(const target of [bar,refsArea]){target.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();bar.classList.add('drop');}});
   target.addEventListener('dragleave',event=>{if(!target.contains(event.relatedTarget))bar.classList.remove('drop');});
   target.addEventListener('drop',event=>{bar.classList.remove('drop');if(event.dataTransfer.files.length){event.preventDefault();event.stopPropagation();globalThis.LibraryUpload?.add(event.dataTransfer.files);}});}
  // Ctrl+V with an image anywhere on the library page adds it as a reference
  document.addEventListener('paste',event=>{if(document.body.dataset.settingsPage&&document.body.dataset.settingsPage!=='history')return;const files=[...(event.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(!files.length)return;event.preventDefault();globalThis.LibraryUpload?.add(files);});
  // a click outside the composer, on something that is not a control, folds the settings away
  document.addEventListener('pointerdown',event=>{if(!panelOpen||event.button!==0)return;const target=event.target;if(card.contains(target))return;if(target.closest('button,a,input,select,textarea,label,summary,dialog,[role="button"],[tabindex],[contenteditable="true"]'))return;openPanel(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panelOpen)openPanel(false);});
  return true;
 }
 function grow(){if(!area)return;area.style.height='auto';area.style.height=Math.min(160,area.scrollHeight)+'px';}
 function openPanel(open){if(!panel)return;panelOpen=!!open;panel.hidden=!panelOpen;toggle.setAttribute('aria-expanded',String(panelOpen));bar.classList.toggle('open',panelOpen);}
 // the ratio control updates in place while the slider moves (rebuilding it mid-drag made the drag stall)
 function ratioPicker(){
  const box=el('div','ratio-picker');box.setAttribute('role','group');box.setAttribute('aria-label',T('画面比例 / Aspect ratio'));
  const preview=el('div','ratio-preview'),frame=el('i'),label=el('span');preview.append(frame,label);
  const right=el('div','ratio-controls'),orient=el('div','segmented ratio-orientation');
  const buttons=[['portrait','竖图 / Portrait'],['square','方图 / Square'],['landscape','横图 / Landscape']].map(([id,text])=>{const b=el('button','',T(text));b.type='button';b.dataset.orientation=id;b.onclick=()=>set(ORIENT[id]);orient.append(b);return b;});
  const slider=el('input');slider.type='range';slider.id='studioRatio';slider.min='0';slider.max=String(RATIOS.length-1);slider.step='1';slider.setAttribute('aria-label',T('画面比例 / Aspect ratio'));
  const ticks=el('div','ratio-ticks'),tickButtons=TICKS.map(r=>{const b=el('button','',r);b.type='button';b.style.left=(RATIOS.indexOf(r)/(RATIOS.length-1)*100)+'%';b.onclick=()=>set(r);ticks.append(b);return b;});
  function paint(){const [w,h]=state.ratio.split(':').map(Number),scale=Math.min(72/w,56/h),current=w===h?'square':w<h?'portrait':'landscape';frame.style.width=Math.round(w*scale)+'px';frame.style.height=Math.round(h*scale)+'px';label.textContent=state.ratio.replace(':',' : ');
   for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.orientation===current));for(const b of tickButtons)b.setAttribute('aria-pressed',String(b.textContent===state.ratio));
   if(document.activeElement!==slider)slider.value=String(RATIOS.indexOf(state.ratio));slider.setAttribute('aria-valuetext',state.ratio);}
  function set(ratio){state.ratio=ratio;slider.value=String(RATIOS.indexOf(ratio));paint();clearTimeout(set.timer);set.timer=setTimeout(save,250);}
  slider.oninput=()=>set(RATIOS[Number(slider.value)]||'1:1');
  right.append(orient,slider,ticks);box.append(preview,right);paint();return box;
 }
 function pixelField(){
  const label=el('label','studio-field');label.append(el('span','',T('像素（长边） / Pixels (long side)')));
  const select=el('select');select.id='studioPixels';select.add(new Option(T('跟随生图来源 / As the source'),'0'));for(const px of PIXELS)select.add(new Option(String(px),String(px)));select.add(new Option(T('自定义… / Custom…'),'custom'));
  const custom=el('input');custom.type='number';custom.id='studioPixelsCustom';custom.min='256';custom.max='8192';custom.step='16';custom.placeholder='2560';custom.setAttribute('aria-label',T('自定义长边像素 / Custom long-side pixels'));
  const isPreset=!state.pixels||PIXELS.includes(state.pixels);select.value=isPreset?String(state.pixels||0):'custom';custom.hidden=isPreset;custom.value=isPreset?'':String(state.pixels);
  select.onchange=()=>{if(select.value==='custom'){custom.hidden=false;custom.focus();return;}state.pixels=Number(select.value);save();render();};
  custom.onchange=()=>{const px=Math.round(Number(custom.value)/16)*16;if(px>=256&&px<=8192){state.pixels=px;custom.value=String(px);save();}else custom.value=state.pixels&&!PIXELS.includes(state.pixels)?String(state.pixels):'';};
  const pair=el('span','pixel-pair');pair.append(select,custom);label.append(pair);return label;
 }
 function render(){
  if(!pane)return;const running=!!controller,gen=enabled;pane.hidden=!jobs.length;
  if(embedded){pane.hidden=true;return;}
  const card=document.getElementById('imageSelection');card?.classList.toggle('gen-off',!gen);
  const refs=references(),modeLabel=card?.querySelector('.composer-mode');
  if(modeLabel){modeLabel.hidden=!refs.length;modeLabel.textContent=refs.length+'/10 '+(gen?T('张参考图 · 图生图，按顺序使用 / references · image to image, in order'):T('张图 / images'));}
  if(area){area.hidden=!gen;area.placeholder=T('描述想生成的画面，留空则用反推出的提示词 / Describe the image; empty uses the reversed prompt');area.title=T('Ctrl+Enter 生图 · Ctrl+V 粘贴参考图 / Ctrl+Enter to generate · Ctrl+V to paste references');if(area.value!==state.prompt&&document.activeElement!==area)area.value=state.prompt;grow();}
  if(chipSlot){chipSlot.replaceChildren();const p=prefix();if(gen&&p){const chip=el('span','studio-prefix-chip',p.name);chip.title=T('固定前缀，永远放在最前面 / Prefix, always first')+'：'+p.text;chipSlot.append(chip);}}
  if(toggle){toggle.title=T('生图设置 / Generation settings');toggle.setAttribute('aria-label',toggle.title);}
  bar?.querySelector('.lib-attach')?.setAttribute('title',T('添加参考图（也可以拖进来或 Ctrl+V） / Add references (or drop them, or Ctrl+V)'));
  if(go){go.hidden=!gen;go.textContent=running?T('停止 / Stop'):T('生图 {n} 张 / Generate {n}').replace(/\{n\}/g,state.count);}
  if(controls){
   controls.replaceChildren();controls.hidden=!gen;
   if(gen){
    const row=el('div','studio-row');
    const count=el('label','studio-field');count.append(el('span','',T('张数 / Images')));const countSelect=el('select');countSelect.id='studioCount';for(const n of COUNTS)countSelect.add(new Option(String(n),String(n)));countSelect.value=String(state.count);countSelect.onchange=()=>{state.count=Number(countSelect.value);save();if(go&&!controller)go.textContent=T('生图 {n} 张 / Generate {n}').replace(/\{n\}/g,state.count);};count.append(countSelect);
    const pre=el('label','studio-field');pre.append(el('span','',T('固定前缀 / Prefix')));const preSelect=el('select');preSelect.id='studioPrefix';preSelect.add(new Option(T('不用前缀 / No prefix'),''));for(const p of state.prefixes)preSelect.add(new Option(p.name,p.id));preSelect.value=state.activePrefix||'';preSelect.onchange=()=>{state.activePrefix=preSelect.value;save();render();};pre.append(preSelect);
    const manage=el('button','studio-link',T('管理前缀 / Manage prefixes'));manage.type='button';manage.setAttribute('aria-expanded',String(editing));manage.onclick=()=>{editing=!editing;render();};
    row.append(count,pixelField(),pre,manage);
    controls.append(ratioPicker(),row);if(editing)controls.append(prefixEditor());
   }
  }
  pane.replaceChildren();
  const status=el('p','hint studio-status');status.id='studioStatus';status.setAttribute('role','status');status.textContent=statusText();pane.append(status);
  const grid=el('div','studio-grid');grid.dataset.ratio=batch?.ratio||state.ratio;for(const job of jobs)grid.append(card_(job));pane.append(grid);
 }
 // While images arrive only the results, status and button change, so typing is not interrupted.
 function renderResults(){if(!pane)return;const grid=pane.querySelector('.studio-grid');if(!grid){render();return;}grid.dataset.ratio=batch?.ratio||state.ratio;grid.replaceChildren(...jobs.map(card_));pane.hidden=!jobs.length;const status=pane.querySelector('#studioStatus');if(status)status.textContent=statusText();const go=document.getElementById('studioGenerate');if(go)go.textContent=controller?T('停止 / Stop'):T('生图 {n} 张 / Generate {n}').replace(/\{n\}/g,state.count);}
 function statusText(){if(!jobs.length)return '';const done=jobs.filter(j=>j.status==='done').length,failed=jobs.filter(j=>j.status==='failed').length;return T('完成 {d}/{n} · 失败 {f} / Done {d}/{n} · failed {f}').replace(/\{d\}/g,done).replace(/\{n\}/g,jobs.length).replace(/\{f\}/g,failed);}
 function card_(job){
  const cell=el('figure','studio-card');cell.dataset.status=job.status;
  if(job.image){const img=el('img');img.src=job.image;img.alt='';img.onclick=()=>zoom(job);cell.append(img);}
  else cell.append(el('div','studio-wait',job.status==='failed'?T('失败 / Failed'):job.status==='running'?T('生成中 / Generating'):T('排队中 / Queued')));
  const actions=el('figcaption','studio-actions');
  if(job.image){
   const again=el('button','',T('再生成 / Again'));again.type='button';again.onclick=()=>rerun(job);
   const asRef=el('button','',T('作参考 / Use as reference'));asRef.type='button';asRef.onclick=async()=>{const blob=await (await fetch(job.image)).blob();await globalThis.LibraryUpload?.add([new File([blob],'reference.png',{type:blob.type})]);render();};
   const download=el('a','studio-download',T('下载 / Download'));download.href=job.image;download.download='hoverprompt-'+job.id.slice(0,8)+(job.image.startsWith('data:image/png')?'.png':'.jpg');
   actions.append(again,asRef,download);
  }else if(job.status==='failed'){actions.append(el('span','studio-error',job.error||''));const again=el('button','',T('重试 / Retry'));again.type='button';again.onclick=()=>rerun(job);actions.append(again);}
  cell.append(actions);return cell;
 }
 function zoom(job){
  const dialog=el('dialog','studio-zoom');const img=el('img');img.src=job.image;img.alt='';const meta=el('p','hint',[job.model,job.size,job.sourceName].filter(Boolean).join(' · '));
  const close=el('button','',T('关闭 / Close'));close.type='button';close.onclick=()=>dialog.close();
  // every enlarged image: Download and Copy prompt
  const download=el('button','',T('下载 / Download'));download.type='button';download.onclick=()=>globalThis.GenFlow?.downloadImage?.(job.image,job.id);
  const copy=el('button','',T('复制提示词 / Copy prompt'));copy.type='button';const text=job.prompt||batch?.prompt||'';copy.disabled=!text;copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);copy.textContent=T('已复制 / Copied');}catch{copy.textContent=T('复制失败 / Copy failed');}};
  const row=el('div','studio-zoom-actions');row.append(download,copy,close);dialog.append(img,meta,row);dialog.addEventListener('close',()=>dialog.remove());dialog.onclick=event=>{if(event.target===dialog)dialog.close();};document.body.append(dialog);dialog.showModal();
 }
 function prefixEditor(){
  const box=el('div','studio-prefixes');box.id='studioPrefixes';
  for(const p of state.prefixes){
   const row=el('div','studio-prefix-row');const name=el('input');name.value=p.name;name.setAttribute('aria-label',T('名称 / Name'));name.onchange=()=>{p.name=name.value.trim().slice(0,40)||p.name;save();render();};
   const text=el('textarea');text.rows=2;text.value=p.text;text.setAttribute('aria-label',T('前缀内容 / Prefix text'));text.onchange=()=>{p.text=text.value.slice(0,2000);save();render();};
   const remove=el('button','studio-link',T('删除 / Delete'));remove.type='button';remove.onclick=()=>{state.prefixes=state.prefixes.filter(x=>x!==p);if(state.activePrefix===p.id)state.activePrefix='';save();render();};
   row.append(name,text,remove);box.append(row);
  }
  const add=el('button','',T('＋ 新建前缀 / ＋ New prefix'));add.type='button';add.id='studioAddPrefix';add.onclick=()=>{const p={id:crypto.randomUUID(),name:T('前缀 / Prefix')+' '+(state.prefixes.length+1),text:''};state.prefixes.push(p);state.activePrefix=p.id;save();render();document.querySelector('#studioPrefixes .studio-prefix-row:last-child textarea')?.focus();};
  box.append(add);return box;
 }
 // Results: generations on the current record, or a new generation record when there is none.
 async function persist(){
  if(!batch)return;const finished=jobs.filter(j=>j.status==='done'||j.status==='failed');if(!finished.some(j=>j.image))return;
  const generations=finished.map(j=>({id:j.id,mode:batch.mode,status:j.status,createdAt:j.createdAt,finishedAt:j.finishedAt,prompt:batch.prompt,model:j.model||'',sourceName:j.sourceName||'',size:j.size||'',runMs:j.runMs,image:j.image||undefined,error:j.error||undefined,aspect:batch.ratio,references:batch.references.length}));
  let task=batch.taskId?await getTask(batch.taskId):null;
  if(task){const ids=new Set(generations.map(g=>g.id));task.generations=[...(task.generations||[]).filter(g=>!ids.has(g.id)),...generations].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));}
  else task={id:batch.recordId,kind:'generation',createdAt:batch.createdAt,status:'done',source:'studio',params:{ratio:batch.ratio,mode:batch.mode,count:jobs.length,pixels:batch.pixels||undefined},zh:batch.prompt,en:batch.prompt,focus:'',image:batch.references[0]||generations.find(g=>g.image).image,generations};
  await saveTask(task);clearTimeout(persist.timer);persist.timer=setTimeout(()=>renderHistory().catch(()=>{}),300);
 }
 async function runJob(job,signal){
  job.status='running';job.startedAt=Date.now();renderResults();
  try{
   const refs=batch.references,result=await ImageGen.route({prompt:batch.prompt,...(refs.length>1?{images:refs}:refs.length?{image:refs[0]}:{}),aspect:batch.ratio,...(batch.pixels?{pixels:batch.pixels}:{}),signal});
   Object.assign(job,{status:'done',image:result.images[0],model:result.model,sourceName:result.sourceName,size:result.size,runMs:result.runMs,finishedAt:Date.now()});
  }catch(error){if(error.name==='AbortError'){job.status='failed';job.error=T('已停止 / Stopped');}else Object.assign(job,{status:'failed',error:error.message,finishedAt:Date.now()});}
  await persist().catch(()=>{});renderResults();
 }
 async function start(){
  if(controller)return;const status=()=>document.getElementById('studioStatus');const body=await basePrompt(),refs=references(),kind=refs.length?'image':'text';
  if(kind==='text'&&!body){const line=document.getElementById('status');if(line)line.textContent=T('写下生图提示词、先生成提示词，或放入参考图 / Type a prompt, generate one first, or add references');area?.focus();return;}
  const prompt=compose(body||T('参考图片的风格与内容 / Follow the style and content of the reference images'));
  const task=currentId?await getTask(currentId):null;
  batch={taskId:task?.id||null,recordId:RecordKinds.newId('generation'),createdAt:Date.now(),prompt,ratio:state.ratio,pixels:state.pixels||0,mode:kind,references:refs};
  jobs=Array.from({length:state.count},()=>({id:crypto.randomUUID(),status:'queued',createdAt:Date.now()}));
  controller=new AbortController();const signal=controller.signal;render();
  let next=0;const worker=async()=>{while(next<jobs.length&&!signal.aborted){const job=jobs[next++];await runJob(job,signal);}};
  try{await Promise.all(Array.from({length:Math.min(POOL,jobs.length)},worker));}
  finally{for(const job of jobs)if(job.status==='queued'){job.status='failed';job.error=T('已停止 / Stopped');}controller=null;await persist().catch(()=>{});render();}
 }
 async function rerun(job){if(!batch||controller)return;controller=new AbortController();try{Object.assign(job,{status:'queued',image:null,error:null});await runJob(job,controller.signal);}finally{controller=null;render();}}
 async function init(){
  if(!build())return;await load();render();
  document.addEventListener('imageprompt-language',()=>render());document.addEventListener('imageprompt-uploads',()=>{if(!controller)render();});
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(changes.plugins){enabled=changes.plugins.newValue?.studio?.enabled!==false;render();}if(changes.studio&&!controller){const next=changes.studio.newValue||{};if(JSON.stringify(next.prefixes)!==JSON.stringify(state.prefixes)){state.prefixes=next.prefixes||[];render();}}});
 }
 return {init,compose:body=>compose(body),state:()=>state,mode};
})();
// Starts after every script has run (it needs app.js).
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>StudioUI.init(),{once:true});else StudioUI.init();
