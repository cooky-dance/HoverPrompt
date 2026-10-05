// Shared eligibility for automatic webpage discovery and image buttons.
globalThis.ImagePromptFilter ||= (() => {
  const defaults={enabled:true,minSize:120,pinterest:true};
  let config={...defaults};const listeners=new Set();
  function normalize(value={}) {
    const size=Number(value?.minSize);
    return {enabled:value?.enabled!==false,minSize:Number.isFinite(size)&&size>=16?Math.min(2000,Math.round(size)):120,pinterest:value?.pinterest!==false};
  }
  function configure(value){config=normalize(value);for(const listener of listeners)listener();return {...config};}
  function classify(image){
    if(!config.pinterest||!/(^|\.)pinterest\.(com(?:\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2,3})$/i.test(location.hostname))return {allowed:true};
    const label=[image.alt,image.getAttribute('aria-label'),image.getAttribute('data-test-id')].filter(Boolean).join(' '),url=image.currentSrc||image.src;
    if(/\.svg(?:[?#]|$)|\/favicon|\/user(?:s)?\//i.test(url)||/\b(avatar|profile (?:photo|picture)|favicon|logo|icon)\b|头像|图标|站点标志/i.test(label)||image.closest('header,nav,[role="navigation"],[role="banner"],button'))return {allowed:false,reason:'pinterest-icon'};
    let pinRoot=null;for(let node=image.parentElement;node&&node!==document.body;node=node.parentElement){
      const test=node.getAttribute('data-test-id')||'';
      if(/board[-_ ]?(card|cover|preview|thumbnail|carousel)|boardHeader/i.test(test))return {allowed:false,reason:'pinterest-board-cover'};
      if(node.hasAttribute('data-ad-id')||node.getAttribute('data-promoted')==='true'||/(^|[-_])(ad|ads|promoted|sponsored)([-_]|$)/i.test(test))return {allowed:false,reason:'pinterest-ad'};
      if(!pinRoot&&/^(pin|pinWrapper|pin-wrapper|pin-card|pin-visual-wrapper|pin-closeup-image)$/i.test(test))pinRoot=node;
    }
    const link=image.closest('a[href]');let pinLink=false;if(link){try{pinLink=/^\/pin\/\d+(?:\/|$)/.test(new URL(link.href,location.href).pathname);}catch{}}
    const closeup=!!image.closest('[data-test-id="pin-closeup-image"],[data-test-id="closeup-image"],[data-test-id="pin-visual-wrapper"],[data-test-id="pin-image"]');
    if(!pinLink&&!pinRoot&&!closeup)return {allowed:false,reason:'pinterest-not-pin'};
    // The image wrapper can be narrower than the sponsor footer. Inspect the whole
    // single Pin card, never the feed container shared with neighboring organic Pins.
    const group=image.closest('[role="group"][aria-label]');
    const root=image.closest('[data-test-id="pin"],[data-test-id="pin-card"],[data-test-id="pinWrapper"],[data-test-id="pin-wrapper"]')||(/Pin.*(?:card|卡片|カード)|ピン.*カード/i.test(group?.getAttribute('aria-label')||'')?group:null)||pinRoot||link?.parentElement;
    if(root){
      const sponsor=/^(?:promoted(?: pin)?|sponsored(?: pin| by .+)?|advertisement|广告|推广|赞助(?:的\s*Pin\s*图)?|廣告|贊助(?:的\s*Pin\s*圖)?|広告|プロモーション|スポンサー|광고|스폰서|реклама|спонсорство|sponsorisé|gesponsert|إعلان|प्रायोजित)$/i;
      const footer=root.querySelector('[data-test-id="pinrep-footer"]')||root;
      if([...footer.querySelectorAll('div,span,a,[aria-label]')].some(node=>{
        const label=(node.getAttribute('aria-label')||'').trim();
        const text=node.childElementCount===0?(node.textContent||'').trim():'';
        return sponsor.test(label)||sponsor.test(text)||/赞助的\s*Pin\s*图|贊助的\s*Pin\s*圖|\bsponsored pin\b/i.test(label);
      }))return {allowed:false,reason:'pinterest-ad'};
      if([...root.querySelectorAll('a[href]')].some(anchor=>{try{const u=new URL(anchor.href,location.href),medium=u.searchParams.get('utm_medium')||'',source=u.searchParams.get('utm_source')||'';return /pinterest/i.test(source)&&/^(?:paid[ _-]?social|paid|cpc|ppc)$/i.test(medium);}catch{return false;}}))return {allowed:false,reason:'pinterest-ad'};
    }

    if(root){const pins=new Set([...root.querySelectorAll('a[href*="/pin/"]')].map(anchor=>anchor.getAttribute('href')));const cell=pins.size>1?link:root;
      if(cell&&([...cell.querySelectorAll('[data-test-id],[data-ad-id],[data-promoted]')].some(node=>node.hasAttribute('data-ad-id')||node.getAttribute('data-promoted')==='true'||/(^|[-_])(ad|ads|promoted|sponsored)([-_]|$)/i.test(node.getAttribute('data-test-id')||''))||[...cell.querySelectorAll('span,[aria-label]')].some(node=>/^(promoted|sponsored(?: by .+)?|advertisement|广告|推广|赞助|广告内容|sponsorisé|gesponsert|реклама|広告|광고)$/i.test((node.getAttribute('aria-label')||node.textContent||'').trim()))))return {allowed:false,reason:'pinterest-ad'};
    }
    return {allowed:true,site:'pinterest'};
  }
  function measure(image){
    const rect=image.getBoundingClientRect(),style=getComputedStyle(image);
    // not its own opacity: X lays a transparent <img> over the picture it shows as a background
    if(style.display==='none'||style.visibility==='hidden')return null;
    let width=rect.width,height=rect.height;
    // Use the represented size, not its overlap with the viewport or a scroller.
    // A large off-screen photograph still belongs to the loaded-page collection.
    for(let parent=image.parentElement;parent&&parent!==document.documentElement;parent=parent.parentElement){
      const style=getComputedStyle(parent),bounds=parent.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return null;
      if(/hidden|clip|scroll|auto/.test(style.overflowX))width=Math.min(width,bounds.width);
      if(/hidden|clip|scroll|auto/.test(style.overflowY))height=Math.min(height,bounds.height);
    }
    return {width,height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};
  }
  function matches(size){
    if(!size||size.width<2||size.height<2||size.naturalWidth<2||size.naturalHeight<2)return false;
    return !config.enabled||[size.width,size.height,size.naturalWidth,size.naturalHeight].every(value=>value>=config.minSize);
  }
  function eligible(image){return classify(image).allowed&&matches(measure(image));}
  const ready=chrome.storage.local.get(['imageFilter']).then(saved=>configure(saved.imageFilter));
  chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.imageFilter)configure(changes.imageFilter.newValue);});
  return {normalize,configure,eligible,measure,matches,classify,ready,subscribe:fn=>listeners.add(fn)};
})();
