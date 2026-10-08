/* Free Plus trial invite: a small purple card in the corner of the extension window (settings page and floating window),
   the same design as the website's (hoverprompt.com public/plus-invite.js).
   - Not signed in: "Sign up & claim" starts the usual sign-in (Cloud.login: the website page, email code with the human
     check or a social account, then "approve"); while it waits the card shows the code.
   - Signed in and the account can still claim (/api/me trialOffer): "Claim free Plus" claims it (Cloud.claimTrial, the
     same call as the credits window), then a short success state.
   - Trial used, a Plus member, or the trial switched off on the server: never shown.
   Days and credits come from the server: the account's trialOffer, or the public price list (/api/pricing "trial") when
   signed out. Closing it hides it for 3 days (chrome.storage.local plusInvite); after a claim, or once an account here
   has no offer, it is not shown again. Respects reduced motion. */
globalThis.PlusInvite=(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):splitBilingual(value)[0];
 const KEY='plusInvite',SNOOZE=3*86400000,DAY=86400000;
 let saved={},loaded=false,known=false,state='',card=null,trial=null,pricingTrial,pricingLoad=null,timer=null,doneTimer=null,claimedUntil=null,busy=false;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 const muted=()=>!!saved.done||(Number(saved.closedAt)>0&&Date.now()-Number(saved.closedAt)<SNOOZE);
 const remember=async patch=>{saved={...saved,...patch};try{await chrome.storage.local.set({[KEY]:saved});}catch{}};
 const valid=v=>v&&Number(v.days)>0&&Number(v.credits)>0?{days:Number(v.days),credits:Number(v.credits)}:null;
 const publicTrial=()=>pricingLoad||=Cloud.pricing().then(p=>{pricingTrial=valid(p?.trial);return pricingTrial;}).catch(()=>{pricingLoad=null;return null;});
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 async function decide(){
  clearTimeout(timer);
  if(!known||!loaded||state==='done'||busy)return;
  const account=Cloud.account?.();let next,view;
  if(account){
   if(!account.trialOffer){if(!saved.done)remember({done:true});hide(false);return;}
   next=valid(account.trialOffer);view='claim';
  }else{next=await publicTrial();view=Cloud.loginState?.()?'wait':'join';}
  if(state==='done'||busy)return;
  if(!next||muted()){hide(false);return;}
  trial=next;
  if(card){state=view;paint();return;}
  state=view;timer=setTimeout(()=>{if(state===view&&!muted())show();},900);
 }
 const STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>';
 function build(){
  card=el('div','plus-invite');card.id='plusInvite';card.setAttribute('role','dialog');card.setAttribute('aria-modal','false');card.setAttribute('aria-labelledby','plusInviteTitle');
  const stars=el('span','pi-stars');stars.setAttribute('aria-hidden','true');for(let i=0;i<10;i++)stars.append(el('i'));
  const close=el('button','pi-close');close.type='button';close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';close.onclick=dismiss;
  const body=el('div','pi-body');const badge=el('span','pi-badge');badge.innerHTML=STAR;badge.append(el('span','pi-badge-text'));
  const title=el('p','pi-title');title.id='plusInviteTitle';
  const perks=el('div','pi-perks');for(const kind of ['days','credits']){const perk=el('span','pi-perk');perk.dataset.kind=kind;perk.append(el('b'),el('small'));perks.append(perk);}
  const code=el('div','pi-code');code.append(el('span'),el('b'));
  const error=el('p','pi-error');error.setAttribute('role','alert');error.hidden=true;
  const actions=el('div','pi-actions');const cta=el('button','pi-cta');cta.type='button';cta.append(el('span','pi-cta-text'));cta.onclick=act;
  const later=el('button','pi-later');later.type='button';later.onclick=notNow;actions.append(cta,later);
  body.append(badge,title,el('p','pi-text'),perks,code,error,actions);
  const done=el('div','pi-done');done.setAttribute('aria-live','polite');done.innerHTML='<span class="pi-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  const ok=el('button','pi-cta pi-ok');ok.type='button';ok.append(el('span','pi-cta-text'));ok.onclick=()=>hide(true);done.append(el('p','pi-done-title'),el('p','pi-done-text'),ok);
  card.append(stars,close,body,done);
  card.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();state==='done'?hide(true):dismiss();}});
  document.body.append(card);
 }
 function paint(){
  if(!card)return;const d=trial?.days??'',n=trial?.credits??'',set=(sel,text)=>{const node=card.querySelector(sel);if(node)node.textContent=text;};
  card.dataset.state=busy?'busy':state;card.setAttribute('aria-label',T('免费 Plus 体验 / Free Plus trial'));
  const close=card.querySelector('.pi-close');close.title=close.ariaLabel=T('关闭 / Close');close.setAttribute('aria-label',close.title);
  set('.pi-badge-text',T('免费 Plus / Free Plus'));
  set('.pi-title',T(`免费体验 ${d} 天 Plus / Try Plus free for ${d} days`));
  set('.pi-text',state==='wait'?T('在打开的网页里登录，确认验证码一致后点“批准连接”。 / Sign in on the opened page, check the code matches, then approve.'):state==='join'?T(`注册即可领取 ${n} 云端积分和 Plus 云同步，无需绑卡。 / Create a free account to get ${n} cloud credits and Plus sync. No card needed.`):T(`你的账户现在就能领取：${n} 云端积分 + Plus 云同步，无需绑卡。 / Your account can claim it now: ${n} cloud credits and Plus sync. No card needed.`));
  for(const perk of card.querySelectorAll('.pi-perk')){const days=perk.dataset.kind==='days';perk.querySelector('b').textContent=days?d:n;perk.querySelector('small').textContent=T(days?'天 Plus 会员 / days of Plus':'云端积分 / cloud credits');}
  const wait=Cloud.loginState?.();const code=card.querySelector('.pi-code');code.hidden=!(state==='wait'&&wait);
  if(wait){code.querySelector('span').textContent=T('验证码 / Code');code.querySelector('b').textContent=wait.userCode.replace(/(.{4})(?=.)/g,'$1-');}
  const cta=card.querySelector('.pi-actions .pi-cta');cta.setAttribute('aria-busy',String(busy));
  cta.querySelector('.pi-cta-text').textContent=busy?T('领取中… / Claiming…'):state==='wait'?T('重新打开登录页 / Open the page again'):state==='join'?T('注册并领取 / Sign up & claim'):T('立即免费领取 / Claim free Plus');
  set('.pi-later',state==='wait'?T('取消 / Cancel'):T('以后再说 / Not now'));
  set('.pi-done-title',T('Plus 已开通 / Plus is on'));
  const until=claimedUntil?new Date(claimedUntil).toLocaleDateString(document.documentElement.lang||undefined,{year:'numeric',month:'long',day:'numeric'}):'';
  set('.pi-done-text',T('Plus 体验有效期至 {date}，积分已到账。 / Enjoy Plus until {date}. Your credits are ready.').replaceAll('{date}',until));
  set('.pi-ok .pi-cta-text',T('好的 / Great'));
 }
 function show(){if(!card)build();paint();if(reduced())card.classList.add('shown');else requestAnimationFrame(()=>requestAnimationFrame(()=>card?.classList.add('shown')));}
 function hide(animate){
  clearTimeout(timer);clearTimeout(doneTimer);if(!busy)state='';
  const node=card;card=null;if(!node)return;
  if(!animate||reduced()){node.remove();return;}
  node.classList.remove('shown');node.classList.add('leaving');setTimeout(()=>node.remove(),260);
 }
 function dismiss(){if(state==='wait')Cloud.cancelLogin?.();remember({closedAt:Date.now()});state='';hide(true);}
 // "not now" while the sign-in waits: stop waiting and go back to the invite
 function notNow(){if(state==='wait'){Cloud.cancelLogin?.();state='join';paint();return;}dismiss();}
 async function act(){
  const error=card?.querySelector('.pi-error');if(!error||busy)return;error.hidden=true;
  if(state==='join'){try{const started=Cloud.login();state='wait';paint();await started;}catch(e){if(card){state='join';paint();error.textContent=e.message;error.hidden=false;}}return;}
  if(state==='wait'){Cloud.reopenLogin?.();return;}
  if(state!=='claim')return;
  busy=true;paint();
  try{
   const quota=await Cloud.claimTrial();
   claimedUntil=quota?.trial?.endsAt||Date.now()+trial.days*DAY;await remember({done:true});busy=false;
   if(card){state='done';paint();card.querySelector('.pi-ok')?.focus({preventScroll:true});doneTimer=setTimeout(()=>hide(true),7000);}else state='';
  }catch(e){
   busy=false;if(['trial_taken','trial_used','trial_member','trial_unavailable'].includes(e.code))await remember({done:true});
   if(!card){state='';return;}
   state='claim';paint();error.textContent=e.code==='trial_taken'?T('这台设备、浏览器或网络已经领取过 Plus 体验。 / This device, browser or network has already claimed a Plus trial.'):T('领取失败： / Could not claim it: ')+e.message;error.hidden=false;
  }
 }
 async function init(){
  try{saved=(await chrome.storage.local.get([KEY]))[KEY]||{};}catch{saved={};}
  loaded=true;decide();
 }
 // the account is known once the cloud module has answered once (signed out, or /api/me); listened to from the start so
 // the first answer is not missed
 if(typeof document!=='undefined'){
  document.addEventListener('imageprompt-cloud',()=>{known=true;decide();});
  document.addEventListener('imageprompt-language',()=>paint());
 }
 return {init,decide};
})();
if(typeof chrome!=='undefined'&&chrome.storage&&typeof document!=='undefined'&&document.body)PlusInvite.init();
