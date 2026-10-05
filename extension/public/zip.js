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
export async function exportLibrary(records,getImage){
  if(records.length>500)throw new Error('Export at most 500 images per ZIP / 每次最多导出 500 张');
  const files=[],manifest=[];
  for(const record of records){
    const entry={...record};delete entry.image;delete entry.apiKey;delete entry.apiSource;
    if(record.hasImage||record.image){
      try{const response=await getImage(record),blob=await response.blob(),extension=blob.type.includes('png')?'png':blob.type.includes('webp')?'webp':'jpg';entry.file='images/'+record.id+'.'+extension;files.push({name:entry.file,data:await blob.arrayBuffer()});}
      catch{entry.exportError='Image unavailable';}
    }
    manifest.push(entry);
  }
  files.push({name:'manifest.json',data:JSON.stringify({version:2,exportedAt:new Date().toISOString(),records:manifest},null,2)});
  const codes=[...new Set(manifest.flatMap(r=>Object.keys(r.prompts||{})))];
  files.push({name:'prompts.csv',data:'\uFEFF'+[['id','image','zh','en','status','sourceUrl',...codes].map(cell).join(','),...manifest.map(r=>[r.id,r.file,r.zh,r.en,r.status,r.sourceUrl,...codes.map(code=>r.prompts?.[code]||'')].map(cell).join(','))].join('\r\n')});
  files.push({name:'preview.html',data:'<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'"><title>HoverPrompt export</title><style>body{max-width:1000px;margin:40px auto;font:16px/1.6 system-ui}article{padding:24px;border-bottom:1px solid #ddd}img{max-width:280px;max-height:320px}p{white-space:pre-wrap}</style>'+manifest.map(r=>'<article>'+(r.file?'<img src="'+escape(r.file)+'" alt="">':'')+'<p>'+escape(r.zh)+'</p><p>'+escape(r.en)+'</p><small>'+escape(r.id)+' · '+escape(r.status)+'</small></article>').join('')});
  return zipFiles(files);
}
export function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
