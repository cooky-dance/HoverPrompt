// ChatGPT image studio plugin, settings-page side. While the plugin is on:
//  - the navigation gets a "ChatGPT studio" page (after a divider); opening it shows the studio in place and folds the
//    navigation into an icon strip (SettingsLayout.addPage);
//  - the library's Records / Images row gets a "ChatGPT images" tab, a scope: the Records and Generated views, and their statistics (the library's own
//    statistics code), narrow to ChatGPT runs (HistoryTools.registerScope).
// Nothing here runs while the plugin is off; the settings page itself only offers the two hooks.
(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):String(value).split(' / ')[0];
 const PAGE='chatgpt-studio',SCOPE={id:'chatgpt',label:'Companion Studio 图片 / Companion Studio images',match:task=>globalThis.RecordKinds?['chatgpt-studio','chatgpt-save','import'].includes(RecordKinds.kindOf(task)):task?.source==='chatgpt-studio'||task?.source==='chatgpt'};
 const embedded=new URLSearchParams(location.search).get('embed')==='1';
 let bar=null,page=null,standalone=false;
 const STUDIO_URL=()=>chrome.runtime.getURL('chatgpt-studio.html');
 // the classic single page (own tab, own light/dark switch): focus it when it is already open
 async function openStandalone(){try{const [tab]=await chrome.tabs.query({url:STUDIO_URL()+'*'});if(tab){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return;}}catch{}chrome.tabs.create({url:STUDIO_URL()});}
 // the scope is a third tab next to "Records" and "Images" (one row); it shows ChatGPT runs as records
 function mountScope(){
  if(bar||typeof HistoryTools==='undefined'||!HistoryTools.registerScope)return;HistoryTools.registerScope({id:SCOPE.id,match:SCOPE.match,exclusive:true,get label(){return T(SCOPE.label);}});
  const row=HistoryTools.viewSwitch?.()||document.getElementById('historyViewSwitch');if(!row)return;
  bar=document.createElement('button');bar.type='button';bar.id='chatgptScopeTab';bar.dataset.scopeTab=SCOPE.id;bar.textContent=T(SCOPE.label);
  bar.onclick=()=>{if(HistoryTools.scope()===SCOPE.id)return;HistoryTools.setView?.('records',false);HistoryTools.setScope(SCOPE.id);};
  row.append(bar);bar.setAttribute('aria-pressed',String(HistoryTools.scope()===SCOPE.id));
 }
 // settings → plugins → "open as its own page": the navigation entry opens the classic page instead of showing it here
 function mountPage(single){
  if(embedded||!globalThis.SettingsLayout?.addPage)return;
  if(page&&standalone===single)return;if(page){if(SettingsLayout.page()===PAGE)SettingsLayout.navigate('history');SettingsLayout.removePage(PAGE);page=null;}
  standalone=single;const label={zh:'Companion Studio',en:'Companion Studio'};
  // the Chrome build has no studio page of its own: the entry opens the companion plugin's studio
  if(globalThis.Companion?.external){page=true;standalone=true;SettingsLayout.addPage({id:PAGE,label,onOpen:()=>Companion.open()});return;}
  if(single){page=true;SettingsLayout.addPage({id:PAGE,label,onOpen:openStandalone});return;}
  page=document.createElement('div');page.className='plugin-page';
  SettingsLayout.addPage({id:PAGE,label,pane:page,collapseNav:true});
 }
 // the studio loads the first time its page is opened, and then stays (a running batch keeps going while you look elsewhere)
 document.addEventListener('settings-page-changed',event=>{if(event.detail!==PAGE||!(page instanceof Element)||page.querySelector('iframe'))return;const frame=document.createElement('iframe');frame.title=T('Companion Studio / Companion Studio');frame.src='chatgpt-studio.html?embed=1';page.append(frame);});
 function unmount(){if(bar){HistoryTools.unregisterScope(SCOPE.id);bar.remove();bar=null;}if(page){SettingsLayout.removePage(PAGE);page=null;}}
 async function sync(){const {plugins={}}=await chrome.storage.local.get(['plugins']);if(plugins.chatgpt?.enabled===true){mountScope();mountPage(plugins.chatgpt.standalone===true);}else unmount();}
 globalThis.ChatGPTStudioPage={open:()=>{if(globalThis.Companion?.external)Companion.open();else if(page&&!standalone)SettingsLayout.navigate(PAGE);else openStandalone();}};
 document.addEventListener('imageprompt-language',()=>{if(bar)bar.textContent=T(SCOPE.label);});
 chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.plugins)sync();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
})();
