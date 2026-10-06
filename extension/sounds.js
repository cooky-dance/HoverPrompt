// Interface sounds for the site and the extension (the same file is copied into extension/sounds.js). Tiny tones made
// with WebAudio — no audio files are loaded. On by default; turned off in Settings (site: localStorage
// "imageprompt-sounds" = "off"; extension: chrome.storage.local uiSounds = false, mirrored into localStorage).
//  - tap: a button, link, tab or menu item is clicked; toggle: a checkbox or switch; notice: a status message appears
//  - HPSound.play('success' | 'error' | …) for code that knows the outcome
// Quiet (≈ −24 dB), at most one sound per 70 ms, never for synthetic clicks, never before the first user gesture.
(()=>{
 if(globalThis.HPSound)return;
 const KEY='imageprompt-sounds';
 let enabled=true;try{enabled=localStorage.getItem(KEY)!=='off';}catch{}
 try{if(typeof chrome!=='undefined'&&chrome.storage?.local){chrome.storage.local.get(['uiSounds']).then(v=>{if(v.uiSounds===false)set(false,false);}).catch(()=>{});chrome.storage.onChanged?.addListener(c=>{if(c.uiSounds)set(c.uiSounds.newValue!==false,false);});}}catch{}
 let ctx=null,last=0,lastNotice=0;
 const audio=()=>{if(!ctx){const A=globalThis.AudioContext||globalThis.webkitAudioContext;if(!A)return null;ctx=new A();}if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx;};
 // one note: frequency glide f1→f2 over d seconds, wave type, volume, start offset
 function note(c,f1,f2,d,type='sine',vol=.06,at=0){
  const t=c.currentTime+at,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(f2,t+d);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(c.destination);o.start(t);o.stop(t+d+.02);
 }
 const SOUNDS={
  tap:c=>note(c,1150,820,.045,'sine',.045),
  toggle:c=>note(c,700,980,.06,'triangle',.05),
  untoggle:c=>note(c,880,560,.06,'triangle',.045),
  notice:c=>{note(c,880,880,.09,'sine',.04);note(c,1320,1320,.12,'sine',.035,.07);},
  success:c=>{note(c,660,660,.09,'triangle',.05);note(c,990,990,.16,'triangle',.05,.08);},
  error:c=>{note(c,240,170,.16,'triangle',.06);note(c,180,140,.14,'triangle',.05,.1);},
  open:c=>note(c,520,780,.07,'sine',.04),
  close:c=>note(c,780,520,.07,'sine',.035)
 };
 function play(name){
  if(!enabled||!SOUNDS[name])return;const now=performance.now();if(now-last<70)return;last=now;
  try{const c=audio();if(c)SOUNDS[name](c);}catch{}
 }
 function set(on,save=true){enabled=!!on;try{localStorage.setItem(KEY,on?'on':'off');}catch{}
  if(save){try{if(typeof chrome!=='undefined'&&chrome.storage?.local)chrome.storage.local.set({uiSounds:!!on});}catch{}}
  if(on)play('toggle');}
 globalThis.HPSound={play,set,get enabled(){return enabled;}};
 // clicks anywhere: what was clicked decides the sound (only real clicks)
 const TAP='button,a[href],[role=button],[role=tab],[role=menuitem],[role=option],[role=radio],summary,.swatch';
 document.addEventListener('click',event=>{
  if(!event.isTrusted)return;const t=event.target;if(!(t instanceof Element))return;
  const box=t.closest('input[type=checkbox],input[type=radio]');if(box){play(box.checked?'toggle':'untoggle');return;}
  const hit=t.closest(TAP);if(hit&&!hit.disabled&&hit.getAttribute('aria-disabled')!=='true')play('tap');
 },true);
 document.addEventListener('change',event=>{if(event.isTrusted&&event.target instanceof HTMLSelectElement)play('tap');},true);
 // status messages: a soft chime when text appears in a live region
 const seen=new WeakMap();
 const watch=()=>{try{new MutationObserver(list=>{for(const m of list){const node=m.target.nodeType===1?m.target:m.target.parentElement;const live=node?.closest?.('[role=status],[aria-live=polite],[role=alert]');if(!live)continue;const text=live.textContent.trim();if(text&&text!==seen.get(live)&&!live.hidden&&performance.now()-lastNotice>2500){seen.set(live,text);lastNotice=performance.now();play(live.getAttribute('role')==='alert'||/\b(bad|error|failed)\b/.test(live.className)?'error':'notice');}}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});}catch{}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
 // dialogs opening and closing
 document.addEventListener('toggle',event=>{if(event.target instanceof HTMLDialogElement||event.target?.popover!==undefined)play(event.newState==='open'?'open':'close');},true);
})();
