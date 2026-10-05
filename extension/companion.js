// The ChatGPT studio companion plugin (used by the Chrome build, where the studio is not built in): find it, open it.
// The plugin is downloaded from the website and loaded unpacked; it has a fixed ID (its manifest key).
globalThis.Companion=(()=>{
 const ID='cglojadmkjmlgnonhddpgogdlmkmnnnk',INSTALL_URL='https://hoverprompt.com/studio#/plugins';
 const external=globalThis.IMAGEPROMPT_BUILD?.chatgpt==='companion';
 async function ping(){try{const answer=await chrome.runtime.sendMessage(ID,{type:'COMPANION_PING'});return answer?.ok?answer:null;}catch{return null;}}
 async function open(){const answer=await chrome.runtime.sendMessage(ID,{type:'COMPANION_OPEN_STUDIO'}).catch(()=>null);if(!answer?.ok)chrome.tabs.create({url:INSTALL_URL});return !!answer?.ok;}
 return {ID,INSTALL_URL,external,ping,open};
})();
