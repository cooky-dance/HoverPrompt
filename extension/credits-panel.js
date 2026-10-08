/* Credits window: a compact centred dialog opened from the credits badge (settings top bar, floating window) and as the
   paywall when cloud credits run out. Credits by source with expiry, 14-day use, credit packs and sync packs that open
   Stripe checkout directly, and Plus. Prices come from /api/pricing (the Stripe prices checkout will charge). */
globalThis.CreditsPanel=(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):splitBilingual(value)[0];
 const bolt='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6Z"/></svg>';
 const cloudIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.34 9.1 4.5 4.5 0 0 0 7 18Z"/></svg>';
 let root=null,reason='',usage=null,pricing=null,returnFocus=null;
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 const date=value=>new Date(value).toLocaleDateString(document.documentElement.lang||undefined,{month:'numeric',day:'numeric'});
 const ZERO_DECIMAL=new Set(['JPY','KRW','VND','CLP','ISK','UGX','XAF','XOF']);
 const money=price=>price?new Intl.NumberFormat(document.documentElement.lang||undefined,{style:'currency',currency:price.currency,maximumFractionDigits:ZERO_DECIMAL.has(price.currency)?0:2}).format(ZERO_DECIMAL.has(price.currency)?price.amount:price.amount/100):'';
 const AVATARS=Array.from({length:16},(_,i)=>'avatar-'+String(i+1).padStart(2,'0'));
 const hash=text=>[...String(text)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7);
 function close(){if(!root)return;root.remove();root=null;document.removeEventListener('keydown',keys,true);removeEventListener('focus',refresh);returnFocus?.focus?.();returnFocus=null;}
 function keys(event){
  if(event.key==='Escape'){event.preventDefault();close();return;}
  // keep Tab inside the dialog
  if(event.key!=='Tab'||!root)return;const items=[...root.querySelectorAll('button:not(:disabled)')];if(!items.length)return;
  const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 function openAccount(){close();if(globalThis.SettingsLayout)SettingsLayout.navigate('account');else chrome.runtime.openOptionsPage?.();}
 async function openWeb(path){const base=Cloud.base?.()||'';const lang=(await chrome.storage.local.get(['uiLanguage'])).uiLanguage||'';await chrome.tabs.create({url:base+path+(lang?(path.includes('?')?'&':'?')+'lang='+encodeURIComponent(lang):'')});}
 function source(label,value,note,tone){const row=el('div','cp-source');row.dataset.tone=tone;row.append(el('span','cp-dot'),el('span','cp-label',T(label)),el('b','',value),el('small','',note));return row;}
 function chart(days){
  const box=el('div','cp-chart'),max=Math.max(1,...days.map(day=>day.total));
  for(const day of days){const bar=el('div','cp-bar');bar.title=day.date+' · '+day.total;for(const part of ['monthly','bonus','purchased']){if(!day[part])continue;const seg=el('i');seg.dataset.tone=part;seg.style.height=(day[part]/max*100)+'%';bar.append(seg);}box.append(bar);}
  return box;
 }
 // pack sizes on sale (from the price list, else the account), smallest first
 function sizes(kind,account){const list=Object.keys(pricing?.packs?.[kind]||account?.packs?.[kind]||{}).sort((a,b)=>a-b);return list.length?list:kind==='credits'?['250','600','2000']:['500','2000'];}
 // One pack button: size, unit, price and validity; clicking opens the payment page in a new tab.
 function pack(kind,size,account){
  const info=pricing?.packs?.[kind]?.[size],onSale=info?info.onSale:account.packs?.[kind]?.[size]===true,days=pricing?.syncPackDays;
  const b=el('button','cp-pack'+(kind==='sync'?' sync':''));b.type='button';b.dataset.kind=kind;b.dataset.pack=size;b.disabled=!onSale;
  b.innerHTML='<span class="cp-pack-top"><span class="cp-pack-icon"></span><b></b></span><small class="cp-pack-unit"></small><strong class="cp-pack-price"></strong><small class="cp-pack-valid"></small>';
  b.querySelector('.cp-pack-icon').innerHTML=kind==='credits'?bolt:cloudIcon;b.querySelector('b').textContent='+'+size;
  b.querySelector('.cp-pack-unit').textContent=kind==='credits'?T('积分 / credits'):T('条同步记录 / sync records');
  b.querySelector('.cp-pack-price').textContent=onSale?(money(info?.price)||T('购买 / Buy')):T('暂未开放 / Not on sale yet');
  b.querySelector('.cp-pack-valid').textContent=kind==='credits'?T('永久有效 / Never expire'):days?T('{n} 个月有效 / Valid {n} months').replace(/\{n\}/g,Math.round(days/30.4)):T('永久有效 / Never expire');
  if(kind==='credits'&&size===sizes('credits',account).at(-1)){const tag=el('em','',T('最划算 / Best value'));b.append(tag);}
  // payments paused on the server (e.g. while the store awaits approval): prices show, a click explains instead of failing
  b.onclick=async()=>{if(pricing?.salesPaused){status(T('在线支付正在开通中，很快就能购买 / Online payment is being activated and will open shortly'));return;}b.disabled=true;b.classList.add('busy');try{await Cloud.buyPack(size,kind);addEventListener('focus',refresh);}catch(error){status(error.message);}finally{b.disabled=!onSale;b.classList.remove('busy');}};
  return b;
 }
 const status=message=>{const node=root?.querySelector('.cp-status');if(node)node.textContent=message||'';};
 async function refresh(){if(!root||!Cloud.signedIn?.())return;try{await Cloud.status();}catch{}render();}
 function render(){
  if(!root)return;
  const account=Cloud.account?.(),dialog=root.querySelector('.credits-panel');dialog.replaceChildren();
  const closeButton=el('button','cp-close','×');closeButton.type='button';closeButton.setAttribute('aria-label',T('关闭 / Close'));closeButton.onclick=close;
  if(!account){
   const head=el('div','cp-head');head.append(el('strong','cp-title',T('云端积分 / Cloud credits')),closeButton);
   const go=el('button','cp-primary',T('前往登录 / Sign in'));go.type='button';go.onclick=openAccount;
   dialog.append(head,el('p','cp-hint',T('登录云端账号后可以查看和购买积分。 / Sign in to your cloud account to see and buy credits.')),go);return;
  }
  const {user,quota:q}=account,credits=globalThis.CreditsBadge?.fromQuota(q),plan=q.plan==='pro'&&!q.trial?'pro':'free',sync=q.sync||{used:0,limit:0,lots:[]};
  // header: who, plan, total credits
  const head=el('div','cp-head');const who=el('div','cp-who');const img=el('img','cp-avatar');img.alt='';img.src='avatars/'+(user.avatar||AVATARS[hash(user.id)%16])+'.svg';
  const id=el('div','cp-id');id.append(el('strong','',user.name||user.email),el('span','',user.email));who.append(img,id,el('span','plan-badge '+(q.trial?'pro':plan),q.trial?T('Plus 体验 / Plus trial'):plan==='pro'?'PLUS':'FREE'));
  const total=el('div','cp-total');total.innerHTML='<span class="cp-bolt">'+bolt+'</span><b></b><small></small>';total.querySelector('b').textContent=credits?.remaining??0;total.querySelector('small').textContent=T('剩余积分 / credits left');
  head.append(who,total,closeButton);dialog.append(head);
  if(reason==='quota'){const alert=el('div','cp-alert');alert.append(el('strong','',T('云端积分已用完 / Cloud credits are used up')),el('span','',T('购买积分包或开通 Plus 继续使用；也可以切换到本地模式，用自己的 API 或本机模型。 / Buy a pack or upgrade to Plus to continue, or switch to local mode with your own API or local model.')));dialog.append(alert);}
  // credits by source | 14-day use
  const grid=el('div','cp-grid');
  const sources=el('div','cp-card cp-sources');sources.append(el('h3','',T('积分来源 / Credit sources')));
  sources.append(source('本月额度 / Monthly',q.monthly.remaining+'/'+q.monthly.limit,T('重置 / Resets')+' '+date(q.monthly.resetAt),'monthly'));
  if(q.bonus.granted)sources.append(source('安装赠送 / Install gift',q.bonus.remaining+'/'+q.bonus.granted,q.bonus.expired?T('已过期 / Expired'):T('到期 / Expires')+' '+date(q.bonus.expiresAt),'bonus'));
  else if(pricing?.installGift){const row=source('安装赠送 / Install gift','—',T('尚未领取 / Not claimed'),'bonus');const claim=el('button','cp-link',T('领取 / Claim'));claim.type='button';claim.onclick=()=>{claim.disabled=true;document.getElementById('claimGift')?.click();setTimeout(refresh,1500);};row.append(claim);sources.append(row);}
  sources.append(source('购买的积分 / Purchased',String(q.purchased?.remaining||0),T('永久有效 / Never expire'),'purchased'));
  const use=el('div','cp-card cp-usage');const days=usage?.days||[];const uh=el('div','cp-card-head');uh.append(el('h3','',T('最近 14 天消耗 / Last 14 days')),el('span','',T('今天 / Today')+' '+(days.at(-1)?.total||0)+' · '+T('合计 / Total')+' '+days.reduce((a,d)=>a+d.total,0)));
  use.append(uh,days.length?chart(days):el('p','cp-hint',T('加载中… / Loading…')));
  const legend=el('div','cp-legend');for(const [tone,label] of [['monthly','本月额度 / Monthly'],['bonus','安装赠送 / Install gift'],['purchased','购买的积分 / Purchased']]){const item=el('span','',T(label));item.dataset.tone=tone;legend.append(item);}use.append(legend);
  grid.append(sources,use);dialog.append(grid);
  // packs: credits and sync side by side in one card
  const packs=el('div','cp-card cp-packs');
  const creditHead=el('div','cp-card-head');creditHead.append(el('h3','',T('积分包 / Credit packs')),el('span','',T('月额度用完后使用 / Used after the monthly allowance')));
  const creditRow=el('div','cp-pack-row');for(const size of sizes('credits',account))creditRow.append(pack('credits',size,account));
  const syncHead=el('div','cp-card-head');const lot=sync.lots?.find(l=>l.expiresAt);
  syncHead.append(el('h3','',T('同步加量包 / Sync packs')),el('span','',T('云同步 / Cloud sync')+' '+sync.used+'/'+sync.limit+(lot?' · '+T('加量包到期 / Pack expires')+' '+date(lot.expiresAt):'')));
  const syncRow=el('div','cp-pack-row');for(const size of sizes('sync',account))syncRow.append(pack('sync',size,account));
  // "By purchasing you agree…": the same terms as the website's buy buttons
  const agree=el('p','cp-agree');const [lead,terms,mid,refund,tail]=T('购买即表示同意|服务条款|和|退款政策|。 / By purchasing, you agree to the |Terms of Service| and |Refund Policy|.').split('|');
  for(const [text,href] of [[lead],[terms,'https://hoverprompt.com/terms'],[mid],[refund,'https://hoverprompt.com/refund'],[tail]]){if(!href){agree.append(text||'');continue;}const a=el('a','',text);a.href=href;a.target='_blank';a.rel='noopener';agree.append(a);}
  packs.append(creditHead,creditRow,syncHead,syncRow,agree);dialog.append(packs);
  // Plus
  if(plan!=='pro'){
   const pro=el('div','cp-pro');const text=el('div');text.append(el('strong','','Plus'),el('span','',T('每月 600 次云端反推 · 云同步 300 条 · 1 GB 空间 / 600 analyses a month · 300 synced records · 1 GB')));
   const price=pricing?.pro?.price;if(price)text.append(el('b','cp-pro-price',money(price)+' '+T('每月 / per month')));
   const onSale=pricing?pricing.pro.onSale:!!account.billing?.pro;
   const up=el('button','cp-primary',onSale?T('开通 Plus / Get Plus'):T('查看方案 / See plans'));up.type='button';up.onclick=()=>openWeb('/pricing');
   if(q.trial)text.append(el('span','cp-trial',T('Plus 体验至 / Plus trial until')+' '+date(q.trial.endsAt)));
   pro.append(text);
   // the 7-day Plus trial, claimed here once (per account, device, browser and network)
   if(account.trialOffer){const t=el('button','cp-secondary',T('免费试用 '+account.trialOffer.days+' 天 / Try free for '+account.trialOffer.days+' days'));t.type='button';t.title=T('含 '+account.trialOffer.credits+' 积分，无需绑卡 / '+account.trialOffer.credits+' credits, no card');
    t.onclick=async()=>{t.disabled=true;try{await Cloud.claimTrial();status(T('Plus 体验已开通 / Plus trial started'));render();}catch(error){status(error.message);t.disabled=false;}};pro.append(t);}
   pro.append(up);dialog.append(pro);
  }else dialog.append(el('p','cp-hint',T('Plus 有效期至 / Plus until')+' '+(q.expiresAt?new Date(q.expiresAt).toLocaleDateString():'—')));
  const foot=el('div','cp-foot');const status_=el('span','cp-status');status_.setAttribute('role','status');
  const plans=el('button','cp-link',T('查看全部方案 / Compare plans'));plans.type='button';plans.onclick=()=>openWeb('/pricing');
  const manage=el('button','cp-link',T('账号与同步设置 / Account & sync'));manage.type='button';manage.onclick=openAccount;
  foot.append(status_,plans,manage);dialog.append(foot);
 }
 async function open(options={}){
  close();reason=options.reason||'';returnFocus=options.anchor||document.activeElement;
  root=el('div','credits-overlay'+(reason==='quota'?' paywall':''));root.addEventListener('pointerdown',event=>{if(event.target===root)close();});
  const dialog=el('div','credits-panel');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label',T('云端积分 / Cloud credits'));
  root.append(dialog);document.body.append(root);document.addEventListener('keydown',keys,true);
  render();root.querySelector('.cp-close')?.focus();
  if(Cloud.signedIn?.()){
   const [,u,p]=await Promise.allSettled([Cloud.status(),usage?Promise.resolve(usage):Cloud.usage(14),pricing?Promise.resolve(pricing):Cloud.pricing()]);
   usage=u.status==='fulfilled'?u.value:{days:[]};if(p.status==='fulfilled')pricing=p.value;render();
   Cloud.usage(14).then(value=>{usage=value;render();}).catch(()=>{});
  }
 }
 const toggle=anchorElement=>root?close():open({anchor:anchorElement});
 document.addEventListener('imageprompt-cloud',()=>render());document.addEventListener('imageprompt-language',()=>render());
 return {open,close,toggle};
})();
