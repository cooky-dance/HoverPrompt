// ChatGPT image studio plugin, page side. The workbench (chatgpt-studio.html) drives one chatgpt.com tab per conversation:
// it sends CGPT_JOB, this script types the prompt (through chatgpt-main.js in the page's world), attaches references, presses
// Send, waits for that reply's image to finish and answers with the image. Progress goes back as CGPT_PROGRESS.
// On ordinary chatgpt.com visits it adds a launcher for the workbench and "Save to HoverPrompt" under generated images.
(()=>{
 if(globalThis.__imagepromptChatGPT)return;globalThis.__imagepromptChatGPT=true;
 const SELECTORS={
  composer:['#prompt-textarea[contenteditable="true"]','div.ProseMirror[contenteditable="true"]','[contenteditable="true"][role="textbox"]','textarea#prompt-textarea','textarea[name="prompt-textarea"]'],
  send:['button[data-testid="send-button"]','#composer-submit-button','button[aria-label="Send prompt"]','button[aria-label="发送提示"]','button[aria-label*="Send" i]','button[aria-label*="发送"]'],
  stop:['button[data-testid="stop-button"]','button[aria-label="Stop generating"]','button[aria-label="停止生成"]','button[aria-label*="Stop" i]','button[aria-label*="停止"]'],
  fileInput:['#upload-files','input[type="file"][data-photo-upload-enabled="true"]','input[type="file"][accept*="image"]','input[type="file"][multiple]','input[type="file"]'],
  assistant:['[data-testid^="conversation-turn"][data-turn="assistant"]','[data-message-author-role="assistant"]'],
  user:['[data-testid^="conversation-turn"][data-turn="user"]','[data-message-author-role="user"]'],
  login:['[data-testid="login-button"]','a[href*="/auth/login"]','button[data-testid="welcome-login-button"]'],
  // the file list ChatGPT opens after "@" in the composer, and the upload input of a library folder page
  mentionOption:['[role="option"]','[role="menuitem"]','[cmdk-item]','li','button','div'],
  libraryInput:['input[type="file"][multiple]','input[type="file"]'],
  limit:'(reached|hit) (your|the) .{0,40}limit|limit (reached|resets)|try again later|too many requests|已达到.{0,12}(上限|限制)|稍后再试|请求过多'};
 let selectors=SELECTORS,zh=true,lang='zh-CN',enabled=false,current=null;
 // this script runs on chatgpt.com without the extension's translation tables, so it carries its own (ru/ja/ko/hi/ar)
 const L10N={"Stopped":{"ru": "Остановлено", "ja": "停止しました", "ko": "중지됨", "hi": "रोका गया", "ar": "توقّف"},"Upload input not found; cannot attach references":{"ru": "Поле загрузки не найдено; нельзя прикрепить референсы", "ja": "アップロード欄が見つからないため、参照画像を添付できません", "ko": "업로드 입력란을 찾을 수 없어 참조 이미지를 첨부할 수 없습니다", "hi": "अपलोड इनपुट नहीं मिला; रेफ़रेंस नहीं जोड़े जा सकते", "ar": "لم يُعثر على حقل الرفع؛ لا يمكن إرفاق المراجع"},"Could not read the image":{"ru": "Не удалось прочитать изображение", "ja": "画像を読み込めませんでした", "ko": "이미지를 읽을 수 없습니다", "hi": "इमेज नहीं पढ़ी जा सकी", "ar": "تعذّرت قراءة الصورة"},"This conversation needs a ChatGPT sign-in":{"ru": "Для этого диалога нужен вход в ChatGPT", "ja": "この会話には ChatGPT へのログインが必要です", "ko": "이 대화는 ChatGPT 로그인이 필요합니다", "hi": "इस बातचीत के लिए ChatGPT साइन इन ज़रूरी है", "ar": "تحتاج هذه المحادثة إلى تسجيل الدخول إلى ChatGPT"},"Could not type into ChatGPT; the page may have changed":{"ru": "Не удалось ввести текст в ChatGPT; возможно, страница изменилась", "ja": "ChatGPT の入力欄に書き込めませんでした。ページが変更された可能性があります", "ko": "ChatGPT 입력창에 입력할 수 없습니다. 페이지가 바뀌었을 수 있습니다", "hi": "ChatGPT में टाइप नहीं हो सका; पेज बदल गया हो सकता है", "ar": "تعذّرت الكتابة في ChatGPT؛ ربما تغيّرت الصفحة"},"Could not type into ChatGPT":{"ru": "Не удалось ввести текст в ChatGPT", "ja": "ChatGPT の入力欄に書き込めませんでした", "ko": "ChatGPT 입력창에 입력할 수 없습니다", "hi": "ChatGPT में टाइप नहीं हो सका", "ar": "تعذّرت الكتابة في ChatGPT"},"Send stayed disabled (references may still be uploading)":{"ru": "Кнопка отправки недоступна (референсы, возможно, ещё загружаются)", "ja": "送信ボタンが押せないままです（参照画像がまだアップロード中の可能性があります）", "ko": "전송 버튼이 계속 비활성 상태입니다(참조 이미지가 아직 업로드 중일 수 있음)", "hi": "Send बटन बंद ही रहा (रेफ़रेंस शायद अभी अपलोड हो रहे हैं)", "ar": "بقي زر الإرسال معطّلًا (ربما ما زالت المراجع تُرفع)"},"No image in this reply:":{"ru": "В этом ответе нет изображения:", "ja": "この返信に画像がありません：", "ko": "이 답변에 이미지가 없습니다:", "hi": "इस जवाब में कोई इमेज नहीं:", "ar": "لا توجد صورة في هذا الرد:"},"ChatGPT did not reply":{"ru": "ChatGPT не ответил", "ja": "ChatGPT から返信がありません", "ko": "ChatGPT가 답하지 않았습니다", "hi": "ChatGPT ने जवाब नहीं दिया", "ar": "لم يرد ChatGPT"},"Plugin is off":{"ru": "Плагин выключен", "ja": "プラグインはオフです", "ko": "플러그인이 꺼져 있습니다", "hi": "प्लगइन बंद है", "ar": "الإضافة معطّلة"},"The ChatGPT image studio plugin is off":{"ru": "Плагин студии изображений ChatGPT выключен", "ja": "ChatGPT 画像スタジオのプラグインがオフです", "ko": "ChatGPT 이미지 스튜디오 플러그인이 꺼져 있습니다", "hi": "ChatGPT इमेज स्टूडियो प्लगइन बंद है", "ar": "إضافة استوديو صور ChatGPT معطّلة"},"This conversation is busy":{"ru": "Этот диалог занят", "ja": "この会話は処理中です", "ko": "이 대화는 사용 중입니다", "hi": "यह बातचीत व्यस्त है", "ar": "هذه المحادثة مشغولة"},"The library folder page has no upload input; check the link":{"ru": "На странице папки библиотеки нет поля загрузки; проверьте ссылку", "ja": "ライブラリのフォルダーページにアップロード欄がありません。リンクを確認してください", "ko": "라이브러리 폴더 페이지에 업로드 입력란이 없습니다. 링크를 확인하세요", "hi": "लाइब्रेरी फ़ोल्डर पेज पर अपलोड इनपुट नहीं है; लिंक जाँचें", "ar": "لا يوجد حقل رفع في صفحة مجلد المكتبة؛ تحقق من الرابط"},"ChatGPT sign-in needed":{"ru": "Нужен вход в ChatGPT", "ja": "ChatGPT へのログインが必要です", "ko": "ChatGPT 로그인 필요", "hi": "ChatGPT साइन इन ज़रूरी", "ar": "يلزم تسجيل الدخول إلى ChatGPT"},"HoverPrompt studio":{"ru": "Студия HoverPrompt", "ja": "HoverPrompt スタジオ", "ko": "HoverPrompt 스튜디오", "hi": "HoverPrompt स्टूडियो", "ar": "استوديو HoverPrompt"},"Save to HoverPrompt":{"ru": "Сохранить в HoverPrompt", "ja": "HoverPrompt に保存", "ko": "HoverPrompt에 저장", "hi": "HoverPrompt में सेव करें", "ar": "الحفظ في HoverPrompt"},"Saved":{"ru": "Сохранено", "ja": "保存しました", "ko": "저장됨", "hi": "सेव हो गया", "ar": "تم الحفظ"},"Save failed":{"ru": "Не удалось сохранить", "ja": "保存に失敗しました", "ko": "저장 실패", "hi": "सेव नहीं हो सका", "ar": "فشل الحفظ"}};
 const t=(cn,en)=>{if(zh)return cn;const key=String(en).trim(),hit=L10N[key]?.[lang];return hit?en.replace(key,hit):en;};
 const find=(list,scope=document)=>{for(const selector of list){try{const node=scope.querySelector(selector);if(node)return node;}catch{}}return null;};
 const findAll=(list,scope=document)=>{for(const selector of list){try{const nodes=[...scope.querySelectorAll(selector)];if(nodes.length)return nodes;}catch{}}return [];};
 async function load(){
  const saved=await chrome.storage.local.get(['plugins','uiLanguage']);
  enabled=saved.plugins?.chatgpt?.enabled===true;lang=String(saved.uiLanguage||'zh-CN');zh=lang.startsWith('zh');
  const custom=saved.plugins?.chatgpt?.selectors;selectors=custom&&typeof custom==='object'?{...SELECTORS,...custom}:SELECTORS;
 }
 // Waits react to page changes (MutationObserver) as well as a slow timer: a background tab's timers can be throttled to once
 // a minute, but mutation callbacks still arrive as soon as ChatGPT updates the reply.
 function waitFor(check,timeoutMs){
  return new Promise((resolve,reject)=>{let done=false;const finish=(fn,value)=>{if(done)return;done=true;observer.disconnect();clearInterval(timer);clearTimeout(limit);fn(value);};
   const test=()=>{if(current?.stopped)return finish(reject,new Error(t('已停止','Stopped')));try{const value=check();if(value)finish(resolve,value);}catch(error){finish(reject,error);}};
   const observer=new MutationObserver(test);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});
   const timer=setInterval(test,1000),limit=setTimeout(()=>finish(resolve,null),timeoutMs);test();});
 }
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const writeComposer=text=>composerRequest('imageprompt:composer-write',text),appendComposer=text=>composerRequest('imageprompt:composer-append',text);
 function composerRequest(type,text){
  return new Promise(resolve=>{const requestId=crypto.randomUUID();
   const done=event=>{let detail=null;try{detail=JSON.parse(event.detail);}catch{}if(detail?.requestId!==requestId)return;document.removeEventListener('imageprompt:composer-written',done);clearTimeout(timer);resolve(detail.ok);};
   const timer=setTimeout(()=>{document.removeEventListener('imageprompt:composer-written',done);resolve(false);},3000);
   document.addEventListener('imageprompt:composer-written',done);document.dispatchEvent(new CustomEvent(type,{detail:JSON.stringify({requestId,value:text})}));});
 }
 // references and files go in one upload; each is a data URL or {name, dataUrl} (the workbench names files after their
 // content, so ChatGPT's library keeps one stable name per image and later messages can refer to it with @name)
 async function attach(images,files=[]){
  if(!images.length&&!files.length)return;const input=find(selectors.fileInput);if(!input)throw new Error(t('找不到上传入口，无法附上参考图','Upload input not found; cannot attach references'));
  const transfer=new DataTransfer();for(const [i,item] of images.entries()){const dataUrl=typeof item==='string'?item:item.dataUrl;const blob=await (await fetch(dataUrl)).blob();transfer.items.add(new File([blob],typeof item==='string'?'reference-'+(i+1)+(blob.type==='image/png'?'.png':blob.type==='image/webp'?'.webp':'.jpg'):item.name,{type:blob.type}));}
  for(const file of files){const blob=await (await fetch(file.dataUrl)).blob();transfer.items.add(new File([blob],file.name,{type:blob.type||'text/markdown'}));}
  input.files=transfer.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
 }
 // "@name": type the unique part of the file name at the end of the prompt, wait for ChatGPT's file list (it can take a few
 // seconds), click the entry whose text is exactly the file name, and check the typed query turned into a reference.
 const composerText=()=>{const box=find(selectors.composer);return box?(box.tagName==='TEXTAREA'?box.value:box.innerText||''):'';};
 function option(name){
  const box=find(selectors.composer);
  for(const selector of selectors.mentionOption){let nodes=[];try{nodes=[...document.querySelectorAll(selector)];}catch{}
   const hit=nodes.filter(n=>!box?.contains(n)&&!n.closest('[data-testid^="conversation-turn"],[data-message-author-role]')&&n.offsetParent!==null&&String(n.innerText||n.textContent||'').trim()===name);if(hit.length)return hit.sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0];}
  return null;
 }
 async function mention(name){
  const stem=name.replace(/\.[^.]+$/,'');
  if(!(await appendComposer((composerText().trim()?' ':'')+'@'+stem)))return false;
  const entry=await waitFor(()=>option(name),Number(globalThis.__imagepromptMentionMs)||15000);if(!entry)return false;
  for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])entry.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));
  return !!(await waitFor(()=>!composerText().includes('@'+stem),3000));
 }
 const assistantTurns=()=>findAll(selectors.assistant);
 const alerts=()=>[...document.querySelectorAll('[role="alert"],[data-testid*="toast"]')].map(n=>n.innerText).join(' ');
 const limitIn=text=>new RegExp(selectors.limit,'i').test(text)?text.trim().slice(0,200):'';
 const src=img=>img.currentSrc||img.src||'';
 // generated images of one reply: large, not avatars or icons. Worker tabs sit in a minimized window where lazy images may
 // never load, so a declared size counts too (the bytes are fetched from the URL anyway) and lazy loading is switched off.
 const imagesIn=turn=>[...turn.querySelectorAll('img')].filter(img=>{if(img.loading==='lazy')img.loading='eager';if(!/^(https?:|blob:|data:image\/)/.test(src(img)))return false;
  return img.complete&&Math.max(img.naturalWidth,img.naturalHeight)>=256||Number(img.getAttribute('width'))>=256&&Number(img.getAttribute('height'))>=256;});
 function report(stage,percent,extra={}){if(current)chrome.runtime.sendMessage({type:'CGPT_PROGRESS',jobId:current.id,stage,percent:Math.round(percent),url:location.href,...extra}).catch(()=>{});}
 async function toDataUrl(img){
  const url=src(img);if(url.startsWith('data:'))return url;
  // the image's own address is ChatGPT's original file; the page has just loaded it, so the browser cache usually answers
  try{const response=await fetch(url,{credentials:'include',cache:'force-cache'});if(response.ok){const blob=await response.blob();if(blob.type.startsWith('image/'))return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}}catch{}
  const fetched=await chrome.runtime.sendMessage({type:'CGPT_FETCH_IMAGE',url});if(fetched?.dataUrl)return fetched.dataUrl;throw new Error(fetched?.error||t('读取图片失败','Could not read the image'));
 }
 function state(){
  if(find(selectors.login)&&!find(selectors.composer))return 'login';
  if(!find(selectors.composer))return 'loading';
  return find(selectors.stop)?'busy':'ready';
 }
 // ---- a job: CGPT_SEND types and sends one message; the workbench then polls CGPT_STATUS until the images are in ----
 // (worker tabs sit in a minimized window: the page may not update and its timers slow down, so the visible workbench drives
 // the polling, and each poll reads ChatGPT's conversation data, falling back to the page)
 const jobs=new Map();
 const API=globalThis.ImagePromptChatGPTApi;
 // "思考强度" (thinking effort): turn it to the highest level when the model offers it; n= is followed more reliably
 async function raiseThinking(){
  const box=find(selectors.composer);const scope=box?.closest('form')||document;
  const button=[...scope.querySelectorAll('button')].find(b=>/思考强度|思考|Thinking|Reasoning|Think/i.test(b.innerText||b.getAttribute('aria-label')||''));if(!button)return false;
  button.click();const control=await waitFor(()=>document.querySelector('[role="slider"],input[type="range"]'),3000);
  if(!control){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return false;}
  if(control.tagName==='INPUT'){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(control,control.max||'100');control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));}
  else{control.focus();control.dispatchEvent(new KeyboardEvent('keydown',{key:'End',code:'End',bubbles:true}));}
  await sleep(300);document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));box?.focus();
  return true;
 }
 async function sendJob(job){
  current={id:job.id,stopped:false};
  try{
   report('waiting',2);
   if(!(await waitFor(()=>state()==='ready'||state()==='login',120000))||state()==='login')throw Object.assign(new Error(t('这个会话需要登录 ChatGPT','This conversation needs a ChatGPT sign-in')),{login:true});
   const before=assistantTurns().length,userBefore=findAll(selectors.user).length;
   if(job.thinking==='high')await raiseThinking().catch(()=>false);
   if(job.references?.length||job.files?.length){report('uploading',5);await attach(job.references||[],job.files||[]);}
   if(!(await writeComposer(job.text)))throw new Error(t('无法写入 ChatGPT 输入框，页面可能改版了','Could not type into ChatGPT; the page may have changed'));
   // files already in ChatGPT's library are referred to by name; if one cannot be found, every such file is uploaded instead
   let mentionFallback=[];
   if(job.mentions?.length){report('referencing',6);let ok=true;for(const file of job.mentions){if(!(await mention(file.name))){ok=false;break;}}
    if(!ok){mentionFallback=job.mentions.map(f=>({mention:f.name,uploaded:f.uploadName||f.name}));if(!(await writeComposer(job.text)))throw new Error(t('无法写入 ChatGPT 输入框','Could not type into ChatGPT'));report('uploading',6);const uploads=job.mentions.map(f=>({name:f.uploadName||f.name,dataUrl:f.dataUrl}));await attach(uploads.filter(f=>!/\.md$/i.test(f.name)),uploads.filter(f=>/\.md$/i.test(f.name)));}}
   const send=await waitFor(()=>{const b=find(selectors.send);return b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'?b:null;},job.references?.length||job.files?.length||mentionFallback.length?180000:30000);
   if(!send)throw new Error(t('发送按钮一直不可用（参考图可能还在上传）','Send stayed disabled (references may still be uploading)'));
   const sentAt=Date.now();send.click();report('sent',10);
   // the message is in once the user turn appears (a new conversation also gets its /c/ address)
   await waitFor(()=>findAll(selectors.user).length>userBefore||!!API?.conversationId(),30000);
   jobs.set(job.id,{n:Math.max(1,Number(job.n)||1),sentAt,before,lastKey:'',stableSince:0,apiFailures:0,finishWaitMs:Number(job.finishWaitMs)||0,lastApi:0,dirty:true,found:0});watch(job.id);
   return {ok:true,sentAt,url:location.href,conversationId:API?.conversationId()||null,mentionFallback};
  }catch(error){return {ok:false,error:error.message,limit:!!error.limit,login:!!error.login,url:location.href};}
  finally{current=null;}
 }
 // Progress as soon as the page shows it: page changes (mutation callbacks still arrive in a background tab) are checked at
 // most every 400 ms; a new image or the reply ending is pushed to the workbench at once and marks the job for a fresh read
 // of the conversation data on the next poll (between such changes the data is read at most every 2 s).
 function watch(id){
  let timer=null,lastFound=-1,lastBusy=null;
  const check=()=>{timer=null;const job=jobs.get(id);if(!job){observer.disconnect();return;}
   const turns=assistantTurns(),turn=turns.length>job.before?turns.at(-1):null,found=turn?imagesIn(turn).length:0,busy=!!find(selectors.stop);
   if(found===lastFound&&busy===lastBusy)return;lastFound=found;lastBusy=busy;job.dirty=true;job.found=Math.max(job.found||0,found);
   chrome.runtime.sendMessage({type:'CGPT_PROGRESS',jobId:id,stage:turn?'drawing':'sent',percent:estimate(job,job.found),found:job.found,url:location.href}).catch(()=>{});};
  const observer=new MutationObserver(()=>{if(!timer)timer=setTimeout(check,400);});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-testid','aria-label']});
 }
 const estimate=(job,found)=>{const byTime=15+80*(1-Math.exp(-(Date.now()-job.sentAt)/(50000*Math.sqrt(job.n))));return Math.round(Math.min(95,Math.max(byTime,15+80*Math.min(1,found/job.n))));};
 async function fetchAll(urls){return Promise.all(urls.map(async url=>{
  try{const response=await fetch(url,{credentials:'include',cache:'force-cache'});if(response.ok){const blob=await response.blob();if(blob.type.startsWith('image/'))return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}}catch{}
  const fetched=await chrome.runtime.sendMessage({type:'CGPT_FETCH_IMAGE',url});if(fetched?.dataUrl)return fetched.dataUrl;throw new Error(fetched?.error||t('读取图片失败','Could not read the image'));}));}
 // One original image: ChatGPT's download address for the file; if that fails, the image on the page that shows the same
 // file (its address carries the file ID). Thumbnails are never used.
 async function fetchOriginal(image,cid){
  try{const url=await API.downloadUrl(image.pointer,cid);return (await fetchAll([url]))[0];}
  catch(error){const img=[...document.querySelectorAll('img')].find(el=>image.fileId&&src(el).includes(image.fileId));if(img)return toDataUrl(img);throw error;}
 }
 // One poll. From the conversation data when it can be read, otherwise from the page.
 async function statusJob(id){
  const job=jobs.get(id);if(!job)return {state:'unknown'};
  const elapsed=Date.now()-job.sentAt,cid=API?.conversationId();
  if(API&&cid&&job.apiFailures<3){
   // nothing changed on the page and the data was read less than 2 s ago: answer from what is known
   if(!job.dirty&&Date.now()-job.lastApi<2000)return {state:'drawing',percent:estimate(job,job.found||0),found:job.found||0,expected:job.n,source:'cache'};
   try{job.lastApi=Date.now();job.dirty=false;
    const info=API.parse(await API.conversation(cid),job.sentAt);job.found=Math.max(job.found||0,info.images.length);
    const limit=limitIn(info.text+' '+alerts());if(limit&&!info.images.length){jobs.delete(id);return {state:'limit',error:limit};}
    if(info.images.length&&info.finished){
     // several images arrive one after another: a reply with fewer than asked gets more time (20 s + 15 s per missing image, at most 2 min)
     if(info.images.length<job.n&&elapsed<(job.finishedWait||=elapsed+(job.finishWaitMs||Math.min(120000,20000+15000*(job.n-info.images.length)))))return {state:'drawing',percent:estimate(job,info.images.length),found:info.images.length,expected:job.n};
     // each image on its own: one that cannot be read is tried again on the next 2 polls, then reported by file ID instead of failing the rest
     job.got||={};job.tries||={};
     // the originals are fetched side by side
     await Promise.all(info.images.filter(image=>!job.got[image.fileId]).map(async image=>{try{job.got[image.fileId]=await fetchOriginal(image,cid);}catch{job.tries[image.fileId]=(job.tries[image.fileId]||0)+1;}}));
     job.dirty=true;
     const missing=info.images.filter(image=>!job.got[image.fileId]);
     if(missing.some(image=>job.tries[image.fileId]<3))return {state:'drawing',stage:'saving',percent:96,found:info.images.length-missing.length,expected:job.n};
     const got=info.images.filter(image=>job.got[image.fileId]);jobs.delete(id);
     return {state:'done',images:got.map(image=>job.got[image.fileId]),meta:got.map(image=>({fileId:image.fileId,title:image.title,width:image.width||null,height:image.height||null})),missing:missing.map(image=>({fileId:image.fileId,pointer:image.pointer,title:image.title})),conversationId:cid,url:location.href,runMs:elapsed};
    }
    if(info.finished&&!info.images.length&&elapsed>120000&&!find(selectors.stop)){jobs.delete(id);return {state:'failed',error:t('这条回复没有图片：','No image in this reply: ')+(info.text||'').slice(0,160)};}
    return {state:'drawing',percent:estimate(job,info.images.length),found:info.images.length,expected:job.n,source:'api'};
   }catch{job.apiFailures++;}
  }
  // page fallback: the reply turn after the one that existed before sending
  const turns=assistantTurns(),turn=turns.length>job.before?turns.at(-1):null;
  const limitText=limitIn((turn?.innerText||'')+' '+alerts());if(limitText&&!(turn&&imagesIn(turn).length)){jobs.delete(id);return {state:'limit',error:limitText};}
  if(!turn)return elapsed>180000?(jobs.delete(id),{state:'failed',error:t('ChatGPT 没有回复','ChatGPT did not reply')}):{state:'sent',percent:10};
  const found=imagesIn(turn),key=found.map(src).join('|');
  if(find(selectors.stop)||!found.length){
   if(!found.length&&!find(selectors.stop)&&elapsed>120000&&(turn.innerText||'').trim().length>40&&!turn.querySelector('img')){jobs.delete(id);return {state:'failed',error:t('这条回复没有图片：','No image in this reply: ')+turn.innerText.trim().slice(0,120)};}
   return {state:'drawing',percent:estimate(job,found.length),found:found.length,expected:job.n,source:'page'};
  }
  // the preview sharpens in place: accept once the image set is unchanged for 2.5 s
  if(key!==job.lastKey){job.lastKey=key;job.stableSince=Date.now();return {state:'drawing',percent:estimate(job,found.length),found:found.length,expected:job.n,source:'page'};}
  if(Date.now()-job.stableSince<2500)return {state:'drawing',percent:estimate(job,found.length),found:found.length,expected:job.n,source:'page'};
  const images=(await Promise.allSettled(found.map(toDataUrl))).map(r=>r.status==='fulfilled'?r.value:null);jobs.delete(id);const kept=found.filter((_,k)=>images[k]);
  // on the page the title can only come from the image's alt text, and only when it is not a generic label
  const titleOf=img=>{const alt=String(img.alt||'').trim().replace(/^(generated image|image|已生成图片|生成的图片|图片)\s*[:：-]?\s*/i,'').trim();return alt&&!/^(generated image|image|图片|已生成图片)$/i.test(alt)?alt:null;};
  return {state:'done',images:images.filter(Boolean),meta:kept.map(img=>({fileId:(/[?&]id=([\w-]+)/.exec(src(img))||[])[1]||null,title:titleOf(img)})),missing:found.length-kept.length?[{count:found.length-kept.length}]:[],conversationId:API?.conversationId()||null,url:location.href,runMs:elapsed};
 }
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message?.type==='CGPT_PING'){load().then(()=>respond({enabled,state:state(),url:location.href,title:document.title}));return true;}
  if(message?.type==='CGPT_LIBRARY_UPLOAD'){load().then(async()=>respond(enabled?await libraryUpload(message.files||[]):{ok:false,error:t('插件未开启','Plugin is off')}));return true;}
  if(message?.type==='CGPT_READ_CONVERSATION'){(async()=>{try{return {ok:true,...API.turns(await API.conversation(message.conversationId))};}catch(error){return {ok:false,error:error.message};}})().then(respond);return true;}
  if(message?.type==='CGPT_DOWNLOAD_FILES'){(async()=>{const out=[];for(const file of message.files||[]){try{out.push({fileId:file.fileId,dataUrl:await fetchOriginal(file,message.conversationId)});}catch(error){out.push({fileId:file.fileId,error:error.message});}}return {ok:true,files:out};})().then(respond);return true;}
  if(message?.type==='CGPT_PROJECT_CONVERSATIONS'){API.projectConversations(message.projectId).then(items=>respond({ok:true,items}),error=>respond({ok:false,error:error.message}));return true;}
  if(message?.type==='CGPT_STOP'){if(message.id){if(current?.id===message.id)current.stopped=true;jobs.delete(message.id);}else{if(current)current.stopped=true;jobs.clear();}respond({ok:true});return;}
  if(message?.type==='CGPT_SEND'){load().then(async()=>{if(!enabled)return respond({ok:false,error:t('ChatGPT 生图工作台插件未开启','The ChatGPT image studio plugin is off')});if(current)return respond({ok:false,error:t('这个会话正忙','This conversation is busy'),busy:true});respond(await sendJob(message.job));});return true;}
  if(message?.type==='CGPT_STATUS'){statusJob(message.id).then(respond,error=>respond({state:'drawing',error:error.message}));return true;}
 });
 // ---- pre-upload into a ChatGPT library folder (this tab shows the folder page) ----
 // The files go to the folder page's own upload input; when a name shows up on the page the upload counts as done.
 async function libraryUpload(files){
  if(!(await waitFor(()=>find(selectors.libraryInput)||find(selectors.login),60000)))return {ok:false,error:t('资料库文件夹页面没有上传入口，链接可能不对','The library folder page has no upload input; check the link')};
  if(!find(selectors.libraryInput))return {ok:false,login:true,error:t('需要登录 ChatGPT','ChatGPT sign-in needed')};
  const input=find(selectors.libraryInput),transfer=new DataTransfer();
  for(const file of files){const blob=await (await fetch(file.dataUrl)).blob();transfer.items.add(new File([blob],file.name,{type:blob.type||'application/octet-stream'}));}
  input.files=transfer.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  const pageText=()=>document.body.innerText||'';const shown=()=>files.filter(f=>pageText().includes(f.name.replace(/\.[^.]+$/,'')));
  await waitFor(()=>shown().length===files.length,Number(globalThis.__imagepromptLibraryMs)||120000);
  const done=shown().map(f=>f.name);return {ok:done.length>0,uploaded:done,missing:files.map(f=>f.name).filter(n=>!done.includes(n))};
 }
 // ---- launcher and save buttons on ordinary visits ----
 let host=null;
 function launcher(){
  if(!enabled||window!==window.top){host?.remove();host=null;return;}
  if(host)return;host=document.createElement('imageprompt-chatgpt');const root=host.attachShadow({mode:globalThis.__imagepromptTestOpenShadow?'open':'closed'});
  const sheet=new CSSStyleSheet();sheet.replaceSync(':host{all:initial}button{position:fixed;right:18px;bottom:96px;z-index:2147483000;border:0;border-radius:999px;padding:9px 14px;background:#168c80;color:#fff;font:600 13px system-ui,"PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px #0004;cursor:pointer}');root.adoptedStyleSheets=[sheet];
  const b=document.createElement('button');b.type='button';b.textContent=t('HoverPrompt 生图工作台','HoverPrompt studio');b.onclick=()=>chrome.runtime.sendMessage({type:'CGPT_OPEN_STUDIO'});root.append(b);document.documentElement.append(host);
 }
 async function save(img,prompt){try{const image=await toDataUrl(img);const result=await chrome.runtime.sendMessage({type:'PLUGIN_SAVE_IMAGE',image,prompt,imageUrl:src(img)});return !!result?.ok;}catch{return false;}}
 function decorate(){
  if(!enabled)return;
  for(const turn of assistantTurns())for(const img of imagesIn(turn)){
   if(img.dataset.ipSaved)continue;img.dataset.ipSaved='1';const wrap=img.parentElement;if(!wrap)continue;if(getComputedStyle(wrap).position==='static')wrap.style.position='relative';
   const b=document.createElement('button');b.type='button';b.textContent=t('存入 HoverPrompt','Save to HoverPrompt');b.setAttribute('data-imageprompt','save');
   Object.assign(b.style,{position:'absolute',left:'8px',bottom:'8px',zIndex:5,border:'0',borderRadius:'999px',padding:'4px 10px',font:'600 12px system-ui',background:'#168c80e6',color:'#fff',cursor:'pointer'});
   b.onclick=async event=>{event.preventDefault();event.stopPropagation();b.disabled=true;const users=findAll(selectors.user);const prompt=(users.filter(u=>u.compareDocumentPosition(turn)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.innerText||'').trim();b.textContent=(await save(img,prompt))?t('已存入','Saved'):t('保存失败','Save failed');};
   wrap.append(b);
  }
 }
 async function start(){
  await load();launcher();
  new MutationObserver(()=>{clearTimeout(decorate.timer);decorate.timer=setTimeout(decorate,600);}).observe(document.documentElement,{childList:true,subtree:true});decorate();
  chrome.storage.onChanged.addListener(async(changes,area)=>{if(area==='local'&&(changes.plugins||changes.uiLanguage)){await load();if(!enabled&&current)current.stopped=true;host?.remove();host=null;launcher();}});
 }
 start();
})();
