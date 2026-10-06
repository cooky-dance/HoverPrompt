const LanguageUI=(()=>{
  let state={uiLanguage:'en',historyDisplayMode:'default',historyLanguages:['zh-CN','en'],promptLanguages:[{code:'en',name:'English',enabled:true},{code:'zh-CN',name:'简体中文',enabled:true},{code:'ru',name:'Русский',enabled:false},{code:'ja',name:'日本語',enabled:false},{code:'ko',name:'한국어',enabled:false},{code:'ar',name:'العربية',enabled:false}]};
  let lastTask=null,committed=null,dirty=false,conflict=false,captured=false;const originals=new WeakMap(),translated=new WeakMap(),attributeOriginals=new WeakMap(),staticNodes=new WeakSet();
  const $=id=>document.getElementById(id);
  function normalize(list){const seen=new Set();return (Array.isArray(list)?list:state.promptLanguages).slice(0,12).filter(x=>{if(!/^[a-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(x.code||'')||!String(x.name||'').trim()||seen.has(x.code))return false;seen.add(x.code);return true;}).map(x=>({code:x.code,name:String(x.name).slice(0,60),enabled:x.enabled!==false}));}
  const selectedFrom=config=>{const list=config.promptLanguages.filter(x=>x.enabled).map(({code,name})=>({code,name}));for(const line of String(config.promptLanguageRequest||'').split('\n')){const match=/^\s*([a-z]{2,8}(?:-[A-Za-z0-9]{2,8})*)\s*:\s*(.{1,60})\s*$/.exec(line);if(match&&!list.some(x=>x.code===match[1]))list.push({code:match[1],name:match[2].trim()});}return list;};
  const selected=()=>selectedFrom(committed||state);
  const dictionary={'分析结果':'Analysis result','历史':'History','复制':'Copy','尚未配置':'Not configured','接口设置':'API settings','视觉候选·名称推测':'Vision candidate by name','选择模型':'Select model','完成':'Done','失败':'Failed','等待发送':'Queued','运行中':'Running','新来源':'New source','默认来源':'Default source','未命名来源':'Unnamed source','备用路由仅在网络错误、超时、404、429、5xx 时切换，图片会发往下一个启用的来源。401/403、参数错误不会切换。每个来源指定一个模型；优先级模式从数字最小的来源开始。':'Failover uses the next enabled source on network errors, timeouts, 404, 429 or 5xx. Authentication and parameter errors stop the request. Each source has one selected model.','OpenAI / Anthropic 通常填写带 /v1 的基础地址；Gemini 原生填写 https://generativelanguage.googleapis.com/v1beta。中转站按其文档填写。密钥只保存在本浏览器。':'Use the provider base URL, usually ending in /v1 for OpenAI or Anthropic. Native Gemini uses https://generativelanguage.googleapis.com/v1beta. API keys stay in this browser.','模型列表（优先读取接口模态元数据，其次名称推测）':'Model list: metadata first, then name-based candidates','测试所选模型视觉能力（一次付费请求）':'Test selected vision model (one billed request)'};
  function text(value){if(globalThis.InterfaceLocale && !['en','zh-CN','bilingual'].includes(state.uiLanguage)){const key=String(value).trim();return InterfaceLocale.translate(dictionary[key]?String(value).replace(key,dictionary[key]):value,state.uiLanguage);}if(state.uiLanguage==='bilingual')return value;if(dictionary[String(value).trim()])return state.uiLanguage==='en'?dictionary[String(value).trim()]:value;const parts=splitBilingual(value);if(parts.length>1)return state.uiLanguage==='en'?parts.slice(1).join(' / '):parts[0];if(state.uiLanguage==='en'){const swapped=String(value).replace(/完成|失败|等待发送|运行中/g,k=>dictionary[k]);return /[\u4e00-\u9fff]/.test(swapped)?value:swapped;}return value;}
  // Only user content stays untranslated (prompts, names typed by the user); every UI string shows one language.
  const KEEP='textarea,script,style,#promptVersions,#languageRows,#sourceSelect,.history-prompt-text,.history-summary,#historyLanguageRows,.prompt-language-name,#profileSelect,#genSourceSelect,#profileFileList,#profilePreview,#imageLightbox figcaption,.gen-profile-pick';
  function translateText(node){
    const p=node.parentElement;if(!p||p.closest(KEEP))return;
    if(!originals.has(node)||node.textContent!==translated.get(node))originals.set(node,node.textContent);const original=originals.get(node),parts=splitBilingual(original);
    const next=parts.length>1?text(original):dictionary[original.trim()]&&state.uiLanguage==='en'?original.replace(original.trim(),dictionary[original.trim()]):text(original);
    translated.set(node,next);if(node.textContent!==next)node.textContent=next;
  }
  function translateAttributes(element){
    if(element.closest('#promptVersions,#languageRows,.history-prompt-text,.prompt-language-name'))return;
    let values=attributeOriginals.get(element);if(!values){values={};attributeOriginals.set(element,values);}
    for(const name of ['placeholder','title','aria-label']){if(!element.hasAttribute(name))continue;const current=element.getAttribute(name),saved=values[name];if(!saved||current!==saved.translated)values[name]={original:current};const entry=values[name],next=text(entry.original);entry.translated=next;if(current!==next)element.setAttribute(name,next);}
  }
  function translateRoot(root){
    if(root.nodeType===Node.TEXT_NODE){translateText(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())translateText(node);
    if(root.matches('[placeholder],[title],[aria-label]'))translateAttributes(root);
    for(const element of root.querySelectorAll('[placeholder],[title],[aria-label]'))translateAttributes(element);
  }
  // Newly created UI (cards, statuses, dialogs, settings panels) is translated as it appears.
  let pending=new Set(),scheduled=false;
  const observer=new MutationObserver(records=>{
    for(const record of records){if(record.type==='characterData')pending.add(record.target);else if(record.type==='attributes')pending.add(record.target);else for(const node of record.addedNodes)pending.add(node);}
    if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;const batch=pending;pending=new Set();for(const node of batch)if(node.isConnected)translateRoot(node);});}
  });
  function translate(){
    translateRoot(document.body);
    if(!captured)observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
    document.documentElement.lang=state.uiLanguage==='bilingual'?'en':state.uiLanguage;document.documentElement.dir=state.uiLanguage==='ar'?'rtl':'ltr';
    captured=true;
    // Parts drawn with LanguageUI.text() (credits badge, profile card, credits window) redraw in the new language.
    document.dispatchEvent(new CustomEvent('imageprompt-language',{detail:{language:state.uiLanguage}}));
  }
  function versions(task){
    const saved=Object.fromEntries(Object.entries(task.prompts||{}).filter(([,value])=>typeof value==='string'&&value.trim()));
    const prompts=Object.keys(saved).length?saved:{'zh-CN':task.zh,en:task.en};
    const languages=configured();
    const known=new Set(languages.map(language=>language.code));
    for(const code of Object.keys(prompts))if(!known.has(code))languages.push({code,name:code});
    return languages.filter(language=>typeof prompts[language.code]==='string'&&prompts[language.code].trim()).map(language=>({...language,prompt:prompts[language.code]}));
  }
  function configured(){const list=(committed||state).promptLanguages.map(({code,name})=>({code,name}));for(const language of selected())if(!list.some(item=>item.code===language.code))list.push(language);return list;}
  const preferred=task=>versions(task)[0]||null;
  function historyVersions(task){const list=versions(task),settings=committed||state;return settings.historyDisplayMode==='all'?list:settings.historyDisplayMode==='selected'?list.filter(language=>settings.historyLanguages.includes(language.code)):list.slice(0,1);}
  function notify(){if(lastTask)show(lastTask);document.dispatchEvent(new CustomEvent('prompt-presentation-changed'));}
  async function save(){
    const normalized=normalize(state.promptLanguages);
    const count=selectedFrom({...state,promptLanguages:normalized}).length;
    if(!count||count>12)throw new Error('请选择 1–12 种生成语言 / Select 1–12 prompt languages');
    state.promptLanguages=normalized;dirty=true;$('languageSaveStatus').textContent=text('有未保存的更改 / Unsaved changes');rows();
  }
  async function commit(){
    if(conflict)throw new Error('设置已在其他窗口改变，请取消并重新载入 / Settings changed elsewhere; discard and reload');
    if(!dirty)return;
    $('languageSaveStatus').textContent=text('保存中 / Saving');
    const next={promptLanguages:normalize(state.promptLanguages),historyDisplayMode:state.historyDisplayMode,historyLanguages:state.historyLanguages,promptLanguageRequest:''};
    dirty=false;try{await chrome.storage.local.set(next);}catch(error){dirty=true;$('languageSaveStatus').textContent=error.message;throw error;}
    committed=structuredClone({...state,...next});state.promptLanguageRequest='';notify();$('languageSaveStatus').textContent=text('已保存 / Saved');
  }
  async function reorder(code,position){
    const index=state.promptLanguages.findIndex(language=>language.code===code);
    if(index<0||position<0||position>=state.promptLanguages.length)return;
    const [language]=state.promptLanguages.splice(index,1);state.promptLanguages.splice(position,0,language);await save();
  }
  function rows(){
    $('languageRows').replaceChildren();
    for(const [index,language] of state.promptLanguages.entries()){
      const row=document.createElement('div');row.className='language-row';row.dataset.code=language.code;
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=language.enabled;checkbox.setAttribute('aria-label',text('生成此语言 / Generate this language'));
      checkbox.onchange=async()=>{language.enabled=checkbox.checked;try{await save();}catch(error){language.enabled=!checkbox.checked;rows();$('status').textContent=text(error.message);}};
      const label=document.createElement('span');label.className='prompt-language-name';label.textContent=(index+1)+'. '+language.name+' · '+language.code;
      const actions=document.createElement('div');actions.className='language-order-actions';
      const up=document.createElement('button');up.textContent='↑';up.disabled=index===0;up.title=text('上移 / Move up');up.onclick=()=>reorder(language.code,index-1);
      const down=document.createElement('button');down.textContent='↓';down.disabled=index===state.promptLanguages.length-1;down.title=text('下移 / Move down');down.onclick=()=>reorder(language.code,index+1);
      const first=document.createElement('button');first.className='language-default';first.textContent=text(index===0?'默认 / Default':'设为默认 / Make default');first.disabled=index===0;first.onclick=()=>reorder(language.code,0);
      const remove=document.createElement('button');remove.textContent='×';remove.title=text('删除语言 / Remove language');remove.onclick=async()=>{const before=[...state.promptLanguages];state.promptLanguages=state.promptLanguages.filter(item=>item!==language);try{await save();}catch(error){state.promptLanguages=before;rows();$('status').textContent=text(error.message);}};
      actions.append(up,down,first,remove);row.append(checkbox,label,actions);$('languageRows').append(row);
    }
    $('historyDisplayMode').value=state.historyDisplayMode;$('historyLanguageRows').hidden=state.historyDisplayMode!=='selected';$('historyLanguageRows').replaceChildren();
    for(const language of state.promptLanguages){
      const label=document.createElement('label');label.className='checkbox-setting';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=language.code;checkbox.checked=state.historyLanguages.includes(language.code);
      checkbox.onchange=async()=>{state.historyLanguages=checkbox.checked?[...new Set([...state.historyLanguages,language.code])]:state.historyLanguages.filter(code=>code!==language.code);await save();};
      label.append(checkbox,document.createTextNode(language.name+' · '+language.code));$('historyLanguageRows').append(label);
    }
  }
  function show(task){
    lastTask=task;const root=$('promptVersions');if(!root)return;root.replaceChildren();
    for(const language of versions(task)){
      const button=document.createElement('button');button.textContent=language.name;button.dataset.language=language.code;
      button.onclick=()=>{root.querySelectorAll('button').forEach(item=>item.classList.remove('active'));button.classList.add('active');$('promptVersionText').value=language.prompt;};root.append(button);
    }
    root.firstElementChild?.click();if(!root.children.length)$('promptVersionText').value='';$('dynamicPrompt').hidden=!root.children.length;
    $('zhGroup').hidden=true;$('enGroup').hidden=true;document.querySelector('#result .language-tabs').hidden=true;$('copyCurrent').hidden=true;
  }
  async function init(){
    const saved=await chrome.storage.local.get(['uiLanguage','promptLanguages','historyDisplayMode','historyLanguages','promptLanguageRequest']);state={...state,...saved};state.promptLanguages=normalize(state.promptLanguages);
    for(const language of selectedFrom(state))if(!state.promptLanguages.some(item=>item.code===language.code)&&state.promptLanguages.length<12)state.promptLanguages.push({...language,enabled:true});
    state.historyDisplayMode=['default','all','selected'].includes(state.historyDisplayMode)?state.historyDisplayMode:'default';state.historyLanguages=Array.isArray(state.historyLanguages)?state.historyLanguages.filter(code=>typeof code==='string'):['zh-CN','en'];
    committed=structuredClone({...state,promptLanguages:normalize(saved.promptLanguages||state.promptLanguages)});if(state.promptLanguageRequest)save().catch(()=>{});
    $('uiLanguage').value=state.uiLanguage;
    // interface sounds (sounds.js): on unless turned off
    if($('uiSounds')){const sv=await chrome.storage.local.get(['uiSounds']);$('uiSounds').checked=sv.uiSounds!==false;$('uiSounds').onchange=()=>globalThis.HPSound?.set($('uiSounds').checked);}
    $('uiLanguage').onchange=async()=>{state.uiLanguage=$('uiLanguage').value;committed.uiLanguage=state.uiLanguage;await chrome.storage.local.set({uiLanguage:state.uiLanguage});translate();notify();};
    $('historyDisplayMode').onchange=async()=>{state.historyDisplayMode=$('historyDisplayMode').value;await save();};
    $('saveLanguages').onclick=()=>commit().catch(error=>$('languageSaveStatus').textContent=error.message);
    $('cancelLanguages').onclick=async()=>{if(conflict){const latest=await chrome.storage.local.get(['promptLanguages','historyDisplayMode','historyLanguages','promptLanguageRequest']);state={...state,...latest};state.promptLanguages=normalize(state.promptLanguages);committed=structuredClone(state);}else state={...state,promptLanguages:structuredClone(committed.promptLanguages),historyDisplayMode:committed.historyDisplayMode,historyLanguages:[...committed.historyLanguages],promptLanguageRequest:committed.promptLanguageRequest};dirty=false;conflict=false;rows();$('languageSaveStatus').textContent=text('更改已取消 / Changes discarded');};
    $('addLanguage').onclick=async()=>{const code=$('languageCode').value.trim(),name=$('languageName').value.trim();if(!/^[a-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(code)||!name||state.promptLanguages.some(language=>language.code===code)||state.promptLanguages.length>=12)return $('languageSaveStatus').textContent=text('语言代码无效、重复或超过 12 种 / Invalid, duplicate or too many languages');state.promptLanguages.push({code,name,enabled:selectedFrom(state).length<6});await save();$('languageCode').value='';$('languageName').value='';};
    $('copyVersion').onclick=()=>CopyUI.copy($('promptVersionText').value);
    chrome.storage.onChanged?.addListener((changes,area)=>{
      if(area!=='local')return;const before=JSON.stringify(state);if(dirty&&['promptLanguages','historyDisplayMode','historyLanguages','promptLanguageRequest'].some(key=>changes[key])){conflict=true;$('languageSaveStatus').textContent=text('设置已在其他窗口变化，请取消并重新载入 / Settings changed elsewhere; discard and reload');return;}for(const key of ['uiLanguage','promptLanguages','historyDisplayMode','historyLanguages','promptLanguageRequest'])if(changes[key]&&changes[key].newValue!==undefined)state[key]=changes[key].newValue;
      state.promptLanguages=normalize(state.promptLanguages);state.historyLanguages=Array.isArray(state.historyLanguages)?state.historyLanguages:[];state.historyDisplayMode=['default','all','selected'].includes(state.historyDisplayMode)?state.historyDisplayMode:'default';
      committed=structuredClone(state);if(before!==JSON.stringify(state)){rows();$('uiLanguage').value=state.uiLanguage;translate();notify();}
    });
    rows();translate();
  }
  return {init,selected,configured,show,translate,text,versions,preferred,historyVersions};

})();
document.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('[data-settings-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('[data-settings-pane]').forEach(p=>p.hidden=p.dataset.settingsPane!==button.dataset.settingsTab);
});
