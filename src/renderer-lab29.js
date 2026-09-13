'use strict';
(function installLab29Renderer(){
  if(window.__ecLab29RendererInstalled)return;
  if(!window.ECAPI){setTimeout(installLab29Renderer,120);return;}
  window.__ecLab29RendererInstalled=true;
  const q=s=>document.querySelector(s);
  const MONITOR_FPS=15,MONITOR_BUSY_FPS=5,MONITOR_FRAME_MS=Math.round(1000/MONITOR_FPS),MONITOR_BUSY_FRAME_MS=Math.round(1000/MONITOR_BUSY_FPS);
  let monitorTimer=null,monitorBusy=false,monitorReady=false,lastCaptureAt=0,lastCaptureCompletedAt=0,lastFrameState=null,monitorAudio=false;

  function operatorStatus(text){try{if(typeof status==='function')status(text);}catch{}}
  function productionGpuBusy(){try{const p=typeof automationState!=='undefined'?automationState?.processing:null;return!!(p?.gpuStageBusy||p?.voiceBusy||p?.aiBusy);}catch{return false;}}
  function optimizerActive(){const box=q('#ecOptimizeResult0321');return!!box?.dataset?.live;}
  function monitorVisible(){const tab=q('#tab-auto');return!!(tab?.classList.contains('show')&&!document.hidden);}
  function updateDiagnostics(reason,targetFps,captureMs=0){
    const now=Date.now(),elapsed=lastCaptureCompletedAt?Math.max(1,now-lastCaptureCompletedAt):0,effectiveFps=elapsed?Math.min(targetFps,1000/elapsed):0;
    window.__ecMonitorRuntimeDiagnostics={owner:'lab29',normalFps:MONITOR_FPS,busyFps:MONITOR_BUSY_FPS,targetFps,effectiveFps:Number(effectiveFps.toFixed(2)),reason,productionBusy:productionGpuBusy(),captureMs:Number(captureMs)||0,lastCaptureAt,lastCaptureCompletedAt};
  }
  function applyFormat(format){const host=q('#ecMonitor29FrameHost'),vertical=format==='9:16';if(host){host.classList.toggle('format-9-16',vertical);host.classList.toggle('format-16-9',!vertical);}}
  function applyState(s){
    lastFrameState=s||lastFrameState;const pill=q('#ecMonitor29State');if(!pill||!lastFrameState)return;
    const k=lastFrameState.kind==='ad'?'ANUNCIO':lastFrameState.kind==='canned'?'CONTENIDO':lastFrameState.source==='automatic'||lastFrameState.source==='manual'?'AL AIRE':'STANDBY';
    pill.textContent=k;pill.className=`status-pill ${k==='STANDBY'?'neutral':'live'}`;
  }
  async function toggleAudio(){try{const r=await window.ECAPI.outputMonitorAudio(!monitorAudio);monitorAudio=!!r?.enabled;const b=q('#ecMonitor29Audio');if(b)b.textContent=`Audio monitor: ${monitorAudio?'ON':'OFF'}`;operatorStatus(monitorAudio?'Audio del monitor activado.':'Audio del monitor desactivado.');}catch(e){operatorStatus(`Monitor: ${e.message||e}`);}}
  function replaceMonitorCard(){
    const card=q('#ecLanMonitorCard');if(!card)return false;if(card.dataset.ecLab29==='1')return true;
    card.dataset.ecLab29='1';
    card.innerHTML=`<div class="section-head"><div><h3>Monitor de emisión</h3><p class="note">Vista local directa del Output. Se mantiene activa durante la preparación de IA/TTS.</p></div><span id="ecMonitor29State" class="status-pill neutral">STANDBY</span></div><div id="ecMonitor29FrameHost" class="ec-monitor-frame-host format-16-9"><img id="ecMonitor29Image" class="ec-monitor-image hidden" alt="Monitor de emisión"><div id="ecMonitor29Empty" class="ec-monitor-empty">Iniciando monitor…</div></div><div class="ec-monitor-footer"><span id="ecMonitor29Hint">Monitor local · 15 FPS</span><button id="ecMonitor29Audio" class="dark compact" type="button">Audio monitor: OFF</button><span id="ecMonitor29Clients">LAN: 0 conexiones</span></div>`;
    const b=q('#ecMonitor29Audio');if(b)b.onclick=toggleAudio;
    return true;
  }
  async function monitorCaptureInterval(){
    if(!replaceMonitorCard()||!monitorVisible()||monitorBusy)return;
    const img=q('#ecMonitor29Image'),empty=q('#ecMonitor29Empty'),hint=q('#ecMonitor29Hint');if(!img||!empty)return;
    if(optimizerActive()){empty.classList.remove('hidden');empty.textContent='Monitor pausado durante la optimización…';img.classList.add('hidden');updateDiagnostics('optimizer',0);return;}
    const busyProduction=productionGpuBusy(),targetFps=busyProduction?MONITOR_BUSY_FPS:MONITOR_FPS,busyFrameMs=busyProduction?MONITOR_BUSY_FRAME_MS:MONITOR_FRAME_MS,now=Date.now();
    if(now-lastCaptureAt<busyFrameMs){updateDiagnostics(busyProduction?'production-throttle':'normal-throttle',targetFps);return;}
    lastCaptureAt=now;monitorBusy=true;const started=performance.now();
    try{
      const r=await window.ECAPI.outputMonitorFrame();
      if(r?.suspended){empty.classList.remove('hidden');empty.textContent='Monitor pausado durante la optimización…';img.classList.add('hidden');updateDiagnostics('suspended',0,performance.now()-started);return;}
      if(!r?.ok||!r.dataUrl){if(!monitorReady){empty.classList.remove('hidden');empty.textContent=r?.error||'Preparando vista local del Output…';}updateDiagnostics('capture-pending',targetFps,performance.now()-started);return;}
      applyFormat(r.format||r.state?.format||'16:9');if(r.state)applyState(r.state);img.src=r.dataUrl;img.classList.remove('hidden');empty.classList.add('hidden');monitorReady=true;lastCaptureCompletedAt=Date.now();if(hint)hint.textContent=`Monitor local · ${busyProduction?MONITOR_BUSY_FPS:MONITOR_FPS} FPS${busyProduction?' · prioridad IA/TTS':''}`;updateDiagnostics(busyProduction?'production-busy':'normal',targetFps,performance.now()-started);
    }catch(e){if(!monitorReady){empty.classList.remove('hidden');empty.textContent='Monitor local: reintentando…';}updateDiagnostics('capture-error',targetFps,performance.now()-started);}
    finally{monitorBusy=false;}
  }
  async function refreshLanClients(){try{const s=await window.ECAPI.outputLanStatus?.();const el=q('#ecMonitor29Clients');if(el)el.textContent=`LAN: ${Number(s?.connections)||0} conexiones`;}catch{}}
  function startMonitor(){if(monitorTimer)return;replaceMonitorCard();monitorCaptureInterval();monitorTimer=setInterval(()=>{if(!document.hidden)monitorCaptureInterval();},MONITOR_FRAME_MS);setInterval(()=>{if(!document.hidden)refreshLanClients();},2400);}

  async function saveYoutubeConfig(){
    try{
      const enabled=q('#ecYoutubePromoEnabled'),lead=q('#ecYoutubePromoLead');if(!enabled||!lead)return;
      const s=await window.ECAPI.getSettings();s.__youtubePromoConfigLab29={enabled:!!enabled.checked,leadSeconds:[5,7,10].includes(Number(lead.value))?Number(lead.value):10};await window.ECAPI.saveSettings(s);operatorStatus(`Promo YouTube ${enabled.checked?'activada':'desactivada'} · ${lead.value} s.`);
    }catch(e){operatorStatus(`YouTube: ${e.message||e}`);}
  }
  function bindYoutubeConfig(){const enabled=q('#ecYoutubePromoEnabled'),lead=q('#ecYoutubePromoLead');if(!enabled||!lead){setTimeout(bindYoutubeConfig,250);return;}enabled.onchange=saveYoutubeConfig;lead.onchange=saveYoutubeConfig;enabled.dataset.ecLab29='1';lead.dataset.ecLab29='1';}

  window.ECAPI.on?.('output:state',s=>applyState(s));
  window.ECAPI.on?.('profile:changed',()=>{monitorReady=false;lastCaptureAt=0;setTimeout(()=>{replaceMonitorCard();bindYoutubeConfig();monitorCaptureInterval();},350);});
  if(document.readyState==='complete'){setTimeout(startMonitor,0);setTimeout(bindYoutubeConfig,250);}else window.addEventListener('load',()=>{setTimeout(startMonitor,0);setTimeout(bindYoutubeConfig,250);},{once:true});
  window.addEventListener('beforeunload',()=>{if(monitorTimer)clearInterval(monitorTimer);},{once:true});
})();
