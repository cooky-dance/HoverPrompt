globalThis.CopyUI ||= (()=>{
  const timers=new WeakMap(),notices=new Map();
  function current(target){return target?.isConnected||!target?.dataset.copyKey?target:[...document.querySelectorAll('.copy-feedback')].find(node=>node.dataset.copyKey===target.dataset.copyKey)||target;}
  function show(target,notice){
    clearTimeout(timers.get(target));target.classList.remove('is-visible');target.textContent=notice.text;
    target.style.animationDelay='-'+Math.max(0,Date.now()-(notice.expiresAt-2800))+'ms';void target.offsetWidth;target.classList.add('is-visible');
    timers.set(target,setTimeout(()=>{target.classList.remove('is-visible');target.textContent='';if(notices.get(target.dataset.copyKey)===notice)notices.delete(target.dataset.copyKey);},Math.max(0,notice.expiresAt-Date.now())));
  }
  function bind(target,key){target.dataset.copyKey=key;const notice=notices.get(key);if(notice&&notice.expiresAt>Date.now())show(target,notice);}
  async function copy(value,target=document.getElementById('copyFeedback')){
    target=current(target);
    if(target){clearTimeout(timers.get(target));notices.delete(target.dataset.copyKey);target.classList.remove('is-visible');target.textContent='';}
    try{
      if(!String(value||'').trim())throw new Error('暂无可复制的提示词 / No prompt to copy');
      await navigator.clipboard.writeText(value);
      target=current(target);
      if(target){
        const notice={text:LanguageUI.text('✓ 复制成功 / ✓ Copied'),expiresAt:Date.now()+2800};
        if(target.dataset.copyKey)notices.set(target.dataset.copyKey,notice);show(target,notice);
      }
      return true;
    }catch(error){document.getElementById('status').textContent=LanguageUI.text(error.message==='暂无可复制的提示词 / No prompt to copy'?error.message:'复制失败，请选中文本手动复制 / Copy failed; select text to copy');return false;}
  }
  return {copy,bind};
})();
