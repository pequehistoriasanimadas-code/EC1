'use strict';
(function installLab27MonitorProductionRefresh(){
  if(window.__ecLab27MonitorProductionRefresh)return;
  if(!window.ECAPI||!document.querySelector('#ecLanMonitorCard')){setTimeout(installLab27MonitorProductionRefresh,120);return;}
  window.__ecLab27MonitorProductionRefresh=true;
  const q=s=>document.querySelector(s);let busy=false;
  function productionBusy(){try{const p=typeof automationState!=='undefined'?automationState?.processing:null;return!!(p?.gpuStageBusy||p?.voiceBusy||p?.aiBusy);}catch{return false;}}
  function optimizerActiveLab27(){const box=q('#ecOptimizeResult0321');return!!box?.dataset?.live;}
  function monitorVisible(){const tab=q('#tab-auto');return!!(tab?.classList.contains('show')&&!document.hidden);}
  function applyFormat(format){const host=q('#ecMonitorFrameHost'),vertical=format==='9:16';if(host){host.classList.toggle('format-9-16',vertical);host.classList.toggle('format-16-9',!vertical);}}
  function applyState(s){const pill=q('#ecMonitorState');if(!pill||!s)return;const k=s.kind==='ad'?'ANUNCIO':s.kind==='canned'?'CONTENIDO':s.source==='automatic'||s.source==='manual'?'AL AIRE':'STANDBY';pill.textContent=k;pill.className=`status-pill ${k==='STANDBY'?'neutral':'live'}`;}
  async function refreshDuringProduction(){
    if(busy||!monitorVisible()||optimizerActiveLab27()||!productionBusy())return;
    const img=q('#ecMonitorImage'),empty=q('#ecMonitorEmpty');if(!img||!empty)return;busy=true;
    try{const r=await window.ECAPI.outputMonitorFrame();if(r?.suspended||!r?.ok||!r.dataUrl)return;applyFormat(r.format||r.state?.format);applyState(r.state);img.src=r.dataUrl;img.classList.remove('hidden');empty.classList.add('hidden');}
    catch{}
    finally{busy=false;}
  }
  const timer=setInterval(refreshDuringProduction,900);refreshDuringProduction();window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
})();
