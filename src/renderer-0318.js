'use strict';

(function installEc0318Ui(){
  if(!window.__ec0317UiInstalled||!window.ECAPI?.gpuTtsStatus||typeof settings==='undefined'||!settings||!document.querySelector('#ttsBenchmarkResult')){setTimeout(installEc0318Ui,100);return;}
  if(window.__ec0318UiInstalled)return;window.__ec0318UiInstalled=true;

  const anchor=$('#ttsBenchmarkResult');
  const card=document.createElement('div');card.id='gpuTtsCard';card.className='subcard top-gap';card.innerHTML=`
    <div class="section-head"><h3>Aceleración NVIDIA de Kokoro</h3><span id="gpuTtsBadge" class="mini-pill">COMPROBANDO</span></div>
    <p class="note">Compara la configuración CPU optimizada con la GPU NVIDIA. EC conserva siempre la CPU como respaldo y solo recomienda la GPU si la mejora es importante.</p>
    <div id="gpuTtsInfo" class="note">Comprobando tarjeta gráfica…</div>
    <div class="buttons"><button id="prepareGpuTts" class="dark">Preparar aceleración NVIDIA</button><button id="benchmarkGpuTts">Comparar CPU vs GPU</button><button id="useCpuTts" class="dark">Usar CPU</button></div>
    <div id="gpuTtsProgress" class="note"></div>
    <div id="gpuTtsResult" class="note"></div>`;
  anchor.insertAdjacentElement('afterend',card);

  let installing=false,benchmarking=false,lastGpuStatus=null;
  const fmtMb=n=>{const x=Number(n)||0;return x>=1024?`${(x/1024).toFixed(1)} GB`:`${x.toFixed(0)} MB`;};
  const setBusy=()=>{const a=$('#prepareGpuTts'),b=$('#benchmarkGpuTts'),c=$('#useCpuTts');if(a)a.disabled=installing||benchmarking||!lastGpuStatus?.nvidia?.detected||!lastGpuStatus?.nvidia?.compatible||!!lastGpuStatus?.runtimeInstalled;if(b)b.disabled=installing||benchmarking||!lastGpuStatus?.runtimeInstalled||!lastGpuStatus?.nvidia?.compatible;if(c)c.disabled=installing||benchmarking||lastGpuStatus?.selected!=='cuda';};

  async function refreshGpu(){
    try{
      const g=await window.ECAPI.gpuTtsStatus();lastGpuStatus=g;const n=g?.nvidia||{},badge=$('#gpuTtsBadge'),info=$('#gpuTtsInfo'),selected=g.selected||g.requested||'cpu';
      if(!n.detected){badge.textContent='NO DETECTADA';info.textContent=n.error||'No se detectó una GPU NVIDIA compatible. Kokoro seguirá usando CPU.';}
      else if(!n.compatible){badge.textContent='DRIVER';info.textContent=`${n.name} · driver ${n.driver} · se necesita un controlador compatible con CUDA 12.x (${n.requiredDriver||'525+'}).`;}
      else if(g.runtimeInstalled){badge.textContent=g.active==='cuda'?'CUDA ACTIVO':selected==='cuda'?'GPU SELECCIONADA':'CPU ACTIVA';info.textContent=`${n.name} · ${fmtMb(n.totalMb)} VRAM · driver ${n.driver} · runtime NVIDIA listo · ${selected==='cuda'?'GPU seleccionada':'CPU seleccionada'}${g.active==='cuda'?' · worker CUDA activo':''}${g.fallingBack?` · fallback CPU: ${g.fallbackReason}`:''}.`;}
      else{badge.textContent='DISPONIBLE';info.textContent=`${n.name} · ${fmtMb(n.totalMb)} VRAM · driver ${n.driver}. EC puede descargar el runtime CUDA dentro de su carpeta de datos; no necesitas instalar CUDA manualmente en Windows.`;}
      setBusy();
    }catch(e){lastGpuStatus=null;$('#gpuTtsBadge').textContent='ERROR';$('#gpuTtsInfo').textContent=`No se pudo comprobar NVIDIA: ${humanError(e)}`;setBusy();}
  }

  window.ECAPI.on('tts:gpuEvent',e=>{const box=$('#gpuTtsProgress');if(!box)return;box.textContent=String(e?.message||'');if(e?.type==='start'||e?.type==='progress'||e?.type==='validate')status(`NVIDIA: ${e.message||'preparando…'}`);});

  $('#prepareGpuTts').onclick=async()=>{
    installing=true;setBusy();$('#gpuTtsResult').textContent='';$('#gpuTtsProgress').textContent='Preparando componentes NVIDIA. La primera descarga puede tardar varios minutos y requiere varios GB libres.';status('Preparando aceleración NVIDIA de Kokoro…');
    try{const r=await window.ECAPI.installGpuTts();if(!r?.ok)throw new Error(r?.error||'No se pudo preparar la aceleración NVIDIA');$('#gpuTtsProgress').textContent=`Aceleración NVIDIA preparada ✓ · ${r.nvidia?.name||'GPU NVIDIA'} · runtime ONNX GPU ${r.runtimeVersion||''}.`;status('Aceleración NVIDIA preparada. Ya puedes comparar CPU vs GPU.');}
    catch(e){$('#gpuTtsProgress').textContent=`No se pudo preparar NVIDIA: ${humanError(e)}`;status(`NVIDIA: ${humanError(e)}`);}finally{installing=false;await refreshGpu();setBusy();}
  };

  $('#benchmarkGpuTts').onclick=async()=>{
    benchmarking=true;setBusy();$('#gpuTtsResult').textContent='Calentando Kokoro y midiendo CPU y CUDA con dos pasadas reales por configuración. Durante esta primera prueba deja OBS cerrado para medir el rendimiento limpio.';status('Comparando Kokoro por CPU contra NVIDIA CUDA…');
    try{
      const voice=$('#voice')?.value;if(voice)settings.tts.voice=voice;settings.tts.speed=Math.max(.7,Math.min(1.4,Number($('#voiceSpeed')?.value)||1));await window.ECAPI.saveSettings(settings);
      const r=await window.ECAPI.benchmarkGpuTts();if(!r?.ok)throw new Error(r?.error||'No se pudo completar la comparación CPU vs GPU');
      const cpu=r.cpu||{},gpu=r.gpu||{},base=r.gpuBaseline||{},baseGpu=Number(base.utilization||0),baseVram=Number(base.usedMb||0),baseEnc=Number(base.encoder||0),gpuRows=(r.gpuResults||[]).map((x,i)=>{const deltaGpu=Math.max(0,Number(x.gpuAverage||0)-baseGpu),deltaVram=Math.max(0,Number(x.memoryUsedMaxMb||0)-baseVram),deltaEnc=Math.max(0,Number(x.encoderPeak||0)-baseEnc);return`<div style="margin-top:6px"><b>GPU ${i+1}: ${escapeHtml(x.label||'CUDA')}</b> · ${x.error?`DESCARTADA · ${escapeHtml(x.error)}`:`RTF ${Number(x.realtimeFactor||0).toFixed(2)}× · CPU ${Number(x.cpuAverage||0).toFixed(0)}% · GPU total ${Number(x.gpuAverage||0).toFixed(0)}% (≈ +${deltaGpu.toFixed(0)} pts sobre base) · VRAM +${escapeHtml(fmtMb(deltaVram))} · Encode +${deltaEnc.toFixed(0)} pts · ${Number(x.temperaturePeak||0).toFixed(0)} °C`}</div>`;}).join('');
      const baselineLine=`<div style="margin-top:6px"><b>GPU antes de Kokoro:</b> ${baseGpu.toFixed(0)}% · VRAM ${escapeHtml(fmtMb(baseVram))} · Video Encode ${baseEnc.toFixed(0)}%${Number(base.temperature)?` · ${Number(base.temperature).toFixed(0)} °C`:''}</div>`;
      const winner=r.recommended==='cuda'?`<b>Recomendación aplicada: NVIDIA CUDA ✓</b>`:`<b>Recomendación aplicada: mantener CPU</b>`,target=r.targetReached?' · objetivo RTF ≤ 1.0 alcanzado ✓':'';
      $('#gpuTtsResult').innerHTML=`<div><b>Comparación completada ✓</b></div>${baselineLine}<div style="margin-top:6px"><b>CPU optimizada</b> · RTF ${Number(cpu.realtimeFactor||0).toFixed(2)}× · CPU ${Number(cpu.cpuAverage||0).toFixed(0)}% · inferencia ${(Number(cpu.inferenceMs||0)/1000).toFixed(2)} s</div>${gpuRows}<div style="margin-top:8px">${winner} · mejora GPU ${Number(r.gainPct||0).toFixed(1)}%${target}</div><div>${escapeHtml(r.selectionReason||'')}</div><div class="note" style="margin-top:6px">La CPU optimizada queda guardada como fallback. Si luego OBS presenta problemas, puedes pulsar “Usar CPU” sin borrar el runtime NVIDIA.</div>`;
      settings=await window.ECAPI.getSettings();status(r.recommended==='cuda'?`Kokoro usará NVIDIA CUDA · RTF ${Number(gpu.realtimeFactor||0).toFixed(2)}×.`:`Kokoro mantiene CPU · la mejora GPU no fue suficiente.`);await refreshRuntimeStatus();await refreshGpu();
    }catch(e){$('#gpuTtsResult').textContent=`No se pudo completar CPU vs GPU: ${humanError(e)}`;status(`NVIDIA: ${humanError(e)}`);}finally{benchmarking=false;setBusy();}
  };

  $('#useCpuTts').onclick=async()=>{
    if(!window.ECAPI.useCpuTts)return;benchmarking=true;setBusy();try{const r=await window.ECAPI.useCpuTts();if(!r?.ok)throw new Error(r?.error||'No se pudo volver a CPU');settings=await window.ECAPI.getSettings();$('#gpuTtsResult').textContent='Kokoro volvió a la configuración CPU optimizada. El runtime NVIDIA permanece guardado para futuras comparaciones.';status('Kokoro: CPU optimizada seleccionada.');await refreshRuntimeStatus();await refreshGpu();}catch(e){status(`CPU: ${humanError(e)}`);}finally{benchmarking=false;setBusy();}
  };

  refreshGpu();
})();
