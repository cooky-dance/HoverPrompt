import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {cacheIdFor,loadCacheIndex,saveCacheIndex,withCacheLock} from './cache-files.mjs';
// Tool folder: %LOCALAPPDATA%/HoverPrompt; an install made before the rename keeps %LOCALAPPDATA%/ImagePrompt until the
// installer moves it. Cache folder: IMAGEPROMPT_CACHE, else cacheDir from <tool folder>/config.json (set by setCacheDir), else default.
const local=process.env.LOCALAPPDATA||os.homedir(),toolRoot=existsSync(path.join(local,'HoverPrompt'))||!existsSync(path.join(local,'ImagePrompt'))?path.join(local,'HoverPrompt'):path.join(local,'ImagePrompt'),configFile=path.join(toolRoot,'config.json'),defaultRoot=path.join(toolRoot,'cache');
let config={};try{config=JSON.parse(await fs.readFile(configFile,'utf8'));}catch{}
const root=process.env.IMAGEPROMPT_CACHE||(typeof config.cacheDir==='string'&&path.isAbsolute(config.cacheDir)?config.cacheDir:defaultRoot);
// The image cached next to a record: its recorded path when that lies inside the cache folder, else <stem>.<ext>.
async function cachedImage(stem,record){
 const types={jpg:'image/jpeg',png:'image/png',webp:'image/webp'},candidates=[];
 if(typeof record?.imagePath==='string'){const resolved=path.resolve(record.imagePath);if(resolved.startsWith(path.resolve(root)+path.sep))candidates.push(resolved);}
 for(const ext of Object.keys(types))candidates.push(path.join(root,stem+'.'+ext));
 for(const file of candidates){const ext=path.extname(file).slice(1).toLowerCase();if(!types[ext])continue;try{const bytes=await fs.readFile(file);if(bytes.length)return {bytes,mime:types[ext]};}catch{}}
 return null;
}
async function countFiles(dir){let n=0;for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]))n+=entry.isDirectory()?await countFiles(path.join(dir,entry.name)):1;return n;}
let buffer=Buffer.alloc(0),chain=Promise.resolve();
async function handle(message){
 if(!['put','delete','info','pull','complete','writeGenerated','putOriginal','setCacheDir','restore','restoreImage','scanGenerated','readGenerated','cacheId'].includes(message.action))throw new Error('Unsupported action');
 if(message.action==='info'){const records=(await fs.readdir(root,{withFileTypes:true}).catch(()=>[])).filter(e=>e.isFile()&&/^[a-zA-Z0-9_-]+\.json$/.test(e.name)).length;return {ok:true,path:root,defaultPath:defaultRoot,custom:root!==defaultRoot,envOverride:!!process.env.IMAGEPROMPT_CACHE,records};}
 if(message.action==='setCacheDir'){
  // Move the whole cache (records, images, originals, index, CLI queues) to an empty folder, then switch config.
  if(process.env.IMAGEPROMPT_CACHE)throw new Error('IMAGEPROMPT_CACHE is set; unset it to change the folder here');
  const raw=String(message.dir||'').trim();if(!raw||!path.isAbsolute(raw))throw new Error('Cache folder must be an absolute path');
  const target=path.resolve(raw),current=path.resolve(root);
  if(target.toLowerCase()===current.toLowerCase())return {ok:true,path:root,moved:0};
  if(target.toLowerCase().startsWith(current.toLowerCase()+path.sep))throw new Error('New folder cannot be inside the current cache folder');
  const existing=await fs.readdir(target).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  if(existing.length)throw new Error('Target folder must be empty');
  await fs.mkdir(target,{recursive:true});
  const hasCurrent=await fs.access(current).then(()=>true,()=>false);
  let moved=0;
  if(hasCurrent)await withCacheLock(current,async()=>{
   await fs.cp(current,target,{recursive:true,force:false,errorOnExist:false,filter:source=>path.basename(source)!=='.cache-write-lock'});
   moved=await countFiles(target);const expected=await countFiles(current);
   if(moved<expected)throw new Error('Copy incomplete: '+moved+'/'+expected+' files; cache folder unchanged');
   await fs.mkdir(toolRoot,{recursive:true});await fs.writeFile(configFile,JSON.stringify({...config,cacheDir:target},null,2));
  });
  else{await fs.mkdir(toolRoot,{recursive:true});await fs.writeFile(configFile,JSON.stringify({...config,cacheDir:target},null,2));}
  if(hasCurrent)await fs.rm(current,{recursive:true,force:true}).catch(()=>{});
  return {ok:true,path:target,previous:current,moved};
 }
 if(message.action==='putOriginal'){
  // Full-resolution original next to the mirror: <cache>/originals/<cacheId or id>.<ext>
  const id=String(message.id||'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Invalid record ID');
  const match=/^data:image\/(jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/=]+)$/.exec(message.dataUrl||'');if(!match)throw new Error('Unsupported image');
  const ext=match[1]==='jpeg'?'jpg':match[1],index=await loadCacheIndex(root).catch(()=>({records:{}})),stem=index.records?.[id]?.cacheId||id;
  const dir=path.join(root,'originals');await fs.mkdir(dir,{recursive:true});
  for(const other of ['jpg','png','webp','gif','avif'])if(other!==ext)await fs.rm(path.join(dir,stem+'.'+other),{force:true});
  const file=path.join(dir,stem+'.'+ext);await fs.writeFile(file+'.tmp',Buffer.from(match[2],'base64'));await fs.rename(file+'.tmp',file);
  return {ok:true,path:file};
 }
 if(message.action==='writeGenerated'){
  // Generated images go to a user-chosen folder (default Pictures/HoverPrompt) with a JSON sidecar; never overwrite.
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(message.dataUrl||'');if(!match)throw new Error('Unsupported image');
  if(message.dir&&!path.isAbsolute(String(message.dir)))throw new Error('Output folder must be an absolute path');
  const dir=message.dir?path.resolve(String(message.dir)):path.join(os.homedir(),'Pictures','HoverPrompt');
  const name=String(message.name||'image').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,120)||'image',ext=match[1]==='jpeg'?'jpg':match[1];
  await fs.mkdir(dir,{recursive:true});
  let file=path.join(dir,name+'.'+ext);for(let index=2;await fs.access(file).then(()=>true,()=>false);index++)file=path.join(dir,name+'-'+index+'.'+ext);
  await fs.writeFile(file,Buffer.from(match[2],'base64'));
  if(message.meta&&typeof message.meta==='object')await fs.writeFile(file.slice(0,-ext.length)+'json',JSON.stringify({...message.meta,file,createdAt:new Date().toISOString()},null,2));
  return {ok:true,path:file};
 }
 if(message.action==='pull'){
  const directory=path.join(root,'commands');await fs.mkdir(directory,{recursive:true});
  for(const name of (await fs.readdir(directory)).filter(name=>/^[a-zA-Z0-9_-]+\.json\.processing$/.test(name)).sort()){
   const filename=path.join(directory,name),command=JSON.parse(await fs.readFile(filename,'utf8'));
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(command.id||'')||!['scan','search','snapshot','submit'].includes(command.action))throw new Error('Invalid CLI command');
   if(command.expiresAt<Date.now()){await complete(command.id,{error:'Command expired before extension completed it'});continue;}
   return {ok:true,command,recovered:true};
  }
  for(const name of (await fs.readdir(directory)).filter(name=>/^[a-zA-Z0-9_-]+\.json$/.test(name)).sort()){
   const filename=path.join(directory,name),processing=filename+'.processing';
   try{await fs.rename(filename,processing);}catch(error){if(error.code==='ENOENT')continue;throw error;}
   const command=JSON.parse(await fs.readFile(processing,'utf8'));
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(command.id||'')||!['scan','search','snapshot','submit'].includes(command.action))throw new Error('Invalid CLI command');
   if(command.expiresAt<Date.now()){await complete(command.id,{error:'Command expired before extension received it'});continue;}
   return {ok:true,command};
  }
  return {ok:true,command:null};
 }
 // Restore: read the cached library back (for a browser that lost its database). Native messages to the browser are
 // limited to 1 MB, so records come in pages of about 700 KB and larger images in chunks (restoreImage).
 if(message.action==='restore'){
  const budget=700000,cursor=Math.max(0,parseInt(message.cursor,10)||0);
  const files=(await fs.readdir(root,{withFileTypes:true})).filter(e=>e.isFile()&&/^[a-zA-Z0-9_-]+\.json$/.test(e.name)).map(e=>e.name).sort();
  const records=[];let size=0,i=cursor;
  for(;i<files.length;i++){
   let record;try{record=JSON.parse(await fs.readFile(path.join(root,files[i]),'utf8'));}catch{continue;}
   if(!record||typeof record.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(record.id))continue;
   const found=await cachedImage(files[i].slice(0,-5),record);
   const {imagePath,sequence,...fields}=record,item={...fields,cacheId:files[i].slice(0,-5)};
   if(found){const data='data:'+found.mime+';base64,'+found.bytes.toString('base64');if(data.length>budget)item.imageChunked=data.length;else item.image=data;}
   const itemSize=JSON.stringify(item).length;
   if(records.length&&size+itemSize>budget)break;
   records.push(item);size+=itemSize;
  }
  return {ok:true,records,next:i<files.length?i:null,total:files.length};
 }
 // The backup name of a record (six-digit sequence + short code), allocated now if the record is not cached yet, so
 // generated files are named after it from the start.
 if(message.action==='cacheId'){
  const id=String(message.id||'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Invalid record ID');
  return withCacheLock(root,async()=>{const index=await loadCacheIndex(root);let entry=index.records[id];if(!entry){const sequence=index.nextSequence++;entry={sequence,cacheId:cacheIdFor(sequence,id)};index.records[id]=entry;await saveCacheIndex(root,index);}return {ok:true,cacheId:entry.cacheId,sequence:entry.sequence};});
 }
 // Generated images are recovered from the output folder by their JSON sidecars (taskId, prompt, model...), whatever
 // the file names are. scanGenerated lists them; readGenerated returns one image in chunks, only from inside that folder.
 const outputDir=value=>{if(value&&!path.isAbsolute(String(value)))throw new Error('Output folder must be an absolute path');return value?path.resolve(String(value)):path.join(os.homedir(),'Pictures','HoverPrompt');};
 const IMAGE_TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
 if(message.action==='scanGenerated'){
  const dir=outputDir(message.dir),items=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){
   if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
   let meta;try{meta=JSON.parse(await fs.readFile(path.join(dir,entry.name),'utf8'));}catch{continue;}
   if(!meta||typeof meta.taskId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(meta.taskId))continue;
   const stem=entry.name.slice(0,-5);let file=null;for(const ext of Object.keys(IMAGE_TYPES)){const candidate=path.join(dir,stem+ext);if(await fs.access(candidate).then(()=>true,()=>false)){file=candidate;break;}}
   if(!file)continue;
   items.push({file,name:path.basename(file),taskId:meta.taskId,prompt:typeof meta.prompt==='string'?meta.prompt.slice(0,20000):'',model:meta.model,source:meta.source,mode:meta.mode==='image'?'image':'text',size:meta.size,aspect:meta.aspect,conversationUrl:meta.conversationUrl,refName:meta.refName,chatgptName:meta.chatgptName,chatgptFileId:meta.chatgptFileId,createdAt:Date.parse(meta.createdAt)||null});
  }
  return {ok:true,dir,items};
 }
 if(message.action==='readGenerated'){
  const dir=outputDir(message.dir),file=path.resolve(dir,path.basename(String(message.name||''))),mime=IMAGE_TYPES[path.extname(file).toLowerCase()];
  if(!mime||path.dirname(file)!==dir)throw new Error('Generated image not found');
  const stat=await fs.stat(file).catch(()=>null);if(!stat?.isFile()||stat.size>30*1048576)throw new Error('Generated image not found');
  const data='data:'+mime+';base64,'+(await fs.readFile(file)).toString('base64'),offset=Math.max(0,parseInt(message.offset,10)||0),size=600000;
  return {ok:true,chunk:data.slice(offset,offset+size),next:offset+size<data.length?offset+size:null,length:data.length};
 }
 if(message.action==='restoreImage'){
  const stem=String(message.cacheId||'');if(!/^[a-zA-Z0-9_-]{1,120}$/.test(stem))throw new Error('Invalid cache ID');
  let record={};try{record=JSON.parse(await fs.readFile(path.join(root,stem+'.json'),'utf8'));}catch{}
  const found=await cachedImage(stem,record);if(!found)throw new Error('Image not found');
  const data='data:'+found.mime+';base64,'+found.bytes.toString('base64'),offset=Math.max(0,parseInt(message.offset,10)||0),size=600000;
  return {ok:true,chunk:data.slice(offset,offset+size),next:offset+size<data.length?offset+size:null,length:data.length};
 }
 if(message.action==='complete'){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(message.id||''))throw new Error('Invalid command ID');await complete(message.id,message.result);return {ok:true};}
 const record=message.record,id=String(message.id||record?.id||'');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Invalid record ID');
 if(message.action==='put'&&(!record||typeof record!=='object'||record.id!==id))throw new Error('Invalid record');
 let imageData=null;
 if(message.action==='put'&&record.image){
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(record.image);if(!match)throw new Error('Unsupported image');
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>8*1048576)throw new Error('Image too large');
  const ext=match[1]==='jpeg'?'jpg':match[1];const signature=ext==='jpg'?bytes[0]===255&&bytes[1]===216:ext==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!signature)throw new Error('Invalid image signature');
  imageData={bytes,ext};
 }
 return withCacheLock(root,async()=>{
  const index=await loadCacheIndex(root);let entry=index.records[id];
  if(message.action==='delete'){
   for(const stem of [id,entry?.cacheId].filter(Boolean)){await fs.rm(path.join(root,stem+'.json'),{force:true});for(const ext of ['jpg','png','webp'])await fs.rm(path.join(root,stem+'.'+ext),{force:true});}
   return {ok:true};
  }
  if(!entry){const sequence=index.nextSequence++;entry={sequence,cacheId:cacheIdFor(sequence,id)};index.records[id]=entry;await saveCacheIndex(root,index);}else if(index.rebuilt)await saveCacheIndex(root,index);
  const stem=entry.cacheId,file=path.join(root,stem+'.json');let imagePath=null;
  if(imageData){imagePath=path.join(root,stem+'.'+imageData.ext);await fs.writeFile(imagePath+'.tmp',imageData.bytes,{mode:0o600});await fs.rename(imagePath+'.tmp',imagePath);}
  else for(const ext of ['jpg','png','webp']){const named=path.join(root,stem+'.'+ext),old=path.join(root,id+'.'+ext);if(await fs.access(named).then(()=>true,()=>false)){imagePath=named;break;}if(await fs.access(old).then(()=>true,()=>false)){await fs.copyFile(old,named);imagePath=named;break;}}
  const clean={id,sequence:entry.sequence,cacheId:stem,createdAt:record.createdAt,status:record.status,focus:record.focus,zh:record.zh,en:record.en,prompts:record.prompts,timing:record.timing,error:record.error,imagePath,imageUrl:typeof record.imageUrl==='string'?record.imageUrl:undefined,originalPath:typeof record.originalPath==='string'?record.originalPath:undefined,generations:Array.isArray(record.generations)?record.generations.filter(g=>g&&g.path).map(g=>({id:typeof g.id==='string'?g.id.slice(0,120):undefined,status:g.status==='failed'?'failed':'done',mode:g.mode,path:g.path,model:g.model,profile:g.profile,createdAt:g.createdAt,prompt:typeof g.prompt==='string'?g.prompt.slice(0,20000):undefined,aspect:g.aspect,conversationUrl:typeof g.conversationUrl==='string'?g.conversationUrl:undefined,refName:typeof g.refName==='string'?g.refName.slice(0,120):undefined,chatgptName:typeof g.chatgptName==='string'?g.chatgptName.slice(0,300):undefined,chatgptFileId:typeof g.chatgptFileId==='string'?g.chatgptFileId.slice(0,120):undefined})):undefined};
  await fs.writeFile(file+'.tmp',JSON.stringify(clean),{mode:0o600});await fs.rename(file+'.tmp',file);
  await fs.rm(path.join(root,id+'.json'),{force:true});for(const ext of ['jpg','png','webp']){await fs.rm(path.join(root,id+'.'+ext),{force:true});if(imagePath!==path.join(root,stem+'.'+ext))await fs.rm(path.join(root,stem+'.'+ext),{force:true});}
  return {ok:true,path:root,id,sequence:entry.sequence,cacheId:stem,imagePath};
 });
}
async function complete(id,result){
 const directory=path.join(root,'results');await fs.mkdir(directory,{recursive:true});const filename=path.join(directory,id+'.json');
 await fs.writeFile(filename+'.tmp',JSON.stringify({id,...result}),{mode:0o600});await fs.rename(filename+'.tmp',filename);
 await fs.rm(path.join(root,'commands',id+'.json.processing'),{force:true});
}
function reply(result){const body=Buffer.from(JSON.stringify(result));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);process.stdout.write(Buffer.concat([header,body]));}
process.stdin.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=4){const length=buffer.readUInt32LE(0);if(length>64*1048576){process.exitCode=1;process.stdin.destroy();return;}if(buffer.length<length+4)return;const body=buffer.subarray(4,length+4);buffer=buffer.subarray(length+4);chain=chain.then(async()=>{try{reply(await handle(JSON.parse(body.toString())));}catch(error){reply({ok:false,error:error.message});}});}});
