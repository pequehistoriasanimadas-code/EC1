'use strict';

(function installEc0314UiPatches(){
  if(typeof renderQueue!=='function'||typeof badgeInfo!=='function'||!document.querySelector('#optimizeTts')){setTimeout(installEc0314UiPatches,60);return;}
  if(window.__ec0314UiPatchesInstalled)return;window.__ec0314UiPatchesInstalled=true;

  renderQueue=function(s){
    const box=$('#queue');if(!box)return;const items=s.queue||[],colors={...QUEUE_COLOR_DEFAULT,...(settings?.visual?.queueColors||{})};if(!items.length){box.innerHTML='<div class="empty">Sin actividad</div>';return;}
    box.innerHTML=items.map((x,i)=>{
      const type=x.sourceType||'rss',color=x.status==='ERROR'?colors.error:(colors[type]||colors.rss),[badge,badgeClass]=badgeInfo(x.status),human=x.reason?`Omitida · ${x.reason}`:(x.planText||humanTiming(x)||stageName(x.stage,x.status)),tech=technicalLine(x),classes=`queue-item${x.planned?' planned':''}${x.history?' history':''}`;
      const isNews=type==='rss'||type==='generated',fixed=Number(x.sessionSeq)||0,indexLabel=isNews&&fixed>0?`${fixed}.`:'';
      return`<div class="${classes}" style="--type-color:${escapeHtml(color)}"><div class="queue-main"><span class="queue-index">${indexLabel}</span><div class="queue-text"><div class="queue-headline"><span class="queue-type">${sourceTypeName(type)}</span><span class="queue-title">${escapeHtml(x.title)}</span></div><div class="queue-meta">${escapeHtml(human)}</div>${x.error?`<div class="queue-meta" style="color:#ffb3b3">${escapeHtml(x.error)}</div>`:''}${tech?`<details class="technical-details"><summary>Ver detalles técnicos</summary><div>${escapeHtml(tech)}</div></details>`:''}</div><span class="queue-badge ${badgeClass}">${badge}</span></div></div>`;
    }).join('');
  };

  async function saveVoiceOnly(){
    if(!settings?.tts)throw new Error('Los ajustes de voz todavía no están disponibles');
    const voice=$('#voice')?.value;if(voice)settings.tts.voice=voice;
    settings.tts.speed=Math.max(.7,Math.min(1.4,Number($('#voiceSpeed')?.value)||1));
    settings.tts.resourceMode=$('#ttsPerformanceProfile')?.value||settings.tts.resourceMode||'safe_streaming';
    settings.tts.persistent=true;settings.tts.persistentIdleMinutes=5;
    const r=await window.ECAPI.saveSettings(settings);settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;return r;
  }

  $('#optimizeTts').onclick=async()=>{
    const btn=$('#optimizeTts');btn.disabled=true;$('#ttsBenchmarkResult').textContent='Probando 2, 4, 6, 8, 10 y 12 hilos según tu procesador. Puede tardar unos minutos…';status('Buscando la configuración de voz más rápida para esta computadora…');
    try{
      await saveVoiceOnly();
      const r=await window.ECAPI.benchmarkTts();if(!r.ok)throw new Error('No se pudo completar la prueba de rendimiento de voz');
      settings.tts.resourceMode='performance';settings.tts.performanceThreads=Math.max(2,Number(r.recommendedThreads)||6);$('#ttsPerformanceProfile').value='performance';$('#ttsPerformanceHint').textContent=`Rápido optimizado para esta computadora · ${settings.tts.performanceThreads} hilos.`;
      await window.ECAPI.saveSettings(settings);
      const best=Number(r.bestRealtimeFactor||0),detail=best>0?` · RTF ${best.toFixed(2)}×`:'';$('#ttsBenchmarkResult').textContent=`Optimización completada ✓ · Rápido: ${settings.tts.performanceThreads} hilos${detail}`;status(`Voz optimizada: ${settings.tts.performanceThreads} hilos${detail}.`);await refreshRuntimeStatus();
    }catch(e){$('#ttsBenchmarkResult').textContent=`No se pudo completar la optimización: ${humanError(e)}`;status(`Voz: ${humanError(e)}`);}finally{btn.disabled=false;}
  };
})();
