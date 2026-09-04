'use strict';
(function installRenderer0330(){
  if(window.__ec0330Installed)return;
  if(!window.ECAPI||typeof settings==='undefined'||!settings||typeof renderQueue!=='function'||!window.__ec0329Installed){setTimeout(installRenderer0330,120);return;}
  window.__ec0330Installed=true;
  const q=s=>document.querySelector(s);

  function gpuIdentity(g={}){const d=g.gpu||g.device||{};return{gpu:String(d.name||g.gpuName||g.name||''),vram:Number(d.vramMb||d.memoryTotalMb||g.vramMb||g.memoryTotalMb||0),driver:String(d.driver||g.driver||'')};}
  async function hardwareFingerprint(){const [local,gpu]=await Promise.all([window.ECAPI.localStatus().catch(()=>({})),window.ECAPI.gpuTtsStatus().catch(()=>({}))]),id=gpuIdentity(gpu),logical=Number(local?.profile?.logicalCpus||0);return JSON.stringify({logical,gpu:id.gpu,vram:Math.round(id.vram/256)*256,driver:id.driver});}
  async function migrateGlobalOptimization(){
    try{const fp=await hardwareFingerprint(),r=await window.ECAPI.optimizationMigrateGlobal(fp);if(r?.matched&&r?.changed&&!sessionStorage.getItem('ec0330-global-tuning-reload')){sessionStorage.setItem('ec0330-global-tuning-reload','1');location.reload();return;}sessionStorage.removeItem('ec0330-global-tuning-reload');if(r?.matched){settings=await window.ECAPI.getSettings();const badge=q('#ecOptimizeState0321'),box=q('#ecOptimizeResult0321'),opt=settings?.optimization0321;if(badge&&opt?.fingerprint===fp){badge.textContent='OPTIMIZADA ✓';badge.className='mini-pill ok';if(box&&!box.dataset.live)box.textContent=`Perfil global de esta computadora · ${opt.hardwareLabel||'hardware actual'} · ${opt.summary||'GEC optimizado'}.`;}}}catch(e){console.warn('EC 0.3.30 global tuning migration:',e?.message||e);}
  }

  function enhanceCustomIntervalUi(){
    const row=q('#cannedCustomRow'),input=q('#cannedCustomInterval'),select=q('#cannedInterval');if(!row||!input||!select)return;
    if(!row.dataset.ec0330Enhanced){
      row.dataset.ec0330Enhanced='1';row.classList.add('ec0330-custom-interval');input.setAttribute('aria-label','Cantidad personalizada de noticias antes del contenido');
      const text=[...row.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.textContent='Emitir contenido cada ';
      const unit=document.createElement('span');unit.className='ec0330-custom-unit';unit.textContent=' noticias';input.insertAdjacentElement('afterend',unit);
      const help=document.createElement('small');help.className='ec0330-custom-help';help.textContent='El contenido se insertará después de esta cantidad de noticias realmente emitidas.';row.appendChild(help);
      select.addEventListener('change',()=>{setTimeout(()=>{const visible=select.value==='custom';row.classList.toggle('hidden',!visible);if(visible){try{input.focus({preventScroll:true});input.select();}catch{input.focus();}}},0);});
    }
    row.classList.toggle('hidden',select.value!=='custom');
  }

  document.addEventListener('click',e=>{if(e.target?.id!=='ec29Cancel')return;setTimeout(async()=>{try{const st=await window.ECAPI.profileStatus();if(!st?.hasProfiles)location.reload();}catch{}},0);},true);

  const baseRenderQueue=renderQueue;
  renderQueue=function(snapshot){
    if(window.__ecQueueRenderOwner==='0332')return;
    const rows=(snapshot?.queue||[]).map(x=>({...x,sessionSeq:Number(x.displayPosition)||0})),next={...snapshot,queue:rows};baseRenderQueue(next);const box=q('#queue');if(!box)return;const cards=[...box.querySelectorAll('.queue-item')];cards.forEach((card,i)=>{
      const row=rows[i],index=card.querySelector('.queue-index');if(index)index.textContent=Number(row?.displayPosition)>0?`${Number(row.displayPosition)}.`:'';
      if(row?.isExclusive){const head=card.querySelector('.queue-headline');if(head&&!head.querySelector('.queue-exclusive')){const badge=document.createElement('span');badge.className='queue-exclusive';badge.textContent='EXCLUSIVO';head.insertBefore(badge,head.querySelector('.queue-title')||null);}}
    });
    const first=rows.findIndex(x=>x.queueGroup==='preparing');if(first>=0&&cards[first]&&!box.querySelector('.ec0330-preparing-divider')){const divider=document.createElement('div');divider.className='ec0330-preparing-divider';divider.innerHTML='<strong>En preparación</strong><span>Estas noticias todavía no tienen una posición definitiva de emisión.</span>';box.insertBefore(divider,cards[first]);}
  };

  enhanceCustomIntervalUi();
  migrateGlobalOptimization();
})();
