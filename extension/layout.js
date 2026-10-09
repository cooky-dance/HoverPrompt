/* Settings navigation and shared appearance. No page styles are inherited. */
(()=>{
 const $=id=>document.getElementById(id),embedded=new URLSearchParams(location.search).get('embed')==='1';
 const pages=['history','collection','generation','sources','interface','cli','account'];
 const labels={en:['Library','Page collection','Generation','API sources','Appearance & interaction','Local CLI','Account & sync'],'zh-CN':['资料库','网页采集','生成设置','API 来源','外观与交互','本地 CLI','账号与同步'],ru:['Библиотека','Сбор страниц','Генерация','Источники API','Внешний вид','Локальный CLI','Аккаунт'],ja:['ライブラリ','ページ収集','生成設定','API ソース','外観と操作','ローカル CLI','アカウント'],ko:['라이브러리','페이지 수집','생성 설정','API 소스','모양과 조작','로컬 CLI','계정'],hi:['लाइब्रेरी','पेज संग्रह','जनरेशन','API स्रोत','दिखावट','लोकल CLI','खाता'],ar:['المكتبة','جمع الصور','الإنتاج','مصادر API','المظهر والتفاعل','CLI المحلي','الحساب']};
 // Skill market sits just before Account & sync.
 pages.splice(pages.indexOf('account'),0,'skills');
 for(const [code,name] of Object.entries({en:'Skill market','zh-CN':'Skill 市场',ru:'Маркет навыков',ja:'スキルマーケット',ko:'스킬 마켓',hi:'स्किल मार्केट',ar:'سوق المهارات'}))labels[code]?.splice(pages.indexOf('skills'),0,name);
 // Plugins sit right after the Skill market.
 pages.splice(pages.indexOf('skills')+1,0,'plugins');
 for(const [code,name] of Object.entries({en:'Plugins','zh-CN':'插件市场',ru:'Плагины',ja:'プラグイン',ko:'플러그인',hi:'प्लगइन',ar:'الإضافات'}))labels[code]?.splice(pages.indexOf('plugins'),0,name);
 let page='history';
 const sidebar=document.createElement('aside');sidebar.id='settingsSidebar';sidebar.innerHTML='<a class="brand" href="https://hoverprompt.com/" target="_blank" rel="noopener"><img class="brand-icon" src="icons/icon-32.png" alt="" width="24" height="24">HoverPrompt<span>IMAGE TO PROMPT</span></a><button id="sidebarToggle" type="button" aria-expanded="false" aria-controls="settingsNavigation" title="菜单 / Menu">☰</button><button id="navCollapse" type="button" aria-pressed="false" title="收起导航 / Collapse navigation"></button><nav id="settingsNavigation"></nav>';
 const top=document.createElement('div');top.id='basicConfiguration';top.innerHTML='<div class="page-heading">Library</div><div class="appearance-controls"><button id="appearanceToggle" type="button" class="appearance-toggle"></button><label title="Theme color">◉ <input id="themeColor" type="color" value="#168c80"></label><label title="Glass effect"><input id="glassEffect" type="checkbox" checked> Glass</label><label title="玻璃不透明度 / Glass opacity">◫ <input id="glassOpacity" type="range" min="50" max="95" step="5" value="80"></label><label id="topLanguageLabel" title="界面语言 / Interface language"></label></div>';
 const selector=$('uiLanguage');selector.replaceChildren();for(const [code,name] of [['en','English · EN'],['zh-CN','中文 · ZH'],['ru','Русский · RU'],['ja','日本語 · JA'],['ko','한국어 · KO'],['hi','हिन्दी · HI'],['ar','العربية · AR']]){const option=new Option(name,code);selector.add(option);}
 // Navigation labels follow this selector; settings-ui sets it later without a change event, so seed it
 // from the last known language (first paint) and from storage, instead of rendering English until a click.
 const knownLanguage=value=>[...selector.options].some(option=>option.value===value);
 try{const cached=localStorage.getItem('imageprompt.uiLanguage');if(knownLanguage(cached))selector.value=cached;}catch{}
 top.querySelector('#topLanguageLabel').append(selector);document.body.prepend(top);document.body.prepend(sidebar);
 globalThis.LiquidGlass?.install(document.body);sidebar.classList.add('lg');top.querySelector('.appearance-controls').classList.add('lg');
 // the brand opens the website (the account's own address when one is set); a member sees community messages next to the credits
 const brand=sidebar.querySelector('.brand');brand.title=(globalThis.LanguageUI?.text||(v=>v.split(' / ')[0]))('打开 HoverPrompt 官网 / Open the HoverPrompt website');
 globalThis.CommunityShare?.siteUrl('/').then(url=>{brand.href=url;}).catch(()=>{});
 const inbox=document.createElement('a');inbox.id='communityInbox';inbox.className='community-inbox';inbox.target='_blank';inbox.rel='noopener';inbox.hidden=true;
 inbox.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><b class="inbox-count" hidden></b>';
 async function refreshInbox(){
  if(!globalThis.CommunityShare||embedded)return;const n=await CommunityShare.unread();inbox.hidden=n==null;if(n==null)return;
  const label=(globalThis.LanguageUI?.text||(v=>v.split(' / ')[0]))('社区消息 / Community messages');inbox.title=label+(n?' · '+n:'');inbox.setAttribute('aria-label',inbox.title);
  const count=inbox.querySelector('.inbox-count');count.hidden=!n;count.textContent=n>99?'99+':String(n);inbox.href=await CommunityShare.siteUrl('/community#/inbox');
 }
 top.querySelector('.appearance-controls').prepend(inbox);refreshInbox();setInterval(refreshInbox,180000);addEventListener('focus',refreshInbox);
 chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.cloudConfig)refreshInbox();});
 const appearanceControls=top.querySelector('.appearance-controls'),interfacePane=document.querySelector('[data-settings-pane="interface"]');
 function relocateAppearance(){if(innerWidth<=600)interfacePane.prepend(appearanceControls);else top.append(appearanceControls);}
 addEventListener('resize',relocateAppearance);relocateAppearance();
 $('settings').querySelector('h2').hidden=true;$('settings').querySelector('.settings-tabs').hidden=true;
 if(embedded)document.querySelector('main').append($('batchPane'));
 else document.querySelector('[data-settings-pane="collection"]').append($('batchPane'));
 const generation=document.querySelector('[data-settings-pane="generation"]'),sources=document.querySelector('[data-settings-pane="sources"]'),interfaceSettings=document.querySelector('[data-settings-pane="interface"]');
 for(const id of ['defaultHistoryOpen','imageButtonMode'])interfaceSettings.querySelector('#interfaceControls').append($(id).closest('label'));
 const requestFieldset=sources.querySelector('fieldset');generation.querySelector('#generationControls').append(requestFieldset);
 const requestActions=document.createElement('div');requestActions.className='form-actions';requestActions.append($('saveRequestControl'),$('cancelRequestControl'),$('requestSaveStatus'));requestFieldset.append(requestActions);
 const sourceHeader=document.createElement('div');sourceHeader.className='source-header';sourceHeader.append($('sourceSelect').closest('label'),$('addSource'),$('deleteSource'),$('activateSource'));sources.querySelector('h3').after(sourceHeader);
 const sourceGrid=document.createElement('div');sourceGrid.className='source-grid';for(const id of ['sourceName','protocol','baseUrl','model','apiKey','priority','sourceTimeout','routeMode','sourceEnabled'])sourceGrid.append($(id).closest('label'));sourceHeader.after(sourceGrid);
 const upload=$('file').closest('section');upload.id='imageSelection';
 // Pages a plugin adds (e.g. the ChatGPT image studio): listed after a divider at the end of the navigation, each with its
 // own pane; such a page can ask for the navigation to fold into an icon strip while it is open.
 const extra=new Map();let folded=false;try{folded=localStorage.getItem('imageprompt.navFolded')==='1';}catch{}
 const currentLanguage=()=>selector.value||'en',labelOf=value=>extra.has(value)?(currentLanguage().startsWith('zh')?extra.get(value).label.zh:extra.get(value).label.en):(labels[currentLanguage()]||labels.en)[pages.indexOf(value)];
 // a page with onOpen and no pane is a link (e.g. a plugin page that opens in its own tab)
 function addPage({id,label,pane,collapseNav=false,onOpen}){
  if(extra.has(id)||pages.includes(id))return;extra.set(id,{label,collapseNav});
  if(pane){pane.dataset.settingsPane=id;pane.hidden=true;$('settings').append(pane);}
  const nav=sidebar.querySelector('nav');if(!nav.querySelector('.nav-divider')){const divider=document.createElement('hr');divider.className='nav-divider';nav.append(divider);}
  const button=document.createElement('button');button.dataset.page=id;button.onclick=()=>onOpen?onOpen():navigate(id);if(onOpen)button.dataset.external='true';nav.append(button);refreshLabels();
 }
 function removePage(id){if(!extra.has(id))return;extra.delete(id);sidebar.querySelector('nav [data-page="'+id+'"]')?.remove();document.querySelector('[data-settings-pane="'+id+'"]')?.remove();if(!extra.size)sidebar.querySelector('.nav-divider')?.remove();if(page===id)navigate('history');}
 // folded: icons only; a page that asks for it folds the navigation while open, and the button flips it any time
 function paintFold(){const fold=folded||!!extra.get(page)?.collapseNav&&!document.body.dataset.navUnfolded;document.body.classList.toggle('nav-folded',fold);const button=$('navCollapse');button.setAttribute('aria-pressed',String(fold));button.title=fold?'展开导航 / Expand navigation':'收起导航 / Collapse navigation';}
 sidebar.querySelector('#navCollapse').onclick=()=>{const fold=document.body.classList.contains('nav-folded');if(extra.get(page)?.collapseNav){if(fold)document.body.dataset.navUnfolded='1';else delete document.body.dataset.navUnfolded;}else{folded=!fold;try{localStorage.setItem('imageprompt.navFolded',folded?'1':'0');}catch{}}paintFold();};
 function navigate(value){page=pages.includes(value)||extra.has(value)?value:'history';delete document.body.dataset.navUnfolded;$('settings').hidden=page==='history';for(const item of document.querySelectorAll('[data-settings-pane]'))item.hidden=item.dataset.settingsPane!==page;
  if(!embedded){for(const item of [upload,$('result'),$('historySection')]){if(item===$('result')){if(page!=='history'){item.dataset.wasVisible=String(!item.hidden);item.hidden=true;}else if(item.dataset.wasVisible==='true')item.hidden=false;}else item.hidden=page!=='history';}}
  document.body.dataset.settingsPage=page;for(const button of sidebar.querySelectorAll('nav button'))button.classList.toggle('active',button.dataset.page===page);sidebar.classList.remove('nav-open');sidebar.querySelector('#sidebarToggle').setAttribute('aria-expanded','false');refreshLabels();paintFold();document.dispatchEvent(new CustomEvent('settings-page-changed',{detail:page}));if(!embedded){window.scrollTo({top:0,behavior:'instant'});}
 }
 function refreshLabels(){const language=selector.value||'en';sidebar.querySelectorAll('nav button').forEach(b=>{b.textContent=labelOf(b.dataset.page);b.title=b.textContent;});top.querySelector('.page-heading').textContent=labelOf(page);document.documentElement.dir=language==='ar'?'rtl':'ltr';const languageLabel=$('topLanguageLabel');languageLabel.className='language-control';languageLabel.dataset.flag=language;}
 for(const value of pages){const button=document.createElement('button');button.dataset.page=value;button.onclick=()=>navigate(value);sidebar.querySelector('nav').append(button);}
 sidebar.querySelector('#sidebarToggle').onclick=()=>{sidebar.classList.toggle('nav-open');sidebar.querySelector('#sidebarToggle').setAttribute('aria-expanded',String(sidebar.classList.contains('nav-open')));};
 selector.addEventListener('change',refreshLabels);document.addEventListener('prompt-presentation-changed',refreshLabels);
 function useLanguage(value){if(!knownLanguage(value))return;selector.value=value;try{localStorage.setItem('imageprompt.uiLanguage',value);}catch{}refreshLabels();}
 chrome.storage.local.get(['uiLanguage']).then(saved=>useLanguage(saved.uiLanguage)).catch(()=>{});
 chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.uiLanguage)useLanguage(changes.uiLanguage.newValue);});
 // Save and validation messages are written next to controls that may be far off-screen (or to the top
 // status line); mirror them into one fixed toast so every save visibly succeeds or fails.
 const toast=document.createElement('div');toast.id='saveToast';toast.className='lg';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);let toastTimer=null;
 function showToast(text){const value=String(text||'').trim();if(!value||embedded||document.body.dataset.settingsPage==='history')return;toast.textContent=value;toast.dataset.tone=/失败|无效|错误|请先|冲突|elsewhere|invalid|error|fail|unavailable|:\s*\d+\s*[–-]\s*\d+/i.test(value)?'error':/已保存|已更新|已取消|saved|discarded|updated/i.test(value)?'ok':'info';toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),value.length>60?7000:4000);}
 const watched=new WeakSet();
 function watchStatus(){for(const node of document.querySelectorAll('#status,[id$="SaveStatus"],#sourceStatus,#localBridgeStatus,#cloudStatus')){if(watched.has(node))continue;watched.add(node);new MutationObserver(()=>showToast(node.textContent)).observe(node,{childList:true,characterData:true,subtree:true});}}
 for(const delay of [0,1500,5000])setTimeout(watchStatus,delay);
 // Appearance: "system" (default) follows the browser's prefers-color-scheme; the top-bar icon flips light/dark
 // in one click, and the interface page offers system / light / dark explicitly.
 const modeSelect=document.createElement('label');modeSelect.innerHTML='外观 / Appearance<select id="appearanceMode"><option value="system">跟随系统 / System</option><option value="light">浅色 / Light</option><option value="dark">深色 / Dark</option></select>';
 interfacePane.querySelector('#interfaceControls')?.prepend(modeSelect);
 const systemDark=matchMedia('(prefers-color-scheme: dark)');
 const effectiveMode=mode=>mode==='light'||mode==='dark'?mode:systemDark.matches?'dark':'light';
 systemDark.addEventListener?.('change',()=>{if($('appearanceMode').value==='system')apply(currentPrefs());});
 function currentPrefs(){return {appearanceMode:$('appearanceMode').value,themeColor:$('themeColor').value,glassEffect:$('glassEffect').checked,glassOpacity:Number($('glassOpacity').value)};}
 $('appearanceToggle').onclick=()=>{$('appearanceMode').value=effectiveMode($('appearanceMode').value)==='dark'?'light':'dark';appearance();};
 async function appearance(){const prefs={appearanceMode:$('appearanceMode').value,themeColor:$('themeColor').value,glassEffect:$('glassEffect').checked,glassOpacity:Number($('glassOpacity').value)};apply(prefs);await chrome.storage.local.set(prefs);}
 function apply(prefs){const setting=['light','dark','system'].includes(prefs.appearanceMode)?prefs.appearanceMode:'system',effective=effectiveMode(setting);document.documentElement.dataset.appearance=effective;document.documentElement.dataset.appearanceSetting=setting;
  const toggle=$('appearanceToggle');if(toggle){toggle.dataset.mode=effective;const label=effective==='dark'?'切换到浅色 / Switch to light':'切换到深色 / Switch to dark';toggle.title=setting==='system'?label.replace(' / ','（当前跟随系统） / ')+' (following system)':label;toggle.setAttribute('aria-label',label);}document.documentElement.dataset.glass=String(prefs.glassEffect!==false);const color=/^#[0-9a-f]{6}$/i.test(prefs.themeColor||'')?prefs.themeColor:'#168c80';document.documentElement.style.setProperty('--accent',color);const channels=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;document.documentElement.style.setProperty('--accent-ink',luminance>.179?'#000':'#fff');const opacity=Number.isFinite(Number(prefs.glassOpacity))?Math.max(50,Math.min(95,Number(prefs.glassOpacity))):80;document.documentElement.style.setProperty('--glass-opacity',String(opacity/100));$('appearanceMode').value=setting;$('themeColor').value=color;$('glassEffect').checked=prefs.glassEffect!==false;$('glassOpacity').value=String(opacity);}
 for(const id of ['appearanceMode','themeColor','glassEffect','glassOpacity'])$(id).onchange=appearance;
 chrome.storage.local.get(['appearanceMode','themeColor','glassEffect','glassOpacity']).then(apply);chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&['appearanceMode','themeColor','glassEffect','glassOpacity'].some(key=>changes[key]))chrome.storage.local.get(['appearanceMode','themeColor','glassEffect','glassOpacity']).then(apply);});
 const activation=document.createElement('label');activation.className='checkbox-setting';activation.innerHTML='<input type="checkbox" id="imageButtonsRequireActivation"> 点击扩展图标后显示图片提示词按钮 / Show image buttons after clicking extension icon';$('interfaceControls').append(activation);chrome.storage.local.get(['imageButtonsRequireActivation']).then(s=>$('imageButtonsRequireActivation').checked=s.imageButtonsRequireActivation===true);$('imageButtonsRequireActivation').onchange=()=>chrome.storage.local.set({imageButtonsRequireActivation:$('imageButtonsRequireActivation').checked});
 if(!embedded)document.querySelector('main').insertBefore($('status'),$('settings'));
 globalThis.SettingsLayout={navigate,addPage,removePage,page:()=>page};navigate('history');
 // a double click on the toolbar icon opens the Library: a new tab at #library, or this tab by message (background.js)
 if(!embedded){chrome.runtime.onMessage?.addListener((message,sender,respond)=>{if(message?.type!=='OPEN_SETTINGS_PAGE'||sender?.tab)return;navigate(message.page);respond({page});});addEventListener('hashchange',()=>{if(location.hash==='#library')navigate('history');});}
 if(embedded){sidebar.hidden=true;top.hidden=true;document.body.classList.add('compact-layout');}
})();
