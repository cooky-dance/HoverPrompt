/* Settings pages: short fixed-choice dropdowns become single-choice capsules. The <select> stays in the DOM
   (visually hidden) and remains the source of truth, so existing load/save code keeps working; programmatic
   value changes, option changes and disabled state are mirrored onto the capsules. Long or dynamic lists, and the API
   page (kept as dropdowns on request), stay dropdowns. */
globalThis.PillSelect=(()=>{
 const KEEP=new Set(['uiLanguage','profileSelect','sourceSelect','modelList','genSourceSelect','agentCliMode','serviceMode']),MAX=8;
 const eligible=select=>select.id&&!KEEP.has(select.id)&&!select.multiple&&!select.dataset.pills&&select.closest('[data-settings-pane]:not([data-settings-pane="sources"])')&&select.options.length>1&&select.options.length<=MAX;
 function enhance(select){
  select.dataset.pills='1';select.classList.add('pill-source');select.tabIndex=-1;
  const group=document.createElement('div');group.className='pill-choice';group.setAttribute('role','radiogroup');group.dataset.for=select.id;
  const paint=()=>{for(const pill of group.children){const on=pill.dataset.value===select.value;pill.setAttribute('aria-checked',String(on));pill.tabIndex=on?0:-1;}};
  const choose=value=>{if(select.value===value)return;select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));};
  function build(){
   group.replaceChildren(...[...select.options].map(option=>{
    const pill=document.createElement('button');pill.type='button';pill.setAttribute('role','radio');pill.dataset.value=option.value;
    pill.textContent=option.text;pill.title=option.title||option.text;pill.disabled=select.disabled||option.disabled;pill.onclick=()=>choose(option.value);
    return pill;
   }));
   paint();
  }
  // Arrow keys move the choice, like a native radio group.
  group.addEventListener('keydown',event=>{
   const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];if(!step)return;event.preventDefault();
   const pills=[...group.children].filter(pill=>!pill.disabled),index=pills.findIndex(pill=>pill.dataset.value===select.value),next=pills[(index+step+pills.length)%pills.length];
   if(next){choose(next.dataset.value);next.focus();}
  });
  // value / selectedIndex set from code fire no events: mirror them on this element.
  for(const key of ['value','selectedIndex']){const native=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,key);Object.defineProperty(select,key,{configurable:true,get(){return native.get.call(this);},set(value){native.set.call(this,value);paint();}});}
  select.addEventListener('change',paint);
  new MutationObserver(build).observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','label']});
  select.after(group);build();
 }
 const scan=()=>{for(const select of document.querySelectorAll('[data-settings-pane] select'))if(eligible(select))enhance(select);};
 function init(){
  scan();let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});}).observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 return {scan};
})();
