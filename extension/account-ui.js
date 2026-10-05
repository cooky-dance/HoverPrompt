/* Account & sync page: Local / Cloud switch on top; the cloud side shows the profile card (avatar, name, plan,
   credits, sync usage, add-on packs) and the call order. Existing controls (ids used by cloud.js) are moved, not recreated. */
globalThis.AccountUI=(()=>{
 const $=id=>document.getElementById(id),T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):value;
 const AVATARS=Array.from({length:16},(_,i)=>'avatar-'+String(i+1).padStart(2,'0'));
 const bolt='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6Z"/></svg>';
 let pane,cloudPanel,localPanel,card,picking=false,editingName=false;
 const el=(tag,cls,html)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(html!=null)node.innerHTML=html;return node;};
 const date=value=>value?new Date(value).toLocaleDateString():'';
 function build(){
  pane=document.querySelector('[data-settings-pane="account"]');if(!pane||$('modeSwitch'))return false;
  const modeLabel=$('serviceMode').closest('label');modeLabel.hidden=true;
  const switcher=el('div','mode-switch');switcher.id='modeSwitch';switcher.setAttribute('role','radiogroup');switcher.setAttribute('aria-label','运行模式 / Service mode');
  switcher.innerHTML='<button type="button" role="radio" data-mode="local"><span class="mode-icon" data-icon="local"></span><span class="mode-text"><b>本地 / Local</b><small>个人 API · 本机 Ollama / Personal API · local Ollama</small></span></button>'+
   '<button type="button" role="radio" data-mode="cloud"><span class="mode-icon" data-icon="cloud"></span><span class="mode-text"><b>云端 / Cloud</b><small>账号积分 · 云同步 · Skill 市场 / Credits · sync · Skills</small></span></button>';
  localPanel=el('section','mode-panel');localPanel.id='localModePanel';
  localPanel.innerHTML='<h3>本地模式 / Local mode</h3><p class="hint">使用「API 来源」中配置的个人 API 和本机 Ollama 模型。每个来源可以设置优先级和单独超时，超时后自动改用下一个来源。 / Uses the personal API and local Ollama models from API sources. Each source has a priority and its own timeout; on timeout the next source is used.</p>'+
   '<ul class="mode-facts"><li class="yes">个人 API：OpenAI、Anthropic、Gemini 兼容接口 / Personal API: OpenAI, Anthropic, Gemini compatible</li><li class="yes">本机 Ollama 模型，无需密钥 / Local Ollama models, no key needed</li><li class="no">不使用、也不消耗云端积分 / Cloud credits are not used</li><li class="no">Skill 市场仅在云端模式可用 / Skill market is cloud-only</li></ul>'+
   '<div class="form-actions"><button id="gotoSources" type="button">前往 API 来源 / Open API sources</button></div>';
  cloudPanel=el('section','mode-panel');cloudPanel.id='cloudModePanel';
  card=el('div','profile-card');card.id='profileCard';
  const order=el('div','cloud-block');order.innerHTML='<label>调用顺序 / Call order<select id="channelOrder"><option value="local-first">本地优先：Ollama → API → 云端 / Local first</option><option value="cloud-first">云端优先 / Cloud first</option><option value="cloud-only">仅云端 / Cloud only</option></select></label>'+
   '<p class="hint">登录后仍可使用个人 API 和本机模型；某个渠道失败或超时时，改用下一个渠道。本地与个人 API 不消耗云端积分。 / Personal API and local models stay available when signed in; a failed or timed-out channel falls through to the next. Local and personal API calls use no cloud credits.</p>';
  // The service address is fixed in the extension; only the sync option remains here.
  const advanced=el('details','cloud-advanced');advanced.innerHTML='<summary>同步设置 / Sync settings</summary>';
  const urlLabel=$('cloudUrl').closest('label');urlLabel.hidden=true;$('cloudUrl').readOnly=true;
  advanced.append(urlLabel,$('syncImages').closest('label'));const save=el('div','form-actions');save.append($('saveCloud'));advanced.append(save);
  advanced.hidden=true;
  cloudPanel.append(card,order,advanced,$('cloudStatus'));
  const hint=pane.querySelector(':scope > p.hint');if(hint)cloudPanel.append(hint);
  pane.prepend(switcher);switcher.after(localPanel,cloudPanel);
  // Keep the existing buttons (sign in, sync, refresh, sign out…): move them into the card before dropping their old row.
  const legacy=pane.querySelector(':scope > .setting-actions');if(legacy){const parking=el('div','profile-parking');parking.hidden=true;parking.append(...legacy.children);card.append(parking);legacy.remove();}
  switcher.onclick=async event=>{const mode=event.target.closest('[data-mode]')?.dataset.mode;if(!mode)return;await Cloud.setMode(mode);render();if(mode==='cloud'&&!Cloud.signedIn())Cloud.status().catch(()=>{});};
  $('gotoSources').onclick=()=>globalThis.SettingsLayout?.navigate('sources');
  chrome.storage.local.get(['channelOrder']).then(saved=>{$('channelOrder').value=saved.channelOrder||'local-first';});
  $('channelOrder').addEventListener('change',()=>chrome.storage.local.set({channelOrder:$('channelOrder').value}));
  document.addEventListener('imageprompt-cloud',render);document.addEventListener('imageprompt-language',()=>{if(pane)render();});
  return true;
 }
 // The profile card is rebuilt from the account; the existing action buttons are moved into it.
 function renderCard(){
  const account=Cloud.account(),keep=['cloudLogin','syncCloud','refreshCloud','cloudAccount','claimGift','cloudLogout'].map($).filter(Boolean);
  // Controls not shown in the current state wait in a hidden holder inside the card (detached nodes could not be found by id).
  const parking=el('div','profile-parking');parking.hidden=true;parking.append(...keep);card.replaceChildren(parking);
  const waiting=!account&&Cloud.loginState?.();
  if(waiting){
   card.classList.add('signed-out');
   const code=waiting.userCode.replace(/(.{4})(?=.)/g,'$1-');
   const head=el('div','profile-head','<span class="profile-avatar placeholder waiting" aria-hidden="true"></span><div class="profile-id"><span class="profile-name"></span><span class="profile-email"></span></div>');
   head.querySelector('.profile-name').textContent=T('正在等待浏览器中的授权 / Waiting for approval in the browser');
   head.querySelector('.profile-email').textContent=T('在打开的页面用 GitHub 登录，确认验证码一致后点“批准连接”。 / Sign in on the opened page, check the code matches, then approve.');
   const codeBox=el('div','login-code');codeBox.innerHTML='<span></span><b></b>';codeBox.querySelector('span').textContent=T('验证码 / Code');codeBox.querySelector('b').textContent=code;
   const actions=el('div','profile-actions');
   const reopen=el('button','',T('重新打开登录页 / Open the page again'));reopen.type='button';reopen.id='cloudLoginReopen';reopen.onclick=()=>Cloud.reopenLogin();
   const cancel=el('button','secondary',T('取消 / Cancel'));cancel.type='button';cancel.id='cloudLoginCancel';cancel.onclick=()=>Cloud.cancelLogin();
   actions.append(reopen,cancel);card.append(head,codeBox,actions);return;
  }
  if(!account){
   card.classList.add('signed-out');
   const head=el('div','profile-head','<span class="profile-avatar placeholder" aria-hidden="true"></span><div class="profile-id"><span class="profile-name">登录云端账号 / Sign in to the cloud</span><span class="profile-email">登录后可使用云端积分、同步最近 20 条反推记录（Plus 100 条）和 Skill 市场。 / Sign in to use cloud credits, sync your latest 20 records (100 on Plus) and the Skill market.</span></div>');
   const actions=el('div','profile-actions');$('cloudLogin').textContent=T('注册或登录（GitHub） / Sign in or register (GitHub)');actions.append($('cloudLogin'));card.append(head,actions);return;
  }
  card.classList.remove('signed-out');
  const {user,quota}=account,plan=quota.plan==='pro'?'pro':'free',credits=globalThis.CreditsBadge?.fromQuota(quota),sync=quota.sync||{used:0,limit:0,base:0,packs:0};
  const head=el('div','profile-head');
  const avatarButton=el('button','profile-avatar');avatarButton.type='button';avatarButton.title=T('更换头像 / Change avatar');avatarButton.setAttribute('aria-label',avatarButton.title);avatarButton.setAttribute('aria-expanded',String(picking));
  const img=el('img');img.alt='';img.src='avatars/'+(user.avatar||AVATARS[hash(user.id)%16])+'.svg';avatarButton.append(img);avatarButton.onclick=()=>{picking=!picking;renderCard();};
  const id=el('div','profile-id'),nameRow=el('div','profile-name-row');
  if(editingName){
   const input=el('input');input.id='profileNameInput';input.value=user.name||'';input.maxLength=40;input.setAttribute('aria-label',T('显示名称 / Display name'));
   const ok=el('button','',T('保存 / Save'));ok.type='button';ok.id='profileNameSave';const cancel=el('button','secondary',T('取消 / Cancel'));cancel.type='button';
   ok.onclick=async()=>{try{await Cloud.profile({name:input.value});editingName=false;renderCard();}catch(error){$('cloudStatus').textContent=error.message;}};cancel.onclick=()=>{editingName=false;renderCard();};
   input.onkeydown=event=>{if(event.key==='Enter')ok.click();if(event.key==='Escape')cancel.click();};nameRow.append(input,ok,cancel);setTimeout(()=>input.focus(),0);
  }else{
   const name=el('span','profile-name');name.textContent=user.name||user.email;const edit=el('button','profile-edit');edit.type='button';edit.title=T('编辑名称 / Edit name');edit.setAttribute('aria-label',edit.title);edit.onclick=()=>{editingName=true;renderCard();};nameRow.append(name,edit);
  }
  const email=el('span','profile-email');email.textContent=user.email;id.append(nameRow,email);
  const badge=el('span','plan-badge '+plan,plan==='pro'?'PLUS':'FREE');head.append(avatarButton,id,badge);card.append(head);
  if(picking){
   const picker=el('div','avatar-picker');picker.setAttribute('role','listbox');picker.setAttribute('aria-label',T('选择头像 / Choose an avatar'));
   for(const avatar of AVATARS){const option=el('button','avatar-option');option.type='button';option.setAttribute('role','option');option.setAttribute('aria-selected',String(avatar===user.avatar));option.dataset.avatar=avatar;option.innerHTML='<img alt="" src="avatars/'+avatar+'.svg">';
    option.onclick=async()=>{try{await Cloud.profile({avatar});picking=false;renderCard();}catch(error){$('cloudStatus').textContent=error.message;}};picker.append(option);}
   card.append(picker);
  }
  const stats=el('div','profile-stats');
  const stat=(label,value,note,extra='')=>{const box=el('div','profile-stat');box.innerHTML='<span class="stat-label"></span><span class="stat-value"></span>'+extra+'<small></small>';box.querySelector('.stat-label').textContent=T(label);box.querySelector('.stat-value').innerHTML=value;box.querySelector('small').textContent=note;return box;};
  stats.append(
   stat('积分 / Credits','<span class="credits-bolt-inline">'+bolt+'</span>'+(credits?credits.remaining:0),[credits?.expiresAt?date(credits.expiresAt)+' '+T('到期 / expires'):'',quota.purchased?.remaining?T('含加量 / incl. packs')+' '+quota.purchased.remaining:''].filter(Boolean).join(' · ')),
   stat('云同步 / Cloud sync',sync.used+'<em>/'+sync.limit+'</em>',T('保留最近 '+sync.limit+' 条 / Latest '+sync.limit+' kept'),'<span class="meter"><i style="width:'+Math.min(100,sync.limit?Math.round(sync.used/sync.limit*100):0)+'%"></i></span>'),
   stat('套餐 / Plan',plan==='pro'?'Plus':'Free',plan==='pro'&&quota.expiresAt?T('有效期至 / Until')+' '+date(quota.expiresAt):T(plan==='pro'?'Plus 套餐 / Plus plan':'免费版 / Free plan'))
  );
  card.append(stats);
  // One-time packs: analysis credits (never expire, used after the monthly allowance) and cloud sync records.
  for(const [kind,label,unit,title] of [['credits','积分加量包 / Credit packs','积分 / credits','一次性购买，积分不过期，在月额度用完后使用 / One-time purchase; credits never expire and are used after the monthly allowance'],['sync','同步加量包 / Sync add-on packs','条 / records','一次性购买，永久增加云端同步条数 / One-time purchase; permanently adds cloud sync records']]){
   const packs=el('div','pack-row');packs.dataset.kind=kind;packs.innerHTML='<span class="pack-label"></span>';packs.querySelector('.pack-label').textContent=T(label);
   const sizes=Object.keys(account.packs?.[kind]||{}).sort((a,b)=>a-b);for(const pack of sizes.length?sizes:kind==='credits'?['250','600','2000']:['500','2000']){const button=el('button','pack-button');button.type='button';button.dataset.pack=pack;button.dataset.kind=kind;button.innerHTML=(kind==='credits'?'<span class="credits-bolt-inline">'+bolt+'</span>':'')+'<b>+'+pack+'</b><small></small>';button.querySelector('small').textContent=T(unit);
    const onSale=account.packs?.[kind]?.[pack]!==false;button.disabled=!onSale;button.title=onSale?T(title):T('暂未开放 / Not on sale yet');
    button.onclick=async()=>{button.disabled=true;try{await Cloud.buyPack(pack,kind);$('cloudStatus').textContent=T('已打开付款页面；付款完成后点击“刷新额度” / Payment page opened; press Refresh after paying');}catch(error){$('cloudStatus').textContent=error.message;}finally{button.disabled=!onSale;}};packs.append(button);}
   card.append(packs);
  }
  const actions=el('div','profile-actions');
  // Record images always sync; this capsule adds generated images.
  const genToggle=el('button','sync-toggle');genToggle.type='button';genToggle.id='syncGenerationsToggle';genToggle.setAttribute('aria-pressed',String(Cloud.syncGenerations?.()===true));genToggle.textContent=T('同步生图 / Sync generated images');genToggle.title=T('开启后，生成的图片也会同步到云端，并计入云端存储 / Also sync generated images (counts toward cloud storage)');
  genToggle.onclick=async()=>{await Cloud.setSyncGenerations(!Cloud.syncGenerations());};
  // Originals (on by default): the full-size image instead of the 1600 px copy, for records and generated images.
  const origToggle=el('button','sync-toggle');origToggle.type='button';origToggle.id='syncOriginalsToggle';origToggle.setAttribute('aria-pressed',String(Cloud.syncOriginals?.()!==false));origToggle.textContent=T('同步原图 / Sync originals');origToggle.title=T('开启后，云端反推和同步保存原图（不压缩），计入云端存储 / Cloud analysis and sync keep the full-size original (counts toward cloud storage)');
  origToggle.onclick=async()=>{await Cloud.setSyncOriginals(Cloud.syncOriginals()===false);};
  actions.append(genToggle,origToggle,...['syncCloud','refreshCloud','cloudAccount','claimGift','cloudLogout'].map($).filter(Boolean));card.append(actions);
 }
 const hash=value=>[...String(value||'')].reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);
 function render(){
  if(!pane&&!build())return;
  const mode=Cloud.mode();
  for(const button of $('modeSwitch').querySelectorAll('[data-mode]'))button.setAttribute('aria-checked',String(button.dataset.mode===mode));
  localPanel.hidden=mode!=='local';cloudPanel.hidden=mode!=='cloud';
  renderCard();
 }
 function init(){if(build())render();}
 return {init,render,AVATARS};
})();
