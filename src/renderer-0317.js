'use strict';

(function installEc0317Ui(){
  if(!window.__ec0316UiPatchesInstalled||typeof refreshRuntimeStatus!=='function'||!document.querySelector('#optimizeTts')){setTimeout(installEc0317Ui,80);return;}
  if(window.__ec0317UiInstalled)return;window.__ec0317UiInstalled=true;

  const fmtMs=ms=>{const n=Number(ms)||0;return n>=1000?`${(n/1000).toFixed(2)} s`:`${n.toFixed(0)} ms`;};
  const cfgLabel=(x={})=>String(x.label||x.threads||'Configuración');
  const originalRefreshRuntimeStatus0317=refreshRuntimeStatus;
  refreshRuntimeStatus=async function(){
    await originalRefreshRuntimeStatus0317();
    try{
      const t=await window.ECAPI.ttsStatus();if(!t?.ready)return;const base=t.workerRunning?'Motor de voz preparado ✓ · permanece listo entre notas':'Motor de voz disponible ✓ · se preparará al generar la primera locución',recent=Number(t.recentRealtimeFactor)||0,phon=Number(t.recentPhonemeMs)||0,infer=Number(t.recentInferenceMs)||0,pct=Number(t.recentInferencePct)||0;
      const diag=phon||infer?` · fonetización ${fmtMs(phon)} · inferencia ${fmtMs(infer)}${pct?` (${pct.toFixed(0)}%)`:''}`:'';
      $('#ttsInfo').textContent=`${base} · ${t.profileLabel||'Perfil'}${recent?` · RTF real reciente ${recent.toFixed(2)}× (${t.recentSamples||0})`:''}${diag}`;
      if((settings?.tts?.resourceMode==='performance'||$('#ttsPerformanceProfile')?.value==='performance')&&t.profileLabel)$('#ttsPerformanceHint').textContent=`Configuración activa: ${t.profileLabel.replace(/^Rápido\s*·\s*/,'')}.`;
    }catch{}
  };

  $('#optimizeTts').onclick=async()=>{
    const btn=$('#optimizeTts'),box=$('#ttsBenchmarkResult');btn.disabled=true;box.textContent='Probando configuración actual, AUTO CPU, spinning optimizado y ORT_PARALLEL. Cada opción hace warm-up y dos mediciones reales; puede tardar varios minutos…';status('Midiendo el cuello de botella de Kokoro y buscando una configuración más rápida…');
    try{
      const voice=$('#voice')?.value;if(voice)settings.tts.voice=voice;settings.tts.speed=Math.max(.7,Math.min(1.4,Number($('#voiceSpeed')?.value)||1));settings.tts.persistent=true;settings.tts.persistentIdleMinutes=5;await window.ECAPI.saveSettings(settings);
      const r=await window.ECAPI.benchmarkTts();if(!r.ok)throw new Error(r.error||'No se pudo completar la prueba avanzada de Kokoro');
      settings.tts.resourceMode='performance';settings.tts.performanceThreads=Math.max(1,Number(r.recommendedThreads)||settings.tts.performanceThreads||1);settings.tts.performanceConfig={...(r.recommendedConfig||{})};settings.tts.lastAdvancedBenchmark={at:new Date().toISOString(),recommendedId:r.recommendedId,recommendedLabel:r.recommendedLabel,realtimeFactor:r.bestRealtimeFactor,fastestRealtimeFactor:r.fastestRealtimeFactor,inferencePct:r.bottleneck?.inferencePct||0};settings.tts.autoTuned=true;$('#ttsPerformanceProfile').value='performance';await window.ECAPI.saveSettings(settings);
      const winner=`<div><b>Configuración recomendada:</b> ${escapeHtml(r.recommendedLabel||'Rápido')}</div><div><b>RTF elegido:</b> ${Number(r.bestRealtimeFactor||0).toFixed(2)}× · <b>más rápido medido:</b> ${Number(r.fastestRealtimeFactor||0).toFixed(2)}×</div>`;
      const bottleneck=r.bottleneck?`<div><b>Cuello de botella:</b> fonetización ${escapeHtml(fmtMs(r.bottleneck.phonemeMs))} · inferencia ${escapeHtml(fmtMs(r.bottleneck.inferenceMs))}${Number(r.bottleneck.inferencePct)?` · ${Number(r.bottleneck.inferencePct).toFixed(0)}% del tiempo medido en inferencia`:''}</div>`:'';
      const rows=(r.results||[]).map((x,i)=>{const discarded=!!x.error,rtf=Number(x.realtimeFactor),cpu=Number(x.cpuAverage||0),phon=Number(x.phonemeMs||0),infer=Number(x.inferenceMs||0),pct=Number(x.inferencePct||0);return`<div style="margin-top:6px"><b>${i+1}. ${escapeHtml(cfgLabel(x))}</b> · ${discarded?`DESCARTADA${x.error?` · ${escapeHtml(x.error)}`:''}`:`RTF ${rtf.toFixed(2)}× · CPU ${cpu.toFixed(0)}% · fon ${escapeHtml(fmtMs(phon))} · infer ${escapeHtml(fmtMs(infer))}${pct?` (${pct.toFixed(0)}%)`:''}`}</div>`;}).join('');
      box.innerHTML=`<div><b>Optimización avanzada completada ✓</b></div>${winner}${bottleneck}${rows}`;$('#ttsPerformanceHint').textContent=`Configuración activa: ${r.recommendedLabel||'Rápido'}.`;status(`Kokoro optimizado · RTF ${Number(r.bestRealtimeFactor||0).toFixed(2)}× · ${r.recommendedLabel||'configuración guardada'}.`);await refreshRuntimeStatus();
    }catch(e){box.textContent=`No se pudo completar la optimización avanzada: ${humanError(e)}`;status(`Voz: ${humanError(e)}`);}finally{btn.disabled=false;}
  };
})();
