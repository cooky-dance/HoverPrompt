const SourceUI = (() => {
  let state, editingId, draftModels=[],dirty=false,externalChange=false;
  const el=id=>document.getElementById(id);
  const notice=message=>{el('sourceStatus').textContent=message;};
  const blank=()=>({id:crypto.randomUUID(),name:'新来源',protocol:'chat',baseUrl:'',apiKey:'',model:'',priority:100,timeoutSeconds:0,enabled:true,models:[]});
  const OLLAMA_URL='http://127.0.0.1:11434';
  async function getSettings() {
    const saved=await chrome.storage.local.get(['sources','activeSourceId','routeMode','baseUrl','apiKey','model','requestControl']);
    if(!Array.isArray(saved.sources)||!saved.sources.length) {
      const source={...blank(),name:'默认来源',baseUrl:saved.baseUrl || '',apiKey:saved.apiKey || '',model:saved.model || ''};
      saved.sources=[source];saved.activeSourceId=source.id;saved.routeMode='single';
      await chrome.storage.local.set({sources:saved.sources,activeSourceId:source.id,routeMode:'single'});
    }
    return saved;
  }
  function form() {
    const protocol=el('protocol').value;
    return {id:editingId,name:el('sourceName').value.trim() || '未命名来源',protocol,baseUrl:el('baseUrl').value.trim()||(protocol==='ollama'?OLLAMA_URL:''),apiKey:protocol==='ollama'?'':el('apiKey').value.trim(),model:el('model').value.trim(),priority:Number(el('priority').value),timeoutSeconds:Number(el('sourceTimeout')?.value)||0,enabled:el('sourceEnabled').checked,models:draftModels};
  }
  function renderModels() {
    const select=el('modelList');select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='选择模型 / Select model';select.append(placeholder);
    const onlyVision=el('onlyVision').checked;
    for(const model of draftModels.filter(m=>!onlyVision || m.vision===true)) {
      const option=document.createElement('option');option.value=model.id;
      const label=model.confidence==='tested'?'视觉测试通过':model.confidence==='metadata'?(model.vision?'视觉·元数据':'非视觉·元数据'):model.vision===true?'视觉候选·名称推测':model.vision===false?'非视觉候选':'能力未知';
      option.textContent=model.id+' — '+label;select.append(option);
    }
    select.value=el('model').value;
  }
  function markDirty(){dirty=true;notice('有未保存的更改 / Unsaved changes');}
  // Ollama: no key field; the local address is suggested.
  let helpText=null;
  function protocolFields(){const local=el('protocol').value==='ollama';const key=el('apiKey').closest('label');if(key)key.hidden=local;el('baseUrl').placeholder=local?OLLAMA_URL:'https://example.com/v1';el('model').placeholder=local?'llava:13b · qwen2.5vl:7b · gemma3:12b':'gpt-4o-mini';
    const help=el('baseUrlHelp');if(help){helpText??=help.textContent;help.textContent=local?(typeof LanguageUI!=='undefined'?LanguageUI.text('本机 Ollama 地址，默认 http://127.0.0.1:11434；模型需支持图片输入（如 llava、qwen2.5vl、gemma3）。 / Local Ollama address, default http://127.0.0.1:11434; use a model with image input (llava, qwen2.5vl, gemma3).'):''):helpText;}}
  function render() {
    const select=el('sourceSelect');select.replaceChildren();
    for(const source of state.sources){const option=document.createElement('option');option.value=source.id;option.textContent=source.name+' · '+source.protocol+(source.enabled===false?' · 停用':'')+(source.id===state.activeSourceId?' · 当前':'');select.append(option);}
    select.value=editingId;
    const source=state.sources.find(s=>s.id===editingId) || state.sources[0];
    editingId=source.id;draftModels=source.models || [];
    el('sourceName').value=source.name;el('protocol').value=source.protocol || 'chat';el('baseUrl').value=source.baseUrl;el('apiKey').value=source.apiKey;el('model').value=source.model;
    el('priority').value=source.priority || 100;if(el('sourceTimeout'))el('sourceTimeout').value=source.timeoutSeconds||'';el('sourceEnabled').checked=source.enabled!==false;el('routeMode').value=state.routeMode || 'single';renderModels();protocolFields();dirty=false;
  }
  async function persist() {
    const active=state.sources.find(s=>s.id===state.activeSourceId) || state.sources[0];
    await chrome.storage.local.set({sources:state.sources,activeSourceId:state.activeSourceId,routeMode:state.routeMode,baseUrl:active.baseUrl,apiKey:active.apiKey,model:active.model});
  }
  async function save() {
    if(externalChange)throw new Error('配置已在其他窗口改变，请取消并重新载入 / Settings changed elsewhere; discard and reload');
    const source=form();PromptAPI.baseUrl(source);if(!source.apiKey&&!PromptAPI.keyless(source))throw new Error('请填写 API Key');
    if(!Number.isInteger(source.timeoutSeconds)||source.timeoutSeconds<0||source.timeoutSeconds>600)throw new Error('超时须为 0–600 秒 / Timeout must be 0–600 seconds');
    if(!source.model)throw new Error('请选择模型 / Select a model');
    if(!Number.isInteger(source.priority)||source.priority<1||source.priority>9999)throw new Error('优先级须为 1–9999 / Priority must be 1–9999');
    if(source.id===state.activeSourceId&&!source.enabled)throw new Error('请先启用另一个来源，再停用当前来源 / Activate another source before disabling this one');
    state.sources=state.sources.map(s=>s.id===editingId?source:s);state.routeMode=el('routeMode').value;
    dirty=false;try{await persist();}catch(error){dirty=true;throw error;}render();notice('来源已保存 / Source saved');return source;
  }
  async function resolveDraft(){
    if(!dirty)return true;
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='source-draft-dialog';
      const title=document.createElement('h3');title.textContent='未保存的来源更改 / Unsaved source changes';
      const message=document.createElement('p');message.textContent='切换来源前，请保存或放弃当前编辑。 / Save or discard this source before switching.';
      const actions=document.createElement('div');actions.className='setting-actions';
      const finish=value=>{dialog.close();dialog.remove();resolve(value);};
      for(const [label,action] of [['保存 / Save','save'],['放弃 / Discard','discard'],['留在当前页 / Stay','stay']]){
        const button=document.createElement('button');button.type='button';button.textContent=label;
        if(action!=='save')button.className='secondary';
        button.onclick=async()=>{if(action==='save'){try{await save();finish(true);}catch(error){notice(error.message);}}else finish(action==='discard');};
        actions.append(button);
      }
      dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.append(title,message,actions);document.body.append(dialog);dialog.showModal();
    });
  }
  async function init() {
    state=structuredClone(await getSettings());editingId=state.activeSourceId || state.sources[0].id;render();
    for(const id of ['sourceName','protocol','baseUrl','model','apiKey','priority','routeMode','sourceEnabled','sourceTimeout'])el(id)?.addEventListener('input',markDirty);
    el('protocol').addEventListener('change',protocolFields);
    el('sourceSelect').onchange=async()=>{const next=el('sourceSelect').value;if(!await resolveDraft()){el('sourceSelect').value=editingId;return;}editingId=next;render();notice('正在编辑来源 / Editing source');};
    el('addSource').onclick=async()=>{if(!await resolveDraft())return;const source=blank();source.name='来源 '+(state.sources.length+1);state.sources.push(source);editingId=source.id;render();markDirty();};
    el('deleteSource').onclick=async()=>{if(state.sources.length===1){notice('至少保留一个来源');return;}if(editingId===state.activeSourceId){notice('请先启用另一个来源，再删除当前来源 / Activate another source before deleting this one');return;}if(!await resolveDraft())return;if(!confirm('删除当前 API 来源配置？历史图片和提示词会保留。'))return;state.sources=state.sources.filter(s=>s.id!==editingId);editingId=state.activeSourceId;await persist();render();notice('来源已删除');};
    el('cancelSource').onclick=async()=>{if(externalChange){state=structuredClone(await getSettings());externalChange=false;}else state.sources=state.sources.filter(source=>source.id!==editingId||source.baseUrl||source.apiKey||source.model);editingId=state.sources.some(source=>source.id===editingId)?editingId:state.activeSourceId;render();notice('更改已取消 / Changes discarded');};
    el('activateSource').onclick=async()=>{if(dirty){notice('请先保存来源 / Save the source first');return;}const source=state.sources.find(s=>s.id===editingId);if(!source?.enabled||!source.baseUrl||!source.apiKey||!source.model){notice('请先配置并启用来源 / Configure and enable source');return;}state.activeSourceId=editingId;await persist();render();notice('已设为当前来源 / Active source updated');};
    chrome.storage.onChanged?.addListener((changes,area)=>{if(area!=='local'||!['sources','activeSourceId','routeMode'].some(key=>changes[key]))return;if(dirty){externalChange=true;notice('配置已在其他窗口变化；保存前请取消并重新载入 / Settings changed elsewhere; discard and reload before saving');return;}getSettings().then(saved=>{state=structuredClone(saved);editingId=state.sources.some(s=>s.id===editingId)?editingId:state.activeSourceId;render();});});
    el('onlyVision').onchange=renderModels;
    el('modelList').onchange=()=>{if(el('modelList').value){el('model').value=el('modelList').value;markDirty();}};
    el('fetchModels').onclick=async()=>{
      el('fetchModels').disabled=true;notice('正在读取模型列表…');
      try { const source=form();if(!source.apiKey&&!PromptAPI.keyless(source))throw new Error('请填写 API Key');draftModels=await PromptAPI.listModels(source);renderModels();notice(`读取 ${draftModels.length} 个模型，其中 ${draftModels.filter(m=>m.vision===true).length} 个视觉候选。选择后保存；名称推测不等于实测。`); }
      catch(error){notice(error.message+'；可手动填写模型名');}finally{el('fetchModels').disabled=false;}
    };
    el('testVision').onclick=async()=>{
      el('testVision').disabled=true;notice('正在测试所选模型的图片理解能力（一次 API 请求）…');
      try{
        const source=form();if(!source.model || (!source.apiKey&&!PromptAPI.keyless(source)))throw new Error('请填写模型和密钥');
        const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,32,32);
        const answer=await PromptAPI.request(source,canvas.toDataURL('image/png'),'','Identify the dominant color of the provided image. Reply with one English color word only.','What is the dominant color?');
        if(typeof answer!=='string' || !/\bred\b|红/i.test(answer))throw new Error('返回结果未通过颜色测试；无法确认视觉能力');
        draftModels=draftModels.filter(m=>m.id!==source.model);draftModels.push({id:source.model,vision:true,confidence:'tested',reason:'图片颜色测试通过'});renderModels();markDirty();notice('视觉测试通过，点击保存来源保留标记');
      }catch(error){notice(error.message);}finally{el('testVision').disabled=false;}
    };
  }
  return {init,save,getSettings};
})();
