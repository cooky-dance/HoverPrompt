/* Dedicated-worker timers. Chromium throttles chained timers in hidden pages to one wake-up per minute,
   which serialized the analysis queue in the background task tab; worker timers are exempt. */
const timers=new Map();
onmessage=({data})=>{
 if(data?.cancel!=null){clearTimeout(timers.get(data.cancel));timers.delete(data.cancel);return;}
 if(!Number.isInteger(data?.id))return;
 timers.set(data.id,setTimeout(()=>{timers.delete(data.id);postMessage(data.id);},Math.max(0,Number(data.ms)||0)));
};
