'use strict';

(function installFontFix0325(){
  const BASE_FONTS=['Arial','Segoe UI','Verdana','Georgia','Impact'];
  const SELECT_IDS=['title','summary','category','date','exclusive'].map(x=>`ec25-${x}-family`);
  const q=id=>document.getElementById(id);
  const unique=arr=>[...new Set((arr||[]).map(String).map(x=>x.trim()).filter(Boolean))];
  const customFromSettings=()=>Array.isArray(window.settings?.visual?.output?.customFonts)?window.settings.visual.output.customFonts:[];
  let customCache=customFromSettings();

  function names(){return unique([...BASE_FONTS,...customCache.map(x=>x?.family)]);}
  function populate(select){
    if(!select)return;
    const current=String(select.value||'Arial');
    const wanted=names();
    const existing=[...select.options].map(o=>o.value);
    const missing=BASE_FONTS.some(f=>!existing.includes(f));
    const stale=existing.length!==wanted.length||wanted.some(f=>!existing.includes(f));
    if(missing||stale){
      select.replaceChildren(...wanted.map(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;return o;}));
    }
    select.disabled=false;
    select.removeAttribute('disabled');
    select.setAttribute('aria-disabled','false');
    select.style.pointerEvents='auto';
    select.value=wanted.includes(current)?current:'Arial';
  }
  function ensureAll(){for(const id of SELECT_IDS)populate(q(id));}
  async function refreshCustom(){
    ensureAll();
    try{
      const r=await window.ECAPI?.fontsList?.();
      if(Array.isArray(r?.custom))customCache=r.custom;
      else customCache=customFromSettings();
    }catch{customCache=customFromSettings();}
    ensureAll();
  }
  function ready(){
    const editor=q('ec0325DesignEditor');
    if(!editor){setTimeout(ready,80);return;}
    ensureAll();
    refreshCustom();
    document.addEventListener('pointerdown',e=>{const s=e.target?.closest?.('.ec25-family');if(s)populate(s);},true);
    document.addEventListener('focusin',e=>{if(e.target?.matches?.('.ec25-family'))populate(e.target);},true);
    const observer=new MutationObserver(()=>ensureAll());
    observer.observe(editor,{childList:true,subtree:true});
    const importBtn=q('ec25ImportFont');
    if(importBtn)importBtn.addEventListener('click',()=>setTimeout(refreshCustom,250),true);
  }
  ready();
})();
