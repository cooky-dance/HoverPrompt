// ChatGPT's own conversation data, read from inside chatgpt.com (same site, the user's session). Used by the image studio
// worker to follow a reply without relying on the page being drawn: a worker tab sits in a minimized window, where the
// page may not update and timers slow down, so the workbench polls and each poll reads the conversation here.
//   parse(conversation, sentAt) → {started, images:[{pointer,width,height}], finished, inProgress, text}
//   conversation(id), downloadUrl(pointer, conversationId), conversationId(path)
globalThis.ImagePromptChatGPTApi=(()=>{
 let token=null,tokenAt=0;
 const cookie=name=>(typeof document!=='undefined'?document.cookie:'').split('; ').find(c=>c.startsWith(name+'='))?.slice(name.length+1)||'';
 async function session(force=false){
  if(token&&!force&&Date.now()-tokenAt<10*60000)return token;
  const response=await fetch('/api/auth/session',{credentials:'include'});const data=await response.json().catch(()=>null);
  if(!data?.accessToken)throw new Error('No ChatGPT session');token=data.accessToken;tokenAt=Date.now();return token;
 }
 async function get(path){
  for(let attempt=0;attempt<2;attempt++){
   const headers={Authorization:'Bearer '+await session(attempt>0)},device=cookie('oai-did');if(device)headers['OAI-Device-Id']=device;
   const response=await fetch(path,{credentials:'include',headers});
   if(response.status===401&&attempt===0)continue;
   if(!response.ok)throw Object.assign(new Error('HTTP '+response.status),{status:response.status});
   return response.json();
  }
 }
 const conversationId=(path=location.pathname)=>(/\/c\/([0-9a-f-]{20,})/i.exec(path)||[])[1]||null;
 const conversation=id=>get('/backend-api/conversation/'+encodeURIComponent(id));
 // The messages after the user message that was sent at sentAt (ms), along the current branch.
 function parse(data,sentAt=0){
  const mapping=data?.mapping||{},chain=[];let node=data?.current_node;const guard=new Set();
  while(node&&mapping[node]&&!guard.has(node)){guard.add(node);chain.unshift(mapping[node]);node=mapping[node].parent;}
  let start=-1;
  for(let i=chain.length-1;i>=0;i--){const m=chain[i].message;if(m?.author?.role==='user'&&(!sentAt||(Number(m.create_time)||0)*1000>=sentAt-120000)){start=i;break;}}
  if(start<0)return {started:false,images:[],finished:false,inProgress:false,text:''};
  const after=chain.slice(start+1).map(n=>n.message).filter(Boolean),images=[],seen=new Set();let text='';
  for(const m of after){
   if(m.author?.role==='user')break;
   for(const part of m.content?.parts||[]){
    // the title ChatGPT gives a generated image is the name it shows in its library ("<title>.png"); the field has moved
    // between releases, so every known place is read and the raw values are kept for checking
    if(part&&typeof part==='object'&&part.content_type==='image_asset_pointer'&&part.asset_pointer){if(!seen.has(part.asset_pointer)){seen.add(part.asset_pointer);
     const title=[part.metadata?.generation?.title,part.metadata?.dalle?.title,part.metadata?.title,part.title,m.metadata?.image_gen_title].find(v=>typeof v==='string'&&v.trim());
     images.push({pointer:part.asset_pointer,fileId:fileId(part.asset_pointer),width:part.width,height:part.height,title:title?title.trim():null});}}
    else if(typeof part==='string'&&m.author?.role==='assistant')text+=part+'\n';
   }
  }
  const inProgress=after.some(m=>m.status==='in_progress'),last=after.at(-1);
  const finished=!inProgress&&!!last&&last.author?.role==='assistant'&&(last.status==='finished_successfully'||last.status==='finished_partial_completion')&&last.end_turn!==false;
  return {started:true,images,finished,inProgress,text:text.trim()};
 }
 // Every user message of the current branch with the images that answered it (for syncing a conversation into the history).
 function turns(data){
  const mapping=data?.mapping||{},chain=[];let node=data?.current_node;const guard=new Set();
  while(node&&mapping[node]&&!guard.has(node)){guard.add(node);chain.unshift(mapping[node]);node=mapping[node].parent;}
  const out=[];
  for(const item of chain){const m=item.message;if(!m)continue;
   if(m.author?.role==='user'){const text=(m.content?.parts||[]).filter(p=>typeof p==='string').join('\n').trim();out.push({text,createdAt:Math.round((Number(m.create_time)||0)*1000),images:[]});continue;}
   const turn=out.at(-1);if(!turn)continue;
   for(const part of m.content?.parts||[])if(part&&typeof part==='object'&&part.content_type==='image_asset_pointer'&&part.asset_pointer&&!turn.images.some(i=>i.pointer===part.asset_pointer)){
    const title=[part.metadata?.generation?.title,part.metadata?.dalle?.title,part.metadata?.title,part.title,m.metadata?.image_gen_title].find(v=>typeof v==='string'&&v.trim());
    turn.images.push({pointer:part.asset_pointer,fileId:fileId(part.asset_pointer),width:part.width,height:part.height,title:title?title.trim():null});}
  }
  return {title:data?.title||'',turns:out};
 }
 // The conversations of a ChatGPT project (best effort: the listing address is not a public API).
 async function projectConversations(projectId){
  for(const path of ['/backend-api/gizmos/'+encodeURIComponent(projectId)+'/conversations?cursor=0','/backend-api/conversations?offset=0&limit=100&gizmo_id='+encodeURIComponent(projectId)]){
   try{const data=await get(path);const items=data?.items||data?.conversations;if(Array.isArray(items))return items.map(c=>({id:c.id||c.conversation_id,title:c.title||'',updatedAt:Date.parse(c.update_time)||Number(c.update_time)*1000||null})).filter(c=>c.id);}catch{}
  }
  throw new Error('Project conversations could not be listed');
 }
 const fileId=pointer=>String(pointer).replace(/^(file-service|sediment):\/\//,'');
 // a signed address of the original file
 async function downloadUrl(pointer,conversation){
  const id=encodeURIComponent(fileId(pointer)),cid=encodeURIComponent(conversation||'');
  for(const path of ['/backend-api/files/download/'+id+'?conversation_id='+cid+'&inline=false','/backend-api/files/'+id+'/download','/backend-api/conversation/'+cid+'/attachment/'+id+'/download']){
   try{const data=await get(path);if(data?.download_url)return data.download_url;}catch{}
  }
  throw new Error('No download address for '+fileId(pointer));
 }
 return {session,get,conversationId,conversation,parse,turns,projectConversations,fileId,downloadUrl};
})();
