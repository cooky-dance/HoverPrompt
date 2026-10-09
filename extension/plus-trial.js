/* The free Plus trial, shared by the invite card (plus-invite.js) and the credits window (credits-panel.js); the same
   design as the website's (hoverprompt.com public/plus-trial.js).
   - PlusTrial.claim(button): Cloud.claimTrial with a press-and-burst on the button, a spinner while it runs and a readable
     error (error.friendly) when it fails; the button is restored either way. The chime is the button's own
     (data-sound="claim", played by sounds.js for the click); a short sparkle follows a successful claim.
   - PlusTrial.success(quota,offer): the centred "trial membership activated" window. The end date and the benefits are the
     claim's answer (the account's quota: trial.endsAt, monthly credits, the number of synced images) and the offer's
     days — nothing hard-coded. Cloud storage size is not shown (the sync benefit is told as a number of images only). "Reverse now" opens pinterest.com in a new tab (the extension is already here, so no download);
     "See community shares" opens hoverprompt.com/community. ×, Esc and the backdrop close it. */
globalThis.PlusTrial=(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):String(value).split(' / ')[0];
 const DAY=86400000,PINTEREST='https://pinterest.com/',COMMUNITY='https://hoverprompt.com/community';
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const sound=name=>{try{globalThis.HPSound?.play(name);}catch{}};
 const locale=()=>document.documentElement.lang||navigator.language||'en';
 const STAR='M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z';
 const PIN='M12 2a10 10 0 0 0-3.64 19.31c-.09-.79-.17-2 .03-2.86l1.18-5s-.3-.6-.3-1.49c0-1.39.81-2.43 1.82-2.43.86 0 1.27.64 1.27 1.41 0 .86-.55 2.15-.83 3.34-.24 1 .5 1.81 1.48 1.81 1.78 0 3.15-1.88 3.15-4.59 0-2.4-1.72-4.08-4.19-4.08-2.85 0-4.53 2.14-4.53 4.36 0 .86.33 1.79.75 2.29a.3.3 0 0 1 .07.29l-.28 1.13c-.04.18-.15.22-.34.13-1.25-.58-2.03-2.41-2.03-3.88 0-3.16 2.3-6.06 6.62-6.06 3.47 0 6.17 2.47 6.17 5.78 0 3.45-2.18 6.23-5.2 6.23-1.01 0-1.97-.53-2.29-1.15l-.62 2.38c-.23.87-.84 1.96-1.25 2.62A10 10 0 1 0 12 2z';
 const svg=(cls,path)=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
 function message(e){
  const code=e?.code;
  if(code==='trial_taken')return T('这台设备、浏览器或网络已经领取过 Plus 体验。 / This device, browser or network has already claimed a Plus trial.');
  if(code==='trial_used')return T('这个账户已经用过 Plus 体验了。 / This account has already used its Plus trial.');
  if(code==='trial_member')return T('你已经是 Plus 会员了。 / You are already a Plus member.');
  if(code==='trial_unavailable')return T('暂时无法领取 Plus 体验。 / The Plus trial is not available right now.');
  if(e?.status===401)return T('请重新登录。 / Please sign in again.');
  if(e?.status===429)return T('操作太频繁，请稍后再试。 / Too many tries. Wait a minute and try again.');
  if(!e?.status)return T('网络异常，请检查网络后重试。 / Network problem. Check your connection and try again.');
  return T('领取失败： / Could not claim it: ')+(e?.message||'');
 }
 function burst(button){
  if(reduced())return;button.classList.remove('pt-press');void button.offsetWidth;button.classList.add('pt-press');
  const pop=el('span','pt-pop');pop.setAttribute('aria-hidden','true');for(let i=0;i<8;i++)pop.append(el('i'));button.append(pop);setTimeout(()=>pop.remove(),900);
 }
 async function claim(button){
  if(button){burst(button);button.disabled=true;button.setAttribute('aria-busy','true');button.classList.add('pt-claiming');const spin=el('span','pt-spin');spin.setAttribute('aria-hidden','true');button.prepend(spin);}
  try{const quota=await Cloud.claimTrial();sound('celebrate');return quota;}
  catch(e){e.friendly=message(e);sound('error');throw e;}
  finally{if(button){button.disabled=false;button.removeAttribute('aria-busy');button.classList.remove('pt-claiming');button.querySelector(':scope > .pt-spin')?.remove();}}
 }
 const number=v=>new Intl.NumberFormat(locale()).format(v);
 function perks(quota,offer){
  const q=quota||{},list=[],endsAt=Number(q.trial?.endsAt||q.expiresAt)||0;
  const days=Number(offer?.days)||(endsAt?Math.max(1,Math.round((endsAt-Date.now())/DAY)):0);
  if(days)list.push(['days',number(days),T('天 Plus 会员 / days of Plus')]);
  const credits=Number.isFinite(q.monthly?.remaining)?q.monthly.remaining:Number(offer?.credits);if(Number.isFinite(credits)&&credits>0)list.push(['credits',number(credits),T('云端积分 / cloud credits')]);
  if(Number(q.sync?.limit)>0)list.push(['sync',number(q.sync.limit),T('张图片云同步 / images synced to the cloud')]);
  return list;
 }
 const ends=quota=>{const at=Number(quota?.trial?.endsAt||quota?.expiresAt);return at?new Intl.DateTimeFormat(locale(),{dateStyle:'long',timeStyle:'short'}).format(new Date(at)):'';};
 let open=null;
 function success(quota,offer){
  open?.close();
  const dialog=el('dialog','pt-success');dialog.id='plusTrialSuccess';dialog.setAttribute('aria-labelledby','ptSuccessTitle');dialog.setAttribute('aria-describedby','ptSuccessUntil');
  const frame=el('div','pt-frame'),card=el('div','pt-card');
  const sweep=el('span','pt-sweep');sweep.setAttribute('aria-hidden','true');
  const fly=el('span','pt-fly');fly.setAttribute('aria-hidden','true');
  const N=28;for(let i=0;i<N;i++){const s=el('i');const ring=i%3;s.style.setProperty('--a',(i*(360/N)+ring*7)+'deg');s.style.setProperty('--r',(110+ring*60+(i*37%40))+'px');s.style.setProperty('--s',(7+(i*13%9))+'px');s.style.setProperty('--t',(ring*.07+(i%4)*.03)+'s');s.style.setProperty('--o',String(1-ring*.22));fly.append(s);}
  const twinkle=el('span','pt-twinkle');twinkle.setAttribute('aria-hidden','true');for(let i=0;i<9;i++)twinkle.append(el('i'));
  const close=el('button','pt-x');close.type='button';close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';close.title=T('关闭 / Close');close.setAttribute('aria-label',close.title);close.onclick=()=>dialog.close();
  const medal=el('span','pt-medal');medal.setAttribute('aria-hidden','true');medal.innerHTML=svg('pt-medal-star',STAR);
  const title=el('h2','pt-title',T('已开通试用版会员 / Trial membership activated'));title.id='ptSuccessTitle';
  const until=el('p','pt-until');until.id='ptSuccessUntil';const end=Number(quota?.trial?.endsAt||quota?.expiresAt);
  if(end){const time=el('time','',ends(quota));time.dateTime=new Date(end).toISOString();until.append(T('会员有效期至 / Plus is yours until')+' ',time);}else until.hidden=true;
  const list=el('ul','pt-perks');list.setAttribute('aria-label',T('试用权益 / Included in your trial'));
  for(const [kind,value,label] of perks(quota,offer)){const li=el('li','pt-perk');li.dataset.kind=kind;li.append(el('b','',value),el('span','',label));list.append(li);}
  const actions=el('div','pt-actions');
  const reverse=el('button','pt-go');reverse.type='button';reverse.innerHTML=svg('pt-pin',PIN);reverse.append(el('span','',T('立即反推 / Reverse now')));reverse.title=T('在新标签页打开 Pinterest / Opens Pinterest in a new tab');
  reverse.onclick=()=>{window.open(PINTEREST,'_blank','noopener');};
  const community=el('a','pt-more',T('去看看社区分享 / See community shares'));community.href=COMMUNITY;community.target='_blank';community.rel='noopener';
  actions.append(reverse,community);
  card.append(sweep,twinkle,close,medal,title,until,list,actions);frame.append(card,fly);dialog.append(frame);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{open=null;if(reduced())dialog.remove();else{dialog.classList.add('pt-out');setTimeout(()=>dialog.remove(),220);}});
  document.body.append(dialog);open=dialog;dialog.showModal();reverse.focus({preventScroll:true});
  requestAnimationFrame(()=>dialog.classList.add('pt-in'));
  return dialog;
 }
 return {claim,success,perks,message,PINTEREST,COMMUNITY};
})();
