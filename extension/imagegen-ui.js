/* Settings UI for image generation: sources with default parameters and routing (API page), page mini-button
   switches (interface page). Same draft/save model as the vision sources. */
globalThis.ImageGenUI=(()=>{
 const $=id=>document.getElementById(id);
 let state=null,editingId=null,dirty=false;
 const blank=()=>({id:crypto.randomUUID(),name:'生图来源',protocol:'openai',baseUrl:'',apiKey:'',apiKey2:'',model:'',quality:'auto',aspect:ImageGen.DEFAULTS.aspect,pixels:ImageGen.DEFAULTS.pixels,priority:100,enabled:true,refMode:'auto',refField:'',refFormat:'string',keyConcurrency:ImageGen.MODELSCOPE.keyConcurrency,submitGapSec:ImageGen.MODELSCOPE.submitGapSec,dailyLimit:ImageGen.MODELSCOPE.dailyLimit});
 const note=text=>{$('genSaveStatus').textContent=text;};
 const option=(value,text)=>new Option(text,value);
 function card(){
  const section=document.createElement('section');section.id='genSourcesCard';section.className='gen-sources';
  section.innerHTML='<h3>生图来源 / Image generation</h3><p class="hint">用于网页图片上的“生图”“图生图”小框和资料库里的生图按钮。每次生图都会调用该服务并可能计费。 / Used by the page buttons and library generate buttons; each generation calls the provider and may cost money.</p>'+
   '<div class="source-header"><label>编辑生图来源 / Edit source<select id="genSourceSelect"></select></label><button id="addGenSource" type="button">新增 / Add</button><button id="deleteGenSource" type="button" class="danger">删除 / Delete</button><button id="activateGenSource" type="button">设为当前 / Make active</button></div>'+
   '<div class="source-grid">'+
   '<label>名称 / Name<input id="genName" type="text"></label>'+
   '<label>协议 / Protocol<select id="genProtocol"></select></label>'+
   '<label class="wide">接口地址 / Base URL<input id="genBaseUrl" type="url" placeholder=""></label>'+
   '<label>模型 / Model<input id="genModel" type="text" placeholder="gpt-image-1 · Qwen/Qwen-Image · gemini-2.5-flash-image · doubao-seedream-4-0"></label>'+
   '<label>密钥 / API key<input id="genApiKey" type="password" autocomplete="off"></label>'+
   '<label data-for="modelscope">备用密钥（第 2 个 Key） / Backup key (2nd key)<input id="genApiKey2" type="password" autocomplete="off" placeholder="可选 / optional"></label>'+
   '<label data-for="modelscope">每个 Key 并发 / Per-key concurrency<input id="genKeyConcurrency" type="number" min="1" max="10" step="1"></label>'+
   '<label data-for="modelscope">提交间隔（秒） / Submit gap (s)<input id="genSubmitGap" type="number" min="0" max="30" step="0.5"></label>'+
   '<label data-for="modelscope">每个 Key 每日限额（0 = 不限） / Daily limit per key (0 = none)<input id="genDailyLimit" type="number" min="0" max="100000" step="1"></label>'+
   '<p class="hint wide" data-for="modelscope">默认值来自魔搭 Skill：每个 Key 并发 2、提交间隔 1 秒、每日 250 次（基础额度；活跃账号为 350 次）。同一账号的两个 Key 共用账号额度。 / Defaults from the ModelScope skill: 2 per key, 1 s gap, 250 per day (basic allowance; 350 when active). Two keys of one account share its allowance.</p>'+
   '<p id="genKeyStatus" class="hint wide" data-for="modelscope"></p>'+
   '<label>参考图传递 / Reference image<select id="genRefMode"><option value="auto">自动（按协议） / Auto (by protocol)</option><option value="url">图片 URL / Image URL</option><option value="inline">上传图片数据 / Upload image data</option></select></label>'+
   '<label data-ref="url">参考图字段 / Reference field<input id="genRefField" type="text" spellcheck="false"></label>'+
   '<label data-ref="url">URL 格式 / URL format<select id="genRefFormat"><option value="string">单个 URL / Single URL</option><option value="array">URL 列表 / URL list</option></select></label>'+
   '<label>品质 / Quality<select id="genQuality"></select></label>'+
   '<label>比例 / Aspect<select id="genAspect"></select></label>'+
   '<label>像素（长边）/ Pixels (long side)<select id="genPixels"></select></label>'+
   '<label>实际尺寸 / Size<input id="genSizePreview" type="text" readonly tabindex="-1"></label>'+
   '<label>路由优先级 / Priority<input id="genPriority" type="number" min="1" max="9999"></label>'+
   '<label class="checkbox-setting"><input id="genEnabled" type="checkbox"> 启用此来源 / Enabled</label></div>'+
   '<div class="source-grid"><label>生图路由 / Routing<select id="genRouteMode"><option value="single">仅当前来源 / Active source only</option><option value="priority">按优先级自动切换 / Priority failover</option></select></label>'+
   '<label>生图并发 / Parallel generations<input id="genConcurrency" type="number" min="1" value="2"></label>'+
   '<p class="hint wide">生图并发是全部来源的总上限；魔搭双 Key、每个 Key 并发 2 时，设为 4 才能用满，超出的任务会排队等待空位。 / Parallel generations caps all sources; with two ModelScope keys at 2 each, set 4 to use them fully; extra tasks wait for a free slot.</p>'+
   '<label class="wide">输出目录（需本机桥接）/ Output folder (needs the bridge)<input id="genOutputDir" type="text" placeholder="留空 = %USERPROFILE%\\Pictures\\HoverPrompt / Empty = %USERPROFILE%\\Pictures\\HoverPrompt"></label></div>'+
   '<div class="form-actions"><button id="resetGenKeys" type="button" class="secondary" data-for="modelscope">重置今日额度标记 / Reset quota marks</button><button id="saveGenSource" type="button">保存生图来源 / Save</button><button id="cancelGenSource" type="button" class="secondary">取消更改 / Discard</button><button id="testGenSource" type="button" class="secondary">测试生图（一次付费请求）/ Test (one paid request)</button><span id="genSaveStatus" class="hint" role="status"></span></div>'+
   '<figure id="genTestPreview" hidden><img alt=""><figcaption class="hint"></figcaption></figure>';
  return section;
 }
 function form(){return {id:editingId,name:$('genName').value.trim()||'生图来源',protocol:$('genProtocol').value,baseUrl:$('genBaseUrl').value.trim(),apiKey:$('genApiKey').value.trim(),apiKey2:$('genApiKey2').value.trim(),model:$('genModel').value.trim(),quality:$('genQuality').value,aspect:$('genAspect').value,pixels:Number($('genPixels').value),priority:Number($('genPriority').value)||100,enabled:$('genEnabled').checked,
  refMode:$('genRefMode').value,refField:$('genRefField').value.trim(),refFormat:$('genRefFormat').value,keyConcurrency:Number($('genKeyConcurrency').value),submitGapSec:Number($('genSubmitGap').value),dailyLimit:Number($('genDailyLimit').value)};}
 // Protocol-specific fields: ModelScope keys/limits; reference field and format only when the image goes as a URL.
 async function paintKeys(){const source=form(),box=$('genKeyStatus');if(source.protocol!=='modelscope'){box.textContent='';return;}const status=await ImageGen.keyStatus(source);const T=v=>typeof LanguageUI!=='undefined'?LanguageUI.text(v):v;box.textContent=status.length?status.map((item,index)=>T('密钥 '+(index+1)+' / Key '+(index+1))+'：'+T(item.exhausted?'今日额度已用完 / out of quota today':'可用 / available')+' · '+item.used+(source.dailyLimit>0?'/'+source.dailyLimit:'')).join('　'):'';}
 function preview(){const source=form(),preset=ImageGen.REFERENCE[source.protocol]||ImageGen.REFERENCE.openai,urlMode=(source.refMode==='auto'?preset.mode:source.refMode)==='url';
  for(const node of $('genSourcesCard').querySelectorAll('[data-for="modelscope"]'))node.hidden=source.protocol!=='modelscope';for(const node of $('genSourcesCard').querySelectorAll('[data-ref="url"]'))node.hidden=!urlMode;
  $('genRefField').placeholder=preset.field||'image';paintKeys().catch(()=>{});$('genSizePreview').value=ImageGen.sizeFor(source)+(source.protocol==='gemini'?'（Gemini 按比例出图）':'');$('genBaseUrl').placeholder=ImageGen.PROTOCOLS[source.protocol]?.base||'https://api.example.com/v1';$('genQuality').disabled=source.protocol!=='openai';}
 function render(){
  const select=$('genSourceSelect');select.replaceChildren();
  if(!state.genSources.length){state.genSources.push(blank());state.activeGenSourceId=state.genSources[0].id;}
  for(const source of state.genSources)select.add(option(source.id,source.name+' · '+(typeof LanguageUI!=='undefined'?LanguageUI.text(ImageGen.PROTOCOLS[source.protocol]?.label||source.protocol):source.protocol)+(source.enabled===false?' · '+(typeof LanguageUI!=='undefined'?LanguageUI.text('停用 / Disabled'):'停用'):'')+(source.id===state.activeGenSourceId?' · 当前':'')));
  const source=state.genSources.find(item=>item.id===editingId)||state.genSources[0];editingId=source.id;select.value=editingId;
  $('genName').value=source.name;$('genProtocol').value=source.protocol;$('genBaseUrl').value=source.baseUrl||'';$('genApiKey').value=source.apiKey||'';$('genApiKey2').value=source.apiKey2||'';$('genModel').value=source.model||'';
  $('genRefMode').value=source.refMode||'auto';$('genRefField').value=source.refField||'';$('genRefFormat').value=source.refFormat||'string';$('genKeyConcurrency').value=source.keyConcurrency||ImageGen.MODELSCOPE.keyConcurrency;$('genSubmitGap').value=source.submitGapSec??ImageGen.MODELSCOPE.submitGapSec;$('genDailyLimit').value=source.dailyLimit??ImageGen.MODELSCOPE.dailyLimit;
  $('genQuality').value=source.quality||'auto';$('genAspect').value=source.aspect||ImageGen.DEFAULTS.aspect;$('genPixels').value=String(source.pixels||ImageGen.DEFAULTS.pixels);
  $('genPriority').value=source.priority||100;$('genEnabled').checked=source.enabled!==false;$('genRouteMode').value=state.genRouteMode;$('genConcurrency').value=state.genConcurrency;$('genOutputDir').value=state.genOutputDir||'';
  preview();dirty=false;
 }
 async function persist(){await chrome.storage.local.set({genSources:state.genSources,activeGenSourceId:state.activeGenSourceId,genRouteMode:state.genRouteMode,genConcurrency:state.genConcurrency,genOutputDir:state.genOutputDir});}
 async function save(){
  const source=form();
  if(!source.apiKey||!source.model)throw new Error('请填写密钥和模型 / Enter API key and model');
  if(source.protocol==='openai'&&!source.baseUrl)throw new Error('OpenAI 兼容协议需要接口地址 / Base URL required');
  if(!Number.isInteger(source.keyConcurrency)||source.keyConcurrency<1||source.keyConcurrency>10)throw new Error('每个 Key 并发须为 1–10 / Per-key concurrency must be 1–10');
  if(!Number.isInteger(source.dailyLimit)||source.dailyLimit<0)throw new Error('每日限额须为 0 或正整数 / Daily limit must be 0 or a positive integer');
  if(!(source.submitGapSec>=0&&source.submitGapSec<=30))throw new Error('提交间隔须为 0–30 秒 / Submit gap must be 0–30 s');
  if(source.refField&&!/^[A-Za-z_][\w.]{0,40}$/.test(source.refField))throw new Error('参考图字段只能包含字母、数字、下划线 / Reference field: letters, digits, underscore');
  const concurrency=Number($('genConcurrency').value);if(!Number.isInteger(concurrency)||concurrency<1)throw new Error('生图并发须为正整数 / Parallel generations must be a positive integer');
  const dir=$('genOutputDir').value.trim();if(dir&&!/^[a-zA-Z]:[\\/]|^\\\\|^\//.test(dir))throw new Error('输出目录须为绝对路径 / Output folder must be an absolute path');
  state.genSources=state.genSources.map(item=>item.id===editingId?source:item);
  state.genRouteMode=$('genRouteMode').value;state.genConcurrency=concurrency;state.genOutputDir=dir;
  if(!state.genSources.some(item=>item.id===state.activeGenSourceId))state.activeGenSourceId=source.id;
  await persist();render();
  note('已保存：'+source.name+' · '+source.model+' · '+ImageGen.sizeFor(source)+' / Saved');
 }
 // ImgBB reference-image hosting (https://api.imgbb.com/): used when a URL-mode source (e.g. ModelScope) needs a public address.
 function imgbbCard(){
  const box=document.createElement('section');box.id='imgbbSettings';box.className='gen-sources imgbb-settings';
  box.innerHTML='<h3>参考图托管 ImgBB / Reference image hosting (ImgBB)</h3>'+
   '<p class="hint">魔搭等用图片 URL 传参考图的来源需要公网地址。没有网页地址的图片（本地上传、截图）会先上传到 ImgBB，缩到长边 2048 以内，按下方有效期自动删除。API Key 在 api.imgbb.com 获取。 / URL-mode sources such as ModelScope need a public address. Images without one (local uploads, screenshots) are uploaded to ImgBB first, resized to 2048 px or less and deleted after the expiration below. Get an API key at api.imgbb.com.</p>'+
   '<div class="source-grid"><label>ImgBB API Key<input id="imgbbKey" type="password" autocomplete="off"></label>'+
   '<label>有效期（秒，60–15552000） / Expiration (s, 60–15552000)<input id="imgbbExpiration" type="number" min="60" max="15552000" step="60"></label>'+
   '<label>链接方式 / Delivery<select id="imgbbDelivery"><option value="wsrv">经 wsrv.nl 中转（推荐，魔搭已验证） / Via wsrv.nl (recommended, verified with ModelScope)</option><option value="direct">ImgBB 直链 / Direct ImgBB link</option></select></label>'+
   '<label>何时上传 / Upload when<select id="imgbbWhen"><option value="missing">仅在没有网页地址时 / Only without a web address</option><option value="always">始终上传（保证 ≤2048 px） / Always (keeps ≤ 2048 px)</option></select></label></div>'+
   '<p class="hint">隐私：wsrv.nl 会独立缓存图片，可能在 ImgBB 删除后仍保留一段时间且无法手动清除；需要到期即删的图片请选“ImgBB 直链”。 / Privacy: wsrv.nl caches independently and may keep an image after ImgBB deletes it; choose the direct link for images that must disappear on expiry.</p>'+
   '<div class="form-actions"><button id="saveImgbb" type="button">保存图床设置 / Save</button><button id="testImgbb" type="button" class="secondary">测试上传（1 分钟后删除） / Test upload (deleted after 1 min)</button><span id="imgbbStatus" class="hint" role="status"></span></div>';
  return box;
 }
 async function loadImgbb(){const saved=await ImageGen.imgbbSettings();$('imgbbKey').value=saved.key;$('imgbbExpiration').value=saved.expiration;$('imgbbDelivery').value=saved.delivery;$('imgbbWhen').value=saved.when;}
 async function load(){state=structuredClone(await ImageGen.settings());editingId=state.activeGenSourceId||state.genSources[0]?.id;render();}
 async function init(){
  const pane=document.querySelector('[data-settings-pane="sources"]');if(!pane||$('genSourcesCard'))return;
  pane.append(card(),imgbbCard());
  for(const [key,value] of Object.entries(ImageGen.PROTOCOLS))$('genProtocol').add(option(key,value.label));
  for(const value of ImageGen.QUALITIES)$('genQuality').add(option(value,{auto:'自动 / Auto',low:'低 / Low',medium:'中 / Medium',high:'高 / High'}[value]));
  for(const value of ImageGen.ASPECTS)$('genAspect').add(option(value,value));
  for(const value of ImageGen.PIXELS)$('genPixels').add(option(String(value),value+' px'));
  await load();await loadImgbb();
  $('saveImgbb').onclick=async()=>{const expiration=Number($('imgbbExpiration').value);if(!Number.isInteger(expiration)||expiration<60||expiration>15552000){$('imgbbStatus').textContent='有效期须为 60–15552000 秒 / Expiration must be 60–15552000 s';return;}
   await chrome.storage.local.set({imgbbKey:$('imgbbKey').value.trim(),imgbbExpiration:expiration,imgbbDelivery:$('imgbbDelivery').value,imgbbWhen:$('imgbbWhen').value});$('imgbbStatus').textContent='已保存 / Saved';};
  $('testImgbb').onclick=async()=>{const key=$('imgbbKey').value.trim();if(!key){$('imgbbStatus').textContent='请先填写 API Key / Enter the API key first';return;}$('testImgbb').disabled=true;$('imgbbStatus').textContent='正在上传测试图… / Uploading a test image…';
   try{const url=await ImageGen.testImgbb(key);$('imgbbStatus').textContent='上传成功 / Upload OK: '+url;}catch(error){$('imgbbStatus').textContent=error.message;}finally{$('testImgbb').disabled=false;}};
  $('resetGenKeys').onclick=async()=>{await ImageGen.resetKeys();await paintKeys();note('已重置额度标记 / Quota marks reset');};
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.modelscopeKeyState)paintKeys().catch(()=>{});});
  for(const id of ['genName','genProtocol','genBaseUrl','genModel','genApiKey','genApiKey2','genKeyConcurrency','genSubmitGap','genDailyLimit','genRefMode','genRefField','genRefFormat','genQuality','genAspect','genPixels','genPriority','genEnabled','genRouteMode','genConcurrency','genOutputDir'])$(id).addEventListener('input',()=>{dirty=true;preview();note('有未保存的更改 / Unsaved changes');});
  $('genSourceSelect').onchange=()=>{if(dirty&&!confirm('放弃当前未保存的生图来源更改？ / Discard unsaved changes?')){$('genSourceSelect').value=editingId;return;}editingId=$('genSourceSelect').value;render();};
  $('addGenSource').onclick=()=>{const source=blank();source.name='生图来源 '+(state.genSources.length+1);state.genSources.push(source);editingId=source.id;render();dirty=true;note('新来源：填写后保存 / New source: fill in and save');};
  $('deleteGenSource').onclick=async()=>{if(state.genSources.length<=1){note('至少保留一个生图来源 / Keep at least one source');return;}if(!confirm('删除这个生图来源？ / Delete this source?'))return;state.genSources=state.genSources.filter(item=>item.id!==editingId);if(state.activeGenSourceId===editingId)state.activeGenSourceId=state.genSources[0].id;editingId=state.activeGenSourceId;await persist();render();note('已删除 / Deleted');};
  $('activateGenSource').onclick=async()=>{if(dirty){note('请先保存 / Save first');return;}state.activeGenSourceId=editingId;await persist();render();note('已设为当前生图来源 / Active source updated');};
  $('saveGenSource').onclick=async()=>{try{await save();}catch(error){note('保存失败 / Save failed: '+error.message);}};
  $('cancelGenSource').onclick=async()=>{await load();note('更改已取消 / Changes discarded');};
  $('testGenSource').onclick=async()=>{
   const button=$('testGenSource');button.disabled=true;note('正在生成测试图（一次付费请求）… / Generating a test image…');
   try{const result=await ImageGen.generate(form(),{prompt:'A small ceramic teacup on a wooden table, soft window light, minimal still life photo'});
    const figure=$('genTestPreview');figure.querySelector('img').src=result.images[0];figure.querySelector('figcaption').textContent=result.model+' · '+result.size+' · '+Math.round(result.runMs/1000)+'s';figure.hidden=false;note('测试成功，记得保存 / Test passed; remember to save');}
   catch(error){note('测试失败 / Test failed: '+error.message);}finally{button.disabled=false;}
  };
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&!dirty&&['genSources','activeGenSourceId','genRouteMode','genConcurrency','genOutputDir'].some(key=>changes[key]))load();});
  // Interface page: page mini-button switches, saved immediately.
  const controls=document.getElementById('interfaceControls');
  if(controls&&!$('imageButtonReverseGen')){
   // each page mini-button on its own: 提示词 is on unless turned off, 生图 and 图生图 are off unless turned on
   const SWITCHES=[['imageButtonPrompt','在网页图片上显示「提示词」小框 / Show "Prompt" button on page images',true],['imageButtonReverseGen','在网页图片上显示「生图」小框（先反推再文生图）/ Show "Generate" button on page images',false],['imageButtonImageToImage','在网页图片上显示「图生图」小框 / Show "Image to image" button on page images',false]];
   for(const [id,text] of SWITCHES){
    const label=document.createElement('label');label.className='checkbox-setting';label.innerHTML='<input type="checkbox" id="'+id+'"> '+text;controls.append(label);
   }
   // sites where no mini-button appears (one domain per line, subdomains included); hoverprompt.com by default
   const sites=document.createElement('label');sites.className='blocked-sites';sites.innerHTML='不显示小框的网站（每行一个域名，含子域名）/ Sites without page buttons (one domain per line, subdomains included)<textarea id="imageButtonBlockedSites" rows="4" spellcheck="false" placeholder="hoverprompt.com"></textarea><small class="hint" id="blockedSitesNote"></small>';controls.append(sites);
   const saved=await chrome.storage.local.get([...SWITCHES.map(([id])=>id),'imageButtonBlockedSites']);
   for(const [id,,on] of SWITCHES){$(id).checked=on?saved[id]!==false:saved[id]===true;$(id).onchange=()=>chrome.storage.local.set({[id]:$(id).checked});}
   const area=$('imageButtonBlockedSites'),current=saved.imageButtonBlockedSites===undefined?ImagePromptButtonsDefaults():saved.imageButtonBlockedSites;area.value=(Array.isArray(current)?current:[]).join('\n');
   area.onchange=async()=>{const list=domainsOf(area.value);await chrome.storage.local.set({imageButtonBlockedSites:list});area.value=list.join('\n');$('blockedSitesNote').textContent=LanguageUI.text('已保存 / Saved');};
  }
  if(controls&&!$('shortcutSettings'))await shortcutEditor(controls);
  function ImagePromptButtonsDefaults(){return ['hoverprompt.com'];}
  // same rules as the page buttons (image-buttons.js): host names only, no scheme, path or "www."
  function domainsOf(value){return [...new Set(String(value||'').split(/[\s,;]+/).map(d=>d.trim().toLowerCase().replace(/^[a-z]+:\/\//,'').replace(/[\/?#:].*$/,'').replace(/^\*\.|^www\./,'').replace(/\.$/,'')).filter(d=>/^[a-z0-9.-]+\.[a-z0-9-]+$|^localhost$|^\d+\.\d+\.\d+\.\d+$/.test(d)))].slice(0,200);}
 }
 // Shortcut editor: click a key box, press a single key (Esc cancels, Backspace clears); duplicates are refused.
 async function shortcutEditor(controls){
  const S=globalThis.ImagePromptShortcuts;if(!S)return;
  const box=document.createElement('section');box.id='shortcutSettings';box.className='shortcut-settings';
  box.innerHTML='<h3>快捷键 / Keyboard shortcuts</h3><label class="checkbox-setting"><input type="checkbox" id="shortcutsEnabled"> 启用单键快捷键（鼠标悬停在网页图片、悬浮窗图片或资料库卡片上时生效；输入文字或按住 Ctrl/Alt 时不触发）/ Enable single-key shortcuts on the hovered image or card</label><div class="shortcut-rows"></div><div class="form-actions"><button type="button" id="resetShortcuts" class="secondary">恢复默认 / Reset defaults</button><span id="shortcutSaveStatus" class="hint" role="status"></span></div>';
  controls.append(box);
  const saved=await chrome.storage.local.get(['shortcuts','shortcutsEnabled']);let keys={...S.DEFAULTS,...(saved.shortcuts||{})};
  $('shortcutsEnabled').checked=saved.shortcutsEnabled!==false;$('shortcutsEnabled').onchange=()=>chrome.storage.local.set({shortcutsEnabled:$('shortcutsEnabled').checked});
  const label=key=>key?(key.length===1?key.toUpperCase():key):'—';
  const rows=box.querySelector('.shortcut-rows');
  function render(){rows.replaceChildren();for(const [action,text] of S.ACTIONS){const row=document.createElement('div');row.className='shortcut-row';const name=document.createElement('span');name.textContent=text;const key=document.createElement('button');key.type='button';key.className='shortcut-key';key.dataset.action=action;key.textContent=label(keys[action]);key.onclick=()=>capture(key,action);row.append(name,key);rows.append(row);}}
  async function persist(message){await chrome.storage.local.set({shortcuts:keys});render();$('shortcutSaveStatus').textContent=message;}
  function capture(button,action){
   button.textContent='按下新按键… / Press a key…';button.classList.add('capturing');
   const handler=async event=>{
    event.preventDefault();event.stopPropagation();document.removeEventListener('keydown',handler,true);button.classList.remove('capturing');
    if(event.key==='Escape'){render();return;}
    if(event.key==='Backspace'||event.key==='Delete'){keys[action]='';await persist('已清空该快捷键 / Shortcut cleared');return;}
    const key=S.normalize(event.key);
    if(!(key.length===1&&/\S/.test(key))&&!/^F([1-9]|1[0-2])$/.test(key)){render();$('shortcutSaveStatus').textContent='请使用单个字母、数字、符号或 F1–F12 / Use one letter, digit, symbol or F1–F12';return;}
    const clash=Object.keys(keys).find(other=>other!==action&&keys[other]===key);
    if(clash){render();$('shortcutSaveStatus').textContent='按键 '+label(key)+' 已被占用，请先修改冲突项 / Key already in use';return;}
    keys[action]=key;await persist('已保存：'+label(key)+' / Saved');
   };
   document.addEventListener('keydown',handler,true);
  }
  $('resetShortcuts').onclick=async()=>{keys={...S.DEFAULTS};await persist('已恢复默认：C 复制 · E 展开 · R 反推 · G 生图 · I 图生图 / Defaults restored');};
  render();
 }
 return {init};
})();
