/* Library uploads: choose or drop up to 10 images; they show as a strip of thumbnails that can be reordered by dragging
   (or with Alt+Left/Right) and removed. With several images, "Generate" reverses each one as its own record; their order
   is also the reference order for one-click image generation. Loaded after app.js (uses its globals). */
globalThis.LibraryUpload=(()=>{
 const MAX=10,T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):String(value).split(' / ')[0];
 const $=id=>document.getElementById(id);
 let items=[],strip=null,dragIndex=-1;
 const images=()=>items.map(item=>item.dataUrl);
 function emit(){document.dispatchEvent(new CustomEvent('imageprompt-uploads',{detail:{count:items.length}}));}
 function sync(){
  // the first image stays the page's selected image, so single-image behaviour is unchanged
  if(items.length){selectedImage=items[0].dataUrl;currentId=null;currentTimingTask=null;$('taskTime').textContent='';delete $('taskTime').dataset.timingId;$('result').hidden=true;}
  $('preview').hidden=items.length!==1;if(items.length===1)$('preview').src=items[0].dataUrl;
  render();setBusy(false);emit();
  $('analyze').textContent=items.length>1?T('为 {n} 张图生成提示词 / Generate prompts for {n} images').replace(/\{n\}/g,items.length):T('生成提示词 / Generate');
 }
 async function add(files){
  const list=[...files].filter(file=>/^image\//.test(file.type));let skipped=Math.max(0,list.length-(MAX-items.length));
  for(const file of list.slice(0,Math.max(0,MAX-items.length))){
   if(file.size>10*1024*1024){skipped++;setStatus(T('图片超过 10 MB，已跳过 / An image over 10 MB was skipped'));continue;}
   try{const dataUrl=await imageToDataUrl(file);items.push({id:crypto.randomUUID(),name:file.name,dataUrl,original:await originalImageOf(file,dataUrl)});}catch(error){setStatus(error.message);}
  }
  sync();
  setStatus(skipped?T('最多 10 张，已跳过 {n} 张 / Up to 10 images; {n} skipped').replace(/\{n\}/g,skipped):T('已选择 {n} 张图片 / {n} images selected').replace(/\{n\}/g,items.length));
 }
 function move(from,to){if(to<0||to>=items.length||from===to)return;const [item]=items.splice(from,1);items.splice(to,0,item);sync();strip?.querySelectorAll('.upload-thumb')[to]?.focus();}
 function render(){
  if(!strip){strip=document.createElement('ol');strip.id='uploadStrip';strip.className='upload-strip';strip.setAttribute('aria-label',T('已选择的图片，可拖拽排序 / Selected images, drag to reorder'));$('dropzone').after(strip);}
  // the compact composer has no large preview: its strip shows from the first image (each with its number and ×)
  strip.hidden=items.length<(document.getElementById('imageSelection')?.classList.contains('compact')?1:2);strip.replaceChildren();
  items.forEach((item,index)=>{
   const li=document.createElement('li');li.className='upload-thumb';li.draggable=true;li.tabIndex=0;li.dataset.index=index;
   li.setAttribute('aria-label',T('第 {n} 张，Alt+方向键移动 / Image {n}, Alt+arrow keys to move').replace(/\{n\}/g,index+1));
   const img=document.createElement('img');img.src=item.dataUrl;img.alt='';
   const order=document.createElement('span');order.className='upload-order';order.textContent=String(index+1);
   const remove=document.createElement('button');remove.type='button';remove.className='upload-remove';remove.textContent='×';remove.setAttribute('aria-label',T('移除 / Remove'));remove.onclick=event=>{event.stopPropagation();items.splice(index,1);if(!items.length){selectedImage=null;$('preview').hidden=true;}sync();};
   li.append(img,order,remove);
   li.ondragstart=event=>{dragIndex=index;li.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index));};
   li.ondragend=()=>{li.classList.remove('dragging');dragIndex=-1;};
   li.ondragover=event=>{if(dragIndex<0)return;event.preventDefault();event.stopPropagation();li.classList.add('drop-target');};
   li.ondragleave=()=>li.classList.remove('drop-target');
   li.ondrop=event=>{if(dragIndex<0)return;event.preventDefault();event.stopPropagation();li.classList.remove('drop-target');move(dragIndex,index);};
   li.onkeydown=event=>{if(!event.altKey)return;const rtl=document.documentElement.dir==='rtl';if(event.key==='ArrowLeft'){event.preventDefault();move(index,index+(rtl?1:-1));}if(event.key==='ArrowRight'){event.preventDefault();move(index,index+(rtl?-1:1));}};
   strip.append(li);
  });
 }
 // Several images: one reverse task each (they run through the normal request queue and its concurrency).
 async function analyzeAll(){
  const focus=$('focus').value.trim(),list=[...items];
  await Promise.all(list.map(item=>analyze({id:RecordKinds.newId('reverse'),image:item.dataUrl,...(item.original?{originalImage:item.original}:{}),focus,createdAt:Date.now()})));
 }
 function init(){
  const input=$('file');input.multiple=true;
  input.onchange=async event=>{try{if(event.target.files.length){await add(event.target.files);event.target.value='';if(embedded&&items.length===1){document.getElementById('localUploadPane')?.removeAttribute('data-open');await analyze();}}}catch(error){setStatus(error.message);}};
  $('dropzone').ondrop=async event=>{event.preventDefault();$('dropzone').classList.remove('over');try{if(event.dataTransfer.files.length){event.stopPropagation();await add(event.dataTransfer.files);if(embedded&&items.length===1){document.getElementById('localUploadPane')?.removeAttribute('data-open');await analyze();}}}catch(error){setStatus(error.message);}};
  $('analyze').onclick=()=>items.length>1?analyzeAll():analyze();
  document.addEventListener('imageprompt-language',()=>{if(items.length)sync();});
 }
 return {init,images,count:()=>items.length,add,clear:()=>{items=[];sync();}};
})();
// Starts after every script has run (it needs app.js).
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>LibraryUpload.init(),{once:true});else LibraryUpload.init();
