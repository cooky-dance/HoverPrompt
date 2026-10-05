/* Protocol adapters. No keys or request bodies are logged. */
const PromptAPI = (() => {
  const instruction = 'Analyze the image and produce two detailed image-generation prompts describing subject, composition, lighting, colors, style, mood and visible details. Do not invent unseen facts. Return ONLY a JSON object with string fields zh and en. zh must be Simplified Chinese; en must be English.';
  function baseUrl(source) {
    const url = new URL(source.baseUrl.trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('接口地址格式无效');
    if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('远程接口请使用 HTTPS');
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|responses|messages|models(?:\/[^/]+:generateContent)?|api\/chat|api\/tags|api)$/, '');
    return url.toString().replace(/\/$/, '');
  }
  // Ollama runs on this machine and needs no key.
  const keyless = source => source.protocol === 'ollama';
  function headers(source) {
    if (keyless(source)) return {};
    if (source.protocol === 'anthropic') return { 'x-api-key': source.apiKey, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' };
    if (source.protocol === 'gemini') return { 'x-goog-api-key': source.apiKey };
    return { Authorization:'Bearer ' + source.apiKey };
  }
  // image is one data URL, or several (a merged request): each image is labelled "Image n" in the order given.
  function build(source, image, focus = '', system = instruction, user = '') {
    const base = baseUrl(source), model = source.model.trim(), many = Array.isArray(image), list = many ? image : [image];
    const prompt = user || 'Create bilingual prompts for this image.' + (focus ? ' Emphasize: ' + focus : '');
    const parts = list.map(value => { const match = /^data:([^;]+);base64,(.+)$/.exec(value || ''); if (!match) throw new Error('图片数据无效'); return {url:value, mime:match[1], data:match[2]}; });
    const label = i => many ? ['Image ' + (i + 1) + ':'] : [];
    let url, body;
    switch(source.protocol) {
      case 'responses':
        url=base+'/responses'; body={model,instructions:system,input:[{role:'user',content:[{type:'input_text',text:prompt},...parts.flatMap((p,i)=>[...label(i).map(text=>({type:'input_text',text})),{type:'input_image',image_url:p.url}])]}]}; break;
      case 'anthropic':
        url=base+'/messages'; body={model,max_tokens:many?8192:4096,system,messages:[{role:'user',content:[...parts.flatMap((p,i)=>[...label(i).map(text=>({type:'text',text})),{type:'image',source:{type:'base64',media_type:p.mime,data:p.data}}]),{type:'text',text:prompt}]}]}; break;
      case 'ollama':
        url=base+'/api/chat'; body={model,stream:false,format:'json',messages:[{role:'system',content:system},{role:'user',content:prompt,images:parts.map(p=>p.data)}]}; break;
      case 'gemini':
        url=base+'/models/'+encodeURIComponent(model.replace(/^models\//,''))+':generateContent'; body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[...parts.flatMap((p,i)=>[...label(i).map(text=>({text})),{inlineData:{mimeType:p.mime,data:p.data}}]),{text:prompt}]}]}; break;
      default:
        url=base+'/chat/completions'; body={model,messages:[{role:'system',content:system},{role:'user',content:[{type:'text',text:prompt},...parts.flatMap((p,i)=>[...label(i).map(text=>({type:'text',text})),{type:'image_url',image_url:{url:p.url}}])]}]};
    }
    return {url,options:{method:'POST',headers:{...headers(source),'Content-Type':'application/json'},body:JSON.stringify(body)}};
  }
  async function jsonFetch(url, options = {}, key = '', timeout, signal, onRequestState=()=>{}) {
    onRequestState('waiting');
    if(typeof RequestControl!=='undefined')await RequestControl.gate(signal);
    if(signal?.aborted)throw new DOMException('任务已取消','AbortError');
    const duration=timeout || (typeof RequestControl!=='undefined'?RequestControl.settings().timeoutSeconds*1000:90000);
    const controller=new AbortController(), cancel=()=>controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=typeof BackgroundTimer!=='undefined'?BackgroundTimer.set(()=>controller.abort(),duration):{cancel:(id=>()=>clearTimeout(id))(setTimeout(()=>controller.abort(),duration))};
    try {
      onRequestState('running');
      const response=await fetch(url,{...options,signal:controller.signal});
      const raw=await response.text(); let data;
      try {data=JSON.parse(raw);} catch { const error=new Error('接口返回非 JSON，HTTP '+response.status);error.status=response.status;throw error; }
      if(response.status===403&&/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(url)){const error=new Error('本地模型拒绝了扩展的访问（HTTP 403）：请设置环境变量 OLLAMA_ORIGINS=chrome-extension://* 后重启 Ollama / Local model refused the extension (HTTP 403): set OLLAMA_ORIGINS=chrome-extension://* and restart Ollama');error.status=403;throw error;}
      if(!response.ok){const error=new Error('HTTP '+response.status+': '+String(data.error?.message || data.message || response.statusText).split(key || '\0').join('[REDACTED]').slice(0,300));error.status=response.status;throw error;}
      return data;
    } catch(error){if(signal?.aborted)throw new DOMException('任务已取消','AbortError');if(error.name==='AbortError') {const timeoutError=new Error('请求超时（'+duration/1000+' 秒）');timeoutError.status=408;throw timeoutError;}throw error;}
    finally{onRequestState('waiting');timer.cancel();signal?.removeEventListener('abort',cancel);}
  }
  function text(data, protocol) {
    if(protocol==='responses') return data.output_text || (data.output || []).flatMap(item=>item.content || []).filter(part=>part.type==='output_text').map(part=>part.text || '').join('\n');
    if(protocol==='anthropic') return (data.content || []).filter(part=>part.type==='text').map(part=>part.text).join('\n');
    if(protocol==='ollama') return data.message?.content;
    if(protocol==='gemini') return (data.candidates?.[0]?.content?.parts || []).filter(part=>part.text && !part.thought).map(part=>part.text).join('\n');
    return data.choices?.[0]?.message?.content;
  }
  async function request(source,image,focus='',system=instruction,user='',runtime={}) {
    const spec=build(source,image,focus,system,user);
    return text(await jsonFetch(spec.url,spec.options,source.apiKey,runtime.timeoutMs,runtime.signal,runtime.onRequestState),source.protocol);
  }
  function classify(model) {
    const modalities=model.architecture?.input_modalities || model.input_modalities || model.modalities?.input;
    if(Array.isArray(modalities)) return {vision:modalities.includes('image'),confidence:'metadata',reason:'接口输入模态元数据'};
    const declared=model.capabilities?.vision ?? model.supports_vision ?? model.vision;
    if(typeof declared==='boolean') return {vision:declared,confidence:'metadata',reason:'接口视觉能力元数据'};
    const id=String(model.id || model.name || '').toLowerCase();
    if(/embedding|rerank|whisper|tts|dall-e|imagen|image-gen|gpt-image|text-embedding|audio-only/.test(id)) return {vision:false,confidence:'name',reason:'名称表明非视觉聊天模型'};
    if(/gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|gemini-(?:[1-9])|claude-(?:3|[a-z]+-4|[a-z]+-5)|qwen.*(?:vl|vision)|llama.*vision|internvl|pixtral|molmo|glm.*(?:v-|v$|vision)|vision/.test(id)) return {vision:true,confidence:'name',reason:'名称推测，未实测'};
    return {vision:null,confidence:'unknown',reason:'接口未提供能力信息'};
  }
  // Ollama: /api/tags. Vision is read from the model families (clip / mllama) or guessed from the name.
  async function listOllama(source){
    const data=await jsonFetch(baseUrl(source)+'/api/tags',{},'',15000);
    if(!Array.isArray(data.models))throw new Error('Ollama 模型列表格式不兼容 / Unexpected Ollama model list');
    return data.models.map(model=>{const id=model.name||model.model,families=model.details?.families||[];
      if(families.some(f=>/clip|mllama|vision/i.test(f)))return {id,vision:true,confidence:'metadata',reason:'Ollama 模型族元数据'};
      return {id,...classify({id}),...(/llava|bakllava|moondream|minicpm-v|gemma3|qwen2\.5vl|qwen2-vl|llama3\.2-vision|granite3\.2-vision|mistral-small3\.1/i.test(id)?{vision:true,confidence:'name',reason:'名称推测，未实测'}:{})};});
  }
  async function listModels(source) {
    if(source.protocol==='ollama')return listOllama(source);
    const base=baseUrl(source), result=[];let next=''; let pages=0;
    do {
      const url=new URL(base+'/models');
      if(next) url.searchParams.set(source.protocol==='gemini'?'pageToken':'after_id',next);
      const data=await jsonFetch(url.toString(),{headers:headers(source)},source.apiKey);
      const items=data.data || data.models;
      if(!Array.isArray(items)) throw new Error('模型列表格式不兼容');
      for(const model of items){const id=model.id || model.name?.replace(/^models\//,'');if(id)result.push({id,...classify(model)});}
      next=source.protocol==='gemini'?data.nextPageToken:(source.protocol==='anthropic' && data.has_more ? data.last_id : '');
      pages++;
    }while(next && pages<30);
    if(next) throw new Error('模型列表超过 30 页，未保存不完整列表');
    return [...new Map(result.map(model=>[model.id,model])).values()];
  }
  // A custom reverse profile replaces the analysis instruction; the output contract below is always appended.
  function systemFor(settings) {
    const lead=String(settings.reverseSystem||'').trim()?String(settings.reverseSystem).trim()+'\n\nOutput format: Return ONLY a JSON object with string fields zh and en. zh must be Simplified Chinese; en must be English.':instruction;
    return lead+' Return a prompts object keyed by each requested language code with a full translated prompt: '+JSON.stringify(settings.promptLanguages||[{code:'zh-CN',name:'Simplified Chinese'},{code:'en',name:'English'}])+'. Keep zh and en fields for compatibility.';
  }
  function routeCandidates(settings) {
    const available=(settings.sources || []).filter(s=>s.enabled!==false && s.baseUrl && (s.apiKey || keyless(s)) && s.model).sort((a,b)=>(a.priority||100)-(b.priority||100));
    const active=available.find(s=>s.id===settings.activeSourceId) || (settings.activeSourceId ? null : available[0]);
    if(settings.routeMode==='priority') return available;
    if(settings.routeMode==='fallback') return active?[active,...available.filter(s=>s.id!==active.id)]:[];
    return active?[active]:[];
  }
  async function routeSingle(settings,image,focus,onProgress=()=>{},signal,onRequestState=()=>{}) {
    const sources=routeCandidates(settings);if(!sources.length)throw new Error('请先保存并启用至少一个 API 来源，填写模型');
    const control=typeof RequestControl!=='undefined'?RequestControl.normalize(settings.requestControl):{timeoutSeconds:90,autoRetryTimeout:false,maxRetries:0};
    let retries=0;const attempts=[];
    for(let i=0;i<sources.length;i++) {
      const source=sources[i];
      let sourceRetries=0;
      while(true) {
        if(signal?.aborted)throw new DOMException('任务已取消','AbortError');
        onProgress(source,i+1,sources.length,{retries});
        try {
          // A source may set its own timeout (e.g. a short one for a local model) so the route moves on sooner.
          const timeoutMs=(Number(source.timeoutSeconds)>0?Number(source.timeoutSeconds):control.timeoutSeconds)*1000;
          const content=await request(source,image,focus,systemFor(settings),'',{signal,timeoutMs,onRequestState});
          attempts.push({source:source.name,model:source.model,status:'success'});
          return {content,source:{id:source.id,name:source.name,model:source.model,protocol:source.protocol},retries,attempts};
        } catch(error) {
          if(signal?.aborted)throw error;
          attempts.push({source:source.name,model:source.model,status:error.status || 'network'});
          if(error.status===408 && control.autoRetryTimeout && sourceRetries<control.maxRetries){
            sourceRetries++;retries++;onProgress(source,i+1,sources.length,{retries,retrying:true});
            if(typeof RequestControl!=='undefined')await RequestControl.sleep(Math.min(500*2**(sourceRetries-1),8000),signal);
            continue;
          }
          const retryable=error instanceof TypeError || error.status===408 || error.status===429 || error.status===404 || error.status>=500;
          if(!retryable || i===sources.length-1){const failure=new Error(source.name+': '+error.message);failure.status=error.status;failure.retries=retries;failure.attempts=attempts;throw failure;}
          break;
        }
      }
    }
  }
  // ---- merged requests: up to batchSize images (RequestControl, default 4) share one request ----
  // Calls that arrive together with the same sources and instructions form a group. The first one pulls waiting tasks in
  // (RequestControl.borrow) and the group is sent when it is full or after a short wait (longer when tasks were pulled in).
  // The model answers {"items":[...]} with one entry per image; each caller gets its own entry. Images whose entry is
  // missing or malformed, and whole groups the provider refuses as a request (400/413/422), fall back to one request each.
  const groups=new Map();
  const timer=(fn,ms)=>typeof BackgroundTimer!=='undefined'?BackgroundTimer.set(fn,ms):(id=>({cancel:()=>clearTimeout(id)}))(setTimeout(fn,ms));
  function batchSize(settings){const size=typeof RequestControl!=='undefined'?Number(RequestControl.normalize(settings.requestControl).batchSize):1;return Number.isInteger(size)&&size>1?Math.min(4,size):1;}
  function batchPrompt(members){
    const focus=members.map((m,i)=>m.focus?'Image '+(i+1)+' emphasis: '+m.focus:'').filter(Boolean).join('\n');
    return 'You receive '+members.length+' separate images, labelled Image 1 to Image '+members.length+' in order. Treat each image on its own; never mix details between images. '
     +'For every image produce the full result described in the instructions. Return ONLY one JSON object: {"items":[{"index":1,...},{"index":2,...}]} with exactly '+members.length+' items in image order, each item holding the fields the instructions ask for (zh, en and prompts). This items format replaces the single-object format for this request.'+(focus?'\n'+focus:'');
  }
  // Pulls the per-image results out of a merged answer; null for an image without a usable result.
  function splitBatch(content,count){
    if(Array.isArray(content))content=content.map(part=>part.text||'').join('\n');
    let parsed;try{parsed=JSON.parse(String(content||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return Array(count).fill(null);}
    const list=Array.isArray(parsed)?parsed:Array.isArray(parsed?.items)?parsed.items:Array.isArray(parsed?.images)?parsed.images:null;
    const out=Array(count).fill(null);if(!list)return out;
    list.forEach((item,position)=>{if(!item||typeof item!=='object')return;const index=Number.isInteger(Number(item.index))&&Number(item.index)>=1&&Number(item.index)<=count?Number(item.index)-1:position;
     const {index:_,...rest}=item;if(index<count&&!out[index]&&(rest.zh||rest.en||rest.prompts&&Object.keys(rest.prompts).length))out[index]=JSON.stringify(rest);});
    return out;
  }
  function route(settings,image,focus,onProgress=()=>{},signal,onRequestState=()=>{}) {
    const size=batchSize(settings),sources=routeCandidates(settings);
    if(size<=1||!sources.length)return routeSingle(settings,image,focus,onProgress,signal,onRequestState);
    return new Promise((resolve,reject)=>{
      const key=JSON.stringify([sources.map(s=>[s.id,s.protocol,s.baseUrl,s.model]),systemFor(settings)]);
      const member={image,focus,onProgress,signal,onRequestState,resolve,reject,settings};
      let group=groups.get(key);
      if(!group||group.sent||group.members.length>=size){
       group={key,members:[],sent:false};groups.set(key,group);group.members.push(member);
       const pulled=typeof RequestControl!=='undefined'&&RequestControl.borrow?RequestControl.borrow(size-1):0;
       // pulled tasks join after their own bookkeeping; tasks already running in parallel join within the short wait
       group.timer=timer(()=>send(group),pulled?800:150);
      }else group.members.push(member);
      if(signal)signal.addEventListener('abort',()=>{if(!group.sent){group.members=group.members.filter(m=>m!==member);if(!group.members.length){group.timer.cancel();groups.delete(group.key);}}reject(new DOMException('任务已取消','AbortError'));},{once:true});
      if(group.members.length>=size)send(group);
    });
  }
  function send(group){
    if(group.sent)return;group.sent=true;group.timer?.cancel();if(groups.get(group.key)===group)groups.delete(group.key);
    const members=group.members.filter(m=>!m.signal?.aborted);if(!members.length)return;
    const single=m=>routeSingle(m.settings,m.image,m.focus,m.onProgress,m.signal,m.onRequestState).then(m.resolve,m.reject);
    if(members.length===1)return single(members[0]);
    routeBatch(members).then(results=>{results.forEach((result,i)=>result?members[i].resolve(result):single(members[i]));},error=>{
      if(error.splitAll)return members.forEach(single);
      members.forEach(m=>m.reject(error));
    });
  }
  async function routeBatch(members){
    const settings=members[0].settings,sources=routeCandidates(settings),count=members.length;
    const control=typeof RequestControl!=='undefined'?RequestControl.normalize(settings.requestControl):{timeoutSeconds:90,autoRetryTimeout:false,maxRetries:0};
    // the merged request stops only when every one of its tasks is cancelled
    const controller=new AbortController();const live=()=>members.some(m=>!m.signal?.aborted);
    for(const m of members)m.signal?.addEventListener('abort',()=>{if(!live())controller.abort();},{once:true});
    const each=fn=>members.forEach(m=>{if(!m.signal?.aborted)fn(m);});
    let retries=0;const attempts=[];
    for(let i=0;i<sources.length;i++){
      const source=sources[i];let sourceRetries=0;
      while(true){
        if(controller.signal.aborted)throw new DOMException('任务已取消','AbortError');
        each(m=>m.onProgress(source,i+1,sources.length,{retries,batched:count}));
        try{
          // a longer answer: allow more time than a single image
          const timeoutMs=(Number(source.timeoutSeconds)>0?Number(source.timeoutSeconds):control.timeoutSeconds)*1000*(1+.5*(count-1));
          const content=await request(source,members.map(m=>m.image),'',systemFor(settings),batchPrompt(members),{signal:controller.signal,timeoutMs,onRequestState:state=>each(m=>m.onRequestState(state))});
          attempts.push({source:source.name,model:source.model,status:'success',batched:count});
          const info={id:source.id,name:source.name,model:source.model,protocol:source.protocol};
          return splitBatch(content,count).map(item=>item?{content:item,source:info,retries,attempts:[...attempts],batched:count}:null);
        }catch(error){
          if(controller.signal.aborted)throw error;
          attempts.push({source:source.name,model:source.model,status:error.status||'network',batched:count});
          if(error.status===408&&control.autoRetryTimeout&&sourceRetries<control.maxRetries){sourceRetries++;retries++;each(m=>m.onProgress(source,i+1,sources.length,{retries,retrying:true}));if(typeof RequestControl!=='undefined')await RequestControl.sleep(Math.min(500*2**(sourceRetries-1),8000),controller.signal);continue;}
          // the provider refused the merged request itself (too many images, too large): send the images one by one
          if([400,413,422].includes(error.status))throw Object.assign(new Error(error.message),{splitAll:true});
          const retryable=error instanceof TypeError||error.status===408||error.status===429||error.status===404||error.status>=500;
          if(!retryable||i===sources.length-1){const failure=new Error(source.name+': '+error.message);failure.status=error.status;failure.retries=retries;failure.attempts=attempts;throw failure;}
          break;
        }
      }
    }
  }
  return {baseUrl,headers,build,text,classify,listModels,request,routeCandidates,route,routeSingle,splitBatch,keyless};
})();
