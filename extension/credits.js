/* Cloud credits badge: purple bolt + remaining credits, with the nearest expiry in small type.
   Cloud.status() stores {remaining, expiresAt, plan} in chrome.storage.local.cloudCredits; it is removed when signed out,
   and the badge is hidden then. Shown in the settings appearance bar and in the floating window header. */
globalThis.CreditsBadge=(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):splitBilingual(value)[0];
 let credits=null;
 // Monthly allowance + unexpired gift credits; the expiry shown is the nearest one that still has credits behind it.
 function fromQuota(q){
  if(!q)return null;
  // Purchased credits (credit packs) never expire, so they add to the total without an expiry date.
  const monthly=Math.max(0,q.monthly?.remaining||0),gift=q.bonus&&!q.bonus.expired?Math.max(0,q.bonus.remaining||0):0,bought=Math.max(0,q.purchased?.remaining||0);
  const dates=[gift&&q.bonus.expiresAt,monthly&&q.monthly.resetAt,q.plan!=='free'&&q.expiresAt].filter(value=>Number.isFinite(value)&&value>0);
  return {remaining:monthly+gift+bought,expiresAt:dates.length?Math.min(...dates):null,plan:q.plan||'free'};
 }
 const format=n=>n>=10000?(n/1000).toFixed(n>=100000?0:1).replace(/\.0$/,'')+'k':String(n);
 function paint(badge){
  badge.hidden=!credits;if(!credits)return;
  badge.querySelector('.credits-value').textContent=format(credits.remaining);
  const expiry=badge.querySelector('.credits-expiry');
  const date=credits.expiresAt?new Date(credits.expiresAt):null;
  expiry.textContent=date?(date.getMonth()+1)+'/'+date.getDate()+' '+T('到期 / expires'):'';expiry.hidden=!date;
  badge.title=T('积分 / Credits')+': '+credits.remaining+(date?' · '+T('到期 / Expires')+' '+date.toLocaleString():'')+' · '+credits.plan;
  badge.setAttribute('aria-label',badge.title);
 }
 function create(){
  const badge=document.createElement('span');badge.className='credits-badge';badge.setAttribute('role','button');badge.tabIndex=0;
  // Opens the credits window (sources, expiry, daily use, packs, Plus).
  const open=()=>globalThis.CreditsPanel?.toggle(badge);badge.addEventListener('click',open);badge.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});badge.hidden=true;
  badge.innerHTML='<svg class="credits-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6Z"/></svg><span class="credits-text"><b class="credits-value"></b><small class="credits-expiry"></small></span>';
  return badge;
 }
 // Mount next to the day/night switch wherever it exists (the settings bar is built by layout.js, the floating header by app.js).
 // The floating header has no room, so there the badge sits at the end of the History heading.
 function mount(){
  if(document.body.classList.contains('embedded')){const heading=document.querySelector('#historySection h2');if(heading&&!heading.querySelector('.credits-badge')){const badge=create();heading.append(badge);paint(badge);}return;}
  for(const toggle of document.querySelectorAll('.appearance-toggle')){
   if(toggle.previousElementSibling?.classList.contains('credits-badge'))continue;
   const badge=create();toggle.before(badge);paint(badge);
  }
 }
 function render(){for(const badge of document.querySelectorAll('.credits-badge'))paint(badge);}
 async function init(){
  try{credits=(await chrome.storage.local.get(['cloudCredits'])).cloudCredits||null;}catch{credits=null;}
  mount();
  new MutationObserver(()=>{if(document.body.classList.contains('embedded')?!document.querySelector('#historySection h2 .credits-badge'):[...document.querySelectorAll('.appearance-toggle')].some(t=>!t.previousElementSibling?.classList.contains('credits-badge')))mount();}).observe(document.body,{childList:true,subtree:true});
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.cloudCredits){credits=changes.cloudCredits.newValue||null;render();}});
  document.addEventListener?.('imageprompt-language',render);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 return {fromQuota,render};
})();
