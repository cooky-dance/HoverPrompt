/* Image generation: four provider protocols behind one route() call, with the same failover idea as the
   vision sources. Returns data: URLs so results can be stored, shown and written to disk. */
globalThis.ImageGen=(()=>{
 const PROTOCOLS={
  openai:{label:'OpenAI 兼容 /v1/images / OpenAI-compatible /v1/images',base:''},
  modelscope:{label:'魔搭 ModelScope（异步） / ModelScope (async)',base:'https://api-inference.modelscope.cn'},
  gemini:{label:'Google Gemini / Imagen',base:'https://generativelanguage.googleapis.com/v1beta'},
  seedream:{label:'火山方舟 Seedream（即梦/豆包） / Volcengine Ark Seedream (Jimeng/Doubao)',base:'https://ark.cn-beijing.volces.com/api/v3'}};
 const ASPECTS=['1:1','3:4','4:3','2:3','3:2','9:16','16:9'];
 const QUALITIES=['auto','low','medium','high'];
 const PIXELS=[1024,1536,2048,3072,4096];
 const DEFAULTS={quality:'auto',aspect:'3:4',pixels:2048};
 const sleep=ms=>new Promise(resolve=>typeof BackgroundTimer!=='undefined'?BackgroundTimer.set(resolve,ms):setTimeout(resolve,ms));
 // Timings (tests shorten them). ModelScope rules follow the pin2ms skill: per-key concurrency 5, 1 s between
 // submissions, 429 "insufficient/balance/余额" = key out of quota for today, other 429 = back off 60 s × n (5 tries).
 const TIMING={pollMs:4000,rateBackoffMs:60000,rateTries:5,taskTimeoutMs:600000};
 const MODELSCOPE={keyConcurrency:2,submitGapSec:1,dailyLimit:250,maxSide:2048};
 const IMGBB={expiration:86400,delivery:'wsrv',when:'missing',maxSide:2048};
 // Reference image: "url" sends the page image address in a JSON field, "inline" sends the image data; "auto" per protocol.
 const REFERENCE={openai:{mode:'inline',field:'image',format:'string'},modelscope:{mode:'inline',field:'image_url',format:'array'},seedream:{mode:'inline',field:'image',format:'string'},gemini:{mode:'inline',field:'',format:'string'}};
 // ModelScope sends the image data (a JPEG data URL, ≤ 2048 px) by default: its servers are in mainland China and time out
 // fetching many overseas addresses (Pinterest and others). Tested end to end on 2026-10-01 with Qwen/Qwen-Image-Edit.
 // URL mode: ModelScope prefers the page image (hosted inputs are limited to 2048×2048), other providers the original.
 // Without a web address, or when set to "always", the image is uploaded to ImgBB (resized to ≤ 2048) first.
 // Several references (up to 10, in the user's order): list fields get all of them, single-value fields the first.
 async function references(source,images){
  const preset=REFERENCE[source.protocol]||REFERENCE.openai,mode=source.refMode&&source.refMode!=='auto'?source.refMode:preset.mode;
  const field=String(source.refField||'').trim()||preset.field,format=source.refFormat||preset.format,many=format==='array'||source.protocol==='seedream';
  let list;
  if(mode==='url'){const host=await imgbbSettings();if(!host.key)throw new Error('多张参考图在 URL 模式下需要先配置 ImgBB 图床 / Several references in URL mode need ImgBB hosting');list=await Promise.all(images.map(image=>hostImage(image,host)));}
  else list=source.protocol==='modelscope'?await Promise.all(images.map(inlineJpeg)):images;
  return {mode:mode==='url'?'url':'inline',field,value:many?list:list[0],image:list[0],images:list,...(mode==='url'?{url:list[0]}:{})};
 }
 async function reference(source,{image,images,imageUrl,originalUrl}){
  if(Array.isArray(images)&&images.length>1)return references(source,images.slice(0,10));
  if(!image&&!imageUrl&&!originalUrl)return null;
  const preset=REFERENCE[source.protocol]||REFERENCE.openai,mode=source.refMode&&source.refMode!=='auto'?source.refMode:preset.mode;
  const field=String(source.refField||'').trim()||preset.field,format=source.refFormat||preset.format,wrap=value=>format==='array'?[value]:value;
  if(mode==='url'){
   const web=[source.protocol==='modelscope'?imageUrl:originalUrl,imageUrl,originalUrl].find(url=>/^https?:\/\//.test(url||''));
   const host=await imgbbSettings();
   let url=web;if(host.key&&image&&(host.when==='always'||!web))url=await hostImage(image,host);
   if(!url)throw new Error('此来源用图片 URL 传参考图，但这张图没有网页地址（本地上传的图片）：请在下方配置 ImgBB 图床，或改用“上传图片数据”');
   return {mode,field,value:wrap(url),url};
  }
  if(!image){
   // no image data (e.g. only an address is known): fall back to the address
   const web=[imageUrl,originalUrl].find(url=>/^https?:\/\//.test(url||''));if(web)return {mode:'url',field,value:wrap(web),url:web};
   throw new Error('缺少参考图数据');
  }
  const data=source.protocol==='modelscope'?await inlineJpeg(image):image;
  return {mode:'inline',field,value:wrap(data),image:data};
 }
 // ImgBB (https://api.imgbb.com/): multipart upload of the image file (not base64 text), key in the body (not the URL),
 // default one-day expiry; "wsrv" delivery wraps the direct link with wsrv.nl, which ModelScope can fetch reliably.
 async function imgbbSettings(){const saved=await chrome.storage.local.get(['imgbbKey','imgbbExpiration','imgbbDelivery','imgbbWhen']);return {key:String(saved.imgbbKey||'').trim(),expiration:Math.min(15552000,Math.max(60,parseInt(saved.imgbbExpiration,10)||IMGBB.expiration)),delivery:saved.imgbbDelivery==='direct'?'direct':'wsrv',when:saved.imgbbWhen==='always'?'always':'missing'};}
 const hostedCache=new Map();
 // Inline references for ModelScope: resized to ≤ 2048 px and re-encoded as JPEG so the request stays small.
 async function inlineJpeg(dataUrl){
  try{const blob=await shrink(dataUrlToBlob(dataUrl),{minSide:512,jpeg:true});if(blob.type!=='image/jpeg'&&blob.type!=='image/png'&&blob.type!=='image/webp')return dataUrl;
   return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
  catch{return dataUrl;}
 }
 // At most 2048 px on the long side. For ModelScope (minSide, jpeg) the image is always redrawn as a JPEG on white,
 // and a small one (page thumbnails) enlarged to 512 px on the short side: it answers 400 to tiny, transparent,
 // GIF or AVIF references.
 async function shrink(blob,{minSide=0,jpeg=false}={}){
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')return blob;
  const bitmap=await createImageBitmap(blob),long=Math.max(bitmap.width,bitmap.height),short=Math.min(bitmap.width,bitmap.height);
  const scale=Math.min(IMGBB.maxSide/long,Math.max(1,minSide/short));
  if(scale===1&&blob.size<=4*1024*1024&&!(jpeg&&blob.type!=='image/jpeg')){bitmap.close?.();return blob;}
  const canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale))),g=canvas.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);g.imageSmoothingQuality='high';g.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  return canvas.convertToBlob({type:'image/jpeg',quality:0.9});
 }
 async function hostImage(dataUrl,host){
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(dataUrl)))].slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('')+':'+host.delivery;
  const cached=hostedCache.get(digest);if(cached&&cached.expiresAt>Date.now()+600000)return cached.url;
  const blob=await shrink(dataUrlToBlob(dataUrl)),form=new FormData();
  form.append('key',host.key);form.append('expiration',String(host.expiration));form.append('image',blob,'reference.'+(blob.type==='image/png'?'png':'jpg'));
  let data;try{data=await http('https://api.imgbb.com/1/upload',{method:'POST',body:form},{key:host.key,timeoutMs:60000});}catch(error){const e=new Error('ImgBB 上传失败：'+error.message);e.status=error.status;throw e;}
  const direct=data?.data?.url||data?.data?.image?.url;
  if(data?.success!==true||Number(data?.status)!==200||!/^https:\/\//.test(direct||''))throw new Error('ImgBB 响应未通过校验（success/status/直链）');
  const url=host.delivery==='wsrv'?'https://wsrv.nl/?url='+encodeURIComponent(direct)+'&maxage='+Math.min(365,Math.max(1,Math.ceil(host.expiration/86400)))+'d':direct;
  hostedCache.set(digest,{url,expiresAt:Date.now()+host.expiration*1000});return url;
 }
 async function testImgbb(key){const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(8,8):null;let dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';if(canvas){canvas.getContext('2d').fillRect(0,0,8,8);dataUrl=await blobToDataUrl(await canvas.convertToBlob({type:'image/png'}));}hostedCache.clear();return hostImage(dataUrl,{...(await imgbbSettings()),key,expiration:60});}
 // Cross-window limits: Web Locks are shared by every extension page (settings, all floating windows).
 const memoryLocks=new Map();
 async function lock(name,options,callback){
  if(globalThis.navigator?.locks)return navigator.locks.request(name,options,callback);
  let held=memoryLocks.get(name);if(options.ifAvailable&&held)return callback(null);
  while(held){await held;held=memoryLocks.get(name);}
  let release;memoryLocks.set(name,new Promise(resolve=>release=resolve));
  try{return await callback({name});}finally{memoryLocks.delete(name);release();}
 }
 async function withSlot(name,limit,work){
  for(;;){
   for(let i=0;i<limit;i++){let outcome=null;await lock(name+':'+i,{ifAvailable:true},async held=>{if(!held)return;try{outcome={value:await work()};}catch(error){outcome={error};}});if(outcome){if(outcome.error)throw outcome.error;return outcome.value;}}
   await sleep(400);
  }
 }
 async function keyId(key){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)));return [...bytes.slice(0,6)].map(n=>n.toString(16).padStart(2,'0')).join('');}
 const today=()=>new Date().toISOString().slice(0,10);
 async function keyState(){return (await chrome.storage.local.get(['modelscopeKeyState'])).modelscopeKeyState||{};}
 async function markExhausted(id){const state=await keyState();state[id]={...(state[id]?.day===today()?state[id]:{}),exhausted:today()};await chrome.storage.local.set({modelscopeKeyState:state});}
 // Submissions per key and day (the account allowance is counted per submission).
 async function countSubmit(id){const state=await keyState(),entry=state[id]?.day===today()?state[id]:{day:today(),count:0};state[id]={...entry,day:today(),count:(entry.count||0)+1};await chrome.storage.local.set({modelscopeKeyState:state});}
 const quotaText=/insufficient|balance|余额|quota|额度|exceeded your|limit exceeded for today/i;

 async function settings(){
  const saved=await chrome.storage.local.get(['genSources','activeGenSourceId','genRouteMode','genOutputDir','genConcurrency']);
  saved.genSources=Array.isArray(saved.genSources)?saved.genSources:[];
  saved.genRouteMode=saved.genRouteMode==='priority'?'priority':'single';
  saved.genConcurrency=Math.max(1,parseInt(saved.genConcurrency,10)||2);
  return saved;
 }
 const base=source=>String(source.baseUrl||PROTOCOLS[source.protocol]?.base||'').trim().replace(/\/+$/,'');
 // Aspect + long-side pixels -> WxH rounded to 16. Models with fixed size menus get the nearest allowed size.
 function dimensions(source){
  const [a,b]=String(source.aspect||DEFAULTS.aspect).split(':').map(Number),long=Number(source.pixels)||DEFAULTS.pixels;
  const round=value=>Math.max(256,Math.round(value/16)*16);
  return a>=b?{width:round(long),height:round(long*b/a)}:{width:round(long*a/b),height:round(long)};
 }
 function sizeFor(source){
  const {width,height}=dimensions(source),model=String(source.model||'').toLowerCase();
  if(source.protocol==='openai'&&/^gpt-image/.test(model))return width===height?'1024x1024':width>height?'1536x1024':'1024x1536';
  if(source.protocol==='openai'&&/^dall-e-3/.test(model))return width===height?'1024x1024':width>height?'1792x1024':'1024x1792';
  if(source.protocol==='modelscope'&&Math.max(width,height)>MODELSCOPE.maxSide){const {width:w,height:h}=dimensions({...source,pixels:MODELSCOPE.maxSide});return w+'x'+h;}
  return width+'x'+height;
 }
 const redact=(text,key)=>String(text||'').split(key||'\0').join('[REDACTED]').slice(0,300);
 async function http(url,options,{timeoutMs=180000,signal,key}={}){
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=typeof BackgroundTimer!=='undefined'?BackgroundTimer.set(abort,timeoutMs):{cancel:(id=>()=>clearTimeout(id))(setTimeout(abort,timeoutMs))};
  try{
   const response=await fetch(url,{...options,signal:controller.signal});const raw=await response.text();let data;
   try{data=JSON.parse(raw);}catch{data={message:raw.slice(0,200)};}
   if(!response.ok){const error=new Error('HTTP '+response.status+': '+redact(data.error?.message||data.message||data.errors?.[0]?.message||data.errors?.message||data.Message||response.statusText,key));error.status=response.status;error.body=redact(raw,key);throw error;}
   return data;
  }catch(error){if(signal?.aborted)throw new DOMException('任务已取消','AbortError');if(error.name==='AbortError'){const e=new Error('生图请求超时（'+Math.round(timeoutMs/1000)+' 秒）');e.status=408;throw e;}if(error?.name==='TypeError'){let host=String(url);try{host=new URL(url).host;}catch{}const e=new Error('无法连接 '+host+'，请检查网络或代理设置 / Cannot reach '+host+'; check your network or proxy');e.network=true;throw e;}throw error;}
  finally{timer.cancel();signal?.removeEventListener('abort',abort);}
 }
 const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
 async function toDataUrl(value){if(/^data:image\//.test(value))return value;const response=await fetch(value,{credentials:'omit'}).catch(()=>{let host=String(value);try{host=new URL(value).host;}catch{}throw new Error('无法下载生成的图片（'+host+'），请检查网络或代理设置 / Cannot download the image from '+host+'; check your network or proxy');});if(!response.ok)throw new Error('下载生成图失败：HTTP '+response.status);return blobToDataUrl(await response.blob());}
 function dataUrlParts(dataUrl){const match=/^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl||'');if(!match)throw new Error('参考图格式无效');return {mime:match[1],data:match[2]};}
 function dataUrlToBlob(dataUrl){const {mime,data}=dataUrlParts(dataUrl);const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return new Blob([bytes],{type:mime});}

 const providers={
  async openai(source,{prompt,image,images,imageUrl,originalUrl,signal}){
   const root=base(source);if(!root)throw new Error('请填写接口地址（通常以 /v1 结尾）');
   const auth={Authorization:'Bearer '+source.apiKey},size=sizeFor(source),quality=source.quality&&source.quality!=='auto'?source.quality:null;
   let data;const ref=await reference(source,{image,images,imageUrl,originalUrl});
   if(ref?.mode==='url'){
    // URL mode: many compatible gateways take the reference as an image URL field on /images/generations.
    data=await http(root+'/images/generations',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({model:source.model,prompt,size,n:1,...(quality?{quality}:{}),[ref.field]:ref.value})},{signal,key:source.apiKey});
   }else if(ref){
    const form=new FormData();form.append('model',source.model);form.append('prompt',prompt);if(ref.images?.length>1)ref.images.forEach((one,i)=>form.append((ref.field||'image')+'[]',dataUrlToBlob(one),'reference-'+(i+1)+'.png'));else form.append(ref.field||'image',dataUrlToBlob(ref.image),'reference.png');form.append('size',size);if(quality)form.append('quality',quality);
    data=await http(root+'/images/edits',{method:'POST',headers:auth,body:form},{signal,key:source.apiKey});
   }else{
    data=await http(root+'/images/generations',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({model:source.model,prompt,size,n:1,...(quality?{quality}:{})})},{signal,key:source.apiKey});
   }
   return (data.data||[]).map(item=>item.b64_json?'data:image/png;base64,'+item.b64_json:item.url).filter(Boolean);
  },
  // ModelScope (async): up to two keys; each key has its own concurrency and submission gap across all windows.
  async modelscope(source,{prompt,imageUrl,originalUrl,image,images,signal}){
   const root=base(source),ref=await reference(source,{image,images,imageUrl,originalUrl});
   const body={model:source.model,prompt,size:sizeFor(source),...(ref?{[ref.field]:ref.value}:{})};
   const keys=[source.apiKey,source.apiKey2].map(key=>String(key||'').trim()).filter(Boolean);
   const limit=Math.min(10,Math.max(1,parseInt(source.keyConcurrency,10)||MODELSCOPE.keyConcurrency)),gapMs=Math.max(0,Number(source.submitGapSec??MODELSCOPE.submitGapSec))*1000;
   const daily=Number.isInteger(Number(source.dailyLimit))&&source.dailyLimit!==''&&source.dailyLimit!=null?Number(source.dailyLimit):MODELSCOPE.dailyLimit;
   let lastError=null;
   for(const key of keys){
    const id=await keyId(key),current=(await keyState())[id];if(current?.exhausted===today()||(daily>0&&current?.day===today()&&(current.count||0)>=daily))continue;
    const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
    try{
     return await withSlot('ip-modelscope:'+id,limit,async()=>{
      let task;
      for(let tries=1;;tries++){
       try{task=await lock('ip-modelscope-submit:'+id,{},async()=>{const fresh=(await keyState())[id];if(daily>0&&fresh?.day===today()&&(fresh.count||0)>=daily){const e=new Error('daily limit reached');e.status=429;e.body='daily quota';throw e;}const result=await http(root+'/v1/images/generations',{method:'POST',headers:{...headers,'X-ModelScope-Async-Mode':'true'},body:JSON.stringify(body)},{signal,key});if(result?.task_id)await countSubmit(id);if(gapMs)await sleep(gapMs);return result;});break;}
       catch(error){
        if(error.status===429&&quotaText.test(error.body||error.message)){await markExhausted(id);error.quota=true;throw error;}
        if(error.status===429&&tries<TIMING.rateTries){await sleep(TIMING.rateBackoffMs*tries);if(signal?.aborted)throw new DOMException('任务已取消','AbortError');continue;}
        if(error.status===401||error.status===403){const e=new Error('魔搭 Token 无效或无权限（HTTP '+error.status+'），请更新密钥');e.status=error.status;throw e;}
        throw error;
       }
      }
      if(!task.task_id)throw new Error('魔搭未返回 task_id');
      const started=Date.now();
      for(;;){
       await sleep(TIMING.pollMs);if(signal?.aborted)throw new DOMException('任务已取消','AbortError');
       const state=await http(root+'/v1/tasks/'+encodeURIComponent(task.task_id),{headers:{...headers,'X-ModelScope-Task-Type':'image_generation'}},{signal,key,timeoutMs:60000});
       if(state.task_status==='SUCCEED')return state.output_images||[];
       if(state.task_status==='FAILED'){const e=new Error('魔搭任务失败：'+redact(JSON.stringify(state.errors||state.message||''),key));e.status=500;throw e;}
       if(Date.now()-started>TIMING.taskTimeoutMs){const e=new Error('魔搭任务超时（10 分钟）');e.status=408;throw e;}
      }
     });
    }catch(error){if(!error.quota)throw error;lastError=error;}
   }
   const e=new Error(lastError?'魔搭所有密钥今日额度已用完 / All ModelScope keys are out of quota today':'魔搭所有密钥今日额度已用完，明天自动恢复 / All ModelScope keys are out of quota today');e.status=429;throw e;
  },
  async gemini(source,{prompt,image,images,imageUrl,originalUrl,signal}){
   const root=base(source),model=String(source.model||'').replace(/^models\//,'');
   const url=root+'/models/'+encodeURIComponent(model)+':'+(/^imagen/i.test(model)?'predict':'generateContent');
   const headers={'Content-Type':'application/json','x-goog-api-key':source.apiKey};
   if(/^imagen/i.test(model)){
    if(image||images?.length||imageUrl&&source.refMode==='url')throw new Error('Imagen 不支持参考图；图生图请选择 Gemini 图像模型');
    const data=await http(url,{method:'POST',headers,body:JSON.stringify({instances:[{prompt}],parameters:{sampleCount:1,aspectRatio:source.aspect||DEFAULTS.aspect,...(Number(source.pixels)>=2048?{sampleImageSize:'2K'}:{})}})},{signal,key:source.apiKey});
    return (data.predictions||[]).map(p=>p.bytesBase64Encoded?'data:'+(p.mimeType||'image/png')+';base64,'+p.bytesBase64Encoded:null).filter(Boolean);
   }
   const ref=await reference(source,{image,images,imageUrl,originalUrl});
   // Gemini takes image data only: in URL mode the page image is downloaded first.
   const parts=[{text:prompt}];if(ref){for(const one of ref.images||[ref.mode==='url'?ref.url:ref.image]){const {mime,data}=dataUrlParts(/^https?:/.test(one)?await toDataUrl(one):one);parts.push({inline_data:{mime_type:mime,data}});}}
   const data=await http(url,{method:'POST',headers,body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:source.aspect||DEFAULTS.aspect}}})},{signal,key:source.apiKey});
   return (data.candidates?.[0]?.content?.parts||[]).map(part=>part.inlineData||part.inline_data).filter(Boolean).map(inline=>'data:'+(inline.mimeType||inline.mime_type||'image/png')+';base64,'+inline.data);
  },
  async seedream(source,{prompt,image,images,imageUrl,originalUrl,signal}){
   const root=base(source),ref=await reference(source,{image,images,imageUrl,originalUrl});
   const data=await http(root+'/images/generations',{method:'POST',headers:{Authorization:'Bearer '+source.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:source.model,prompt,size:sizeFor(source),response_format:'b64_json',watermark:false,...(ref?{[ref.field]:ref.value}:{})})},{signal,key:source.apiKey});
   return (data.data||[]).map(item=>item.b64_json?'data:image/jpeg;base64,'+item.b64_json:item.url).filter(Boolean);
  }};

 // File signature check: PNG, JPEG or WebP.
 function validImage(dataUrl){try{const bytes=atob(String(dataUrl).split(',')[1].slice(0,24));const code=i=>bytes.charCodeAt(i);return (code(0)===0x89&&bytes.slice(1,4)==='PNG')||(code(0)===0xFF&&code(1)===0xD8&&code(2)===0xFF)||(bytes.slice(0,4)==='RIFF'&&bytes.slice(8,12)==='WEBP');}catch{return false;}}
 async function generate(source,request){
  const provider=providers[source.protocol];if(!provider)throw new Error('未知生图协议：'+source.protocol);
  if(!source.apiKey||!source.model)throw new Error('生图来源缺少密钥或模型');
  const started=Date.now(),outputs=await provider(source,request);
  if(!outputs.length)throw new Error('生图接口没有返回图片');
  const images=[];for(const output of outputs.slice(0,4)){const dataUrl=await toDataUrl(output);if(!validImage(dataUrl))throw new Error('生图接口返回的文件不是有效的 PNG/JPEG/WebP 图片');images.push(dataUrl);}
  return {images,model:source.model,sourceId:source.id,sourceName:source.name,protocol:source.protocol,size:sizeFor(source),runMs:Date.now()-started};
 }
 // Failover only on transient problems; bad requests and auth errors surface immediately.
 const retryable=error=>!error.status||error.status===404||error.status===408||error.status===429||error.status>=500;
 // When the configured sources fail (or none is set up) and the member is signed in, the image is made in the cloud
 // instead (cloud credits, the website's default model); a stop by the user is not a failure.
 async function cloudFallback(request,error){
  const Cloud=globalThis.Cloud;
  if(error?.name==='AbortError'||!Cloud?.signedIn?.()||typeof Cloud.generate!=='function')throw error;
  const refs=[];
  for(const one of request.images||[request.image||request.originalUrl||request.imageUrl].filter(Boolean)){try{const data=await toDataUrl(one);if(/^data:image\/(png|jpeg|webp);base64,/.test(data)&&data.length<=6*1024*1024)refs.push(data);}catch{}}
  try{const result=await Cloud.generate({prompt:request.prompt,aspect:request.aspect,refs,signal:request.signal});return {...result,attempts:[...(error?.attempts||[]),{source:'cloud',fallback:true}],fallback:true};}
  catch(cloudError){if(cloudError.name==='AbortError')throw cloudError;const both=new Error((error?.message||'本地生图失败')+'；云端生图也失败：'+cloudError.message);both.attempts=error?.attempts;both.status=cloudError.status;throw both;}
 }
 async function route(request){
  try{return await routeLocal(request);}catch(error){return cloudFallback(request,error);}
 }
 async function routeLocal(request){
  const saved=await settings();
  const enabled=saved.genSources.filter(source=>source.enabled!==false&&source.apiKey&&source.model);
  const active=enabled.find(source=>source.id===saved.activeGenSourceId)||enabled[0];
  if(!active)throw new Error('请先在 API 来源页配置并启用生图来源');
  const candidates=saved.genRouteMode==='priority'?[...enabled].sort((a,b)=>(a.priority||100)-(b.priority||100)):[active];
  const attempts=[];
  for(const source of candidates){
   // A profile may override the aspect ratio (e.g. character sheets at 9:16).
   // a request may also set its own long-side pixels (custom size in the library), else the source's setting is used
   const px=Math.round(Number(request.pixels));
   try{const result=await generate({...source,...(request.aspect?{aspect:request.aspect}:{}),...(px>=256&&px<=8192?{pixels:px}:{})},request);return {...result,attempts};}
   catch(error){if(error.name==='AbortError')throw error;attempts.push({source:source.name,error:error.message});if(!retryable(error)||source===candidates.at(-1)){error.attempts=attempts;throw error;}}
  }
 }
 async function keyStatus(source){const status=[],state=await keyState();for(const key of [source.apiKey,source.apiKey2].map(k=>String(k||'').trim()).filter(Boolean)){const entry=state[await keyId(key)];status.push({exhausted:entry?.exhausted===today(),used:entry?.day===today()?entry.count||0:0});}return status;}
 async function resetKeys(){await chrome.storage.local.remove('modelscopeKeyState');}
 return {PROTOCOLS,ASPECTS,QUALITIES,PIXELS,DEFAULTS,REFERENCE,MODELSCOPE,IMGBB,TIMING,settings,sizeFor,dimensions,generate,route,reference,keyStatus,resetKeys,imgbbSettings,testImgbb,validImage};
})();
