globalThis.ImagePromptButtons ||= {
  // Sites without buttons: one domain per line (subdomains included); hoverprompt.com until the user changes the list.
  DEFAULT_BLOCKED:['hoverprompt.com'],
  domains(value){const list=Array.isArray(value)?value:String(value??'').split(/[\s,;]+/);
    return [...new Set(list.map(d=>String(d).trim().toLowerCase().replace(/^[a-z]+:\/\//,'').replace(/[\/?#:].*$/,'').replace(/^\*\.|^www\./,'').replace(/\.$/,'')).filter(d=>/^[a-z0-9.-]+\.[a-z0-9-]+$|^localhost$|^\d+\.\d+\.\d+\.\d+$/.test(d)))].slice(0,200);},
  siteBlocked(hostname,list){const h=String(hostname||'').toLowerCase().replace(/\.$/,'');return list.some(d=>h===d||h.endsWith('.'+d));},
  create(root, host, onSelect) {
    const records=new Map();let mode='all',pointer=null,frame=null,activated=false,requireActivation=false,extra={prompt:true,reverse:false,i2i:false},blocked=false;
    const anyButton=()=>extra.prompt||extra.reverse||extra.i2i;
    const css=document.createElement('style');
    css.textContent='.image-prompt-group{position:fixed;z-index:1;display:flex;gap:4px;pointer-events:none;max-width:calc(100vw - 16px)}.image-prompt-group[hidden]{display:none!important}.image-prompt-group .image-prompt-button{position:static}.image-prompt-group .image-prompt-button[hidden]{display:none!important}.image-prompt-button{position:fixed;z-index:1;padding:5px 10px;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;pointer-events:auto;max-width:calc(100vw - 16px)}.image-prompt-button[hidden]{display:none!important}#panel{z-index:2}';
    root.append(css);
    const schedule=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;render();});};
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){const record=records.get(entry.target);if(record)record.inView=entry.isIntersecting;}schedule();});
    const resize=new ResizeObserver(schedule);
    function scan() {
      const current=new Set(document.images);
      for(const [image,record] of records)if(!image.isConnected || !current.has(image)){observer.unobserve(image);resize.unobserve(image);record.button?.remove();records.delete(image);}
      for(const image of current)if(!records.has(image)){records.set(image,{image,button:null,inView:false});observer.observe(image);resize.observe(image);}
      schedule();
    }
    function visibleRect(image) {
      const rect=image.getBoundingClientRect(),style=getComputedStyle(image);
      // the image's own opacity is not checked: X shows the picture as a background and lays a transparent <img> over it
      if(style.display==='none' || style.visibility==='hidden' || rect.width<2 || rect.height<2)return null;
      let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(innerWidth,rect.right),bottom=Math.min(innerHeight,rect.bottom);
      for(let parent=image.parentElement;parent && parent!==document.documentElement;parent=parent.parentElement){
        const style=getComputedStyle(parent);
        if(style.visibility==='hidden' || Number(style.opacity)===0 || style.display==='none')return null;
        const bounds=parent.getBoundingClientRect();
        if(/hidden|clip|scroll|auto/.test(style.overflowX)){left=Math.max(left,bounds.left);right=Math.min(right,bounds.right);}
        if(/hidden|clip|scroll|auto/.test(style.overflowY)){top=Math.max(top,bounds.top);bottom=Math.min(bottom,bounds.bottom);}
      }
      return right-left>=2 && bottom-top>=2 ? {left,top,right,bottom}:null;
    }
    // One group per image: "提示词" (on unless turned off), "生图" and "图生图" when turned on in settings.
    function createButton(record) {
      const group=document.createElement('div');group.className='image-prompt-group';
      const make=(text,label,action)=>{const button=document.createElement('button');button.className='image-prompt-button';button.type='button';button.textContent=text;button.setAttribute('aria-label',label);button.dataset.action=action||'';
        button.onclick=event=>{event.preventDefault();event.stopPropagation();const src=record.image.currentSrc || record.image.src;if(src)onSelect(src,action);};return button;};
      group.append(make('提示词','分析此图片的提示词 / Analyze image'),make('生图','反推后文生图 / Reverse prompt, then generate','reverse-generate'),make('图生图','以此图为参考生图 / Image to image','image-to-image'));
      group.onpointerenter=()=>{record.onButton=true;schedule();};group.onpointerleave=()=>{record.onButton=false;schedule();};
      root.append(group);record.button=group;applyExtra(group);return group;
    }
    function applyExtra(group){group.querySelector('[data-action=""]').hidden=!extra.prompt;group.querySelector('[data-action="reverse-generate"]').hidden=!extra.reverse;group.querySelector('[data-action="image-to-image"]').hidden=!extra.i2i;}
    // An image under something else gets no button. At the button's corner and at the image's centre the page's layers
    // are read from the top down (elementsFromPoint): reaching the image first means it is visible there; another image,
    // video or canvas first (a carousel slide in front, a picture on top) means it is covered; so does an element with a
    // visible background (a dialog, a menu, a dimming mask) that is not part of the image's own card. Transparent
    // layers (links, hover masks, the transparent <img> X lays over its pictures) are looked through.
    const ownHost=host||root.host||null;
    const solid=node=>{const st=getComputedStyle(node);if(/url\(/.test(st.backgroundImage))return true;const m=/rgba?\(([^)]+)\)/.exec(st.backgroundColor);if(!m)return false;const parts=m[1].split(/[ ,\/]+/).filter(Boolean);const alpha=parts.length>3?parseFloat(parts[3]):1;return alpha>=0.15&&Number(st.opacity)>=0.15;};
    // the image's own card: up to three wrappers around it, each no more than about four times its size (never the page body)
    const ownCard=(node,image)=>{const own=image.getBoundingClientRect(),area=Math.max(1,own.width*own.height);let up=image.parentElement;
      for(let n=0;n<3&&up&&up!==document.body&&up!==document.documentElement;n++,up=up.parentElement){const r=up.getBoundingClientRect();if(r.width*r.height>area*4)break;if(up.contains(node))return !node.querySelector?.('img,video,canvas');}
      return false;};
    function coveredAt(image,x,y){
      for(const node of document.elementsFromPoint(x,y)){
        if(node===image)return false;
        if(node===ownHost||node.contains(image))continue;
        if(/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|svg)$/i.test(node.tagName))return true;
        if(ownCard(node,image))continue;
        if(solid(node))return true;
      }
      return false;
    }
    function hiddenUnder(image,rect,left,top){
      const points=[[left+14,top+12],[(rect.left+rect.right)/2,(rect.top+rect.bottom)/2]].filter(([x,y])=>x>=0&&y>=0&&x<innerWidth&&y<innerHeight);
      return points.length>0&&points.every(([x,y])=>coveredAt(image,x,y));
    }
    function render() {
      const panel=root.querySelector('#panel'),panelRect=panel?.style.display==='block'?panel.getBoundingClientRect():null;
      for(const record of records.values()) {
        const rect=record.inView&&ImagePromptFilter.eligible(record.image)?visibleRect(record.image):null;
        const underPointer=rect && pointer && pointer.x>=rect.left && pointer.x<=rect.right && pointer.y>=rect.top && pointer.y<=rect.bottom;
        const shown=!blocked && anyButton() && (!requireActivation || activated) && rect && (record.image.currentSrc || record.image.src) && (mode==='all' || underPointer || record.onButton);
        if(!shown){if(record.button)record.button.hidden=true;continue;}
        const button=record.button || createButton(record);
        const width=button.offsetWidth||64,left=Math.max(6,Math.min(innerWidth-width-8,rect.left+6)),top=Math.max(6,Math.min(innerHeight-32,rect.top+6));
        const covered=panelRect && left+width>panelRect.left && left<panelRect.right && top+28>panelRect.top && top<panelRect.bottom;
        button.hidden=!!covered||hiddenUnder(record.image,rect,left,top);button.style.left=left+'px';button.style.top=top+'px';
      }
    }
    let scanPending=false;
    const mutation=new MutationObserver(()=>{if(scanPending)return;scanPending=true;requestAnimationFrame(()=>{scanPending=false;scan();});});mutation.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','srcset','sizes','style','class','hidden','aria-label','data-test-id','data-ad-id','data-promoted','href']});
    document.addEventListener('pointermove',event=>{pointer={x:event.clientX,y:event.clientY};schedule();},true);
    document.addEventListener('pointerleave',()=>{pointer=null;schedule();});
    document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement)schedule();},true);
    addEventListener('scroll',schedule,true);addEventListener('resize',schedule);
    resize.observe(document.documentElement);if(document.body)resize.observe(document.body);
    setInterval(()=>{if(document.visibilityState==='visible')schedule();},250);
    const blockedBy=value=>ImagePromptButtons.siteBlocked(location.hostname,value===undefined?ImagePromptButtons.DEFAULT_BLOCKED:ImagePromptButtons.domains(value));
    chrome.storage?.local.get(['imageButtonMode','imageButtonsRequireActivation','imageButtonPrompt','imageButtonReverseGen','imageButtonImageToImage','imageButtonBlockedSites']).then(saved=>{mode=saved.imageButtonMode==='hover'?'hover':'all';requireActivation=saved.imageButtonsRequireActivation===true;extra={prompt:saved.imageButtonPrompt!==false,reverse:saved.imageButtonReverseGen===true,i2i:saved.imageButtonImageToImage===true};blocked=blockedBy(saved.imageButtonBlockedSites);for(const record of records.values())if(record.button)applyExtra(record.button);schedule();});
    chrome.storage?.onChanged?.addListener((changes,area)=>{if(area==='local'){if(changes.imageButtonMode)setMode(changes.imageButtonMode.newValue);if(changes.imageButtonsRequireActivation){requireActivation=changes.imageButtonsRequireActivation.newValue===true;schedule();}if(changes.imageButtonBlockedSites){blocked=blockedBy(changes.imageButtonBlockedSites.newValue);schedule();}if(changes.imageButtonPrompt||changes.imageButtonReverseGen||changes.imageButtonImageToImage){if(changes.imageButtonPrompt)extra.prompt=changes.imageButtonPrompt.newValue!==false;if(changes.imageButtonReverseGen)extra.reverse=changes.imageButtonReverseGen.newValue===true;if(changes.imageButtonImageToImage)extra.i2i=changes.imageButtonImageToImage.newValue===true;for(const record of records.values())if(record.button)applyExtra(record.button);schedule();}}});
    function setMode(value){mode=value==='hover'?'hover':'all';for(const record of records.values())record.onButton=false;schedule();}
    ImagePromptFilter.subscribe(schedule);
    // The eligible image under the pointer (for keyboard shortcuts), topmost-smallest wins for nested layouts.
    function hovered(){if(!pointer||blocked)return null;let best=null,area=Infinity;for(const record of records.values()){if(!record.inView||!ImagePromptFilter.eligible(record.image))continue;const rect=visibleRect(record.image);if(!rect||pointer.x<rect.left||pointer.x>rect.right||pointer.y<rect.top||pointer.y>rect.bottom)continue;const size=(rect.right-rect.left)*(rect.bottom-rect.top);if(size<area){area=size;best=record.image;}}return best;}
    scan();return {setMode,refresh:schedule,activate(){activated=true;schedule();},hovered};
  }
};
