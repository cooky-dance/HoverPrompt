globalThis.historySelection=new Set();
(()=>{
  const el=id=>document.getElementById(id);let images=[],currentScan=null,batchSubmitting=false;
  const notice=message=>el('batchStatus').textContent=message;
  const preferences=chrome.storage.local.get(['scanAccumulate','batchSkipDuplicates']).then(saved=>{
    el('scanAccumulate').checked=saved.scanAccumulate!==false;el('skipDuplicateImages').checked=saved.batchSkipDuplicates!==false;
  });
  el('scanAccumulate').onchange=()=>chrome.storage.local.set({scanAccumulate:el('scanAccumulate').checked});
  el('skipDuplicateImages').onchange=()=>chrome.storage.local.set({batchSkipDuplicates:el('skipDuplicateImages').checked});
  if(embedded){el('batchPane').hidden=true;const button=document.createElement('button');button.id='toggleBatch';button.textContent='▧';button.title='批量与导出 / Batch and export';button.onclick=()=>el('batchPane').hidden=!el('batchPane').hidden;document.querySelector('header').append(button);}
  function render(){el('batchImages').replaceChildren();for(const image of images){const label=document.createElement('label');label.className='batch-thumbnail';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=image.selected!==false;checkbox.onchange=()=>image.selected=checkbox.checked;const img=document.createElement('img');img.src=image.url;img.alt='网页图片 / Page image';label.append(checkbox,img);el('batchImages').append(label);}el('runBatch').disabled=batchSubmitting||!images.length;notice('列表 '+images.length+' 张 / '+images.length+' images in list');}
  function scanning(value){el('scanPage').disabled=value;el('stopScan').hidden=!value;el('clearScan').disabled=value||batchSubmitting;}
  const send=message=>parent.postMessage({...message,bridgeToken:launchParams.get('bridge')},'*');
  ImagePromptFilter.subscribe(()=>{
    if(currentScan)send({type:'STOP_PAGE_SCAN',requestId:currentScan.id});currentScan=null;scanning(false);images=[];render();
  });
  el('clearScan').onclick=()=>{if(currentScan||batchSubmitting)return;images=[];render();if(embedded)send({type:'CLEAR_PAGE_IMAGES'});notice('采集缓存已清空，历史记录保留 / Scan cache cleared; history retained');};
  el('stopScan').onclick=()=>{if(currentScan){send({type:'STOP_PAGE_SCAN',requestId:currentScan.id});el('stopScan').disabled=true;notice('正在停止，保留已发现的图片 / Stopping; keeping collected images');}};
  el('scanPage').onclick=async()=>{
    await preferences;
    if(!embedded){notice('请从网页工具栏打开悬浮窗后扫描 / Open the floating window on a webpage to scan');return;}
    if(currentScan)return;
    currentScan={id:crypto.randomUUID(),accumulate:el('scanAccumulate').checked};scanning(true);el('stopScan').disabled=false;
    notice('扫描中 · '+el('scanScope').selectedOptions[0].textContent+' / Scanning…');send({type:'COLLECT_PAGE_IMAGES',scope:el('scanScope').value,requestId:currentScan.id});
  };
  // a list handed over by the page (a Xiaohongshu note's pictures): replaces the list, all selected, batch pane open
  addEventListener('message',event=>{
    const data=event.data;
    if(event.source!==parent||data?.bridgeToken!==launchParams.get('bridge')||data.type!=='PROMPT_BATCH_IMAGES')return;
    images=(data.images||[]).slice(0,5000).map(image=>({url:image.url,sourceUrl:image.sourceUrl}));render();el('batchPane').hidden=false;
    notice('已获取本篇笔记 '+images.length+' 张图片，点「批量反推」开始；本地模式会同时缓存到本地，云端模式提交云端反推 / '+images.length+' images from this note; press Batch reverse (local mode also caches them, cloud mode reverses in the cloud)');
  });
  addEventListener('message',event=>{
    const data=event.data;
    if(event.source!==parent||data?.bridgeToken!==launchParams.get('bridge')||!currentScan||data.requestId!==currentScan.id)return;
    if(data.type==='PROMPT_SCAN_PROGRESS'){notice('采集中 '+data.count+' 张 · 滚动 '+data.steps+'/'+data.limit+' 屏 / Collecting '+data.count+' images · Scroll '+data.steps+'/'+data.limit);return;}
    if(data.type!=='PROMPT_PAGE_IMAGES')return;
    const accumulate=currentScan.accumulate;currentScan=null;scanning(false);
    if(data.error){notice(data.error);return;}
    const merged=new Map((accumulate?images:[]).map(image=>[image.url,image]));let added=0,duplicates=0;
    for(const image of data.images||[]){if(merged.has(image.url)){duplicates++;continue;}if(merged.size<5000){merged.set(image.url,image);added++;}}
    images=[...merged.values()];render();
    notice((data.pageHost||'')+' · '+el('scanScope').selectedOptions[0].textContent+' · 本次新增 '+added+' · 地址重复 '+duplicates+' · 列表累计 '+images.length+(data.reason==='stopped'?' · 已停止':data.reason==='step-limit'?' · 已达 20 屏上限':'')+(data.truncated?' · 缓存已达 5000 张上限':'')+' / Added '+added+' · URL duplicates '+duplicates+' · Total '+images.length+(data.reason==='stopped'?' · Stopped':data.reason==='step-limit'?' · 20-screen limit reached':'')+(data.truncated?' · Cache limit 5000 reached':''));
  });
  async function imageHash(data){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));return 'normalized-jpeg-sha256:'+Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
  el('runBatch').onclick=async()=>{
    if(batchSubmitting)return;await preferences;
    const selected=images.filter(x=>x.selected!==false);if(!selected.length)return;
    if(!confirm('提交 '+selected.length+' 张图片分析，可能产生 API 费用或消耗账号额度 / Analyze '+selected.length+' images?'))return;
    batchSubmitting=true;el('runBatch').disabled=true;el('clearScan').disabled=true;let submitted=0,failed=0,skipped=0;
    const hashes=new Set(),urls=new Set(),skipDuplicates=el('skipDuplicateImages').checked;
    try{
      if(skipDuplicates){notice('检查历史重复图片 / Checking duplicates in history…');for(const task of await allTasks()){
        if(!['done','queued','running'].includes(task.status)||!task.image)continue;
        if(task.imageUrl)urls.add(task.imageUrl);hashes.add(task.imageHash||await imageHash(task.image));
      }}
      for(const image of selected){try{
        if(skipDuplicates&&urls.has(image.url)){skipped++;continue;}
        const response=await fetch(image.url,{credentials:'omit',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('HTTP '+response.status);
        const blob=await response.blob(),data=await imageToDataUrl(blob),hash=await imageHash(data),original=await originalImageOf(blob,data);
        if(skipDuplicates&&hashes.has(hash)){skipped++;continue;}
        const task={id:RecordKinds.newId('reverse'),kind:'reverse',source:'reverse',createdAt:Date.now(),image:data,imageUrl:image.url,imageHash:hash,sourceUrl:image.sourceUrl,focus:el('focus').value,status:'queued',...(original?{originalImage:original}:{})};
        await saveTask(task);hashes.add(hash);urls.add(image.url);analyze(task).catch(()=>{});submitted++;
      }catch{failed++;}finally{notice('已入队 '+submitted+' · 重复跳过 '+skipped+' · 读取失败 '+failed+' / Queued '+submitted+' · Duplicates skipped '+skipped+' · Read failures '+failed);}}
    }catch(error){notice(error.message);}finally{batchSubmitting=false;el('runBatch').disabled=!images.length;el('clearScan').disabled=!!currentScan;await renderHistory();}
  };
  el('selectHistory').onclick=async()=>{const tasks=await allTasks();historySelection=historySelection.size===tasks.length?new Set():new Set(tasks.map(x=>x.id));el('historyExportScope').value=historySelection.size?'selected':'visible';await renderHistory();};
  el('exportLocal').textContent='前往历史导出 / Export from history';el('exportLocal').onclick=()=>{SettingsLayout.navigate('history');el('exportHistoryNow').focus();};
})();
