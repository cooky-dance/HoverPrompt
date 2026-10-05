#!/usr/bin/env node
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {exportLibrary} from '../public/zip.js';
import {migrateCache,resolveCacheRecord} from './cache-files.mjs';
const args=process.argv.slice(2),command=args.shift()||'help';
const option=name=>{const index=args.indexOf('--'+name);return index<0?null:args[index+1];};
// Sign-in file: ~/.hoverprompt/credentials.json (~/.imageprompt before the rename is still read until the next sign-in)
const configPath=process.env.IMAGEPROMPT_CONFIG||(existsSync(path.join(os.homedir(),'.hoverprompt'))||!existsSync(path.join(os.homedir(),'.imageprompt','credentials.json'))?path.join(os.homedir(),'.hoverprompt','credentials.json'):path.join(os.homedir(),'.imageprompt','credentials.json'));
// Tool folder: %LOCALAPPDATA%/HoverPrompt, or %LOCALAPPDATA%/ImagePrompt for an install the installer has not moved yet
const localRoot=process.env.LOCALAPPDATA||os.homedir(),toolRoot=existsSync(path.join(localRoot,'HoverPrompt'))||!existsSync(path.join(localRoot,'ImagePrompt'))?path.join(localRoot,'HoverPrompt'):path.join(localRoot,'ImagePrompt');
let config={};try{config=JSON.parse(await fs.readFile(configPath,'utf8'));}catch{}
// The cloud address is fixed (same as the extension); IMAGEPROMPT_URL / --url override it for local development.
const base=process.env.IMAGEPROMPT_URL||option('url')||config.url||'https://hoverprompt.com';
const bearer=process.env.IMAGEPROMPT_TOKEN||config.token;
const print=value=>process.stdout.write(JSON.stringify(value)+'\n');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function origin(){const url=new URL(base);if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Use an HTTPS service URL');return url.origin;}
async function api(endpoint,data,auth=true){const r=await fetch(origin()+'/api'+endpoint,{headers:{'Content-Type':'application/json',...(auth&&bearer?{Authorization:'Bearer '+bearer}:{})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const result=await r.json();if(!r.ok){const e=new Error(result.error?.message||'Request failed');e.code=result.error?.code;e.status=r.status;throw e;}return result;}
async function image(filename){const bytes=await fs.readFile(filename),ext=path.extname(filename).toLowerCase(),mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[ext];if(!mime)throw new Error('Use JPEG/PNG/WebP');if(bytes.length>4*1048576)throw new Error('Compress CLI images below 4 MB first');return 'data:'+mime+';base64,'+bytes.toString('base64');}
async function analyze(filename){const id=option('id')||crypto.randomUUID(),languages=option('languages')?JSON.parse(option('languages')):undefined;let task=await api('/jobs',{id,image:await image(filename),focus:option('focus')||'',languages});if(option('wait')!=='true')return task;while(['queued','running'].includes(task.status)){await sleep(2000);task=await api('/jobs/'+id);}return task;}
async function cacheRecords(cache){
 const records=new Map();
 try{for(const file of await fs.readdir(cache)){
  if(!/^[a-zA-Z0-9_-]+\.json$/.test(file))continue;
  const record=JSON.parse(await fs.readFile(path.join(cache,file),'utf8'));
  if(record?.id){const previous=records.get(record.id);if(!previous||record.cacheId)records.set(record.id,{record,jsonPath:path.join(cache,file)});}
 }}catch(error){if(error.code!=='ENOENT')throw error;}
 return [...records.values()].sort((a,b)=>(a.record.sequence||Infinity)-(b.record.sequence||Infinity)||(a.record.createdAt||0)-(b.record.createdAt||0));
}
try{
  if(command==='local') {
    let localConfig={};try{localConfig=JSON.parse(await fs.readFile(path.join(toolRoot,'config.json'),'utf8'));}catch{}
    const cache=path.resolve(option('cache')||process.env.IMAGEPROMPT_CACHE||(typeof localConfig.cacheDir==='string'&&path.isAbsolute(localConfig.cacheDir)?localConfig.cacheDir:path.join(toolRoot,'cache')));
    const action=args[0]||'discover';
    if(action==='discover'){const sources=[];for(const browser of ['Google/Chrome','Microsoft/Edge','Tabbit']){const userData=path.join(process.env.LOCALAPPDATA||os.homedir(),browser,'User Data');try{for(const profile of await fs.readdir(userData)){if(!/^(Default|Profile \d+)$/.test(profile))continue;const indexed=path.join(userData,profile,'IndexedDB');try{for(const name of await fs.readdir(indexed)){if(name.startsWith('chrome-extension_')&&name.endsWith('.indexeddb.leveldb')&&option('extension-id')&&name.includes('chrome-extension_'+option('extension-id')+'_'))sources.push({browser,profile,path:path.join(indexed,name),format:'raw LevelDB; use own HoverPrompt mirror to read records'});}}catch{}}}catch{}}print({cache,exists:await fs.access(cache).then(()=>true,()=>false),browserIndexedDB:sources});}
    else if(action==='doctor'){
      const install=toolRoot;
      const exists=filename=>fs.access(filename).then(()=>true,()=>false);
      let manifest=null;try{manifest=JSON.parse(await fs.readFile(path.join(install,'bridge','com.imageprompt.local.json'),'utf8'));}catch{}
      const pending=[];try{for(const name of await fs.readdir(path.join(cache,'commands'))){if(!/\.json(?:\.processing)?$/.test(name))continue;try{const c=JSON.parse(await fs.readFile(path.join(cache,'commands',name),'utf8'));pending.push({id:c.id,action:c.action,received:name.endsWith('.processing'),expired:c.expiresAt<Date.now()});}catch{}}}catch{}
      const recentResults=[];try{const directory=path.join(cache,'results');const files=(await fs.readdir(directory)).filter(name=>/^[a-zA-Z0-9_-]+\.json$/.test(name));const dated=await Promise.all(files.map(async name=>({name,mtime:(await fs.stat(path.join(directory,name))).mtimeMs})));for(const file of dated.sort((a,b)=>b.mtime-a.mtime).slice(0,5)){try{const result=JSON.parse(await fs.readFile(path.join(directory,file.name),'utf8'));recentResults.push({id:result.id,deliveryStatus:result.error?'error':'responded',tabId:result.tabId||null,imageCount:Array.isArray(result.images)?result.images.length:null,queuedJobs:Array.isArray(result.jobs)?result.jobs.length:null});}catch{}}}catch{}
      print({cache,cacheExists:await exists(cache),bridgeInstalled:await exists(path.join(install,'bridge','host.cmd')),allowedExtensionIds:(manifest?.allowed_origins||[]).map(value=>value.replace(/^chrome-extension:\/\//,'').replace(/\/$/,'')),pending,recentResults,browserConnection:'not checked; use local scan for a live round trip',nextSteps:['Reload the extension after updating files','Enable local cache and CLI control in Local CLI settings','Keep a normal HTTP/HTTPS page active; run local scan --scope loaded']});
    }
    else if(action==='scan'||action==='search'||action==='snapshot'||action==='submit'){
      const id=crypto.randomUUID(),waitSeconds=Math.max(10,Math.min(300,Number(option('timeout')||(action==='search'?300:action==='snapshot'?120:180))));if(!Number.isFinite(waitSeconds))throw new Error('Invalid timeout');
      const command={id,action,createdAt:Date.now(),expiresAt:Date.now()+waitSeconds*1000};
      if(option('tab-id')){command.tabId=Number(option('tab-id'));if(!Number.isInteger(command.tabId)||command.tabId<1)throw new Error('Invalid tab ID');}
      const pageUrl=value=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP/HTTPS URL without credentials');return url.href;};
      if(action==='snapshot'){
        // Fallback for agents: page text, links, controls and a screenshot so a model can decide the next step.
        if(option('url'))command.url=pageUrl(option('url'));
        command.screenshot=option('screenshot')!=='false';command.closeTab=option('close-tab')==='true';
        const wait=Number(option('wait')||3);if(!Number.isFinite(wait)||wait<0||wait>30)throw new Error('Use --wait 0-30 seconds');command.waitMs=wait*1000;
      }
      else if(action==='scan'||action==='search'){
        command.scope=option('scope')||(action==='search'?'scroll':'loaded');
        if(!['visible','loaded','scroll'].includes(command.scope))throw new Error('Use visible, loaded or scroll scope');
        if(option('max-screens')){const screens=Number(option('max-screens'));if(!Number.isInteger(screens)||screens<1||screens>60)throw new Error('Use --max-screens 1-60');command.maxScreens=screens;}
        if(action==='search'){
          command.closeTab=option('close-tab')==='true';
          const query=option('query'),site=option('site'),page=option('url');
          if(page){const url=new URL(page);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP/HTTPS search results URL without credentials');command.url=url.href;}
          else if((site==='pinterest.com'||site==='www.pinterest.com')&&query?.trim())command.url='https://www.pinterest.com/search/pins/?q='+encodeURIComponent(query.trim());
          else throw new Error('Use --site pinterest.com --query TEXT, or --url SEARCH_RESULTS_URL');
        }
      }
      else{
        let urls;if(option('scan-id')){const scanId=option('scan-id');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(scanId))throw new Error('Invalid scan ID');const scan=JSON.parse(await fs.readFile(path.join(cache,'results',scanId+'.json'),'utf8'));urls=scan.images?.map(item=>item.url);}
        else urls=JSON.parse(option('urls')||'[]');
        const limit=Number(option('limit')||100);if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Submit 1-100 images per command; use --limit');
        if(!Array.isArray(urls)||!urls.length)throw new Error('Use --scan-id ID or --urls JSON_ARRAY');
        const offset=Number(option('offset')||0);if(!Number.isInteger(offset)||offset<0)throw new Error('Offset must be a nonnegative integer');command.urls=[...new Set(urls)].slice(offset,offset+limit);if(!command.urls.length)throw new Error('No images remain at this offset');for(const url of command.urls){if(typeof url!=='string'||!/^https?:$/.test(new URL(url).protocol))throw new Error('Only HTTP/HTTPS image URLs are supported');}
        command.focus=option('focus')||'';command.skipDuplicates=option('skip-duplicates')!=='false';
      }
      await fs.mkdir(path.join(cache,'commands'),{recursive:true});const filename=path.join(cache,'commands',id+'.json');await fs.writeFile(filename+'.tmp',JSON.stringify(command),{mode:0o600});await fs.rename(filename+'.tmp',filename);
      const resultFile=path.join(cache,'results',id+'.json');let result;
      while(Date.now()<command.expiresAt){try{result=JSON.parse(await fs.readFile(resultFile,'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;}await sleep(300);}
      if(!result){await fs.rm(filename,{force:true});const error=new Error('Extension did not respond. Keep the browser running, install/update the bridge and enable local cache + CLI control. A received submission may still be queued; check local library before retrying. Command ID: '+id);error.code='extension_timeout';throw error;}
      if(result.error)throw new Error(result.error);
      if(typeof result.screenshot==='string'){const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(result.screenshot);delete result.screenshot;if(match){const directory=path.join(cache,'snapshots');await fs.mkdir(directory,{recursive:true});result.screenshotPath=path.join(directory,id+(match[1]==='png'?'.png':'.jpg'));await fs.writeFile(result.screenshotPath,Buffer.from(match[2],'base64'),{mode:0o600});}await fs.writeFile(resultFile,JSON.stringify(result));}
      print(result);
    }
    else if(action==='reindex')print(await migrateCache(cache));
    else if(action==='library')print({records:(await cacheRecords(cache)).map(item=>item.record)});
    else if(action==='pairs')print({pairs:(await cacheRecords(cache)).map(({record,jsonPath})=>({sequence:record.sequence||null,cacheId:record.cacheId||null,id:record.id,status:record.status,jsonPath,imagePath:record.imagePath||null}))});
    // Generated images (e.g. from the ChatGPT image studio) with their prompts; --out copies the original files.
    else if(action==='generations'){
     const key=args[1]&&!args[1].startsWith('--')?args[1]:null,source=option('source'),out=option('out');
     const records=key?[JSON.parse(await fs.readFile(await resolveCacheRecord(cache,key),'utf8'))]:(await cacheRecords(cache)).map(item=>item.record);
     const items=[];for(const record of records)for(const g of record.generations||[]){if(source&&!String(g.model||'').toLowerCase().includes(source.toLowerCase()))continue;items.push({taskId:record.id,prompt:g.prompt||record.zh||record.en||'',path:g.path,model:g.model,mode:g.mode,aspect:g.aspect,conversationUrl:g.conversationUrl,refName:g.refName,chatgptName:g.chatgptName,chatgptFileId:g.chatgptFileId,createdAt:g.createdAt});}
     if(out){const target=path.resolve(out);await fs.mkdir(target,{recursive:true});for(const item of items){try{const file=path.join(target,path.basename(item.path));await fs.copyFile(item.path,file);item.copiedTo=file;}catch(error){item.copyError=error.message;}}}
     print({count:items.length,generations:items});
    }
    else if(action==='get'||action==='image'){const key=args[1];const record=JSON.parse(await fs.readFile(await resolveCacheRecord(cache,key),'utf8'));print(action==='image'?{id:record.id,cacheId:record.cacheId||null,sequence:record.sequence||null,imagePath:record.imagePath||null}:record);}
    else throw new Error('Use local discover, doctor, scan, search, snapshot, submit, library, pairs, reindex, get ID or image ID');
  }else if(command==='help')print({commands:['local discover --extension-id YOUR_EXTENSION_ID','local doctor','local search --site pinterest.com --query TEXT [--scope scroll]','local search --url SEARCH_RESULTS_URL [--scope scroll] [--max-screens 20] [--close-tab true]','local snapshot [--url URL | --tab-id 123] [--screenshot false] [--wait 3] [--close-tab true]','local scan --scope loaded [--tab-id 123]','local submit --scan-id SCAN_ID --limit 100 [--offset 100]','local submit --urls [\"https://example.com/image.jpg\"]','local library','local pairs','local reindex','local get task-id','local image task-id','local generations [task-id] [--source chatgpt] [--out FOLDER]','login --url https://service.example','me','analyze image.jpg --wait true --id stable-task-id','batch folder --wait true','status task-id','library','export --out library.zip'],environment:['IMAGEPROMPT_URL','IMAGEPROMPT_TOKEN','IMAGEPROMPT_CONFIG','IMAGEPROMPT_CACHE'],languageOption:'--languages [{"code":"ja","name":"Japanese"}]',notes:'Each command prints JSON. Local search/scan/submit require the updated native bridge, local cache + CLI control enabled and a running browser. Cache files use six-digit sequence plus short code, with matching JSON and image stems. Scan returns URLs; submit returns queued job IDs and uses extension API/concurrency settings. Cloud quotas are enforced by server. Cloud batch submits sequentially.'});
  else if(command==='login'){
    const device=await api('/device/start',{label:'HoverPrompt CLI',scopes:['analyze','library:read','library:write']},false);
    process.stderr.write('Open '+device.verificationUrl+' in your browser, sign in, then approve this device.\n');
    let result;const end=Date.now()+device.expiresIn*1000;
    while(Date.now()<end){await sleep(5000);result=await api('/device/poll',{deviceCode:device.deviceCode},false);if(result.accessToken)break;}
    if(!result?.accessToken)throw new Error('Device authorization expired');
    await fs.mkdir(path.dirname(configPath),{recursive:true});await fs.writeFile(configPath,JSON.stringify({url:origin(),token:result.accessToken,expiresAt:result.expiresAt}),{mode:0o600});print({authorized:true,expiresAt:result.expiresAt});
  }else if(command==='me')print(await api('/me'));
  else if(command==='analyze')print(await analyze(args[0]));
  else if(command==='status')print(await api('/jobs/'+encodeURIComponent(args[0])));
  else if(command==='library')print(await api('/library'));
  else if(command==='batch'){
    const directory=path.resolve(args[0]);const files=(await fs.readdir(directory,{withFileTypes:true})).filter(x=>x.isFile()&&/\.(png|jpe?g|webp)$/i.test(x.name));
    for(const file of files){try{print({file:file.name,...await analyze(path.join(directory,file.name))});}catch(e){print({file:file.name,error:{code:e.code||'client_error',message:e.message}});if(e.status===429)break;}}
  }else if(command==='export'){
    const {records}=await api('/library');const blob=await exportLibrary(records,async r=>{const response=await fetch(origin()+'/api/images/'+r.id,{headers:{Authorization:'Bearer '+bearer}});if(!response.ok)throw new Error('Image missing');return response;});const output=path.resolve(option('out')||'hoverprompt-library.zip');await fs.writeFile(output,new Uint8Array(await blob.arrayBuffer()));print({exported:records.length,path:output});
  }else throw new Error('Unknown command. Run help.');
}catch(e){print({error:{code:e.code||'client_error',message:e.message}});process.exitCode=1;}
