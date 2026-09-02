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

  document.addEventListener('click',e=>{if(e.target?.id!=='ec29Cancel')return;setTimeout(async()=>{try{const st=await window.ECAPI.profileStatus();if(!st?.hasProfiles)location.reload();}catch{}},0);},true);

  const baseRenderQueue=renderQueue;
  renderQueue=function(snapshot){const rows=(snapshot?.queue||[]).map(x=>({...x,sessionSeq:Number(x.displayPosition)||0})),next={...snapshot,queue:rows};baseRenderQueue(next);const box=q('#queue'),first=rows.findIndex(x=>x.queueGroup==='preparing');if(box&&first>=0){const cards=[...box.children];if(cards[first]&&!box.querySelector('.ec0330-preparing-divider')){const divider=document.createElement('div');divider.className='ec0330-preparing-divider';divider.innerHTML='<strong>En preparación</strong><span>Estas noticias todavía no tienen una posición definitiva de emisión.</span>';box.insertBefore(divider,cards[first]);}}};

  migrateGlobalOptimization();
})();
