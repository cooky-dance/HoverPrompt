// Pure timing helpers shared by the extension and the cloud worker.
globalThis.TaskTiming ||= (()=>{
  const phases=['waiting','running','finished'];
  function clean(value){
    if(!value||!phases.includes(value.phase)||!Number.isFinite(value.queuedAt)||!Number.isFinite(value.phaseAt))return null;
    const duration=value=>Number.isFinite(value)?Math.max(0,Math.min(365*86400000,value)):0;
    return {queuedAt:Math.max(0,value.queuedAt),phaseAt:Math.max(0,value.phaseAt),phase:value.phase,waitMs:duration(value.waitMs),runMs:duration(value.runMs),finishedAt:Number.isFinite(value.finishedAt)?Math.max(0,value.finishedAt):null};
  }
  function begin(task,now=Date.now()){task.timing={queuedAt:now,phaseAt:now,phase:'waiting',waitMs:0,runMs:0,finishedAt:null};return task.timing;}
  function phase(task,next,now=Date.now()){
    const timing=task.timing;if(!timing||timing.phase==='finished'||timing.phase===next)return;
    const elapsed=Math.max(0,now-timing.phaseAt);
    if(timing.phase==='waiting')timing.waitMs+=elapsed;else timing.runMs+=elapsed;
    timing.phase=next;timing.phaseAt=now;
  }
  function finish(task,now=Date.now()){if(!task.timing||task.timing.phase==='finished')return;phase(task,'finished',now);task.timing.finishedAt=now;}
  function snapshot(task,now=Date.now()){
    const timing=clean(task.timing);if(!timing)return null;
    const elapsed=Math.max(0,now-timing.phaseAt);
    if(timing.phase==='waiting')timing.waitMs+=elapsed;
    if(timing.phase==='running')timing.runMs+=elapsed;
    return {...timing,totalMs:timing.waitMs+timing.runMs};
  }
  function format(ms){
    const tenths=Math.round(Math.max(0,ms)/100),h=Math.floor(tenths/36000),m=Math.floor(tenths%36000/600),s=(tenths%600)/10;
    return h?`${h}h ${m}m ${s}s`:m?`${m}m ${s}s`:`${s}s`;
  }
  return {clean,begin,phase,finish,snapshot,format};
})();
