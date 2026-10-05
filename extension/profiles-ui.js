/* Settings UI for prompt profiles (generation page): kind tabs, multiple saved profiles per kind, system prompt,
   attached md/skill files, aspect override, and a preview of exactly what is sent. */
globalThis.PromptProfilesUI=(()=>{
 const $=id=>document.getElementById(id),T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):value;
 let state=null,kind='i2i',editingId=null,dirty=false;
 const note=text=>{$('profileSaveStatus').textContent=text;};
 function card(){
  const section=document.createElement('section');section.id='promptProfilesCard';section.className='prompt-profiles';
  section.innerHTML='<h3>提示词配置 / Prompt profiles</h3><p class="hint">为反推、图生图、文生图分别保存多套“系统提示词 + md/skill 文件”，当前配置会随请求一起提交。 / Save several “system prompt + md/skill files” sets per task; the active one is sent with each request.</p>'+
   '<div class="segmented profile-kinds" role="tablist">'+Object.entries(PromptProfiles.KINDS).map(([key,label])=>'<button type="button" role="tab" data-kind="'+key+'">'+label+'</button>').join('')+'</div>'+
   '<div class="source-header"><label>配置 / Profile<select id="profileSelect"></select></label><button id="addProfile" type="button">新建 / New</button><button id="copyProfile" type="button">复制 / Duplicate</button><button id="deleteProfile" type="button" class="danger">删除 / Delete</button><button id="activateProfile" type="button">设为当前 / Make active</button></div>'+
   '<div class="source-grid"><label>名称 / Name<input id="profileName" type="text"></label>'+
   '<label data-for="gen">比例 / Aspect<select id="profileAspect"><option value="">跟随生图来源 / Source default</option></select></label>'+
   '<label data-for="i2i" class="checkbox-setting"><input id="profileIncludeReverse" type="checkbox"> 同时附加反推提示词 / Also append the reverse prompt</label>'+
   '<label class="wide">系统提示词 / System prompt<textarea id="profileSystem" rows="9" spellcheck="false"></textarea></label></div>'+
   '<div class="profile-files"><div class="profile-files-head"><strong>附加文件 / Attached files</strong><button id="importProfileFiles" type="button" class="secondary">导入 md、skill 文件 / Import</button><input id="profileFileInput" type="file" accept=".md,.markdown,.txt,.skill,.json,.yaml,.yml" multiple hidden></div><ul id="profileFileList"></ul></div>'+
   '<details class="profile-preview"><summary>预览实际提交内容 / Preview what is sent</summary><pre id="profilePreview"></pre></details>'+
   '<div class="form-actions"><button id="saveProfile" type="button">保存配置 / Save</button><button id="cancelProfile" type="button" class="secondary">取消更改 / Discard</button><span id="profileSaveStatus" class="hint" role="status"></span></div>';
  return section;
 }
 const editing=()=>state.profiles.find(p=>p.id===editingId);
 function placeholder(){return kind==='reverse'?'留空 = 内置反推指令。自定义内容会替换分析指令，JSON 输出格式要求始终自动追加。 / Empty = built-in instruction; the JSON output contract is always appended.':kind==='i2i'?'图生图的生成指令（发送给生图模型，原图作为参考图）。 / Instruction for image-to-image; the original is sent as reference.':'追加在反推提示词后面的风格或约束，留空则直接使用反推提示词。 / Appended to the reverse prompt; empty = use it as is.';}
 function readForm(){const p=editing();if(!p)return;p.name=$('profileName').value.trim()||'未命名配置';p.systemPrompt=$('profileSystem').value;if(kind!=='reverse')p.aspect=$('profileAspect').value;if(kind==='i2i')p.includeReverse=$('profileIncludeReverse').checked;}
 function preview(){
  const p=editing();if(!p)return;
  const body=PromptProfiles.compose(p);
  $('profilePreview').textContent=kind==='reverse'?(body||'（内置反推指令 / built-in instruction）')+'\n\n+ JSON 输出格式要求（自动）/ JSON output contract (automatic)':
   kind==='i2i'?(body||'（未填写 / empty）')+(p.includeReverse?'\n\n+ 反推提示词 / reverse prompt':'')+'\n\n+ 参考图：原图 / reference image: original'+(p.aspect?'\n比例 / aspect: '+p.aspect:''):
   '反推提示词 / reverse prompt'+(body?'\n\n'+body:'')+(p.aspect?'\n比例 / aspect: '+p.aspect:'');
 }
 function renderFiles(){
  const p=editing(),list=$('profileFileList');list.replaceChildren();
  if(!p?.files?.length){const li=document.createElement('li');li.className='hint';li.textContent=T('暂无附加文件 / No files');list.append(li);return;}
  for(const file of p.files){const li=document.createElement('li');const name=document.createElement('span');name.textContent=file.name+' · '+Math.max(1,Math.round((file.content||'').length/1024))+' KB';
   const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='移除 / Remove';remove.onclick=()=>{p.files=p.files.filter(f=>f.id!==file.id);dirty=true;renderFiles();preview();note('有未保存的更改 / Unsaved changes');};li.append(name,remove);list.append(li);}
 }
 // option names are translated when built: rebuild on a language change
 document.addEventListener('imageprompt-language',()=>{if(state)render();});
 function render(){
  for(const button of document.querySelectorAll('#promptProfilesCard [data-kind]'))button.setAttribute('aria-pressed',String(button.dataset.kind===kind));
  const own=state.profiles.filter(p=>p.kind===kind);
  if(!own.some(p=>p.id===editingId))editingId=state.active[kind]||own[0]?.id||null;
  const select=$('profileSelect');select.replaceChildren();
  for(const p of own)select.add(new Option(T(p.name)+(p.id===state.active[kind]?' · '+T('当前 / active'):''),p.id));
  const p=editing();select.value=editingId||'';
  for(const id of ['profileName','profileSystem','profileAspect','profileIncludeReverse','copyProfile','deleteProfile','activateProfile','importProfileFiles'])$(id).disabled=!p;
  document.querySelector('#promptProfilesCard [data-for="gen"]').hidden=kind==='reverse';document.querySelector('#promptProfilesCard [data-for="i2i"]').hidden=kind!=='i2i';
  $('profileName').value=p?.name||'';$('profileSystem').value=p?.systemPrompt||'';$('profileSystem').placeholder=placeholder();$('profileAspect').value=p?.aspect||'';$('profileIncludeReverse').checked=!!p?.includeReverse;
  renderFiles();preview();dirty=false;
 }
 async function reload(){state=structuredClone(await PromptProfiles.load());render();}
 async function init(){
  const pane=document.querySelector('[data-settings-pane="generation"]');if(!pane||$('promptProfilesCard'))return;
  pane.append(card());
  for(const aspect of ImageGen.ASPECTS)$('profileAspect').add(new Option(aspect,aspect));
  await reload();
  document.querySelector('#promptProfilesCard .profile-kinds').onclick=event=>{const next=event.target.closest('[data-kind]')?.dataset.kind;if(!next||next===kind)return;if(dirty&&!confirm('放弃未保存的更改？ / Discard unsaved changes?'))return;kind=next;editingId=null;render();};
  for(const id of ['profileName','profileSystem','profileAspect','profileIncludeReverse'])$(id).addEventListener('input',()=>{readForm();dirty=true;preview();note('有未保存的更改 / Unsaved changes');});
  $('profileSelect').onchange=()=>{if(dirty&&!confirm('放弃未保存的更改？ / Discard unsaved changes?')){$('profileSelect').value=editingId;return;}editingId=$('profileSelect').value;render();};
  $('addProfile').onclick=()=>{const p={id:crypto.randomUUID(),kind,name:'新配置 '+(state.profiles.filter(x=>x.kind===kind).length+1),systemPrompt:'',files:[],aspect:'',includeReverse:false};state.profiles.push(p);editingId=p.id;render();dirty=true;note('新配置：填写后保存 / New profile: fill in and save');};
  $('copyProfile').onclick=()=>{const src=editing();if(!src)return;readForm();const p={...structuredClone(src),id:crypto.randomUUID(),name:src.name+' 副本 / copy',builtin:false};state.profiles.push(p);editingId=p.id;render();dirty=true;note('已复制，保存后生效 / Duplicated; save to keep');};
  $('deleteProfile').onclick=async()=>{const p=editing();if(!p)return;if(state.profiles.filter(x=>x.kind===kind).length<=1){note('每类至少保留一个配置 / Keep at least one profile per kind');return;}if(!confirm('删除配置“'+p.name+'”？ / Delete this profile?'))return;state.profiles=state.profiles.filter(x=>x.id!==p.id);if(state.active[kind]===p.id)state.active[kind]=state.profiles.find(x=>x.kind===kind).id;editingId=state.active[kind];await PromptProfiles.save(state.profiles,state.active);render();note('已删除 / Deleted');};
  $('activateProfile').onclick=async()=>{if(dirty){note('请先保存 / Save first');return;}state.active[kind]=editingId;await PromptProfiles.save(state.profiles,state.active);render();note('已设为当前配置 / Active profile updated');};
  $('importProfileFiles').onclick=()=>$('profileFileInput').click();
  $('profileFileInput').onchange=async()=>{try{const files=await PromptProfiles.readFiles([...$('profileFileInput').files]);const p=editing();p.files=[...(p.files||[]),...files];dirty=true;renderFiles();preview();note('已导入 '+files.length+' 个文件，保存后生效 / Imported; save to keep');}catch(error){note('导入失败 / Import failed: '+error.message);}finally{$('profileFileInput').value='';}};
  $('saveProfile').onclick=async()=>{try{readForm();await PromptProfiles.save(state.profiles,state.active);const p=editing();render();note('已保存：'+p.name+' / Saved');}catch(error){note('保存失败 / Save failed: '+error.message);}};
  $('cancelProfile').onclick=async()=>{await reload();note('更改已取消 / Changes discarded');};
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&!dirty&&(changes.promptProfiles||changes.activeProfiles))reload();});
 }
 return {init};
})();
