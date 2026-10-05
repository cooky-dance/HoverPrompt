// Timers for the request queue run in a dedicated worker so a hidden task tab keeps full speed.
// Falls back to page timers where workers are unavailable (tests, restricted contexts).
const BackgroundTimer=(()=>{
  let worker=null,sequence=0;const waiting=new Map();
  const fallback=(fn,ms)=>{const timer=setTimeout(fn,ms);return {cancel:()=>clearTimeout(timer)};};
  try{
    if(typeof Worker!=='undefined'&&typeof chrome!=='undefined'&&chrome.runtime?.getURL){
      worker=new Worker(chrome.runtime.getURL('timer-worker.js'));
      worker.onmessage=({data})=>{const fn=waiting.get(data);waiting.delete(data);fn?.();};
      worker.onerror=()=>{worker=null;for(const [id,fn] of waiting){waiting.delete(id);setTimeout(fn,0);}};
    }
  }catch{worker=null;}
  function set(fn,ms){if(!worker)return fallback(fn,ms);const id=++sequence;waiting.set(id,fn);worker.postMessage({id,ms});return {cancel:()=>{waiting.delete(id);worker?.postMessage({cancel:id});}};}
  return {set};
})();
const RequestControl = (() => {
  const defaults={concurrency:2,requestsPerMinute:30,timeoutSeconds:90,autoRetryTimeout:true,maxRetries:2,batchSize:4};
  let config={...defaults},active=0,gateChain=Promise.resolve(),lastStart=0;
  const jobs=new Map(),queue=[];
  function normalize(value={}) {
    const number=(name,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value[name]))?Number(value[name]):defaults[name]));
    return {concurrency:Math.floor(number('concurrency',1,1000)),requestsPerMinute:Math.floor(number('requestsPerMinute',1,600)),timeoutSeconds:number('timeoutSeconds',1,600),autoRetryTimeout:value.autoRetryTimeout!==false,maxRetries:Math.floor(number('maxRetries',0,10)),batchSize:Math.floor(number('batchSize',1,4))};
  }
  function sleep(ms,signal) {
    return new Promise((resolve,reject)=>{
      const abort=()=>{timer.cancel();signal?.removeEventListener('abort',abort);reject(new DOMException('任务已取消','AbortError'));};
      const timer=BackgroundTimer.set(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
      if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    });
  }
  function gate(signal) {
    const run=gateChain.catch(()=>{}).then(async()=>{
      if(signal?.aborted)throw new DOMException('任务已取消','AbortError');
      const wait=Math.max(0,lastStart+60000/config.requestsPerMinute-Date.now());
      if(wait)await sleep(wait,signal);
      if(signal?.aborted)throw new DOMException('任务已取消','AbortError');
      lastStart=Date.now();
    });gateChain=run;return run;
  }
  function pump() {
    while(active<config.concurrency && queue.length){
      const job=queue.shift();if(!jobs.has(job.id))continue;
      active++;job.state='running';
      const finish=()=>{jobs.delete(job.id);active--;pump();};
      Promise.resolve().then(()=>job.work(job.controller.signal)).then(value=>{finish();job.resolve(value);},error=>{finish();job.reject(error);});
    }
  }
  // A merged request (PromptAPI) pulls up to n waiting tasks in with it: they start now without taking a concurrency slot,
  // so their images can ride in the same request instead of waiting for a free slot.
  function borrow(n) {
    let started=0;
    while(started<n && queue.length){
      const job=queue.shift();if(!jobs.has(job.id))continue;
      job.state='running';started++;
      const finish=()=>{jobs.delete(job.id);pump();};
      Promise.resolve().then(()=>job.work(job.controller.signal)).then(value=>{finish();job.resolve(value);},error=>{finish();job.reject(error);});
    }
    return started;
  }
  function schedule(id,work) {
    if(jobs.has(id))throw new Error('此记录正在执行或等待，不重复提交');
    const controller=new AbortController();
    const promise=new Promise((resolve,reject)=>{const job={id,work,controller,resolve,reject,state:'queued'};jobs.set(id,job);queue.push(job);});
    pump();return promise;
  }
  function cancel(id) {
    const job=jobs.get(id);if(!job)return;
    job.controller.abort();
    if(job.state==='queued'){jobs.delete(id);job.reject(new DOMException('任务已取消','AbortError'));}
  }
  const configure=value=>{config=normalize(value);pump();return {...config};};
  return {defaults,normalize,configure,gate,sleep,schedule,borrow,cancel,has:id=>jobs.has(id),state:id=>jobs.get(id)?.state,counts:()=>({active,queued:[...jobs.values()].filter(j=>j.state==='queued').length}),settings:()=>({...config})};
})();
