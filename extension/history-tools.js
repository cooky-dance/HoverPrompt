globalThis.HistoryTools=(()=>{
 let visibleIds=[],anchor=null,rangeStart=null,rangeChecked=true,rangeMode=false,search='',filter='all',exporting=false,batchRunning=false,genBusy=false,visibleGenKeys=[],sortOrder='desc',dateFrom='',dateTo='';
 const $=id=>document.getElementById(id),t=value=>LanguageUI.text(value),floating=new URLSearchParams(location.search).get('embed')==='1';
 const filters=document.createElement('div');filters.className='history-toolbar';filters.innerHTML='<label class="history-search">搜索历史 / Search library<input id="historySearch" type="search" placeholder="搜索时间、关键词、任务 ID / Search time, keyword or task ID"></label><label>任务状态 / Task status<select id="historyFilter"><option value="all">全部 / All</option><option value="done">已完成 / Completed</option><option value="failed">失败 / Failed</option><option value="pending">处理中 / In progress</option></select></label><button id="selectVisible" type="button">全选当前结果 / Select visible</button><button id="clearSelection" type="button">取消选择 / Clear selection</button><button id="retryTasks" type="button" title="立即开始失败或等待中的任务（已选记录优先，否则当前筛选结果） / Start failed or waiting tasks now (selected records, otherwise the filtered list)">重试 / Retry</button><span id="historyCount" class="hint"></span>';
 $('historySection').insertBefore(filters,$('historyStatus'));
 // View switch: analysed records, or every generated image as its own card (same search/status/date/sort filters).
 const scopes=new Map();let scope='all';
 let view='records';try{if(localStorage.getItem('imageprompt.historyView')==='generated')view='generated';}catch{}
 const viewSwitch=document.createElement('div');viewSwitch.id='historyViewSwitch';viewSwitch.className='segmented history-view-switch';viewSwitch.setAttribute('role','tablist');
 viewSwitch.innerHTML='<button type="button" data-view="records">反推 / Reverse</button><button type="button" data-view="generated">生图 / Generated</button>';
 filters.before(viewSwitch);
 // a plugin scope (e.g. ChatGPT images) adds its own tab to this row; while a scope is on, its tab is the pressed one
 const paintView=()=>{for(const button of viewSwitch.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(scope==='all'&&button.dataset.view===view));for(const button of viewSwitch.querySelectorAll('[data-scope-tab]'))button.setAttribute('aria-pressed',String(button.dataset.scopeTab===scope));document.body.dataset.historyView=view;};
 function setView(next,render=true){if(next!=='records'&&next!=='generated')return;if(next!==view){view=next;anchor=null;rangeStart=null;try{localStorage.setItem('imageprompt.historyView',view);}catch{}}paintView();if(render){globalThis.resetHistoryLimit?.();renderHistory();}}
 viewSwitch.onclick=event=>{const next=event.target.closest('[data-view]')?.dataset.view;if(!next)return;if(scope!=='all'){setView(next,false);setScope('all');return;}if(next!==view)setView(next);};
 paintView();
 // Scopes: a plugin can add a library scope (e.g. the ChatGPT image studio) that narrows records, generated images and
 // their statistics to its own tasks. The scope buttons belong to the plugin; the library only filters.
 const inScope=task=>scope==='all'||!!scopes.get(scope)?.match(task);
 const scopeTitle=kind=>scope==='all'?null:scopes.get(scope).label+(kind==='generated'?' · 生图统计 / image statistics':' · 统计 / statistics');
 function registerScope(definition){scopes.set(definition.id,definition);}
 function unregisterScope(id){scopes.delete(id);if(scope===id)setScope('all');}
 function setScope(id){const next=scopes.has(id)?id:'all';if(next===scope)return;scope=next;anchor=null;rangeStart=null;document.body.dataset.historyScope=scope;paintView();globalThis.resetHistoryLimit?.();renderHistory();document.dispatchEvent(new CustomEvent('imageprompt-history-scope',{detail:{scope}}));}
 // Filter button (left of search): sort order and a custom date range; the dot shows when anything is non-default.
 const filterToggle=document.createElement('button');filterToggle.id='historyFilterToggle';filterToggle.type='button';filterToggle.className='filter-toggle';filterToggle.setAttribute('aria-expanded','false');filterToggle.setAttribute('aria-controls','historyFilterPanel');filterToggle.textContent='筛选 / Filter';
 filters.insertBefore(filterToggle,filters.firstChild);
 const filterPanel=document.createElement('div');filterPanel.id='historyFilterPanel';filterPanel.className='history-filter-panel';filterPanel.hidden=true;
 filterPanel.innerHTML='<label>排序 / Sort<select id="historySort"><option value="desc">时间倒序（最新在前）/ Newest first</option><option value="asc">时间正序（最早在前）/ Oldest first</option></select></label><label>开始日期 / From<input id="historyFrom" type="date"></label><label>结束日期 / To<input id="historyTo" type="date"></label><button id="historyFilterReset" type="button" class="secondary">清除筛选 / Reset</button>';
 filters.after(filterPanel);
 const searchHint=document.createElement('p');searchHint.id='historySearchHint';searchHint.className='hint';searchHint.textContent='可在已保存的所有语言提示词中搜索；也可输入时间（如 2026-09-29、09-29 14:30）或任务 ID / Searches every saved prompt language, plus time (e.g. 2026-09-29, 09-29 14:30) and task ID';
 filterPanel.after(searchHint);
 function filterActive(){return sortOrder!=='desc'||!!dateFrom||!!dateTo;}
 function syncFilterButton(){filterToggle.classList.toggle('active-filter',filterActive());}
 filterToggle.onclick=()=>{filterPanel.hidden=!filterPanel.hidden;filterToggle.setAttribute('aria-expanded',String(!filterPanel.hidden));};
 filterPanel.addEventListener('change',()=>{sortOrder=$('historySort').value;dateFrom=$('historyFrom').value;dateTo=$('historyTo').value;if(dateFrom&&dateTo&&dateFrom>dateTo){[dateFrom,dateTo]=[dateTo,dateFrom];$('historyFrom').value=dateFrom;$('historyTo').value=dateTo;}anchor=null;rangeStart=null;syncFilterButton();renderHistory();});
 filterPanel.querySelector('#historyFilterReset').onclick=()=>{sortOrder='desc';dateFrom='';dateTo='';$('historySort').value='desc';$('historyFrom').value='';$('historyTo').value='';syncFilterButton();renderHistory();};
 // Library statistics (settings page only). A task that ever failed or needed an automatic retry counts as a
 // failure even if a later retry succeeded, so the success rate reflects first-attempt reliability.
 const WINDOWS={all:Infinity,'30d':2592e6,'7d':6048e5,'24h':864e5},WINDOW_LABELS={all:'全部 / All','30d':'30 天 / 30d','7d':'7 天 / 7d','24h':'24 小时 / 24h'};
 let statsWindow='7d';try{const saved=localStorage.getItem('imageprompt.statsWindow');if(saved in WINDOWS)statsWindow=saved;}catch{}
 const statsPanel=document.createElement('section');statsPanel.id='libraryStats';statsPanel.className='library-stats';
 statsPanel.innerHTML='<div class="stats-head"><strong class="stats-title">任务统计 / Task statistics</strong><div class="stats-windows segmented" role="group">'+Object.keys(WINDOWS).map(key=>'<button type="button" data-window="'+key+'"></button>').join('')+'</div></div>'+
  '<div class="stats-body"><figure class="stats-gauge" title=""><svg viewBox="0 0 120 72" aria-hidden="true"><path class="gauge-track" d="M12 64 A48 48 0 0 1 108 64"/><path class="gauge-arc" d="M12 64 A48 48 0 0 1 108 64" pathLength="100"/><line class="gauge-needle" x1="60" y1="64" x2="60" y2="24"/><circle class="gauge-hub" cx="60" cy="64" r="4.5"/></svg><figcaption><span class="gauge-value">—</span><span class="gauge-label"></span></figcaption></figure><dl class="stats-grid"></dl></div>';
 if(!floating)$('historySection').insertBefore(statsPanel,filters);
 let lastRecords=[],lastTitle='任务统计 / Task statistics';
 const selected=()=>view==='generated'?(globalThis.genSelection ||=new Set()):(globalThis.historySelection ||=new Set());
 const visibleKeys=()=>view==='generated'?visibleGenKeys:visibleIds;
 const seconds=ms=>ms==null?'—':ms<60000?(ms/1000).toFixed(1)+'s':Math.floor(ms/60000)+'m'+String(Math.round(ms%60000/1000)).padStart(2,'0')+'s';
 function renderStats(records=lastRecords,title=lastTitle){
  lastRecords=records;lastTitle=title;if(floating)return;
  const since=Date.now()-WINDOWS[statsWindow],list=records.filter(r=>(r.createdAt||0)>=since);
  const count=status=>list.filter(r=>status.includes(r.status)).length;
  const done=list.filter(r=>r.status==='done'),failed=count(['failed']),finished=done.length+failed;
  const recovered=done.filter(r=>r.failCount>0||r.retryCount>0).length,clean=done.length-recovered;
  const runs=done.map(r=>r.timing?.runMs).filter(ms=>Number.isFinite(ms)&&ms>=0).sort((a,b)=>a-b);
  const median=runs.length?(runs.length%2?runs[(runs.length-1)/2]:(runs[runs.length/2-1]+runs[runs.length/2])/2):null;
  const average=runs.length?runs.reduce((a,b)=>a+b,0)/runs.length:null;
  const cells=[['全部 / Total',list.length],['成功 / Done',done.length],['失败 / Failed',failed],['队列 / Queued',count(['queued'])],['正在运行 / Running',count(['running','retrying'])],
   ['重试后成功 / Recovered',recovered],['平均时长 / Avg run',seconds(average)],['中位时长 / Median run',seconds(median)]];
  statsPanel.querySelector('.stats-grid').innerHTML=cells.map(([label,value])=>'<div class="stat-card"><dt>'+t(label)+'</dt><dd>'+value+'</dd></div>').join('');
  // Gauge: first-attempt success rate; retried successes count as failures.
  const rate=finished?clean/finished*100:null,gauge=statsPanel.querySelector('.stats-gauge');
  gauge.dataset.tone=rate==null?'none':rate>=85?'good':rate>=60?'warn':'bad';
  gauge.querySelector('.gauge-arc').style.strokeDasharray=(rate??0).toFixed(1)+' 100';
  gauge.querySelector('.gauge-needle').setAttribute('transform','rotate('+(-90+(rate??0)*1.8).toFixed(1)+' 60 64)');
  gauge.querySelector('.gauge-value').textContent=rate==null?'—':rate.toFixed(1)+'%';
  gauge.querySelector('.gauge-label').textContent=t('成功率 / Success rate');
  gauge.title=t('首次即成功 '+clean+' ÷ 已结束 '+finished+'（重试后成功算失败） / First-attempt successes '+clean+' of '+finished+' finished (retried successes count as failures)');
  for(const button of statsPanel.querySelectorAll('[data-window]')){button.setAttribute('aria-pressed',String(button.dataset.window===statsWindow));button.textContent=t(WINDOW_LABELS[button.dataset.window]);}
  statsPanel.querySelector('.stats-title').textContent=t(title);
 }
 statsPanel.querySelector('.stats-windows').onclick=event=>{const key=event.target.closest('[data-window]')?.dataset.window;if(!key)return;statsWindow=key;try{localStorage.setItem('imageprompt.statsWindow',key);}catch{}renderStats();};
 document.addEventListener('prompt-presentation-changed',()=>renderStats());
 const rangeButton=document.createElement('button');rangeButton.id='rangeSelection';rangeButton.type='button';rangeButton.setAttribute('aria-pressed','false');rangeButton.textContent='连续选择 / Range selection';filters.insertBefore(rangeButton,$('historyCount'));
 const rangeStatus=document.createElement('span');rangeStatus.id='rangeSelectionStatus';rangeStatus.className='hint';rangeStatus.setAttribute('role','status');rangeStatus.setAttribute('aria-live','polite');filters.append(rangeStatus);
 function describeRange(){rangeStatus.textContent=!rangeMode?'':rangeStart?t((rangeChecked?'选择':'取消选择')+'起点：第 '+(visibleIds.indexOf(rangeStart)+1)+' 条。再点终点。 / '+(rangeChecked?'Select':'Deselect')+' from record '+(visibleIds.indexOf(rangeStart)+1)+'. Click the end record.'):t('连续选择已开启：依次点击起点与终点选框。 / Range selection on: click the start and end checkboxes.');}
 $('retryTasks').onclick=()=>globalThis.retryHistoryTasks?.();
 rangeButton.onclick=()=>{rangeMode=!rangeMode;rangeStart=null;rangeButton.setAttribute('aria-pressed',String(rangeMode));update();};
 const bar=document.createElement('div');bar.id='libraryExportBar';bar.innerHTML='<div class="export-summary"><strong>导出资料库 / Export library</strong><span id="exportCount"></span></div><label>导出范围 / Scope<select id="historyExportScope"><option value="visible">当前筛选结果 / Filtered records</option><option value="selected">已选记录 / Selected records</option><option value="all">全部历史 / Entire library</option></select></label><label>文件格式 / Format<select id="historyExportFormat"><option value="zip">图片 + 提示词 ZIP / Images + prompts ZIP</option><option value="jsonl">JSONL · Agent 逐条读取 / JSONL · Agent records</option><option value="csv">CSV · 表格 / CSV · Spreadsheet</option></select></label><button id="exportHistoryNow" type="button">导出 / Export</button><span id="historyExportStatus" role="status"></span>';
 // Batch generation for the selected records, right under Export library: text to image ("Generate", from the prompt)
 // or image to image (with the original). Each record goes through the normal generation queue (concurrency and source
 // routing apply); results appear in the Generated view.
 let batchMode='text';try{batchMode=localStorage.getItem('imageprompt.batchMode')==='image'?'image':'text';}catch{}
 const batchGen=document.createElement('div');batchGen.id='libraryBatchGen';batchGen.className='batch-gen';
 batchGen.innerHTML='<div class="export-summary"><strong>批量生图 / Batch generation</strong><span id="batchGenCount"></span></div><div class="batch-mode" role="radiogroup" aria-label="生图方式 / Generation mode"><button type="button" role="radio" data-mode="text">文生图 / Text to image</button><button type="button" role="radio" data-mode="image">图生图 / Image to image</button></div><label><span id="batchGenProfileLabel"></span><select id="batchGenProfile"></select></label><button id="batchGenStart" type="button"></button><span id="batchGenStatus" role="status"></span>';
 bar.append(batchGen);
 const genBatch=document.createElement('div');genBatch.id='genBatchActions';genBatch.className='batch-gen gen-batch';
 genBatch.innerHTML='<div class="export-summary"><strong>所选生成图 / Selected images</strong><span id="genBatchCount"></span></div><div class="form-actions"><button id="genBatchRegenerate" type="button">重新生成 / Generate again</button><button id="genBatchDelete" type="button" class="danger">删除 / Delete</button></div><span id="genBatchStatus" role="status"></span>'+
  '<div class="gen-export"><strong>导出生成图 / Export generated images</strong><label>导出范围 / Scope<select id="genExportScope"><option value="visible">当前筛选结果 / Filtered images</option><option value="selected">已选生成图 / Selected images</option><option value="all">全部生成图 / All generated images</option></select></label><label>文件格式 / Format<select id="genExportFormat"><option value="zip">图片 + 提示词 ZIP / Images + prompts ZIP</option><option value="jsonl">JSONL · Agent 逐条读取 / JSONL · Agent records</option><option value="csv">CSV · 表格 / CSV · Spreadsheet</option></select></label><button id="genExportNow" type="button">导出 / Export</button><label class="checkbox-setting gen-sync"><input id="genSyncCloud" type="checkbox">纳入云端同步 / Include in cloud sync</label><span id="genExportStatus" role="status"></span></div>';
 bar.append(genBatch);
 document.body.append(bar);document.body.classList.add('has-export-bar');if(!floating)bar.classList.add('lg');
 // Settings page: selection tools live in the fixed export bar so they stay reachable while scrolling the list.
 // Multi-select: Shift-click (checkbox or card) selects a range; Ctrl-click (⌘ on macOS) toggles one card.
 const mac=/Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform||navigator.platform||navigator.userAgent);
 const selectionHint=document.createElement('p');selectionHint.id='selectionHint';selectionHint.className='hint selection-hint';selectionHint.textContent=mac?'⇧ 点选连续多选 · ⌘ 点选单独加选 / ⇧-click to select a range · ⌘-click to add':'Shift 点选连续多选 · Ctrl 点选单独加选 / Shift-click to select a range · Ctrl-click to add';
 rangeButton.remove();rangeStatus.remove();
 if(!floating){const selection=document.createElement('div');selection.className='export-selection';selection.append($('selectVisible'),$('clearSelection'),selectionHint);bar.insertBefore(selection,bar.querySelector('label'));}
 else $('historyCount').after(selectionHint);
 $('history').addEventListener('click',event=>{
  if(!(event.shiftKey||(mac?event.metaKey:event.ctrlKey)))return;
  const item=event.target.closest('.item');if(!item||event.target.closest('input,button,a,select,textarea'))return;
  event.preventDefault();event.stopPropagation();
  if(item.dataset.selectKeys&&!event.shiftKey){const keys=item.dataset.selectKeys.split('|');selectMany(keys,!keys.every(key=>selected().has(key)));return;}
  const id=item.dataset.selectKey||item.dataset.taskId;
  select(id,event.shiftKey?true:!selected().has(id),event.shiftKey);
 },true);
 if(floating){bar.classList.add('floating-inline-export');filters.after(bar);const button=document.createElement('button');button.id='exportVisible';button.type='button';button.textContent='导出 / Export';button.setAttribute('aria-expanded','false');$('selectVisible').after(button);button.onclick=()=>{bar.hidden=!bar.hidden;button.setAttribute('aria-expanded',String(!bar.hidden));};
  // Floating window: one toolbar row (search · filter · status · ⋯); the rest lives in the "⋯" menu.
  const more=document.createElement('button');more.id='historyMoreToggle';more.type='button';more.className='icon-btn history-more-toggle';more.textContent='更多 / More';more.title=more.textContent;more.setAttribute('aria-expanded','false');more.setAttribute('aria-haspopup','menu');
  const menu=document.createElement('div');menu.id='historyMoreMenu';menu.className='history-more-menu';menu.setAttribute('role','menu');menu.hidden=true;
  menu.append($('selectVisible'),button,$('clearSelection'),$('retryTasks'));filters.append(more,menu);
  const closeMenu=()=>{menu.hidden=true;more.setAttribute('aria-expanded','false');};
  more.onclick=event=>{event.stopPropagation();menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));};
  menu.addEventListener('click',()=>setTimeout(closeMenu,0));document.addEventListener('click',event=>{if(!menu.hidden&&!event.target.closest('#historyMoreMenu,#historyMoreToggle'))closeMenu();});
 }
 function showExport(){const visible=!floating&&(document.body.dataset.settingsPage||'history')==='history'&&!$('historySection').hidden;bar.hidden=!visible;document.body.classList.toggle('has-export-bar',visible);}
 document.addEventListener('settings-page-changed',showExport);new MutationObserver(showExport).observe($('historySection'),{attributes:true,attributeFilter:['hidden']});showExport();
 function normalizeSearch(value){return String(value||'').normalize('NFKC').toLocaleLowerCase();}
 function timeText(value){if(!value)return '';const d=new Date(value),p=n=>String(n).padStart(2,'0'),date=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()),time=p(d.getHours())+':'+p(d.getMinutes());return [date+' '+time+':'+p(d.getSeconds()),d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate(),d.getFullYear()+'/'+p(d.getMonth()+1)+'/'+p(d.getDate()),p(d.getMonth()+1)+'-'+p(d.getDate())+' '+time,d.toLocaleString()].join(' ');}
function searchText(record){const promptText=value=>typeof value==='string'?value:typeof value?.prompt==='string'?value.prompt:typeof value?.text==='string'?value.text:'';return normalizeSearch([record.id,record.cacheId,record.focus,record.error,timeText(record.createdAt),promptText(record.zh),promptText(record.en),...Object.values(record.prompts||{}).map(promptText)].join(' '));}
 function apply(records){records=records.filter(scope==='all'?r=>RecordKinds.kindOf(r)==='reverse':inScope);renderStats(records,scopeTitle('records')||'任务统计 / Task statistics');const terms=normalizeSearch(search).split(/\s+/).filter(Boolean);const from=dateFrom?new Date(dateFrom+'T00:00:00').getTime():-Infinity,to=dateTo?new Date(dateTo+'T23:59:59.999').getTime():Infinity;
const list=records.filter(r=>(filter==='all'||filter==='pending'?filter==='all'||['queued','running','retrying'].includes(r.status):r.status===filter)&&(r.createdAt||0)>=from&&(r.createdAt||0)<=to&&terms.every(term=>searchText(r).includes(term))).sort((a,b)=>sortOrder==='asc'?(a.createdAt||0)-(b.createdAt||0):(b.createdAt||0)-(a.createdAt||0));visibleIds=list.map(r=>r.id);if(rangeStart&&!visibleIds.includes(rangeStart))rangeStart=null;const known=new Set(records.map(r=>r.id));for(const id of globalThis.historySelection||[])if(!known.has(id))historySelection.delete(id);update(records.length);return list;}
 function update(total){const set=selected(),count=set.size,visibleSelected=visibleKeys().filter(id=>set.has(id)).length,hiddenSelected=count-visibleSelected;$('genBatchCount').textContent=t((globalThis.genSelection?.size||0)+' 张已选 / '+(globalThis.genSelection?.size||0)+' selected');for(const id of ['genBatchRegenerate','genBatchDelete'])$(id).disabled=!globalThis.genSelection?.size||genBusy;const records=globalThis.historySelection?.size||0;$('batchGenCount').textContent=t(records+' 条已选 / '+records+' selected');$('batchGenStart').disabled=!records||batchRunning;$('exportCount').textContent=t(count+' 条已选 / '+count+' selected')+(hiddenSelected?t(' · '+hiddenSelected+' 条在当前筛选外 / · '+hiddenSelected+' outside current filter'):'');if(total!==undefined)$('historyCount').textContent=t(visibleIds.length+'/'+total+' 条记录 / '+visibleIds.length+' of '+total+' records');$('clearSelection').disabled=!count;$('selectVisible').disabled=!visibleKeys().length;describeRange();for(const input of document.querySelectorAll('.history-check')){input.checked=set.has(input.dataset.recordId);input.closest('.item')?.classList.toggle('export-selected',input.checked);input.closest('.item')?.classList.toggle('range-start',input.dataset.recordId===rangeStart);}
  for(const input of document.querySelectorAll('.gen-group-check')){const keys=input.dataset.keys.split('|'),n=keys.filter(key=>set.has(key)).length;input.checked=n===keys.length;input.indeterminate=n>0&&n<keys.length;input.closest('.item')?.classList.toggle('export-selected',n===keys.length);}}
 // a grouped card selects all its images at once
 function selectMany(keys,checked){const set=selected();for(const key of keys)checked?set.add(key):set.delete(key);anchor=keys.at(-1)||anchor;update();}
 function select(id,checked,shift){
  const set=selected(),keys=visibleKeys();let ids=[id],start=shift?anchor:null;
  if(rangeMode){if(rangeStart){start=rangeStart;checked=rangeChecked;rangeStart=null;}else{rangeStart=id;rangeChecked=checked;}}
  if(start&&keys.includes(start)){const a=keys.indexOf(start),b=keys.indexOf(id);if(b>=0)ids=keys.slice(Math.min(a,b),Math.max(a,b)+1);}
  for(const value of ids)checked?set.add(value):set.delete(value);anchor=id;
  if(view!=='generated'){if(set.size)$('historyExportScope').value='selected';else if($('historyExportScope').value==='selected')$('historyExportScope').value='visible';}
  update();
 }
 $('historySearch').oninput=()=>{globalThis.resetHistoryLimit?.();search=$('historySearch').value;rangeStart=null;clearTimeout(filters.searchTimer);filters.searchTimer=setTimeout(()=>renderHistory(),120);};$('historyFilter').onchange=()=>{globalThis.resetHistoryLimit?.();filter=$('historyFilter').value;anchor=null;rangeStart=null;renderHistory();};
 $('selectVisible').onclick=()=>{const set=selected();rangeStart=null;for(const id of visibleKeys())set.add(id);if(view!=='generated')$('historyExportScope').value='selected';update();};$('clearSelection').onclick=()=>{selected().clear();anchor=null;rangeStart=null;if(view!=='generated')$('historyExportScope').value='visible';update();};
 async function exportRecords(){
  if(exporting)return;exporting=true;$('exportHistoryNow').disabled=true;$('exportHistoryNow').textContent=t('正在打包… / Preparing…');
  try{
   const all=(await allTasks()).sort((a,b)=>b.createdAt-a.createdAt),scope=$('historyExportScope').value;
   const records=all.filter(r=>scope==='all'||(scope==='selected'?historySelection.has(r.id):visibleIds.includes(r.id)));
   if(!records.length)throw new Error(t('没有可导出的记录，请选择记录或更改筛选 / No records to export. Select records or change filters.'));
   const {exportLibrary,exportText,download}=await import(chrome.runtime.getURL('zip.js'));let missingImages=0;
   const format=$('historyExportFormat').value,blob=format==='zip'?await exportLibrary(records,r=>fetch(r.image),entry=>{if(!entry.file)missingImages++;}):exportText(records,format);
   download(blob,'imageprompt-library-'+new Date().toISOString().slice(0,10)+'.'+format);
   $('historyExportStatus').textContent=t('已导出 '+records.length+' 条记录 / Exported '+records.length+' records')+(missingImages?t(' · '+missingImages+' 条无本地图片 / · '+missingImages+' missing local images'):'');
  }catch(error){$('historyExportStatus').textContent=error.message;}
  finally{exporting=false;$('exportHistoryNow').disabled=false;$('exportHistoryNow').textContent=t('导出 / Export');}
 }
 $('exportHistoryNow').onclick=exportRecords;
 // Generated images: the same export as records (scope, ZIP / JSONL / CSV). Files keep their on-disk name
 // (<backup name>-<t2i|i2i>-<time>), so an export, the output folder and the CLI agree.
 async function exportGenerated(){
  if(exporting)return;exporting=true;$('genExportNow').disabled=true;$('genExportNow').textContent=t('正在打包… / Preparing…');
  try{
   const scope=$('genExportScope').value,picked=new Set(globalThis.genSelection||[]),visible=new Set(visibleGenKeys);
   const items=[];for(const task of await allTasks())for(const g of task.generations||[]){if(g.status!=='done'||!g.image)continue;const key=task.id+':'+g.id;if(scope==='selected'&&!picked.has(key))continue;if(scope==='visible'&&!visible.has(key))continue;items.push({task,g});}
   if(!items.length)throw new Error(t('没有可导出的生成图，请选择或更改筛选 / No generated images to export. Select some or change filters.'));
   const records=items.sort((a,b)=>(b.g.createdAt||0)-(a.g.createdAt||0)).map(({task,g})=>({id:task.id+'-'+g.id,exportName:g.path?String(g.path).split(/[\\/]/).pop().replace(/\.[^.]+$/,''):(task.cacheId||task.id.slice(0,8))+'-'+(g.mode==='image'?'i2i':'t2i')+'-'+new Date(g.createdAt||Date.now()).toISOString().replace(/[-:T]/g,'').slice(0,14),
    createdAt:g.createdAt,status:'done',zh:g.prompt||'',en:'',prompts:{prompt:g.prompt||''},image:g.image,exportMeta:{taskId:task.id,cacheId:task.cacheId||null,generationId:g.id,mode:g.mode,model:g.model||'',source:g.sourceName||'',size:g.size||'',aspect:g.aspect||'',conversationUrl:g.conversationUrl||''}}));
   const {exportLibrary,exportText,download}=await import(chrome.runtime.getURL('zip.js'));const format=$('genExportFormat').value;
   const blob=format==='zip'?await exportLibrary(records,r=>fetch(r.image)):exportText(records,format);
   download(blob,'imageprompt-generated-'+new Date().toISOString().slice(0,10)+'.'+format);
   $('genExportStatus').textContent=t('已导出 '+records.length+' 张生成图 / Exported '+records.length+' generated images');
  }catch(error){$('genExportStatus').textContent=error.message;}
  finally{exporting=false;$('genExportNow').disabled=false;$('genExportNow').textContent=t('导出 / Export');}
 }
 $('genExportNow').onclick=exportGenerated;
 // generated images in cloud sync: the same switch as on the account page
 const paintGenSync=()=>{const box=$('genSyncCloud');if(!box)return;box.checked=typeof Cloud!=='undefined'&&Cloud.syncGenerations?.()===true;box.disabled=typeof Cloud==='undefined'||!Cloud.signedIn?.();box.parentElement.title=box.disabled?t('登录云端账号后可用 / Sign in to the cloud first'):'';};
 $('genSyncCloud').onchange=async()=>{if(typeof Cloud==='undefined')return;await Cloud.setSyncGenerations($('genSyncCloud').checked);paintGenSync();};
 document.addEventListener('imageprompt-cloud',paintGenSync);setTimeout(paintGenSync,0);
 async function fillBatchProfiles(){
  const kind=batchMode==='image'?'i2i':'t2i';
  for(const button of batchGen.querySelectorAll('[data-mode]'))button.setAttribute('aria-checked',String(button.dataset.mode===batchMode));
  $('batchGenProfileLabel').textContent=t(batchMode==='image'?'图生图配置 / Image-to-image profile':'文生图配置 / Text-to-image profile');
  $('batchGenStart').textContent=t(batchMode==='image'?'开始图生图 / Start image to image':'开始生图 / Generate');
  if(typeof PromptProfiles==='undefined')return;const {profiles,active}=await PromptProfiles.load(),select=$('batchGenProfile');
  // names are translated here, so the list is rebuilt when the interface language changes
  select.replaceChildren(...profiles.filter(p=>p.kind===kind).map(p=>new Option(t(p.name),p.id)));select.value=active[kind]||select.options[0]?.value||'';
 }
 // profiles.js loads after this file: fill once every script has run.
 const fillLater=()=>fillBatchProfiles().catch(()=>{});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fillLater,{once:true});else setTimeout(fillLater,0);chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&(changes.promptProfiles||changes.activeProfiles))fillBatchProfiles().catch(()=>{});});
 const pickedGenerations=()=>[...(globalThis.genSelection||[])].map(key=>{const [taskId,generationId]=key.split(':');return {key,taskId,generationId};});
 $('genBatchRegenerate').onclick=async()=>{
  const picked=pickedGenerations();if(!picked.length||genBusy)return;
  if(picked.length>20&&!confirm(t('将发起 '+picked.length+' 次生图请求（可能产生费用），确定继续？ / This sends '+picked.length+' image requests (may be billed). Continue?')))return;
  genBusy=true;update();let done=0,failed=0;const status=$('genBatchStatus'),paint=()=>{status.textContent=t('重新生成 '+(done+failed)+'/'+picked.length+' · 成功 '+done+' · 失败 '+failed+' / Generating '+(done+failed)+'/'+picked.length+' · done '+done+' · failed '+failed);};paint();
  try{await Promise.all(picked.map(async({taskId,generationId})=>{const task=await getTask(taskId),mode=task?.generations?.find(g=>g.id===generationId)?.mode||'image';const result=await GenFlow.start(taskId,mode).catch(()=>null);result?.status==='done'?done++:failed++;paint();}));}
  finally{genBusy=false;update();}
 };
 $('genBatchDelete').onclick=async()=>{
  const picked=pickedGenerations();if(!picked.length||genBusy||!confirm(t('删除所选的 '+picked.length+' 张生成图？ / Delete the '+picked.length+' selected images?')))return;
  genBusy=true;try{const byTask=new Map();for(const item of picked)byTask.set(item.taskId,[...(byTask.get(item.taskId)||[]),item.generationId]);
   for(const [taskId,ids] of byTask){const task=await getTask(taskId);if(!task)continue;task.generations=(task.generations||[]).filter(g=>!ids.includes(g.id));await saveTask(task);}
   globalThis.genSelection.clear();$('genBatchStatus').textContent=t('已删除 '+picked.length+' 张 / Deleted '+picked.length);}
  finally{genBusy=false;await renderHistory();update();}
 };
 $('batchGenProfile').onchange=async()=>{const {profiles,active}=await PromptProfiles.load();await PromptProfiles.save(profiles,{...active,[batchMode==='image'?'i2i':'t2i']:$('batchGenProfile').value});};
 batchGen.querySelector('.batch-mode').onclick=event=>{const mode=event.target.closest('[data-mode]')?.dataset.mode;if(!mode||mode===batchMode||batchRunning)return;batchMode=mode;try{localStorage.setItem('imageprompt.batchMode',mode);}catch{}$('batchGenStatus').textContent='';fillBatchProfiles();};
 document.addEventListener('imageprompt-language',()=>fillBatchProfiles());
 $('batchGenStart').onclick=async()=>{
  const ids=[...(globalThis.historySelection||[])],status=$('batchGenStatus');if(!ids.length||batchRunning)return;
  if(ids.length>20&&!confirm(t('将发起 '+ids.length+' 次生图请求（可能产生费用），确定继续？ / This sends '+ids.length+' image requests (may be billed). Continue?')))return;
  const mode=batchMode;batchRunning=true;$('batchGenStart').disabled=true;let done=0,failed=0,skipped=0;
  const [zh,en]=mode==='image'?['图生图','Image to image']:['生图','Generate'];
  const paint=()=>{status.textContent=t(zh+' '+(done+failed+skipped)+'/'+ids.length+' · 成功 '+done+' · 失败 '+failed+(skipped?' · 跳过 '+skipped:'')+' / '+en+' '+(done+failed+skipped)+'/'+ids.length+' · done '+done+' · failed '+failed+(skipped?' · skipped '+skipped:''));};
  paint();
  try{await Promise.all(ids.map(id=>GenFlow.start(id,mode).then(result=>{if(!result)skipped++;else if(result.status==='done')done++;else failed++;paint();},()=>{failed++;paint();})));}
  finally{batchRunning=false;update();}
 };// Generated-image list: same search terms, status filter, date range and sort order as records.
 function applyGenerations(items){
  // a scope with its own tab (e.g. ChatGPT images) keeps its images there; the plain Images view leaves them out
  items=items.filter(item=>scope==='all'?![...scopes.values()].some(d=>d.exclusive&&d.match(item.task)):inScope(item.task));
  const terms=normalizeSearch(search).split(/\s+/).filter(Boolean),from=dateFrom?new Date(dateFrom+'T00:00:00').getTime():-Infinity,to=dateTo?new Date(dateTo+'T23:59:59.999').getTime():Infinity;
  const statusOk=g=>filter==='all'||(filter==='pending'?['queued','running'].includes(g.status):g.status===filter);
  const text=({task,generation:g})=>normalizeSearch([g.prompt,g.model,g.sourceName,g.profile,g.error,g.path,task.id,task.cacheId,timeText(g.createdAt)].join(' '));
  const list=items.filter(item=>statusOk(item.generation)&&(item.generation.createdAt||0)>=from&&(item.generation.createdAt||0)<=to&&terms.every(term=>text(item).includes(term)));
  // Statistics follow the view: generated images counted like tasks (no retries for images).
  renderStats(items.map(({generation:g})=>({createdAt:g.createdAt,status:g.status,timing:{runMs:g.runMs}})),scopeTitle('generated')||'生图统计 / Generation statistics');
  const sorted=list.sort((a,b)=>sortOrder==='asc'?(a.generation.createdAt||0)-(b.generation.createdAt||0):(b.generation.createdAt||0)-(a.generation.createdAt||0));
  visibleGenKeys=sorted.map(({task,generation})=>task.id+':'+generation.id);
  const known=new Set(items.map(({task,generation})=>task.id+':'+generation.id));for(const key of globalThis.genSelection||[])if(!known.has(key))genSelection.delete(key);
  queueMicrotask(()=>update());return sorted;
 }
 return {apply,select,update,exportRecords,visible:()=>[...visibleIds],view:()=>view,applyGenerations,registerScope,unregisterScope,setScope,setView,selectMany,scope:()=>scope,viewSwitch:()=>viewSwitch};
})();
