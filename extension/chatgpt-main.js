// Runs in chatgpt.com's own JavaScript world (manifest "world": "MAIN") so ProseMirror sees ordinary editing commands.
// The isolated worker asks for a write with a DOM event (detail is a JSON string, which crosses worlds intact) and gets the outcome back the same way; nothing else is exposed.
(()=>{
 if(document.documentElement.hasAttribute('data-imageprompt-composer'))return;document.documentElement.setAttribute('data-imageprompt-composer','1');
 const tidy=text=>String(text||'').replace(/ /g,' ').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').trim();
 const flat=text=>tidy(text).replace(/\s+/g,'');
 function composer(){
  const boxes=[...document.querySelectorAll('#prompt-textarea[contenteditable="true"],[contenteditable="true"][role="textbox"]')];
  return boxes.find(box=>box.closest('form'))||boxes.find(box=>box.id==='prompt-textarea')||boxes[0]||document.querySelector('textarea#prompt-textarea,textarea[name="prompt-textarea"]');
 }
 const current=box=>box.tagName==='TEXTAREA'?box.value:[...box.children].filter(n=>n.matches('p,div')&&n.getAttribute('aria-hidden')!=='true').map(n=>n.textContent||'').join('\n')||box.innerText||'';
 function write(value){
  let box=composer();if(!box)return false;if(flat(current(box))===flat(value))return true;
  box.focus();
  if(box.tagName==='TEXTAREA'){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,value);box.dispatchEvent(new Event('input',{bubbles:true}));return flat(box.value)===flat(value);}
  const range=document.createRange();range.selectNodeContents(box);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  document.execCommand('delete');
  // one insert per line with explicit breaks: a single insertText with "\n" collapses lines in ProseMirror
  const lines=tidy(value).split('\n');lines.forEach((line,i)=>{if(line)document.execCommand('insertText',false,line);if(i<lines.length-1)document.execCommand('insertLineBreak')||document.execCommand('insertParagraph');});
  box=composer()||box;
  if(flat(current(box))!==flat(value)){box.replaceChildren(document.createTextNode(value));box.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));}
  return flat(current(composer()||box))===flat(value);
 }
 // Typing at the end without replacing anything (e.g. " @ip-ref-…" so ChatGPT opens its file list).
 function append(value){
  const box=composer();if(!box)return false;box.focus();
  if(box.tagName==='TEXTAREA'){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,box.value+value);box.dispatchEvent(new Event('input',{bubbles:true}));return true;}
  const range=document.createRange();range.selectNodeContents(box);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  return document.execCommand('insertText',false,value);
 }
 document.addEventListener('imageprompt:composer-append',event=>{let detail=null;try{detail=JSON.parse(event.detail);}catch{}if(!detail||typeof detail.requestId!=='string'||typeof detail.value!=='string'||detail.value.length>1000)return;
  let ok=false;try{ok=append(detail.value);}catch{}
  document.dispatchEvent(new CustomEvent('imageprompt:composer-written',{detail:JSON.stringify({requestId:detail.requestId,ok})}));});
 document.addEventListener('imageprompt:composer-write',event=>{let detail=null;try{detail=JSON.parse(event.detail);}catch{}if(!detail||typeof detail.requestId!=='string'||typeof detail.value!=='string'||detail.value.length>200000)return;
  let ok=false;try{ok=write(detail.value);}catch{}
  document.dispatchEvent(new CustomEvent('imageprompt:composer-written',{detail:JSON.stringify({requestId:detail.requestId,ok})}));});
})();
