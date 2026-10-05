// Plugin kit sample page: each live component shows its own markup below it (read from the page, so it never drifts).
(async()=>{
 await PluginKit.start();
 document.getElementById('appearance').onclick=()=>PluginKit.setAppearance(document.documentElement.dataset.appearance==='dark'?'light':'dark');
 for(const live of document.querySelectorAll('.demo-live')){
  const pre=document.createElement('pre');pre.className='code';const code=document.createElement('code');code.textContent=live.innerHTML.trim();pre.append(code);
  const copy=document.createElement('button');copy.type='button';copy.className='link copy';copy.textContent=PluginKit.T('复制代码|Copy markup');
  copy.onclick=async()=>{await navigator.clipboard.writeText(code.textContent);copy.textContent=PluginKit.T('已复制|Copied');setTimeout(()=>{copy.textContent=PluginKit.T('复制代码|Copy markup');},1500);};
  live.after(copy,pre);
 }
 PluginKit.onLanguage(()=>{for(const b of document.querySelectorAll('.copy'))b.textContent=PluginKit.T('复制代码|Copy markup');});
})();
