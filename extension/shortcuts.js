/* Single-key shortcuts for the image under the mouse (web page, floating window, library cards).
   Ignored while typing and whenever Ctrl/Alt/Meta is held, so Ctrl+C and page hotkeys keep working. */
globalThis.ImagePromptShortcuts ||= (()=>{
 const ACTIONS=[
  ['copy','复制提示词 / Copy prompt','c'],
  ['expand','展开提示词 / Expand prompts','e'],
  ['reverse','运行或重试反推 / Run or retry reverse prompt','r'],
  ['generate','运行或重试生图 / Run or retry generate','g'],
  ['i2i','运行或重试图生图 / Run or retry image to image','i']];
 const DEFAULTS=Object.fromEntries(ACTIONS.map(([action,,key])=>[action,key]));
 let keys={...DEFAULTS},enabled=true;
 const normalize=key=>{const value=String(key||'');return value.length===1?value.toLowerCase():value;};
 function typing(event){const target=event.composedPath?.()[0]||event.target;return !!target&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName||''));}
 function action(event){
  if(!enabled||event.ctrlKey||event.metaKey||event.altKey||event.repeat||event.isComposing||typing(event))return null;
  const key=normalize(event.key);return Object.keys(keys).find(name=>keys[name]&&keys[name]===key)||null;
 }
 async function load(){try{const saved=await chrome.storage.local.get(['shortcuts','shortcutsEnabled']);keys={...DEFAULTS,...(saved.shortcuts||{})};enabled=saved.shortcutsEnabled!==false;}catch{}}
 chrome.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&(changes.shortcuts||changes.shortcutsEnabled))load();});
 load();
 return {ACTIONS,DEFAULTS,action,load,normalize,keys:()=>({...keys}),enabled:()=>enabled};
})();
