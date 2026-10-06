// Community, from the extension: the unread count (replies + private messages) and "post to the showcase".
// Uses the HoverPrompt account the extension is signed in to (cloudConfig.token); nothing happens without it.
globalThis.CommunityShare=(()=>{
 const SITE='https://hoverprompt.com';
 // the settings page translates through LanguageUI; plugin pages (the studio) through PluginKit; otherwise the browser language
 const T=value=>{if(globalThis.LanguageUI?.text)return LanguageUI.text(value);const [cn,...en]=String(value).split(' / ');if(globalThis.PluginKit)return PluginKit.t(cn,en.join(' / ')||undefined);return (navigator.language?.startsWith('zh')?cn:en.join(' / '))||cn;};
 const base=config=>{try{const url=new URL(config?.baseUrl||'');if(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))return url.origin;}catch{}return SITE;};
 async function account(){const {cloudConfig}=await chrome.storage.local.get(['cloudConfig']);return {base:base(cloudConfig),token:cloudConfig?.token||null};}
 async function api(path,data){
  const {base:origin,token}=await account();if(!token)throw Object.assign(new Error(T('请先在「账号与同步」登录 HoverPrompt 账号 / Sign in to your HoverPrompt account in Account & sync first')),{signedOut:true});
  const response=await fetch(origin+'/api'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(60000)});
  const value=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===429?T('每个账号每天最多发 5 条帖子，明天再来吧 / Each account can post 5 topics a day; try again tomorrow'):value.error?.message||'HTTP '+response.status);
  return value;
 }
 // unread replies to my topics + unread private messages (null when signed out or offline)
 async function unread(){try{const value=await api('/forum/inbox');return (value.unread||0)+(value.dmUnread||0);}catch{return null;}}
 const siteUrl=async path=>(await account()).base+path;
 // an image (data URL or same-extension URL) redrawn at most 2048 px, under 1.4 MB
 async function shrink(src){
  const blob=await (await fetch(src)).blob(),bitmap=await createImageBitmap(blob),scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  for(const quality of [.86,.75,.6,.45]){let url=canvas.toDataURL('image/webp',quality);if(!url.startsWith('data:image/webp'))url=canvas.toDataURL('image/jpeg',quality);if(url.length*.75<1.4*1024*1024)return url;}
  throw new Error(T('图片太大 / Image too large'));
 }
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 // the dialog: images, title (30), description with the prompt, tags; posting opens the topic
 async function open({images=[],prompt='',title='',model='',aspect=''}={}){
  images=images.filter(Boolean);const dialog=el('dialog','community-share');
  const close=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  const {token}=await account();
  if(!token){dialog.append(el('h2','',T('发布到社区 / Post to the community')),el('p','',T('请先在「账号与同步」登录 HoverPrompt 账号，然后再发布。 / Sign in to your HoverPrompt account in Account & sync, then post.')));
   const row=el('div','share-actions'),go=el('button','primary',T('去登录 / Sign in'));go.type='button';go.onclick=()=>{close();if(globalThis.SettingsLayout)SettingsLayout.navigate('account');else chrome.tabs.create({url:globalThis.CompanionHost?.mainPage?.()||chrome.runtime.getURL('popup.html')});};
   const cancel=el('button','',T('取消 / Cancel'));cancel.type='button';cancel.onclick=close;row.append(cancel,go);dialog.append(row);document.body.append(dialog);dialog.showModal();return;}
  let skipped=0;if(images.length>12){skipped=images.length-12;images=images.slice(0,12);}
  const form=el('form'),strip=el('div','share-strip');for(const src of images){const img=el('img');img.src=src;img.alt='';strip.append(img);}
  const titleInput=el('input');titleInput.maxLength=30;titleInput.required=true;titleInput.placeholder=T('标题（最多 30 字） / Title (up to 30 characters)');titleInput.setAttribute('aria-label',titleInput.placeholder);
  titleInput.value=[...String(title||prompt).replace(/\s+/g,' ').trim()].slice(0,30).join('');
  const body=el('textarea');body.rows=5;body.maxLength=9000;body.value=(model?T('模型： / Model: ')+model+(aspect?' · '+aspect:'')+'\n':'')+(prompt?T('提示词： / Prompt: ')+prompt:'');body.placeholder=T('说明（可选） / Description (optional)');body.setAttribute('aria-label',body.placeholder);
  const tags=el('input');tags.placeholder=T('标签（逗号分隔，最多 5 个） / Tags (comma separated, up to 5)');tags.setAttribute('aria-label',tags.placeholder);
  const status=el('p','share-status');status.textContent=skipped?T('一次最多 12 张，已取前 12 张 / Up to 12 images; the first 12 were taken'):'';
  const send=el('button','primary',T('发布到作品展示 / Post to the showcase')),cancel=el('button','',T('取消 / Cancel'));send.type='submit';cancel.type='button';cancel.onclick=close;
  const row=el('div','share-actions');row.append(cancel,send);
  form.append(el('h2','',T('发布到社区「作品展示」 / Post to the community showcase')),strip,titleInput,body,tags,status,row);dialog.append(form);document.body.append(dialog);dialog.showModal();titleInput.focus();
  form.onsubmit=async event=>{event.preventDefault();send.disabled=true;status.textContent=T('正在上传图片… / Uploading images…');
   try{
    const prepared=[];for(const src of images)prepared.push(await shrink(src));
    let text=body.value.trim();if([...text].length<10)text=(text+'\n'+titleInput.value).trim().padEnd(10,'。');
    const topicTags=tags.value.split(/[,，\s]+/).map(x=>x.replace(/^#+/,'').trim()).filter(Boolean).slice(0,5);
    const value=await api('/forum/topics',{category:'showcase',title:titleInput.value.trim(),body:text.slice(0,10000),images:prepared,tags:topicTags});
    const url=await siteUrl('/community#/t/'+encodeURIComponent(value.topic.id));
    status.replaceChildren(T('已发布到作品展示。 / Posted to the showcase. '));const link=el('a','',T('查看帖子 / View the topic'));link.href=url;link.target='_blank';link.rel='noopener';status.append(link);
    send.hidden=true;cancel.textContent=T('关闭 / Close');
   }catch(error){status.textContent=error.message;send.disabled=false;}
  };
 }
 return {open,unread,siteUrl,account};
})();
