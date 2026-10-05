import fs from 'node:fs/promises';
import path from 'node:path';

const indexName='.cache-index.json';
const imageTypes=['jpg','png','webp'];
const validId=/^[a-zA-Z0-9_-]{1,100}$/;
const validCacheId=/^\d{6,}-[a-z0-9]{1,8}$/;
const exists=filename=>fs.access(filename).then(()=>true,()=>false);

export function cacheIdFor(sequence,id){
 if(!Number.isSafeInteger(sequence)||sequence<1||!validId.test(id))throw new Error('Invalid cache identity');
 return String(sequence).padStart(6,'0')+'-'+id.replace(/[^a-zA-Z0-9]/g,'').slice(0,8).toLowerCase();
}

export async function withCacheLock(root,action){
 await fs.mkdir(root,{recursive:true});
 const lock=path.join(root,'.cache-write-lock');let acquired=false;
 for(let attempt=0;attempt<200;attempt++){
  try{await fs.mkdir(lock);acquired=true;break;}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   try{if(Date.now()-(await fs.stat(lock)).mtimeMs>120000)await fs.rmdir(lock);}catch(error){if(!['ENOENT','ENOTEMPTY'].includes(error.code))throw error;}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
 }
 if(!acquired)throw new Error('Cache is busy; retry after other synchronization finishes');
 try{return await action();}finally{await fs.rmdir(lock);}
}

export async function loadCacheIndex(root){
 let index={version:1,nextSequence:1,records:Object.create(null)};
 try{const saved=JSON.parse(await fs.readFile(path.join(root,indexName),'utf8'));if(saved.version===1&&Number.isSafeInteger(saved.nextSequence)&&saved.nextSequence>0&&saved.records&&typeof saved.records==='object'){saved.records=Object.assign(Object.create(null),saved.records);return saved;}}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const entries=[];
 for(const name of await fs.readdir(root)){
  if(!validId.test(name.slice(0,-5))||!name.endsWith('.json'))continue;
  try{const record=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));if(validId.test(record.id||''))entries.push({id:record.id,createdAt:Number(record.createdAt)||0,cacheId:validCacheId.test(record.cacheId||'')?record.cacheId:null});}catch{}
 }
 for(const entry of entries){
  if(!index.records[entry.id]&&entry.cacheId){const sequence=Number(entry.cacheId.split('-')[0]);index.records[entry.id]={sequence,cacheId:entry.cacheId};index.nextSequence=Math.max(index.nextSequence,sequence+1);}
 }
 for(const entry of entries.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))){
  if(!index.records[entry.id]){const sequence=index.nextSequence++;index.records[entry.id]={sequence,cacheId:cacheIdFor(sequence,entry.id)};}
 }
 // Callers must persist a rebuilt index; otherwise every write rescans and reassigns sequences.
 Object.defineProperty(index,'rebuilt',{value:true});
 return index;
}

export async function saveCacheIndex(root,index){
 const target=path.join(root,indexName),temp=target+'.tmp-'+crypto.randomUUID();
 await fs.writeFile(temp,JSON.stringify(index),{mode:0o600});await fs.rename(temp,target);
}

export async function resolveCacheRecord(root,key){
 if(!validId.test(key||''))throw new Error('Invalid record ID');
 const direct=path.join(root,key+'.json');if(await exists(direct))return direct;
 try{const index=JSON.parse(await fs.readFile(path.join(root,indexName),'utf8'));const cacheId=Object.hasOwn(index.records||{},key)?index.records[key]?.cacheId:null;if(validCacheId.test(cacheId||'')){const named=path.join(root,cacheId+'.json');if(await exists(named))return named;}}catch(error){if(error.code!=='ENOENT')throw error;}
 throw new Error('Record not found');
}

export async function migrateCache(root){
 return withCacheLock(root,async()=>{
  const index=await loadCacheIndex(root);let migrated=0;
  for(const [id,entry] of Object.entries(index.records)){
   if(!validId.test(id)||!validCacheId.test(entry.cacheId||''))continue;
   const oldJson=path.join(root,id+'.json'),newJson=path.join(root,entry.cacheId+'.json');
   const source=await exists(newJson)?newJson:oldJson;if(!await exists(source))continue;
   const record=JSON.parse(await fs.readFile(source,'utf8'));if(record.id!==id)throw new Error('Cache record ID mismatch: '+id);
   let imagePath=null;
   for(const ext of imageTypes){
    const named=path.join(root,entry.cacheId+'.'+ext),legacy=path.join(root,id+'.'+ext);
    if(await exists(named)){imagePath=named;break;}
    if(await exists(legacy)){await fs.copyFile(legacy,named);imagePath=named;break;}
   }
   const updated={...record,sequence:entry.sequence,cacheId:entry.cacheId,imagePath};
   const temp=newJson+'.tmp-'+crypto.randomUUID();await fs.writeFile(temp,JSON.stringify(updated),{mode:0o600});await fs.rename(temp,newJson);
   if(source!==newJson)migrated++;
   if(oldJson!==newJson)await fs.rm(oldJson,{force:true});
   for(const ext of imageTypes)await fs.rm(path.join(root,id+'.'+ext),{force:true});
  }
  await saveCacheIndex(root,index);
  return {migrated,total:Object.keys(index.records).length,nextSequence:index.nextSequence};
 });
}
