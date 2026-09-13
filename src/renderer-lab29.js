'use strict';
(function installLab29Renderer(){
  if(window.__ecLab29RendererInstalled)return;
  if(!window.ECAPI){setTimeout(installLab29Renderer,120);return;}
  window.__ecLab29RendererInstalled=true;
  const q=s=>document.querySelector(s);
  const MONITOR_FPS=15,MONITOR_BUSY_FPS=5,MONITOR_BUSY_FRAME_MS=Math.round(1000/MONITOR_BUSY_FPS);
  let monitorTimer=null,monitorBusy=false,lastCaptureAt=0,lastCaptureCompletedAt=0,lastFrameState=null;

  function operatorStatus(text){try{if(typeof status==='function')status(text);}catch{}}
  function productionGpuBusy(){try{const p=typeof automationState!=='undefined'?automationState?.processing:null;return!!(p?.gpuStageBusy||p?.voiceBusy||p?.aiBusy);}catch{return false;}}
  function optimizerActive(){const box=q('#ecOptimizeResult0321');return!!box?.dataset?.live;}
  function monitorVisible(){const tab=q('#tab-auto');return!!(tab?.classList.contains('show')&&!document.hidden);}
  function updateDiagnostics(reason,targetFps,captureMs=0){
    const now=Date.now(),elapsed=lastCaptureCompletedAt?Math.max(1,now-lastCaptureCompletedAt):0,effectiveFps=elapsed?Math.min(targetFps,1000/elapsed):0;
    window.__ecMonitorRuntimeDiagnostics={owner:'lan-output+lab29-busy-supplement',normalFps:MONITOR_FPS,busyFps:MONITOR_BUSY_FPS,targetFps,effectiveFps:Number(effectiveFps.toFixed(2)),reason,productionBusy:productionGpuBusy(),captureMs:Number(captureMs)||0,lastCaptureAt,lastCaptureCompletedAt};
  }
  function applyFormat(format){const host=q('#ecMonitorFrameHost'),vertical=format==='9:16';if(host){host.classList.toggle('format-9-16',vertical);host.classList.toggle('format-16-9',!vertical);}}
  function applyState(s){
    lastFrameState=s||lastFrameState;const pill=q('#ecMonitorState');if(!pill||!lastFrameState)return;
    const k=lastFrameState.kind==='ad'?'ANUNCIO':lastFrameState.kind==='canned'?'CONTENIDO':lastFrameState.source==='automatic'||lastFrameState.source==='manual'?'AL AIRE':'STANDBY';
    pill.textContent=k;pill.className=`status-pill ${k==='STANDBY'?'neutral':'live'}`;
  }

  // renderer-lan-output.js owns the monitor surface and its normal 15 FPS loop.
  // Lab.29 only supplies 5 FPS frames while production GPU work is active,
  // because the base loop deliberately yields during those stages.
  async function monitorCaptureInterval(){
    if(!monitorVisible()||!productionGpuBusy()||monitorBusy)return;
    const img=q('#ecMonitorImage'),empty=q('#ecMonitorEmpty'),hint=q('#ecMonitorLanHint');if(!img||!empty)return;
    if(optimizerActive()){updateDiagnostics('optimizer',0);return;}
    const now=Date.now();if(now-lastCaptureAt<MONITOR_BUSY_FRAME_MS){updateDiagnostics('production-throttle',MONITOR_BUSY_FPS);return;}
    lastCaptureAt=now;monitorBusy=true;const started=performance.now();
    try{
      const r=await window.ECAPI.outputMonitorFrame();
      if(r?.suspended){updateDiagnostics('suspended',0,performance.now()-started);return;}
      if(!r?.ok||!r.dataUrl){updateDiagnostics('capture-pending',MONITOR_BUSY_FPS,performance.now()-started);return;}
      applyFormat(r.format||r.state?.format||'16:9');if(r.state)applyState(r.state);
      img.src=r.dataUrl;img.classList.remove('hidden');empty.classList.add('hidden');lastCaptureCompletedAt=Date.now();
      if(hint)hint.textContent=`Monitor local · ${MONITOR_BUSY_FPS} FPS · prioridad IA/TTS`;
      updateDiagnostics('production-busy',MONITOR_BUSY_FPS,performance.now()-started);
    }catch(e){updateDiagnostics('capture-error',MONITOR_BUSY_FPS,performance.now()-started);}
    finally{monitorBusy=false;}
  }
  function startMonitor(){if(monitorTimer)return;monitorTimer=setInterval(()=>{if(!document.hidden)monitorCaptureInterval();},MONITOR_BUSY_FRAME_MS);}

  async function saveYoutubeConfig(){
    try{
      const enabled=q('#ecYoutubePromoEnabled'),lead=q('#ecYoutubePromoLead');if(!enabled||!lead)return;
      const s=await window.ECAPI.getSettings();s.__youtubePromoConfigLab29={enabled:!!enabled.checked,leadSeconds:[5,7,10].includes(Number(lead.value))?Number(lead.value):10};await window.ECAPI.saveSettings(s);operatorStatus(`Promo YouTube ${enabled.checked?'activada':'desactivada'} · ${lead.value} s.`);
    }catch(e){operatorStatus(`YouTube: ${e.message||e}`);}
  }
  function bindYoutubeConfig(){
    const enabled=q('#ecYoutubePromoEnabled'),lead=q('#ecYoutubePromoLead');
    if(!enabled||!lead){setTimeout(bindYoutubeConfig,250);return;}
    if(enabled.dataset.ecLab29!=='1')enabled.addEventListener('change',saveYoutubeConfig);
    if(lead.dataset.ecLab29!=='1')lead.addEventListener('change',saveYoutubeConfig);
    enabled.dataset.ecLab29='1';lead.dataset.ecLab29='1';
  }

  window.ECAPI.on?.('output:state',s=>applyState(s));
  window.ECAPI.on?.('automation:state',()=>monitorCaptureInterval());
  window.ECAPI.on?.('profile:changed',()=>{lastCaptureAt=0;setTimeout(()=>{bindYoutubeConfig();monitorCaptureInterval();},350);});
  if(document.readyState==='complete'){setTimeout(startMonitor,0);setTimeout(bindYoutubeConfig,250);}else window.addEventListener('load',()=>{setTimeout(startMonitor,0);setTimeout(bindYoutubeConfig,250);},{once:true});
  window.addEventListener('beforeunload',()=>{if(monitorTimer)clearInterval(monitorTimer);},{once:true});
})();
