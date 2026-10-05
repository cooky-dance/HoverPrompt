(() => {
  const panelBuild='3.10.0',previousPanel=globalThis.__imagePromptPanelLoaded;
  if(previousPanel?.version===panelBuild&&previousPanel.host?.isConnected){chrome.runtime.onMessage?.addListener(previousPanel.onMessage);return;}
  previousPanel?.host?.remove();
  document.querySelector('[data-imageprompt-floating-host]')?.remove();
  const host = document.createElement('div');host.dataset.imagepromptFloatingHost=panelBuild;
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:transparent!important;box-shadow:none!important;outline:none!important;border:0!important;filter:none!important;backdrop-filter:none!important';
  host.style.colorScheme='light';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `button{font:13px system-ui;cursor:pointer;color:white;border:1px solid #ffffff70;background:#24282cbf;border-radius:20px;padding:7px 13px;pointer-events:auto}#hover{position:fixed;display:none}#panel{position:fixed;right:20px;top:70px;width:390px;height:min(760px,calc(100vh - 90px));border:1px solid #ffffff66;border-radius:24px;background:#24282bd9;backdrop-filter:blur(20px);box-shadow:none;pointer-events:auto;overflow:hidden;display:none}#bar{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;color:#fff;font:600 12px system-ui;letter-spacing:1px}iframe{width:100%;height:calc(100% - 48px);border:0;outline:none;box-shadow:none;background:transparent}@media(max-width:450px){#panel{right:8px;width:calc(100vw - 16px)}}`;
  const panel = document.createElement('div'); panel.id = 'panel';
  const bar = document.createElement('div'); bar.id = 'bar';
  const title = document.createElement('span'); title.textContent = 'HoverPrompt · v3.10.0';
  const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', '关闭悬浮窗');
  const pin = document.createElement('button'); pin.id = 'pin'; pin.textContent = '♧'; pin.title = '固定位置 / Pin position'; pin.setAttribute('aria-pressed', 'false');
  // Day/night switch: first button in the window bar (before pin and close); shares appearanceMode with the settings page.
  const dayNight = document.createElement('button'); dayNight.id = 'dayNight'; dayNight.type = 'button';
  const actions = document.createElement('div'); actions.id = 'windowActions'; actions.append(dayNight, pin, close);
  const frame = document.createElement('iframe'); frame.title = '图片提示词分析';
  frame.style.colorScheme='light';
  frame.allow = 'clipboard-write';
  bar.append(title, actions); panel.append(bar, frame); root.append(style, panel); document.documentElement.append(host);
  globalThis.LiquidGlass?.install(root);
  // Window chrome matches the in-frame design: one UI font, 8px glass squares, ink for the pressed pin.
  const chromeStyle=document.createElement('style');chromeStyle.textContent=`#panel #bar{font:600 12px 'Segoe UI Variable Text','Segoe UI','Microsoft YaHei UI','PingFang SC',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.92}#panel #windowActions{gap:6px}#panel #windowActions button{width:28px;height:28px;padding:0;border-radius:8px;display:grid;place-items:center;font:500 14px/1 'Segoe UI',system-ui,sans-serif;color:inherit;background:#ffffff1f;border:1px solid #ffffff38;box-shadow:inset 0 1px 0 #ffffff33}#panel #windowActions button:hover{background:#ffffff38}#panel[data-mode=light] #windowActions button{background:#ffffffa6;border-color:#0000001a;box-shadow:inset 0 1px 0 #fff}#panel[data-mode=light] #windowActions button:hover{background:#fff}#panel #pin[aria-pressed="true"]{background:#f4f4f5;color:#111113;border-color:#f4f4f5}#panel[data-mode=light] #pin[aria-pressed="true"]{background:#111113;color:#fff;border-color:#111113}`;root.append(chromeStyle);
  const imageButtons=ImagePromptButtons.create(root,host,(src,action)=>openPanel(src,action));
  function applyAppearance(saved){const light=saved.appearanceMode==='light'||(saved.appearanceMode!=='dark'&&!matchMedia('(prefers-color-scheme: dark)').matches),glass=saved.glassEffect!==false;panel.style.background=light?(glass?'#8e8e968f':'#8e8e96'):(glass?'#2a2a2eb8':'#2a2a2e');bar.style.color='#fff';panel.style.backdropFilter=glass?(CSS.supports('backdrop-filter','url(#ip-liquid)')?'url(#ip-liquid-soft) blur(14px) saturate(1.7)':'blur(20px) saturate(1.6)'):'none';panel.style.border=light?'1px solid #ffffffd9':'1px solid #ffffff26';panel.style.boxShadow='none';dayNight.innerHTML=light?"<svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'/></svg>":"<svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/></svg>";dayNight.title=light?'切换到深色 / Switch to dark':'切换到浅色 / Switch to light';dayNight.setAttribute('aria-label',dayNight.title);panel.dataset.mode=light?'light':'dark';}
  dayNight.onclick=async()=>{const saved=await chrome.storage.local.get(['appearanceMode']);const light=saved.appearanceMode==='light'||(saved.appearanceMode!=='dark'&&!matchMedia('(prefers-color-scheme: dark)').matches);await chrome.storage.local.set({appearanceMode:light?'dark':'light'});};
  chrome.storage.local.get(['appearanceMode','glassEffect']).then(applyAppearance);
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&(changes.appearanceMode||changes.glassEffect))chrome.storage.local.get(['appearanceMode','glassEffect']).then(applyAppearance);});
  let frameReady=false,frameLoadTimer;
  const loading=document.createElement('div');loading.id='frameLoading';loading.style.cssText='position:absolute;inset:44px 0 0;z-index:4;display:none;overflow:hidden;border-radius:0 0 24px 24px';
  // Loading state: drifting colour blobs under a blur plus a spinner; text only appears if loading fails.
  const loadingStyle=document.createElement('style');loadingStyle.textContent='#frameLoading .ip-blobs{position:absolute;inset:-35%;filter:blur(42px) saturate(1.35);opacity:.9;background:radial-gradient(40% 36% at 30% 30%,#ff8a6b,transparent 70%),radial-gradient(38% 34% at 72% 28%,#8f7bff,transparent 70%),radial-gradient(42% 38% at 62% 72%,#3fd7b0,transparent 70%),radial-gradient(34% 30% at 28% 76%,#5aa8ff,transparent 70%);animation:ip-drift 7s ease-in-out infinite alternate}#frameLoading .ip-blobs::after{content:"";position:absolute;inset:0;background:inherit;animation:ip-spin 18s linear infinite;mix-blend-mode:screen;opacity:.55}@keyframes ip-drift{0%{transform:translate(0,0) scale(1) rotate(0deg)}50%{transform:translate(7%,-6%) scale(1.12) rotate(35deg)}100%{transform:translate(-6%,7%) scale(1.02) rotate(70deg)}}#frameLoading .ip-spinner{position:absolute;left:50%;top:44%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:3px solid #ffffff4d;border-top-color:#fff;box-shadow:0 0 24px #ffffff55;animation:ip-spin .8s linear infinite}@keyframes ip-spin{to{transform:rotate(360deg)}}#frameLoading p{position:absolute;inset-inline:18px;top:calc(44% + 34px);margin:0;text-align:center;font:600 12.5px/1.5 system-ui;color:#fff;text-shadow:0 1px 3px #0008}#frameLoading p:empty{display:none}#frameLoading button{position:absolute;left:50%;top:calc(44% + 96px);transform:translateX(-50%)}#frameLoading.failed .ip-spinner{display:none}@media (prefers-reduced-motion:reduce){#frameLoading .ip-blobs,#frameLoading .ip-blobs::after,#frameLoading .ip-spinner{animation-duration:0s}}';root.append(loadingStyle);
  const blobs=document.createElement('div');blobs.className='ip-blobs';const spinner=document.createElement('div');spinner.className='ip-spinner';spinner.setAttribute('role','progressbar');spinner.setAttribute('aria-label','Loading HoverPrompt');loading.append(blobs,spinner);
  const loadingText=document.createElement('p'),reloadFrame=document.createElement('button');reloadFrame.textContent='重新加载窗口 / Reload window';reloadFrame.hidden=true;loading.append(loadingText,reloadFrame);panel.append(loading);
  function startFrame(){frameReady=false;loading.style.display='block';loadingText.textContent='';loading.classList.remove('failed');reloadFrame.hidden=true;clearTimeout(frameLoadTimer);frame.src=chrome.runtime.getURL('popup.html')+'?embed=1&bridge='+encodeURIComponent(bridgeToken)+'&load='+Date.now();frameLoadTimer=setTimeout(()=>{if(!frameReady){loading.classList.add('failed');loadingText.textContent='窗口未完成初始化。扩展更新后请刷新网页，或点击重新加载窗口。 / Initialization did not finish. Refresh the webpage after updating the extension, or reload this window.';reloadFrame.hidden=false;}},10000);}
  reloadFrame.onclick=startFrame;

  const pendingImages=[],bridgeToken=crypto.randomUUID();
  function frameOrigin() {
    const url=new URL(chrome.runtime.getURL('popup.html'));
    return url.protocol==='chrome-extension:'?'chrome-extension://'+url.host:url.origin;
  }
  function sendPendingImages() {
    if(!frameReady)return;
    while(pendingImages.length){const item=pendingImages.shift();frame.contentWindow.postMessage({type:'PROMPT_IMAGE',imageUrl:item.url,action:item.action,bridgeToken},frameOrigin());}
    if(pendingBatch){frame.contentWindow.postMessage({type:'PROMPT_BATCH_IMAGES',...pendingBatch,bridgeToken},frameOrigin());pendingBatch=null;}
  }
  // A Xiaohongshu note open on the page: "reverse the whole note" at the top right of its pictures puts all of them in the
  // window's batch list (then "Batch reverse" analyses them locally or in the cloud, as the window is set).
  let pendingBatch=null;
  const noteButton=document.createElement('button');noteButton.type='button';noteButton.hidden=true;
  noteButton.style.cssText='position:fixed;z-index:3;padding:6px 12px;border:1px solid #ffffff59;border-radius:999px;background:#1c1b22d9;color:#fff;font:600 12px system-ui,"Microsoft YaHei UI",sans-serif;cursor:pointer;box-shadow:0 6px 18px #0005;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)';
  root.append(noteButton);
  noteButton.onclick=event=>{event.preventDefault();event.stopPropagation();const images=globalThis.NoteImages?.collect()||[];if(!images.length)return;pendingBatch={images,label:'note',pageHost:location.hostname};openPanel();};
  function placeNoteButton(){
    const media=globalThis.NoteImages?.media();const rect=media?.getBoundingClientRect();
    const count=media?globalThis.NoteImages.collect().length:0;
    if(!rect||rect.width<80||!count||panel.style.display==='block'&&panel.getBoundingClientRect().left<rect.right){noteButton.hidden=true;return;}
    noteButton.textContent='反推整篇笔记 · '+count+' 张';noteButton.title='Reverse every image of this note ('+count+')';
    noteButton.style.left=Math.max(8,rect.right-noteButton.offsetWidth-10||rect.right-150)+'px';noteButton.style.top=Math.max(8,rect.top+10)+'px';noteButton.hidden=false;
  }
  if(/(^|\.)xiaohongshu\.com$/i.test(location.hostname))setInterval(placeNoteButton,700);
  function openPanel(src,action) {
    if(src)pendingImages.push({url:src,action:action||''});
    if (!frame.getAttribute('src')) startFrame();
    sendPendingImages();
    panel.style.display = 'block';clampPosition();imageButtons.refresh();
  }
  const onPanelMessage=(message, sender, respond) => {
    if(message.type==='CLI_COLLECT_PAGE_IMAGES'){
      if(message.scope==='note'){respond({images:globalThis.NoteImages?.collect()||[],steps:0,reason:'note',pageUrl:location.href});return;}
      if(!['visible','loaded','scroll'].includes(message.scope)){respond({error:'Invalid scan scope'});return;}
      if(pageScan){respond({error:'Another page scan is running'});return;}
      const scan={id:message.requestId,controller:new AbortController()};pageScan=scan;
      pageImages.collect(message.scope,{signal:scan.controller.signal,maxSteps:message.maxScreens}).then(result=>respond({...result,pageUrl:location.href})).catch(error=>respond({error:error.message})).finally(()=>{if(pageScan===scan)pageScan=null;});return true;
    }
    if (message.type !== 'OPEN_PROMPT_PANEL') return;
    if(message.activateButtons)imageButtons.activate();openPanel(message.imageUrl);respond({opened:true,version:panelBuild});
  };
  chrome.runtime.onMessage?.addListener(onPanelMessage);
  const pageImages=PageImageCollector.create();
  let pageScan=null,capturing=false;
  function selectScreenshotArea(){
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.id='screenshotSelector';overlay.tabIndex=-1;
      overlay.style.cssText='position:fixed;inset:0;z-index:10;pointer-events:auto;cursor:crosshair;touch-action:none;user-select:none;outline:none;background:#0002';
      const hint=document.createElement('div');hint.style.cssText='position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:10px 14px;background:#202c3a;color:white;border-radius:12px;font:14px system-ui;cursor:default;white-space:nowrap';
      hint.textContent='拖动鼠标框选 · Esc 退出 / Drag to select · Esc to exit ';
      const cancel=document.createElement('button');cancel.id='cancelScreenshot';cancel.textContent='取消 / Cancel';hint.append(cancel);
      const box=document.createElement('div');box.id='screenshotSelection';box.style.cssText='position:absolute;display:none;border:2px solid #80c6ff;background:#ffffff12;pointer-events:none;box-sizing:border-box';
      overlay.append(hint,box);root.append(overlay);overlay.focus({preventScroll:true});let start=null,finished=false;
      const clamp=event=>({x:Math.max(0,Math.min(innerWidth,event.clientX)),y:Math.max(0,Math.min(innerHeight,event.clientY))});
      const area=point=>({x:Math.min(start.x,point.x),y:Math.min(start.y,point.y),width:Math.abs(start.x-point.x),height:Math.abs(start.y-point.y),viewportWidth:innerWidth,viewportHeight:innerHeight});
      function finish(value){if(finished)return;finished=true;window.removeEventListener('keydown',key,true);window.removeEventListener('resize',resized);overlay.remove();resolve(value);}
      function key(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(null);}}
      function resized(){finish(null);}
      window.addEventListener('keydown',key,true);window.addEventListener('resize',resized);
      overlay.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
      cancel.onclick=event=>{event.stopPropagation();finish(null);};
      overlay.onpointerdown=event=>{if(event.button!==0||hint.contains(event.target))return;event.preventDefault();event.stopPropagation();start=clamp(event);overlay.setPointerCapture(event.pointerId);box.style.display='block';Object.assign(box.style,{left:start.x+'px',top:start.y+'px',width:'0px',height:'0px'});};
      overlay.onpointermove=event=>{if(!start)return;const rect=area(clamp(event));Object.assign(box.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});};
      overlay.onpointerup=event=>{if(!start)return;event.preventDefault();event.stopPropagation();const rect=area(clamp(event));start=null;if(rect.width<8||rect.height<8){box.style.display='none';return;}finish(rect);};
      overlay.onpointercancel=()=>finish(null);
    });
  }
  async function capturePage(request){
    if(capturing)return;
    capturing=true;const previous=host.style.visibility,display=panel.style.display;
    const reply=value=>frame.contentWindow.postMessage({type:'PROMPT_SCREENSHOT_RESULT',requestId:request.requestId,bridgeToken,...value},frameOrigin());
    try{
      panel.style.display='none';const area=await selectScreenshotArea();if(!area){reply({cancelled:true});return;}
      host.style.visibility='hidden';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await new Promise(resolve=>setTimeout(resolve,80));
      const result=await chrome.runtime.sendMessage({type:'CAPTURE_IMAGEPROMPT_PAGE'});if(!result?.dataUrl)throw new Error(result?.error||'截图失败 / Capture failed');
      if(innerWidth!==area.viewportWidth||innerHeight!==area.viewportHeight)throw new Error('窗口尺寸已改变，请重新框选 / Window resized; select again');
      const image=new Image();image.src=result.dataUrl;await image.decode();
      const sx=image.naturalWidth/area.viewportWidth,sy=image.naturalHeight/area.viewportHeight;
      const left=Math.round(area.x*sx),top=Math.round(area.y*sy),width=Math.max(1,Math.min(image.naturalWidth-left,Math.round(area.width*sx))),height=Math.max(1,Math.min(image.naturalHeight-top,Math.round(area.height*sy)));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,left,top,width,height,0,0,width,height);reply({dataUrl:canvas.toDataURL('image/png')});
    }catch(error){reply({error:error.message});}
    finally{host.style.visibility=previous;panel.style.display=display;capturing=false;imageButtons.refresh();}
  }
  async function collectImages(request){
    if(request.scope==='note'){const images=globalThis.NoteImages?.collect()||[];frame.contentWindow.postMessage({type:'PROMPT_PAGE_IMAGES',requestId:request.requestId,pageHost:location.hostname,images,steps:0,reason:'note',...(images.length?{}:{error:'当前页面没有打开的笔记 / No open note on this page'}),bridgeToken},frameOrigin());return;}
    if(pageScan){frame.contentWindow.postMessage({type:'PROMPT_PAGE_IMAGES',requestId:request.requestId,error:'已有扫描正在运行 / A scan is already running',bridgeToken},frameOrigin());return;}
    const scan={id:request.requestId,controller:new AbortController()};pageScan=scan;
    try{
      const result=await pageImages.collect(request.scope,{signal:scan.controller.signal,onProgress:progress=>frame.contentWindow.postMessage({type:'PROMPT_SCAN_PROGRESS',requestId:scan.id,...progress,bridgeToken},frameOrigin())});
      frame.contentWindow.postMessage({type:'PROMPT_PAGE_IMAGES',requestId:scan.id,pageHost:location.hostname,...result,bridgeToken},frameOrigin());
    }catch(error){frame.contentWindow.postMessage({type:'PROMPT_PAGE_IMAGES',requestId:scan.id,error:error.message,bridgeToken},frameOrigin());}
    finally{if(pageScan===scan)pageScan=null;}
  }
  let pinned = false, drag = null;
  function clampPosition() {
    const rect = panel.getBoundingClientRect();
    if (panel.style.left) panel.style.left = Math.max(8,Math.min(innerWidth-rect.width-8,rect.left))+'px';
    panel.style.top = Math.max(8,Math.min(innerHeight-44,rect.top))+'px';
  }
  async function savePosition() {
    const rect = panel.getBoundingClientRect();
    await chrome.storage?.local.set({floatingWindow:{pinned,left:rect.left,top:rect.top}});
  }
  pin.onclick = async () => {
    pinned = !pinned;pin.textContent = pinned ? '📌' : '♧';
    pin.title = pinned ? '已固定，点击解锁移动 / Unpin' : '自由移动，点击固定 / Pin';
    pin.setAttribute('aria-pressed',String(pinned));bar.style.cursor = pinned ? 'default' : 'grab';await savePosition();
  };
  bar.onpointerdown = event => {
    if (pinned || event.button !== 0 || event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();drag = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    bar.setPointerCapture(event.pointerId);panel.style.right = 'auto';frame.style.pointerEvents = 'none';event.preventDefault();
  };
  bar.onpointermove = event => {
    if (!drag) return;const rect = panel.getBoundingClientRect();
    panel.style.left = Math.max(8,Math.min(innerWidth-rect.width-8,drag.left+event.clientX-drag.x))+'px';
    panel.style.top = Math.max(8,Math.min(innerHeight-44,drag.top+event.clientY-drag.y))+'px';
  };
  const finishDrag = async () => { if (!drag) return;drag=null;frame.style.pointerEvents='';await savePosition(); };
  bar.onpointerup = finishDrag;bar.onpointercancel = finishDrag;
  chrome.storage?.local.get(['floatingWindow']).then(saved => {
    const position=saved.floatingWindow;if(!position)return;
    pinned=position.pinned===true;pin.textContent=pinned?'📌':'♧';pin.setAttribute('aria-pressed',String(pinned));
    if(Number.isFinite(position.left) && Number.isFinite(position.top)){panel.style.left=position.left+'px';panel.style.right='auto';panel.style.top=position.top+'px';}
    bar.style.cursor=pinned?'default':'grab';
  });
  close.onclick = () => { panel.style.display = 'none';imageButtons.refresh(); }; // Keep the frame alive so analysis can finish.
  // Keyboard shortcuts: hovered page image, or forwarded to the floating window when the pointer is over it.
  let shortcutPointer=null;addEventListener('pointermove',event=>{shortcutPointer={x:event.clientX,y:event.clientY};},true);
  const flash=document.createElement('div');flash.id='shortcutFlash';flash.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:3;padding:8px 14px;border-radius:10px;background:#111113e6;color:#fff;font:600 12px system-ui;pointer-events:none;opacity:0;transition:opacity .15s';root.append(flash);let flashTimer=null;
  const notify=text=>{flash.textContent=text;flash.style.opacity='1';clearTimeout(flashTimer);flashTimer=setTimeout(()=>{flash.style.opacity='0';},1600);};
  const copyText=async text=>{try{await navigator.clipboard.writeText(text);notify('已复制提示词 / Prompt copied');}catch{notify('复制失败，请先点击页面 / Copy failed; click the page first');}};
  addEventListener('keydown',event=>{
    const action=globalThis.ImagePromptShortcuts?.action(event);if(!action)return;
    const rect=panel.style.display==='block'?panel.getBoundingClientRect():null;
    if(rect&&shortcutPointer&&shortcutPointer.x>=rect.left&&shortcutPointer.x<=rect.right&&shortcutPointer.y>=rect.top&&shortcutPointer.y<=rect.bottom){
      if(!frameReady)return;event.preventDefault();event.stopPropagation();frame.contentWindow.postMessage({type:'PROMPT_SHORTCUT',action,bridgeToken},frameOrigin());return;
    }
    const image=imageButtons.hovered?.(),src=image&&(image.currentSrc||image.src);if(!src)return;
    event.preventDefault();event.stopPropagation();
    if(action==='copy'){chrome.runtime.sendMessage({type:'IMAGEPROMPT_LOOKUP',url:src}).then(result=>result?.prompt?copyText(result.prompt):notify('这张图还没有提示词，按 '+(ImagePromptShortcuts.keys().reverse||'R').toUpperCase()+' 反推 / No prompt yet')).catch(()=>notify('读取失败 / Lookup failed'));return;}
    openPanel(src,{reverse:'',generate:'reverse-generate',i2i:'image-to-image',expand:'open'}[action]);
    notify({reverse:'开始反推 / Reverse started',generate:'开始生图 / Generate started',i2i:'开始图生图 / Image to image started',expand:'打开提示词 / Opening prompts'}[action]);
  },true);
  addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== frameOrigin()) return;
    if(event.data?.type==='PROMPT_SHORTCUT_COPY'&&event.data.bridgeToken===bridgeToken){if(event.data.text)copyText(event.data.text);else notify(event.data.message||'没有可复制的提示词 / Nothing to copy');}
    if(event.data?.type==='PROMPT_SCREENSHOT'&&event.data.bridgeToken===bridgeToken)capturePage(event.data);
    if(event.data?.type==='COLLECT_PAGE_IMAGES'&&event.data.bridgeToken===bridgeToken){collectImages(event.data);}
    if(event.data?.type==='STOP_PAGE_SCAN'&&event.data.bridgeToken===bridgeToken&&event.data.requestId===pageScan?.id)pageScan.controller.abort();
    if(event.data?.type==='CLEAR_PAGE_IMAGES'&&event.data.bridgeToken===bridgeToken&&!pageScan)pageImages.clear();
    if(event.data?.type==='PROMPT_IMAGE_FILTER'&&event.data.bridgeToken===bridgeToken)ImagePromptFilter.configure(event.data.filter);
    if(event.data?.type==='PROMPT_BUTTON_MODE')imageButtons.setMode(event.data.mode);
    if(event.data?.type==='PROMPT_READY'){frameReady=true;clearTimeout(frameLoadTimer);loading.style.display='none';sendPendingImages();}
    if(event.data?.type==='PROMPT_INIT_FAILED'){clearTimeout(frameLoadTimer);loading.style.display='block';loading.classList.add('failed');loadingText.textContent='窗口初始化失败 / Initialization failed: '+String(event.data.error||'Unknown error').slice(0,300);reloadFrame.hidden=false;}
    if (event.data?.type === 'prompt-history-width') {panel.style.width = event.data.open ? 'min(610px,calc(100vw - 16px))' : 'min(350px,calc(100vw - 16px))';clampPosition();}
  });
  style.textContent += '#panel{width:min(350px,calc(100vw - 16px));height:min(690px,calc(100vh - 50px));top:24px;background:linear-gradient(145deg,#62655b9c,#161a1ae0);backdrop-filter:blur(28px);border-radius:26px}#bar{height:44px;color:#dae0e4;font-size:12px}iframe{height:calc(100% - 44px)}';
  style.textContent += '#bar{cursor:grab;touch-action:none;user-select:none}#windowActions{display:flex;gap:5px}#windowActions button{width:30px;height:30px;padding:0}#pin[aria-pressed="true"]{background:#bc763b99}';
  addEventListener('resize', () => { clampPosition();imageButtons.refresh(); });
  globalThis.__imagePromptPanelLoaded={version:panelBuild,host,onMessage:onPanelMessage};
})();
