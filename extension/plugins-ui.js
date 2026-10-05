/* Plugins page (sidebar, next to the Skill market): switch official plugins on or off, import (coming with the plugin
   engine) and the developer documentation. Settings live in chrome.storage.local.plugins = {id: {enabled}}. */
globalThis.PluginsUI=(()=>{
 const T=value=>typeof LanguageUI!=='undefined'?LanguageUI.text(value):String(value).split(' / ')[0];
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 const OFFICIAL=[
  {id:'studio',name:'生图工作台 / Image studio',where:'资料库 / Library',default:true,desc:'在资料库「生成提示词」下方一键生图：文生图或以上传的图（最多 10 张，可拖拽排序）为参考，选比例、1 到 10 张、固定前缀。 / One-click generation under Generate in the library: text to image, or image to image with up to 10 uploaded references in your order; ratio, 1-10 images and a fixed prefix.'},
  {id:'chatgpt',name:'Companion Studio · ChatGPT 生图工作台 / Companion Studio · ChatGPT image workbench',where:'chatgpt.com',default:false,risk:true,page:'chatgpt-studio.html',desc:'ChatGPT 生图工作台：在你自己的 ChatGPT 账号（chatgpt.com）里批量生图：选比例和张数，Ctrl+V 粘贴参考图，同时驱动最多 10 个会话，任务平均分配、每个会话等出图后再发下一条，显示进度百分比，结果存进资料库。HoverPrompt 与 OpenAI 无官方关系。 / The ChatGPT image workbench: batch image generation in your own ChatGPT account (chatgpt.com): pick a ratio and count, paste references with Ctrl+V and run up to 10 conversations at once. Images are shared out evenly, each conversation waits for its image before the next, progress shows as a percentage and results go to the library. HoverPrompt is not affiliated with OpenAI.'},
  {id:'mj',name:'风格参数面板 / Style parameter panel',where:'midjourney.com',soon:true,desc:'带预览图的风格参数与情绪板，一键填入 Midjourney 输入框。 / Style parameters and moodboards with previews, filled into the Midjourney prompt in one click.'}];
 let pane=null,tab='official',settings={};
 const enabled=p=>settings[p.id]?.enabled??p.default;
 async function load(){settings=(await chrome.storage.local.get(['plugins'])).plugins||{};}
 async function setEnabled(id,value){settings={...settings,[id]:{...(settings[id]||{}),enabled:value}};await chrome.storage.local.set({plugins:settings});render();}
 function build(){const anchor=document.querySelector('[data-settings-pane="account"]');if(!anchor||document.querySelector('[data-settings-pane="plugins"]'))return false;pane=el('div');pane.dataset.settingsPane='plugins';pane.hidden=true;anchor.after(pane);return true;}
 function render(){
  if(!pane)return;pane.replaceChildren();
  const head=el('div','plugins-head');head.append(el('h3','',T('插件 / Plugins')),el('p','hint',T('插件为 HoverPrompt 增加新的页面或网站面板。官方插件内置在扩展里，按需开启。 / Plugins add pages or website panels to HoverPrompt. Official plugins ship with the extension; turn on the ones you want.')));pane.append(head);
  const tabs=el('div','segmented skill-tabs plugin-tabs');tabs.setAttribute('role','tablist');
  for(const [id,label] of [['official','官方插件 / Official'],['import','导入插件 / Import'],['docs','开发文档 / Developer docs']]){const b=el('button','',T(label));b.type='button';b.setAttribute('role','tab');b.dataset.tab=id;b.setAttribute('aria-selected',String(tab===id));b.setAttribute('aria-pressed',String(tab===id));b.onclick=()=>{tab=id;render();};tabs.append(b);}
  pane.append(tabs);
  if(tab==='official')pane.append(official());else if(tab==='import')pane.append(importer());else pane.append(docs());
 }
 function official(){
  const list=el('div','plugin-list');
  for(const p of OFFICIAL){
   const card=el('article','plugin-card');card.dataset.plugin=p.id;
   const top=el('div','plugin-top');const title=el('div');title.append(el('b','',T(p.name)),el('span','plugin-where',T('运行位置 / Runs on')+'：'+T(p.where)));
   top.append(title);
   if(p.soon)top.append(el('span','plugin-soon',T('即将推出 / Coming soon')));
   else{const sw=el('button','plugin-switch');sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-checked',String(enabled(p)));sw.setAttribute('aria-label',T(p.name));sw.append(el('span'));sw.onclick=()=>toggle(p,!enabled(p));top.append(sw);}
   card.append(top,el('p','hint',T(p.desc)));
   // the ChatGPT studio shows inside the settings page; this brings back the classic single page with its own light/dark switch
   // Chrome build: the studio is a companion plugin from the website (Chrome Web Store policy); show whether it is there
   if(p.id==='chatgpt'&&globalThis.Companion?.external){card.append(companionStatus());list.append(card);continue;}
   if(p.id==='chatgpt'&&enabled(p)){const option=el('label','plugin-option');const box=el('input');box.type='checkbox';box.id='chatgptStandalone';box.checked=settings.chatgpt?.standalone===true;box.onchange=async()=>{settings={...settings,chatgpt:{...(settings.chatgpt||{}),standalone:box.checked}};await chrome.storage.local.set({plugins:settings});};option.append(box,el('span','',T('工作台单独页面打开（原版单页，带自己的日夜切换） / Open the studio as its own page (classic single page with its own light/dark switch)')));card.append(option);}
   if(p.page&&enabled(p)){const open=el('button','plugin-open',T('打开工作台 / Open workbench'));open.type='button';open.onclick=()=>globalThis.ChatGPTStudioPage&&p.id==='chatgpt'?ChatGPTStudioPage.open():chrome.tabs.create({url:chrome.runtime.getURL(p.page)});card.append(open);}
   if(p.risk)card.append(el('p','plugin-risk',T('自动操作第三方 AI 网页可能违反该服务商的使用条款，账号有被限制的风险，由使用者自行承担。 / Automating a third-party AI website may breach that provider’s terms and risk your account; use at your own risk.')));
   list.append(card);
  }
  return list;
 }
 function companionStatus(){
  const box=el('div','plugin-companion');box.append(el('p','hint',T('正在查找 ChatGPT 工作室配套插件… / Looking for the ChatGPT studio companion plugin…')));
  Companion.ping().then(found=>{
   box.replaceChildren();
   if(found){box.append(el('p','plugin-companion-ok',T('已连接配套插件 / Companion plugin connected')+' · v'+found.version));const open=el('button','plugin-open',T('打开工作台 / Open workbench'));open.type='button';open.onclick=()=>Companion.open();box.append(open);}
   else{box.append(el('p','hint',T('Chrome 版不内置 ChatGPT 工作室。从官网下载配套插件，在扩展程序页面以「加载已解压的扩展程序」安装后，即可在这里打开。 / The Chrome version does not include the ChatGPT studio. Download the companion plugin from the website and install it with “Load unpacked” on the extensions page; then open it from here.')));
    const get=el('button','plugin-open',T('下载配套插件 / Get the companion plugin'));get.type='button';get.onclick=()=>chrome.tabs.create({url:Companion.INSTALL_URL});box.append(get);}
  });
  return box;
 }
 async function toggle(p,value){
  if(value&&p.risk){const {chatgptConsent}=await chrome.storage.local.get(['chatgptConsent']);if(!chatgptConsent&&!(await confirmRisk()))return;}
  await setEnabled(p.id,value);
 }
 function confirmRisk(){
  return new Promise(resolve=>{
   const dialog=el('dialog','plugin-dialog');dialog.append(el('h3','',T('开启前请确认 / Before you turn it on')),el('p','',T('这个插件会替你在 ChatGPT 页面上输入提示词、附上参考图并点击发送。OpenAI 的使用条款限制自动化操作，你的账号可能因此被限制或封禁，风险由使用者自行承担。插件每次只发一条，检测到限额会自动停止。 / This plugin types prompts, attaches references and presses Send on ChatGPT for you. OpenAI’s terms restrict automation; your account may be limited or banned, at your own risk. It sends one message at a time and stops on limits.')));
   const row=el('div','form-actions');const ok=el('button','primary',T('我了解风险，开启 / I understand, turn on'));ok.type='button';const no=el('button','',T('取消 / Cancel'));no.type='button';
   ok.onclick=async()=>{await chrome.storage.local.set({chatgptConsent:Date.now()});dialog.close();resolve(true);};no.onclick=()=>{dialog.close();resolve(false);};dialog.addEventListener('cancel',()=>resolve(false));
   row.append(ok,no);dialog.append(row);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  });
 }
 function importer(){
  const box=el('div','plugin-import');
  box.append(el('p','',T('第三方插件只包含数据（配置、界面布局、风格库、模板和网站适配规则），由扩展内置的插件引擎运行。插件引擎完成后开放导入。 / Third-party plugins contain data only (settings, layouts, style libraries, templates and site rules) and run on the built-in plugin engine. Import opens when the engine is ready.')));
  const form=el('div','plugin-import-form');const url=el('input');url.placeholder=T('GitHub 仓库地址 / GitHub repository URL');url.disabled=true;const local=el('button','',T('选择本地文件夹或 ZIP / Choose a folder or ZIP'));local.type='button';local.disabled=true;form.append(url,local);box.append(form);
  const consent=el('label','checkbox-setting plugin-consent');const cb=el('input');cb.type='checkbox';cb.disabled=true;consent.append(cb,el('span','',T('我了解此插件由第三方提供，HoverPrompt 不对其数据内容负责 / I understand this plugin comes from a third party and HoverPrompt is not responsible for its data')));box.append(consent);
  const sync=el('label','checkbox-setting');const sb=el('input');sb.type='checkbox';sb.disabled=true;sync.append(sb,el('span','',T('同步此插件的数据到云端（可选，默认关闭，计入同步额度） / Sync this plugin’s data to the cloud (optional, off by default, counts toward sync)')));box.append(sync);
  box.append(el('p','plugin-soon',T('即将开放 / Coming soon')));return box;
 }
 function docs(){
  const zh=String((typeof LanguageUI!=='undefined'&&LanguageUI.current?.())||document.documentElement.lang||'').startsWith('zh');
  const wrap=el('div','plugin-docs-wrap'),open=el('button','plugin-open',T('打开组件示例 / Open the component samples'));open.type='button';open.onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('plugin-kit.html')});
  const article=el('article','plugin-docs');article.innerHTML=zh?DOCS_ZH:DOCS_EN;wrap.append(open,article);return wrap;
 }
 const EXAMPLE=`{
  "id": "film-moodboard",
  "name": { "zh-CN": "胶片情绪板", "en": "Film moodboard" },
  "version": "1.0.0",
  "author": "your-github-name",
  "license": "MIT",
  "entry": { "type": "site", "matches": ["https://www.midjourney.com/*"] },
  "permissions": ["site.fill", "storage"],
  "ui": [
    { "block": "grid", "source": "data/styles.json",
      "card": { "image": "preview", "title": "name", "action": { "fill": "params" } } }
  ],
  "data": ["data/styles.json", "previews/*.webp"]
}`;
 const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
 const DOCS_ZH=`<h4>概览</h4><p>插件是一个 GitHub 仓库或文件夹，根目录放 <code>plugin.json</code> 和数据文件。Chrome 应用商店不允许扩展运行下载来的代码，所以插件<strong>只能包含数据</strong>：界面用内置积木描述，功能通过宿主能力调用。含 <code>.js</code>、<code>.wasm</code> 等可执行文件的包会被拒绝。</p>
<h4>plugin.json 示例</h4><pre>${esc(EXAMPLE)}</pre>
<h4>字段</h4><ul><li><code>id</code>：小写字母、数字和短横线，全局唯一。</li><li><code>name</code>：多语言名称，至少提供 <code>en</code>。</li><li><code>version</code>：语义化版本号，更新按 GitHub 发布标签检查。</li><li><code>license</code>：开源许可证（MIT、Apache-2.0 等），没有许可证不能导入。</li><li><code>entry</code>：<code>page</code>（设置页左侧栏新页面）或 <code>site</code>（在 <code>matches</code> 指定的网站上显示面板）。</li><li><code>permissions</code>：要使用的宿主能力，安装时列给用户确认。</li><li><code>ui</code>：积木列表，从上到下渲染。</li><li><code>data</code>：数据文件和图片，支持通配符。</li></ul>
<h4>界面积木</h4><p><code>text</code>、<code>pills</code>（单选胶囊）、<code>select</code>、<code>textarea</code>、<code>images</code>（多图上传，可拖拽排序）、<code>grid</code>（卡片网格，读取 JSON 数据）、<code>card</code>、<code>button</code>。</p>
<h4>页面风格</h4><p>所有插件页面共用一套样式：<code>plugin-kit.css</code> + <code>plugin-kit.js</code>，默认就是 ChatGPT 生图工作台的样子（玻璃面板、色球背景、官网 Barlow 字体），并自动跟随扩展的深浅色、主题色和语言。</p><ul><li>第三方插件只带数据：它的界面积木由扩展用这套样式画出来，不需要也不能自带 CSS。</li><li>官方插件和扩展内的新页面：引入两个文件，调用 <code>PluginKit.start()</code>；文字写 <code>data-t="中文|English"</code>；颜色只用变量（<code>--accent</code>、<code>--text</code>、<code>--muted</code>、<code>--line</code>、<code>--surface</code>、<code>--field</code>、<code>--glass</code>、<code>--success</code>、<code>--warning</code>、<code>--error</code>）。</li><li>可用组件：顶栏 <code>.top</code>、提示词栏 <code>.composer</code>、按钮 <code>.primary</code> / <code>.secondary</code> / <code>.link</code>、提示条 <code>.notice</code>、面板 <code>.panel</code>、分段切换 <code>.segmented</code>、字段 <code>.field</code>、勾选 <code>.check</code>、缩略图条 <code>.refs</code>、结果卡片 <code>.batch</code>、空状态 <code>.empty</code>。点上方「打开组件示例」可以看到每个组件和可直接复制的代码。</li></ul>
<h4>动作与宿主能力</h4><ul><li><code>imagegen.generate</code>：用用户配置的生图来源生图（遵守并发和每日上限）。</li><li><code>library.read</code> / <code>library.save</code>：读取或写入资料库。</li><li><code>site.fill</code>：把文字写入网页上的输入框，由用户点击触发。</li><li><code>copy</code>：复制到剪贴板。</li><li><code>storage</code>：插件自己的设置，互相隔离。</li><li><code>sync</code>（可选）：把插件数据同步到云端，计入同步额度。</li></ul>
<h4>限制</h4><ul><li>整个包不超过 20 MB，最多 500 个文件，单张图片不超过 10 MB。</li><li>只允许 JSON、Markdown、PNG、JPEG、WebP 和 SVG（SVG 会去掉脚本）。</li></ul>
<h4>第三方数据与同步</h4><p>安装第三方插件前，用户需要确认"HoverPrompt 不对其数据内容负责"。数据同步默认关闭，由用户逐个插件开启；插件可以被举报和下架，已同步的数据可以随时删除。</p>
<h4>同步字段</h4><p>资料库里的每条记录（反推、生图、ChatGPT 工作台、插件）都用同一套字段在本地保存，并按用户的云同步设置同步到账号。插件写入记录时只用下面这些字段；其他字段只留在本机。</p>
<ul><li><code>id</code>：<code>前缀-UUID</code>，前缀按类型区分（见下表），全局唯一，写入后不再改。</li><li><code>kind</code>：记录类型；<code>source</code>：来源（小写字母、数字、短横线）；<code>plugin</code>：插件 ID（插件记录必填）。</li><li><code>createdAt</code>（毫秒时间戳）、<code>status</code>（done / failed）、<code>error</code>。</li><li>提示词：<code>zh</code>、<code>en</code>、<code>prompts</code>（按语言代码，最多 6 种，每种 2 万字）、<code>focus</code>、<code>tags</code>。</li><li><code>image</code>：记录的主图（data URL，PNG / JPEG / WebP）；云端单独上传、按内容去重。</li><li><code>params</code>：这条任务的参数，任意小 JSON（不超过 4 KB），例如比例、张数、会话数、前缀、Skill。</li><li><code>generations[]</code>：生成的图，每张一项（同步最多 50 张）：<code>id</code>、<code>job</code>（同一条消息的图共用）、<code>status</code>、<code>mode</code>（text / image）、<code>prompt</code>（不含 n= 等注入）、<code>model</code>、<code>sourceName</code>、<code>aspect</code>、<code>n</code>、<code>references</code>、<code>size</code>、<code>createdAt</code>、<code>runMs</code>、<code>image</code>（单独上传，计入同步张数），以及 ChatGPT 的对应关系：<code>conversationUrl</code>、<code>chatgptFileId</code>、<code>chatgptName</code>、<code>refName</code>。</li><li>只留在本机、不同步：<code>path</code>（本地文件路径）、本地缓存编号、浏览器里的设置和密钥。</li></ul>
<table class="plugin-table"><thead><tr><th>类型 kind</th><th>ID 前缀</th><th>说明</th></tr></thead><tbody><tr><td>reverse</td><td><code>rev-</code></td><td>反推提示词（旧记录是不带前缀的 UUID）</td></tr><tr><td>generation</td><td><code>gen-</code></td><td>资料库一键生图（旧记录 <code>studio-</code>）</td></tr><tr><td>chatgpt-studio</td><td><code>cgpt-</code></td><td>ChatGPT 生图工作台的一次生成</td></tr><tr><td>chatgpt-save</td><td><code>cgsave-</code></td><td>在 chatgpt.com 页面「存入」的图（旧记录 <code>chatgpt-</code>）</td></tr><tr><td>import</td><td><code>imp-</code></td><td>从 ChatGPT 会话同步导入</td></tr><tr><td>plugin</td><td><code>plg-&lt;插件ID&gt;-</code></td><td>第三方插件创建的记录</td></tr></tbody></table>
<p>旧记录保留原 ID（本地备份、云端和导出都按 ID 对应），只补上 <code>kind</code>。同一条记录在本机和云端始终是同一个 ID；生成图在本地文件名、ChatGPT 资料库名和云端之间靠 <code>refName</code> / <code>chatgptName</code> / <code>chatgptFileId</code> 对应。</p>
<h4>发布</h4><ol><li>把插件放进公开的 GitHub 仓库并加上许可证。</li><li>用发布标签（如 <code>v1.0.0</code>）标记版本。</li><li>在「导入插件」里填仓库地址测试；需要上架官方商城时，提交审核。</li></ol>
<h4>官方插件的网页适配</h4><p>ChatGPT 生图工作台定位页面元素的规则可以用数据覆盖：在 <code>plugins.chatgpt.selectors</code> 里提供 <code>composer</code>、<code>send</code>、<code>stop</code>、<code>fileInput</code>、<code>assistant</code>、<code>image</code> 的 CSS 选择器列表，以及 <code>limit</code> 正则。页面改版时更新这份数据即可，不需要新版本扩展。</p>
<p class="hint">插件引擎和导入功能即将开放；文档会随之更新。</p>`;
 const DOCS_EN=`<h4>Overview</h4><p>A plugin is a GitHub repository or folder with <code>plugin.json</code> and data files at its root. The Chrome Web Store does not allow extensions to run downloaded code, so plugins <strong>contain data only</strong>: the interface is described with built-in blocks and features come from host capabilities. Packages with executable files such as <code>.js</code> or <code>.wasm</code> are rejected.</p>
<h4>plugin.json example</h4><pre>${esc(EXAMPLE)}</pre>
<h4>Fields</h4><ul><li><code>id</code>: lowercase letters, digits and hyphens; unique.</li><li><code>name</code>: names per language; <code>en</code> is required.</li><li><code>version</code>: semantic version; updates follow GitHub release tags.</li><li><code>license</code>: an open-source licence (MIT, Apache-2.0…); required.</li><li><code>entry</code>: <code>page</code> (a new sidebar page) or <code>site</code> (a panel on the sites in <code>matches</code>).</li><li><code>permissions</code>: host capabilities the plugin uses, shown to the user at install.</li><li><code>ui</code>: blocks, rendered top to bottom.</li><li><code>data</code>: data files and images; wildcards allowed.</li></ul>
<h4>Blocks</h4><p><code>text</code>, <code>pills</code>, <code>select</code>, <code>textarea</code>, <code>images</code> (multi-upload, drag to reorder), <code>grid</code> (cards from JSON data), <code>card</code>, <code>button</code>.</p>
<h4>Page style</h4><p>Every plugin page shares one style: <code>plugin-kit.css</code> + <code>plugin-kit.js</code>. By default it is the ChatGPT image studio look (frosted panels, colour orbs, the website's Barlow type), following the extension's light/dark mode, theme colour and language.</p><ul><li>Third-party plugins carry data only: the extension draws their blocks in this style; they neither need nor may ship CSS.</li><li>Official plugins and new extension pages: include the two files and call <code>PluginKit.start()</code>; write text as <code>data-t="中文|English"</code>; use only the colour variables (<code>--accent</code>, <code>--text</code>, <code>--muted</code>, <code>--line</code>, <code>--surface</code>, <code>--field</code>, <code>--glass</code>, <code>--success</code>, <code>--warning</code>, <code>--error</code>).</li><li>Components: top bar <code>.top</code>, composer <code>.composer</code>, buttons <code>.primary</code> / <code>.secondary</code> / <code>.link</code>, notices <code>.notice</code>, panels <code>.panel</code>, segmented switch <code>.segmented</code>, fields <code>.field</code>, checkboxes <code>.check</code>, thumbnail strip <code>.refs</code>, result card <code>.batch</code>, empty state <code>.empty</code>. “Open the component samples” above shows each one with markup to copy.</li></ul>
<h4>Actions and host capabilities</h4><ul><li><code>imagegen.generate</code>: generate with the user’s image sources (concurrency and daily limits apply).</li><li><code>library.read</code> / <code>library.save</code>: read or write the library.</li><li><code>site.fill</code>: write text into a field on the page, on the user’s click.</li><li><code>copy</code>: copy to the clipboard.</li><li><code>storage</code>: the plugin’s own settings, isolated.</li><li><code>sync</code> (optional): sync plugin data to the cloud; counts toward sync.</li></ul>
<h4>Limits</h4><ul><li>Up to 20 MB and 500 files per package; images up to 10 MB each.</li><li>JSON, Markdown, PNG, JPEG, WebP and SVG only (scripts are stripped from SVG).</li></ul>
<h4>Third-party data and sync</h4><p>Before installing a third-party plugin the user confirms that HoverPrompt is not responsible for its data. Sync is off by default and turned on per plugin; plugins can be reported and removed, and synced data can be deleted at any time.</p>
<h4>Sync fields</h4><p>Every library record (reverse, generation, ChatGPT studio, plugin) is stored locally with the same fields and synced to the account according to the user's cloud sync settings. Plugins write records with these fields only; anything else stays on the device.</p>
<ul><li><code>id</code>: <code>prefix-UUID</code>, the prefix by kind (table below); unique and never changed once written.</li><li><code>kind</code>: the record kind; <code>source</code>: where it came from (lowercase letters, digits, hyphens); <code>plugin</code>: the plugin id (required for plugin records).</li><li><code>createdAt</code> (ms timestamp), <code>status</code> (done / failed), <code>error</code>.</li><li>Prompts: <code>zh</code>, <code>en</code>, <code>prompts</code> (by language code, up to 6, 20,000 characters each), <code>focus</code>, <code>tags</code>.</li><li><code>image</code>: the record's main image (data URL, PNG / JPEG / WebP); uploaded separately and de-duplicated by content.</li><li><code>params</code>: the task's settings as any small JSON (up to 4 KB), e.g. ratio, count, conversations, prefix, skill.</li><li><code>generations[]</code>: generated images, one entry each (up to 50 synced): <code>id</code>, <code>job</code> (shared by the images of one message), <code>status</code>, <code>mode</code> (text / image), <code>prompt</code> (without injected lines such as n=), <code>model</code>, <code>sourceName</code>, <code>aspect</code>, <code>n</code>, <code>references</code>, <code>size</code>, <code>createdAt</code>, <code>runMs</code>, <code>image</code> (uploaded separately, counts toward synced images), and the ChatGPT mapping: <code>conversationUrl</code>, <code>chatgptFileId</code>, <code>chatgptName</code>, <code>refName</code>.</li><li>Kept on the device only: <code>path</code> (local file path), the local cache number, browser settings and keys.</li></ul>
<table class="plugin-table"><thead><tr><th>kind</th><th>ID prefix</th><th>What</th></tr></thead><tbody><tr><td>reverse</td><td><code>rev-</code></td><td>A reverse-prompt task (older records: bare UUID)</td></tr><tr><td>generation</td><td><code>gen-</code></td><td>One-click generation in the library (older: <code>studio-</code>)</td></tr><tr><td>chatgpt-studio</td><td><code>cgpt-</code></td><td>A run of the ChatGPT image studio</td></tr><tr><td>chatgpt-save</td><td><code>cgsave-</code></td><td>An image saved on chatgpt.com (older: <code>chatgpt-</code>)</td></tr><tr><td>import</td><td><code>imp-</code></td><td>Imported by syncing a ChatGPT conversation</td></tr><tr><td>plugin</td><td><code>plg-&lt;pluginId&gt;-</code></td><td>Created by a third-party plugin</td></tr></tbody></table>
<p>Older records keep their IDs (the local backup, the cloud and exports match by ID) and only gain <code>kind</code>. A record has the same ID on the device and in the cloud; a generated image's local file, ChatGPT library name and cloud copy are linked through <code>refName</code> / <code>chatgptName</code> / <code>chatgptFileId</code>.</p>
<h4>Publishing</h4><ol><li>Put the plugin in a public GitHub repository with a licence.</li><li>Tag releases (for example <code>v1.0.0</code>).</li><li>Test it with Import; to list it in the official market, submit it for review.</li></ol>
<h4>Site rules for official plugins</h4><p>The ChatGPT image studio finds page elements with rules you can override as data: provide CSS selector lists for <code>composer</code>, <code>send</code>, <code>stop</code>, <code>fileInput</code>, <code>assistant</code>, <code>image</code> and a <code>limit</code> pattern in <code>plugins.chatgpt.selectors</code>. When the page changes, update that data; no new extension version is needed.</p>
<p class="hint">The plugin engine and import are coming soon; this documentation will follow them.</p>`;
 async function init(){if(!build())return;await load();render();document.addEventListener('imageprompt-language',()=>render());chrome.storage.onChanged?.addListener(async(changes,area)=>{if(area==='local'&&changes.plugins){await load();render();}});}
 return {init};
})();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>PluginsUI.init(),{once:true});else PluginsUI.init();
