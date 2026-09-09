'use strict';
(function(){
  const mode=window.__GEC_OUTPUT_WEB_MODE__||{},monitor=!!mode.monitor,bar=document.getElementById('monitorBar'),btn=document.getElementById('monitorMute'),vol=document.getElementById('monitorVolume'),volText=document.getElementById('monitorVolumeValue'),clock=document.getElementById('monitorClock'),modeText=document.getElementById('monitorMode'),dot=document.getElementById('monitorLiveDot');
  const media=()=>[document.getElementById('audio'),document.getElementById('cannedVideo'),document.getElementById('music')].filter(Boolean);
  let muted=monitor,volume=.7,lastProgress={currentSec:0,durationSec:0};
  const fmt=v=>{const n=Math.max(0,Math.floor(Number(v)||0)),m=Math.floor(n/60),s=n%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
  function applyAudio(){for(const el of media()){el.muted=muted;if(!muted)el.volume=Math.min(el.volume||1,volume);}if(btn)btn.textContent=muted?'🔇 Audio monitor':'🔊 Audio monitor';if(vol)vol.disabled=muted;if(volText)volText.textContent=Math.round(volume*100)+'%';}
  if(monitor&&bar){bar.classList.remove('hidden');document.body.classList.add('monitor-mode');applyAudio();btn.onclick=()=>{muted=!muted;applyAudio();if(!muted){for(const el of media())if(el.paused&&el.src)el.play().catch(()=>{});}};vol.oninput=()=>{volume=Math.max(0,Math.min(1,Number(vol.value)/100));for(const el of media())if(!muted)el.volume=volume;applyAudio();};}
  window.ECAPI.on('output:story',p=>{if(modeText){const role=p?.mediaRole==='ad'?'ANUNCIO':((p?.kind||'news')==='canned'?'CONTENIDO':'NOTICIA');modeText.textContent=role;}if(dot)dot.classList.add('live');setTimeout(applyAudio,0);});
  window.ECAPI.on('output:control',a=>{if(a==='stop'){if(modeText)modeText.textContent='STANDBY';if(dot)dot.classList.remove('live');lastProgress={currentSec:0,durationSec:0};if(clock)clock.textContent='00:00 / 00:00';}setTimeout(applyAudio,0);});
  window.ECAPI.on('output:master-progress',p=>{lastProgress=p||lastProgress;if(clock)clock.textContent=fmt(lastProgress.currentSec)+' / '+fmt(lastProgress.durationSec);});
  const observer=new MutationObserver(()=>applyAudio());observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  setInterval(()=>{if(!monitor)return;applyAudio();},1000);
})();