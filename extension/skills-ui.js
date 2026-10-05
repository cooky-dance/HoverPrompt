/* Skill market (cloud only). Featured = the cloud's reviewed list; GitHub = direct repository search with import
   to the cloud; Mine = your uploads. The active skill is used by cloud analysis only; its text never reaches the extension. */
globalThis.SkillsUI=(()=>{
 const $=id=>document.getElementById(id),T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):value;
 let tab='market',pane,busy=false,packageFiles=null;
 const TEXT_FILE=/\.(?:md|markdown|txt|m?js|cjs|ts|json|py|sh|ps1|ya?ml)$/i;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 const note=text=>{$('skillStatus').textContent=text;};
 const GITHUB_SEARCH='https://api.github.com/search/repositories';
 // Hand-picked design skills (licences checked 2026-09-30), shown first on the GitHub tab.
 const CURATED=[
  {repo:'anthropics/skills',path:'skills/canvas-design/SKILL.md',name:'Canvas Design',by:'Anthropic',license:'Apache-2.0',stars:'179k',summary:'以“设计理念”驱动的视觉创作：构图、留白、色彩与质感的完整方法。 / Visual art driven by a design philosophy: composition, space, colour and texture.',topics:['visual','poster','art']},
  {repo:'anthropics/skills',path:'skills/theme-factory/SKILL.md',name:'Theme Factory',by:'Anthropic',license:'Apache-2.0',stars:'179k',summary:'10 套现成的配色与字体主题，可统一整套作品的风格。 / Ten ready-made colour and type themes for a consistent look.',topics:['color','typography','theme']},
  {repo:'anthropics/skills',path:'skills/frontend-design/SKILL.md',name:'Frontend Design',by:'Anthropic',license:'Apache-2.0',stars:'179k',summary:'有辨识度的视觉方向：审美取向、字体与层次，避免千篇一律。 / Distinctive visual direction: aesthetics, type and hierarchy, avoiding generic looks.',topics:['ui','aesthetic']},
  {repo:'anthropics/skills',path:'skills/algorithmic-art/SKILL.md',name:'Algorithmic Art',by:'Anthropic',license:'Apache-2.0',stars:'179k',summary:'生成艺术：参数化图案、流场与随机构图。 / Generative art: parametric patterns, flow fields, seeded composition.',topics:['generative','pattern']},
  {repo:'LiamGvchi/gc-still-image-motion-director',path:'SKILL.md',name:'Still Image Motion Director',by:'LiamGvchi',license:'MIT',stars:'150+',summary:'逐张分析图片，写出克制、贴合画面的镜头与动态提示词。 / Analyses each image and writes restrained, image-specific motion prompts.',topics:['image','prompt','motion']},
  {repo:'NyxTides/ppt-image-first',path:'SKILL.md',name:'PPT Image First',by:'NyxTides',license:'Apache-2.0',stars:'1.2k',summary:'以画面为先的演示设计：先定视觉，再排文字。 / Image-first presentation design: visuals first, then text.',topics:['slides','layout']},
  {repo:'fucha1122/minimalist-bw-logo-skill',path:'SKILL.md',name:'Minimalist B&W Logo',by:'fucha1122',license:'MIT',stars:'50+',summary:'极简黑白标志设计的规则与提示词。 / Rules and prompts for minimalist black-and-white logos.',topics:['logo','minimal']},
  {repo:'peixl/ifq-design-skills',path:'SKILL.md',name:'IFQ Design Skills',by:'peixl',license:'Apache-2.0',stars:'20+',summary:'把普通需求变成经过验证的设计稿、演示和看板。 / Turns plain requests into verified designs, decks and dashboards.',topics:['design','prototype']},
  {repo:'ziguishian/premium-ui-builder-skill',path:'SKILL.md',name:'Premium UI Builder',by:'ziguishian',license:'MIT',stars:'30+',summary:'把“做得高级一点”落实为具体的设计与视觉规范。 / Turns “make it premium” into concrete design decisions.',topics:['ui','premium']},
  {repo:'Wholiver/swiftui-design-skill',path:'SKILL.md',name:'SwiftUI Design',by:'Wholiver',license:'MIT',stars:'200+',summary:'六条防“AI 味”设计铁律与设计方向。 / Six rules against sloppy AI design, plus design directions.',topics:['ui','ios']}];
 function curatedCard(item){
  const skill={full_name:item.repo+(item.path==='SKILL.md'?'':' · '+item.path.replace(/\/SKILL\.md$/i,'').split('/').pop()),html_url:'https://github.com/'+item.repo+(item.path==='SKILL.md'?'':'/tree/HEAD/'+item.path.replace(/\/SKILL\.md$/i,'')),description:T(item.summary),stargazers_count:item.stars,license:{spdx_id:item.license},topics:item.topics,curated:item};
  const node=card(skill,{github:true});node.classList.add('curated');node.querySelector('h4').textContent=item.name;node.querySelector('.skill-meta').textContent=item.by+' · ★ '+item.stars+' · '+item.license;return node;
 }
 function build(){
  const account=document.querySelector('[data-settings-pane="account"]');if(!account||document.querySelector('[data-settings-pane="skills"]'))return false;
  pane=el('div');pane.dataset.settingsPane='skills';pane.hidden=true;account.after(pane);
  pane.innerHTML='<div class="skills-head"><h3>Skill 市场 / Skill market</h3><span class="cloud-only-badge">仅云端 / Cloud only</span></div>'+
   '<p class="hint">Skill 是附加在反推指令上的写作规则，例如汉服细节、胶片质感、电商白底。启用后云端反推会使用它；正文只保存在云端，由服务器在运行时使用，扩展和其他用户都无法读取。 / A skill adds writing rules to the analysis instruction (Hanfu detail, film look, product shots…). Cloud analysis uses the active skill; its text stays on the server and cannot be read by the extension or other users.</p>'+
   '<div id="skillLocked" class="skill-locked" hidden><span class="lock-icon" aria-hidden="true"></span><div><b>登录云端后可用 / Available in cloud mode</b><p class="hint">Skill 市场只在云端模式下、登录账号后使用。本地模式可在「生成设置」的提示词配置中导入 md 文件。 / Switch to cloud mode and sign in. In local mode, import md files in Prompt profiles instead.</p></div><button id="skillUnlock" type="button">切换到云端 / Switch to cloud</button></div>'+
   '<div id="skillBody"><div id="skillActive" class="skill-active" hidden><span></span><button id="skillDeactivate" type="button" class="secondary">停用 / Turn off</button></div>'+
   '<div class="segmented skill-tabs" role="tablist"><button type="button" role="tab" data-tab="market">推荐 / Featured</button><button type="button" role="tab" data-tab="github">GitHub</button><button type="button" role="tab" data-tab="mine">我的 / Mine</button></div>'+
   '<form id="skillSearchForm" class="skill-search"><input id="skillQuery" type="search" placeholder="搜索 Skill：汉服、胶片、人像… / Search skills"><button type="submit">搜索 / Search</button></form>'+
   '<p id="skillStatus" class="hint" role="status"></p><div id="skillList" class="skill-grid"></div>'+
   '<form id="skillUpload" class="skill-upload" hidden><h4>上传自己的 Skill / Upload a skill</h4>'+
   '<div class="source-grid"><label>名称 / Name<input id="skillName" maxlength="60" required></label><label>标签（逗号分隔） / Tags<input id="skillTags" placeholder="hanfu, portrait"></label>'+
   '<label class="wide">简介 / Summary<input id="skillSummary" maxlength="280"></label>'+
   '<label>可见范围 / Visibility<select id="skillVisibility"><option value="private">仅自己 / Private</option><option value="public">公开（需审核） / Public (reviewed)</option></select></label>'+
   '<label>Skill 文件（.md） / Skill file<input id="skillFile" type="file" accept=".md,.markdown,.txt"></label>'+
   '<label>或选择整个 Skill 文件夹（含子 Skill） / Or a skill folder (with sub-skills)<input id="skillFolder" type="file" webkitdirectory multiple></label>'+
   '<p id="skillPackageInfo" class="hint wide" hidden></p>'+
   '<label class="wide">或直接粘贴内容 / Or paste the content<textarea id="skillContent" rows="6" spellcheck="false"></textarea></label></div>'+
   '<p class="hint">上传后正文只保存在云端，之后无法再从扩展中查看（包括你自己）；请自行保留原文件。 / After upload the text lives only in the cloud and cannot be viewed again from the extension, even by you; keep your own copy.</p>'+
   '<div class="form-actions"><button type="submit">上传到云端 / Upload</button></div></form></div>';
  pane.querySelector('.skill-tabs').onclick=event=>{const next=event.target.closest('[data-tab]')?.dataset.tab;if(!next||next===tab)return;tab=next;$('skillQuery').value='';render();};
  $('skillSearchForm').onsubmit=event=>{event.preventDefault();load();};
  $('skillUnlock').onclick=async()=>{await Cloud.setMode('cloud');if(!Cloud.signedIn())globalThis.SettingsLayout?.navigate('account');else render();};
  $('skillDeactivate').onclick=async()=>{await chrome.storage.local.remove('activeCloudSkill');paintActive();load();};
  // Folder upload: SKILL.md + skills/<name>/SKILL.md + references/*.md; code files are sent so they are listed, not run.
  $('skillFolder').onchange=async()=>{
   const picked=[...$('skillFolder').files].filter(file=>TEXT_FILE.test(file.name)&&!/(^|\/)(node_modules|\.git)\//.test(file.webkitRelativePath));
   const info=$('skillPackageInfo');packageFiles=null;info.hidden=false;
   if(!picked.length){info.textContent=T('文件夹里没有可用的文本文件 / No text files in this folder');return;}
   if(picked.reduce((sum,file)=>sum+file.size,0)>262144){info.textContent=T('Skill 包超过 256 KB / The package is larger than 256 KB');return;}
   packageFiles=await Promise.all(picked.slice(0,40).map(async file=>({path:file.webkitRelativePath||file.name,content:await file.text()})));
   const rel=packageFiles.map(file=>file.path.split('/').slice(1).join('/')||file.path);
   const main=packageFiles.find((file,index)=>/^skill\.md$/i.test(rel[index])),subs=rel.filter(path=>/^(?:skills|subskills|sub-skills)\/[^/]+\/skill\.md$/i.test(path)).length,hooks=rel.filter(path=>/^hooks\/(?:pre|post)\.js$/i.test(path)).length,code=rel.filter(path=>/\.(?:m?js|cjs|ts|py|sh|ps1)$/i.test(path)&&!/^hooks\/(?:pre|post)\.js$/i.test(path)).length;
   if(!main){info.textContent=T('文件夹根目录需要 SKILL.md / The folder needs SKILL.md at its root');packageFiles=null;return;}
   if(!$('skillName').value)$('skillName').value=(/^name:\s*(.+)$/m.exec(main.content)?.[1]||/^#\s+(.+)$/m.exec(main.content)?.[1]||'').trim().slice(0,60);
   $('skillContent').value='';
   info.textContent=T('已读取 '+packageFiles.length+' 个文件 / Read '+packageFiles.length+' files')+' · '+T('子 Skill '+subs+' 个 / '+subs+' sub-skills')+(hooks?' · '+T('钩子 '+hooks+' 个（云端沙箱运行） / '+hooks+' hooks (cloud sandbox)'):'')+(code?' · '+T('其他代码 '+code+' 个（不运行） / '+code+' other code files (not run)'):'');
  };
  $('skillFile').onchange=async()=>{const file=$('skillFile').files[0];if(!file)return;packageFiles=null;$('skillPackageInfo').hidden=true;if(file.size>65536){note(T('文件超过 64 KB / File is larger than 64 KB'));return;}$('skillContent').value=await file.text();if(!$('skillName').value)$('skillName').value=/^#\s+(.+)$/m.exec($('skillContent').value)?.[1]?.slice(0,60)||file.name.replace(/\.\w+$/,'');};
  $('skillUpload').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;
   try{await Cloud.skills.upload({name:$('skillName').value,summary:$('skillSummary').value,tags:$('skillTags').value,visibility:$('skillVisibility').value,...(packageFiles?{files:packageFiles}:{content:$('skillContent').value})});
    $('skillUpload').reset();$('skillContent').value='';packageFiles=null;$('skillPackageInfo').hidden=true;note(T($('skillVisibility').value==='public'?'已上传，公开前需要审核；你现在就可以使用 / Uploaded; public listing needs review, you can use it now':'已上传，仅自己可用 / Uploaded; private to you'));await load();}
   catch(error){note(error.message);}finally{busy=false;}};
  document.addEventListener('imageprompt-cloud',()=>{if(!pane.hidden)render();});
  new MutationObserver(()=>{if(!pane.hidden)render();}).observe(pane,{attributes:true,attributeFilter:['hidden']});
  return true;
 }
 const available=()=>Cloud.mode()==='cloud'&&Cloud.signedIn();
 async function paintActive(){const {activeCloudSkill:active}=await chrome.storage.local.get(['activeCloudSkill']);const box=$('skillActive');box.hidden=!active;if(active)box.querySelector('span').textContent=T('当前使用 / In use')+'：'+active.name+(active.part&&active.part!=='auto'?' · '+active.partName:active.hasParts?' · '+T('自动选择子 Skill / Auto sub-skills'):'');return active;}
 const choose=async(skill,part='auto',partName='')=>{await chrome.storage.local.set({activeCloudSkill:{id:skill.id,name:skill.name,part,partName,hasParts:!!skill.parts?.length}});note(T('云端反推将使用 / Cloud analysis now uses')+'：'+skill.name+(part!=='auto'?' · '+partName:''));await paintActive();load();};
 function card(skill,{active,activePart,github}={}){
  const item=el('article','skill-card'+(active?' active':''));
  const head=el('div','skill-card-head'),icon=el('span','skill-icon',github||skill.source==='github'?'':String(skill.name||'?').trim().charAt(0).toUpperCase());if(github||skill.source==='github')icon.dataset.kind='github';
  const titles=el('div'),name=el('h4','',skill.name||skill.full_name);
  const meta=el('span','skill-meta',github?[skill.full_name,'★ '+skill.stargazers_count,skill.license?.spdx_id||T('无许可证 / no licence')].join(' · '):[skill.source==='github'?'GitHub · '+skill.repo:T('用户上传 / Uploaded'),skill.stars?'★ '+skill.stars:'',skill.license||''].filter(Boolean).join(' · '));
  titles.append(name,meta);head.append(icon,titles);item.append(head,el('p','skill-summary',(github?skill.description:skill.summary)||''));
  const tags=el('div','skill-tags');for(const tag of (github?skill.topics:skill.tags)||[])tags.append(el('span','',tag));item.append(tags);
  // Sub-skills: "Auto" lets the cloud pick by each sub-skill's "use when"; a chip pins one.
  if(!github&&skill.parts?.length&&skill.status!=='rejected'){
   const parts=el('div','skill-parts');parts.setAttribute('role','radiogroup');parts.setAttribute('aria-label',T('子 Skill / Sub-skills'));
   for(const part of [{key:'auto',name:T('自动 / Auto'),when:T('按每个子 Skill 的使用条件自动选择 / Picked automatically by each sub-skill\'s condition')},...skill.parts]){
    const chip=el('button','',part.name);chip.type='button';chip.setAttribute('role','radio');chip.title=part.when||'';chip.setAttribute('aria-checked',String(!!active&&(activePart||'auto')===part.key));
    chip.onclick=()=>choose(skill,part.key,part.key==='auto'?'':part.name);parts.append(chip);}
   item.append(parts);
  }
  if(!github&&skill.hooks?.length)item.append(el('p','skill-hook-note',T('含代码钩子（云端沙箱运行） / Code hooks (run in the cloud sandbox)')+'：'+skill.hooks.join(' · ')));
  if(!github&&skill.owned&&skill.ignored?.some(file=>file.kind==='code'))item.append(el('p','skill-code-note',T('这些代码文件不会运行 / These code files are not run')+'：'+skill.ignored.filter(file=>file.kind==='code').map(file=>file.path).join(', ')));
  const foot=el('div','skill-foot');
  if(!github){
   const status={live:skill.visibility==='private'?'私有 / Private':'已上架 / Live',review:'审核中 / In review',rejected:'未通过 / Rejected'}[skill.status];
   foot.append(el('span','skill-state'+(skill.status!=='live'?' '+skill.status:''),tab==='mine'?T(status):T('已使用 '+(skill.uses||0)+' 次 / Used '+(skill.uses||0)+' times')));
   if(skill.status!=='rejected'){const use=el('button',active?'secondary':'',T(active?'使用中 / In use':'使用 / Use'));use.type='button';use.disabled=active;use.onclick=()=>choose(skill);foot.append(use);}
   if(skill.owned&&tab==='mine'){const remove=el('button','danger',T('删除 / Delete'));remove.type='button';remove.onclick=async()=>{if(!confirm(T('删除这个 Skill？ / Delete this skill?')))return;try{await Cloud.skills.remove(skill.id);const {activeCloudSkill:current}=await chrome.storage.local.get(['activeCloudSkill']);if(current?.id===skill.id)await chrome.storage.local.remove('activeCloudSkill');await paintActive();load();}catch(error){note(error.message);}};foot.append(remove);}
  }else{
   foot.append(el('span','skill-state',T('GitHub 仓库 / GitHub repository')));
   const link=el('a','skill-link',T('查看 / View'));link.href=skill.html_url;link.target='_blank';link.rel='noreferrer';
   const add=el('button','',T('导入到云端 / Import'));add.type='button';add.disabled=!skill.license?.spdx_id||skill.license.spdx_id==='NOASSERTION';if(add.disabled)add.title=T('没有可识别的许可证，不能导入 / No recognised licence; cannot import');
   add.onclick=async()=>{add.disabled=true;try{const result=skill.curated?await Cloud.skills.importRepo(skill.curated.repo,skill.curated.path):await Cloud.skills.importRepo(skill.full_name);note(T(result.existing?'云端已有这个 Skill / Already in the cloud':result.skill.status==='live'?'已导入并上架 / Imported and live':'已导入，审核通过后对所有人上架；你现在就可以使用 / Imported; listed after review, you can use it now'));tab='mine';render();}catch(error){note(error.message);add.disabled=false;}};
   foot.append(link,add);
  }
  item.append(foot);return item;
 }
 async function load(){
  if(!available())return;const list=$('skillList'),query=$('skillQuery').value.trim();list.replaceChildren();note(T('正在加载… / Loading…'));
  try{
   const active=await paintActive();
   if(tab==='github'){
    // Direct search: public repositories about image-generation prompts/skills, most starred first (60 searches/hour without a GitHub login).
    if(!query){
     list.append(el('h4','skill-section-title',T('推荐的设计类 Skill（已核对开源许可证） / Recommended design skills (licences checked)')));
     for(const item of CURATED)list.append(curatedCard(item));
     note(T('输入关键词可搜索更多 GitHub 仓库 / Type a keyword to search more GitHub repositories'));return;
    }
    const q=query+' SKILL.md in:readme,description';const response=await fetch(GITHUB_SEARCH+'?q='+encodeURIComponent(q)+'&sort=stars&order=desc&per_page=12',{headers:{Accept:'application/vnd.github+json'}});
    if(response.status===403||response.status===429)throw new Error(T('GitHub 搜索次数已达上限，请稍后再试 / GitHub search limit reached; try again later'));
    if(!response.ok)throw new Error('GitHub HTTP '+response.status);
    const data=await response.json();for(const repo of data.items||[])list.append(card(repo,{github:true}));note(T('GitHub 结果 '+(data.items||[]).length+' 个；导入后在云端运行 / '+(data.items||[]).length+' GitHub results; imported skills run in the cloud'));return;
   }
   const {skills}=await Cloud.skills.list(tab,query);
   for(const skill of skills)list.append(card(skill,{active:active?.id===skill.id,activePart:active?.id===skill.id?active.part:''}));
   note(skills.length?'':T(tab==='mine'?'还没有上传或导入的 Skill / No skills yet':'没有找到 Skill，试试 GitHub 搜索 / No skills found; try GitHub'));
  }catch(error){note(error.message);}
 }
 function render(){
  if(!pane&&!build())return;
  const ok=available();$('skillLocked').hidden=ok;$('skillBody').hidden=!ok;if(!ok)return;
  for(const button of pane.querySelectorAll('.skill-tabs [data-tab]'))button.setAttribute('aria-pressed',String(button.dataset.tab===tab));
  $('skillUpload').hidden=tab!=='mine';$('skillQuery').placeholder=T(tab==='github'?'搜索 GitHub：hanfu、film、portrait… / Search GitHub':'搜索 Skill：汉服、胶片、人像… / Search skills');
  load();
 }
 function init(){if(build())render();}
 return {init,render};
})();
