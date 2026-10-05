/* Prompt profiles: per task kind (reverse / image-to-image / text-to-image) a list of saved configurations, each a
   custom system prompt plus attached md/skill files, and an optional aspect override for generation. */
globalThis.PromptProfiles=(()=>{
 const KINDS={reverse:'反推 / Reverse',i2i:'图生图 / Image to image',t2i:'文生图（反推生图）/ Text to image'};
 const COSPLAY='转换为真人 Coser 摄影风格，禁止西方面孔，禁止二次元立绘，禁止动漫风，禁止 3D 渲染，禁止多余肢体。\n'+
  '版式为角色设定图：上方一个头部特写，无口罩，不挡脸，下方两个并排服装视图。\n'+
  '上方为头部近景，重点展示脸部、发型、发饰与妆容。\n'+
  '下方两个视图从左到右为：正面、背面。\n'+
  '下方双视图必须是无头服装展示图，画面从颈根 / 肩部开始，到脚部结束，头、脸、五官、头发一律不要出现；上边缘直接裁掉头部，只保留颈部以下的身体与服装。\n'+
  '下方双视图人物自然站立，全身完整入画，不裁脚，不抬手，不做动作，像服装设定板中的人体展示。\n'+
  '整体保持同一角色、同一体型、同一套服装、同一配饰，重点清晰展示服装正面结构、背面结构、剪裁、轮廓、层次与细节。\n'+
  '干净棚拍参考图风格，浅色纯净背景，无文字，无水印。';
 const PRESETS=[
  {id:'preset-reverse-default',kind:'reverse',name:'默认反推 / Default reverse',systemPrompt:'',files:[],builtin:true},
  {id:'preset-i2i-cosplay-sheet',kind:'i2i',name:'真人人设图 / Real-person character sheet',systemPrompt:COSPLAY,files:[],aspect:'9:16',includeReverse:false,builtin:true},
  {id:'preset-t2i-direct',kind:'t2i',name:'直接使用反推提示词 / Use the reverse prompt',systemPrompt:'',files:[],aspect:'',builtin:true}];
 const DEFAULT_ACTIVE={reverse:'preset-reverse-default',i2i:'preset-i2i-cosplay-sheet',t2i:'preset-t2i-direct'};
 const FILE_LIMIT=200*1024,PROFILE_LIMIT=1024*1024;
 async function load(){
  const saved=await chrome.storage.local.get(['promptProfiles','activeProfiles']);
  const list=Array.isArray(saved.promptProfiles)?saved.promptProfiles.filter(p=>p&&KINDS[p.kind]):[];
  // Presets seed the list only until the user first saves profiles; after that edits and deletions stick.
  for(const preset of PRESETS)if(!list.some(p=>p.id===preset.id)&&!saved.promptProfiles)list.push(structuredClone(preset));
  const active={...DEFAULT_ACTIVE,...(saved.activeProfiles||{})};
  for(const kind of Object.keys(KINDS))if(!list.some(p=>p.id===active[kind]))active[kind]=list.find(p=>p.kind===kind)?.id||'';
  return {profiles:list,active};
 }
 async function save(profiles,active){
  for(const profile of profiles){const size=(profile.systemPrompt||'').length+(profile.files||[]).reduce((n,f)=>n+(f.content||'').length,0);if(size>PROFILE_LIMIT)throw new Error('配置“'+profile.name+'”超过 1 MB / Profile exceeds 1 MB');}
  await chrome.storage.local.set({promptProfiles:profiles,activeProfiles:active});
 }
 async function current(kind){const {profiles,active}=await load();return profiles.find(p=>p.id===active[kind])||null;}
 // System prompt text + attached files, in order; files are labelled so the model can tell them apart.
 function compose(profile){
  if(!profile)return '';
  const parts=[String(profile.systemPrompt||'').trim()];
  for(const file of profile.files||[])if(String(file.content||'').trim())parts.push('--- '+file.name+' ---\n'+String(file.content).trim());
  return parts.filter(Boolean).join('\n\n');
 }
 async function readFiles(fileList){
  const out=[];
  for(const file of fileList){
   if(file.size>FILE_LIMIT)throw new Error(file.name+' 超过 200 KB / exceeds 200 KB');
   if(!/\.(md|markdown|txt|skill|json|ya?ml)$/i.test(file.name))throw new Error(file.name+'：只支持 md / txt / skill / json / yaml 文本文件');
   out.push({id:crypto.randomUUID(),name:file.name,content:await file.text(),addedAt:Date.now()});
  }
  return out;
 }
 return {KINDS,PRESETS,DEFAULT_ACTIVE,load,save,current,compose,readFiles};
})();
