// Library record kinds and their ID prefixes (the same list as the cloud's RECORD_KINDS, src/policy.js).
// New records get "<prefix>-<uuid>"; older records keep their IDs (bare UUIDs, studio-, chatgpt-) and their kind is derived.
//   reverse        rev-      a reverse-prompt task (older: bare UUID)
//   generation     gen-      a one-click generation in the library (older: studio-)
//   chatgpt-studio cgpt-     a run of the ChatGPT image studio
//   chatgpt-save   cgsave-   an image saved from chatgpt.com (older: chatgpt-)
//   import         imp-      imported from a ChatGPT conversation
//   plugin         plg-<id>- created by a third-party plugin (plugin = its id)
globalThis.RecordKinds=(()=>{
 const PREFIX={reverse:'rev','generation':'gen','chatgpt-studio':'cgpt','chatgpt-save':'cgsave','import':'imp','plugin':'plg'};
 const SOURCE={reverse:'reverse','generation':'studio','chatgpt-studio':'chatgpt-studio','chatgpt-save':'chatgpt','import':'chatgpt-import','plugin':'plugin'};
 function newId(kind,plugin){
  if(!PREFIX[kind])throw new Error('Unknown record kind: '+kind);
  if(kind==='plugin'){if(!/^[a-z0-9][a-z0-9-]{1,47}$/.test(plugin||''))throw new Error('Plugin records need the plugin id');return 'plg-'+plugin+'-'+crypto.randomUUID().slice(0,8);}
  return PREFIX[kind]+'-'+crypto.randomUUID();
 }
 function kindOf(task){
  if(task?.kind&&PREFIX[task.kind])return task.kind;
  const id=String(task?.id||''),source=task?.source;
  if(source==='chatgpt-studio'||id.startsWith('cgpt-'))return 'chatgpt-studio';
  if(source==='chatgpt'||id.startsWith('cgsave-')||id.startsWith('chatgpt-'))return 'chatgpt-save';
  if(source==='studio'||id.startsWith('gen-')||id.startsWith('studio-'))return 'generation';
  if(source==='chatgpt-import'||id.startsWith('imp-'))return 'import';
  if(task?.plugin||id.startsWith('plg-'))return 'plugin';
  return 'reverse';
 }
 return {PREFIX,SOURCE,KINDS:Object.keys(PREFIX),newId,kindOf};
})();
