const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
export function zipFiles(files){
  const parts=[],directory=[];let offset=0,dirSize=0;
  if(files.length>65535)throw new Error('Too many ZIP entries');
  for(const file of files){
    const name=encoder.encode(file.name),data=typeof file.data==='string'?encoder.encode(file.data):new Uint8Array(file.data),checksum=crc(data);
    if(offset+data.length>0xffffffff)throw new Error('Export exceeds 4 GB; select fewer records');
    const local=header(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint32(14,checksum,true);local.view.setUint32(18,data.length,true);local.view.setUint32(22,data.length,true);local.view.setUint16(26,name.length,true);
    const central=header(46);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x800,true);central.view.setUint32(16,checksum,true);central.view.setUint32(20,data.length,true);central.view.setUint32(24,data.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);
    parts.push(local.bytes,name,data);directory.push(central.bytes,name);offset+=30+name.length+data.length;dirSize+=46+name.length;
  }
  const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,dirSize,true);end.view.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
}
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cell=value=>'"'+String(value||'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
export function cleanExportRecord(r){return {...(r.exportMeta||{}),id:r.id,createdAt:r.createdAt,status:r.status,focus:r.focus||'',prompts:r.prompts&&Object.keys(r.prompts).length?r.prompts:{'zh-CN':r.zh||'',en:r.en||''},sourceUrl:r.sourceUrl||r.imageUrl||'',timing:r.timing||null,error:r.error||'',file:r.file||null};}
export function exportText(records,format){const clean=records.map(cleanExportRecord);if(format==='jsonl')return new Blob([clean.map(r=>JSON.stringify(r)).join('\n')+'\n'],{type:'application/x-ndjson'});if(format==='csv'){const codes=[...new Set(clean.flatMap(r=>Object.keys(r.prompts)))];return new Blob(['\uFEFF'+[['id','createdAt','status','focus','sourceUrl','error',...codes].map(cell).join(','),...clean.map(r=>[r.id,r.createdAt,r.status,r.focus,r.sourceUrl,r.error,...codes.map(code=>r.prompts[code]||'')].map(cell).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'});}throw new Error('Unsupported export format');}
// "Images + prompts ZIP" contains exactly that: each image plus a same-named .txt with its saved prompts
// (every language, labelled). JSONL and CSV are separate formats and are not bundled into the ZIP.
export async function exportLibrary(records,getImage,onRecord=()=>{}){
  if(records.length>500)throw new Error('Export at most 500 images per ZIP / 每次最多导出 500 张');
  const files=[],width=String(records.length).length<4?4:String(records.length).length;
  const used=new Set();records.forEach((record,index)=>{let stem=record.exportName?String(record.exportName).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100):'';if(!stem)stem=String(index+1).padStart(width,'0')+'-'+(String(record.id).replace(/[^a-zA-Z0-9]/g,'').slice(0,8)||'record');let unique=stem;for(let n=2;used.has(unique);n++)unique=stem+'-'+n;used.add(unique);record.__stem=unique;});
  for(const record of records){
    const entry={...cleanExportRecord(record),zh:record.zh,en:record.en},stem=record.__stem;delete record.__stem;
    if(record.hasImage||record.image){
      try{const response=await getImage(record),blob=await response.blob();if(!['image/png','image/jpeg','image/webp'].includes(blob.type))throw new Error('Invalid image');const extension=blob.type.includes('png')?'png':blob.type.includes('webp')?'webp':'jpg';entry.file=stem+'.'+extension;files.push({name:entry.file,data:await blob.arrayBuffer()});}
      catch{entry.exportError='Image unavailable';}
    }
    const prompts=Object.entries(entry.prompts||{}).filter(([,text])=>typeof text==='string'&&text.trim());
    const body=prompts.length?prompts.map(([code,text])=>'['+code+']\n'+text.trim()).join('\n\n'):[entry.zh&&'[zh-CN]\n'+entry.zh,entry.en&&'[en]\n'+entry.en].filter(Boolean).join('\n\n');
    files.push({name:stem+'.txt',data:'\uFEFF'+(body||'')+'\n'});
    onRecord(entry);
  }
  return zipFiles(files);
}
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
