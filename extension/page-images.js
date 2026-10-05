// Keep URL and size snapshots: virtualized pages remove or reuse old image nodes.
globalThis.PageImageCollector ||= {
  create(options={}) {
    const settings={maxImages:5000,maxSteps:20,minWait:1200,quietMs:800,maxWait:8000,endWait:8000,endAttempts:3,...options};
    const cache=new Map();let timer=null;
    function capture(image){
      const url=image.currentSrc||image.src;if(!/^https?:/.test(url))return;
      if(!ImagePromptFilter.classify(image).allowed){cache.delete(new URL(url).href.split('#')[0]);return;}
      const size=ImagePromptFilter.measure(image);
      if(!size||Math.min(size.width,size.height,size.naturalWidth,size.naturalHeight)<2)return;
      const key=new URL(url).href.split('#')[0],previous=cache.get(key);
      if(!previous&&cache.size>=settings.maxImages)return;
      // Do not replace a full-size snapshot with the same URL used in a tiny icon.
      const quality=Math.min(size.width,size.height,size.naturalWidth,size.naturalHeight);
      if(previous&&previous.quality>quality)return;
      cache.set(key,{url:key,sourceUrl:location.href,size,quality});
    }
    function scan(){for(const image of document.images)capture(image);}
    const schedule=()=>{if(timer===null)timer=setTimeout(()=>{timer=null;scan();},100);};
    const mutation=new MutationObserver(schedule);
    mutation.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','srcset','sizes','style','class','hidden','aria-label','data-test-id','data-ad-id','data-promoted','href']});
    const onLoad=event=>{if(event.target instanceof HTMLImageElement)capture(event.target);};
    document.addEventListener('load',onLoad,true);addEventListener('scroll',schedule,true);addEventListener('resize',schedule);
    scan();
    function images(){return [...cache.values()].filter(record=>ImagePromptFilter.matches(record.size)).map(({url,sourceUrl})=>({url,sourceUrl}));}
    function intersects(image,target){
      const rect=image.getBoundingClientRect(),bounds=target===document.scrollingElement?{left:0,top:0,right:innerWidth,bottom:innerHeight}:target.getBoundingClientRect();
      let left=Math.max(rect.left,bounds.left),top=Math.max(rect.top,bounds.top),right=Math.min(rect.right,bounds.right),bottom=Math.min(rect.bottom,bounds.bottom);
      for(let parent=image.parentElement;parent&&parent!==document.documentElement;parent=parent.parentElement){
        const style=getComputedStyle(parent),clip=parent.getBoundingClientRect();
        if(/hidden|clip|scroll|auto/.test(style.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
        if(/hidden|clip|scroll|auto/.test(style.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
      }
      return right>left&&bottom>top;
    }
    function scrollTarget(){
      const root=document.scrollingElement,candidates=new Map([[root,0]]);
      for(const image of document.images){
        if(!ImagePromptFilter.eligible(image))continue;
        let target=root;
        for(let parent=image.parentElement;parent&&parent!==root;parent=parent.parentElement){
          if(parent.clientHeight>=160&&parent.scrollHeight>parent.clientHeight+5&&/auto|scroll/.test(getComputedStyle(parent).overflowY)){target=parent;break;}
        }
        candidates.set(target,(candidates.get(target)||0)+1);
      }
      return [...candidates].sort((a,b)=>b[1]-a[1])[0][0];
    }
    const position=target=>target===document.scrollingElement?scrollY:target.scrollTop;
    const viewport=target=>target===document.scrollingElement?innerHeight:target.clientHeight;
    const move=(target,y)=>(target===document.scrollingElement?window:target).scrollTo({top:y,behavior:'instant'});
    function signature(target){
      const visible=[...document.images].filter(image=>intersects(image,target));
      return {value:target.scrollHeight+'|'+cache.size+'|'+visible.map(image=>(image.currentSrc||image.src)+':'+image.naturalWidth+':'+image.complete).join('|'),pending:visible.some(image=>!image.complete&&(image.currentSrc||image.src))};
    }
    async function settle(target,signal,onTick,bottom=false){
      const started=Date.now();let changed=started,last='';
      const initialHeight=target.scrollHeight,initialCount=cache.size;
      const deadline=bottom?settings.endWait:settings.maxWait;
      while(!signal?.aborted){
        scan();const current=signature(target),now=Date.now();
        if(current.value!==last){changed=now;last=current.value;}
        onTick();
        if(now-started>=deadline)return;
        // At a temporary bottom, allow a late infinite-scroll response to arrive.
        if((!bottom||target.scrollHeight>initialHeight||cache.size>initialCount)&&now-started>=settings.minWait&&!current.pending&&now-changed>=settings.quietMs)return;
        await new Promise(resolve=>setTimeout(resolve,150));
      }
    }
    async function collect(scope,{signal,onProgress=()=>{},maxSteps}={}){
      await ImagePromptFilter.ready;scan();let steps=0,reason='complete';
      const limit=Number.isInteger(maxSteps)&&maxSteps>0?Math.min(60,maxSteps):settings.maxSteps;
      const report=()=>onProgress({count:images().length,steps,limit});
      if(scope==='scroll'){
        const target=scrollTarget(),original=position(target);let stalled=0;
        try{
          await settle(target,signal,report);
          while(steps<limit&&cache.size<settings.maxImages&&!signal?.aborted){
            const before=position(target),height=target.scrollHeight,count=cache.size;
            move(target,before+viewport(target)*.8);
            const moved=Math.abs(position(target)-before)>1;
            if(moved)steps++;
            await settle(target,signal,report,!moved);
            if(!moved&&height===target.scrollHeight&&count===cache.size){if(++stalled>=settings.endAttempts){reason='end';break;}}
            else stalled=0;
          }
          if(signal?.aborted)reason='stopped';else if(steps>=limit)reason='step-limit';
        }finally{scan();move(target,original);}
      }else{
        // Wait for currently loading images, without forcing a scroll in loaded mode.
        await settle(document.scrollingElement,signal,report);
      }
      let result=images();
      if(scope==='visible'){
        const urls=new Set([...document.images].filter(image=>ImagePromptFilter.eligible(image)&&intersects(image,document.scrollingElement)).map(image=>(image.currentSrc||image.src).split('#')[0]));
        result=result.filter(image=>urls.has(image.url));
      }
      return {images:result,steps,reason:signal?.aborted?'stopped':reason,truncated:cache.size>=settings.maxImages};
    }
    return {collect,clear:()=>{cache.clear();},scan,images,destroy:()=>{mutation.disconnect();clearTimeout(timer);document.removeEventListener('load',onLoad,true);removeEventListener('scroll',schedule,true);removeEventListener('resize',schedule);}};
  }
};
// One post shown with a carousel (a Xiaohongshu note, as a page or over the feed): all of its pictures in carousel order,
// including slides not shown yet and without the loop copies, the feed around it, avatars or comment images.
globalThis.NoteImages ||= {
  container(){
    if(!/(^|\.)xiaohongshu\.com$/i.test(location.hostname))return null;
    const box=document.querySelector('#noteContainer,.note-detail-mask .note-container,.note-container');
    return box&&box.getBoundingClientRect().width>0?box:null;
  },
  media(box=this.container()){return box?.querySelector('.media-container,.note-slider,.swiper')||null;},
  collect(){
    const box=this.container(),media=this.media(box);if(!media)return [];
    const seen=new Set(),list=[];
    const slides=[...media.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate)')].sort((a,b)=>(Number(a.dataset.swiperSlideIndex)||0)-(Number(b.dataset.swiperSlideIndex)||0));
    for(const slide of slides.length?slides:[media])for(const image of slide.querySelectorAll('img')){
      const url=String(image.currentSrc||image.src||image.dataset.src||'').split('#')[0];
      if(!/^https?:/.test(url)||seen.has(url)||image.closest('.avatar,.author-wrapper,.comments-container'))continue;
      seen.add(url);list.push({url,sourceUrl:location.href});
    }
    return list;
  }
};
