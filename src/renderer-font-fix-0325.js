'use strict';
(function installFontFix0325(){
  const BASE_FONTS=['Arial','Segoe UI','Verdana','Georgia','Impact'];
  const ids=['title','summary','category','date','exclusive'].map(x=>`ec25-${x}-family`);
  function ensure(select){if(!select)return;const current=String(select.value||'Arial'),existing=new Set([...select.options].map(o=>o.value));for(const name of BASE_FONTS){if(existing.has(name))continue;const o=document.createElement('option');o.value=name;o.textContent=name;select.appendChild(o);}select.disabled=false;select.removeAttribute('disabled');select.style.pointerEvents='auto';if([...select.options].some(o=>o.value===current))select.value=current;}
  function all(){for(const id of ids)ensure(document.getElementById(id));}
  function ready(){if(!document.getElementById('ec0325DesignEditor')){setTimeout(ready,100);return;}all();document.addEventListener('focusin',e=>{if(e.target?.matches?.('.ec25-family'))ensure(e.target);},true);}
  ready();
})();
