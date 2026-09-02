'use strict';

(function installGec0322Ui(){
  if(!window.__ec0321UiInstalled||!window.ECAPI||typeof $!=='function'){setTimeout(installGec0322Ui,120);return;}
  if(window.__ec0322UiInstalled)return;window.__ec0322UiInstalled=true;

  const style=document.createElement('style');style.textContent=`
    .brand{font-size:inherit!important;line-height:1.08}.gec-brand-title{font-size:24px;font-weight:800;letter-spacing:-.2px}.gec-brand-subtitle{margin-top:6px;font-size:11px;font-weight:500;color:#a9a9a9;letter-spacing:.18px;white-space:nowrap}
    #ec0322VoicePerformance{margin:10px 0 14px;padding:11px 13px;border:1px solid #323232;border-radius:10px;background:#121212;line-height:1.45}#ec0322VoicePerformance b{color:#8ed99b}
  `;document.head.appendChild(style);

  function applyBranding(){
    document.title='GEC Automatic News';
    const brand=document.querySelector('.brand');if(brand)brand.innerHTML='<div class="gec-brand-title">GEC Automatic News</div><div class="gec-brand-subtitle">Diseñado por Carls Mayo</div>';
    const opt=$('#ecOptimizer0321');if(opt){const h=opt.querySelector('.section-head h3');if(h)h.textContent='Optimización automática de GEC';const b=$('#optimizeEc0321');if(b)b.textContent='Optimizar GEC para esta computadora';}
  }

  function hideManualResourceSelector(){
    const select=$('#ttsPerformanceProfile');if(select){const label=select.closest('label');if(label)label.style.display='none';if(settings?.tts?.autoTuned===true){settings.tts.resourceMode='performance';select.value='performance';}}
    const hint=$('#ttsPerformanceHint');if(hint)hint.style.display='none';
    const oldButton=$('#optimizeTts');if(oldButton)oldButton.style.display='none';const oldResult=$('#ttsBenchmarkResult');if(oldResult)oldResult.style.display='none';
  }

  function ensureVoicePerformanceBox(){
    if($('#ec0322VoicePerformance'))return $('#ec0322VoicePerformance');const info=$('#ttsInfo');if(!info)return null;
    const box=document.createElement('div');box.id='ec0322VoicePerformance';box.className='note';box.textContent='Rendimiento: comprobando configuración optimizada…';info.insertAdjacentElement('afterend',box);return box;
  }
  async function refreshVoicePerformance0322(){
    hideManualResourceSelector();const box=ensureVoicePerformanceBox();if(!box)return;
    try{
      const t=await window.ECAPI.ttsStatus(),optimized=!!settings?.tts?.autoTuned,threads=Number(t?.threads||settings?.tts?.performanceThreads||0),rtf=Number(t?.recentRealtimeFactor||0),mode=String(t?.executionMode||'sequential')==='parallel'?'Paralelo':'Secuencial',cfg=settings?.tts?.performanceConfig||{},spin=Number(cfg.spinDurationUs);
      const spinText=spin>=0?` · spin ${spin===0?'off':`${spin/1000} ms / backoff ${Number(cfg.spinBackoffMax)||1}`}`:'';
      box.innerHTML=optimized?`<b>Rendimiento: Optimizado automáticamente ✓</b><br>Voz: CPU · ${threads||'?'} hilos · ${mode}${spinText}${rtf?` · RTF reciente ${rtf.toFixed(2)}×`:''}`:`Rendimiento: pendiente de optimización. Usa “Optimizar GEC para esta computadora”.`;
    }catch(e){box.textContent=`Rendimiento: ${humanError(e)}`;}
  }

  async function refreshPronunciation0322(){
    // 0.3.23+ owns the pronunciation summary/count UI. Once it is installed,
    // the legacy 0.3.22 writer must stop or both async refreshers alternate
    // different text in the same nodes and produce visible flicker.
    if(window.__ec0323UiInstalled||window.__ec0325Installed)return;
    try{
      const p=await window.ECAPI.pronunciationStatus(),count=Number(p?.learningEntries||0),local=p?.model?'mejora local disponible ✓':'mejora local no descargada',toggle=$('#pronunciationClaudeVerify')?.checked!==false,hasKey=!!settings?.ai?.hasClaudeKey,claude=!toggle?'Claude verificador desactivado':hasKey?'Claude verificador activo ✓':'Claude verificador sin API Key';
      const info=$('#pronunciationInfo');if(info)info.textContent=`Pronunciación automática activa ✓ · ${count} términos aprendidos · ${local} · ${claude}`;
      const badge=$('#pronunciationLearningCount');if(badge)badge.textContent=`${count} aprendida${count===1?'':'s'}`;
    }catch{}
  }

  applyBranding();hideManualResourceSelector();ensureVoicePerformanceBox();
  const waitSettings=()=>{if(!settings)return setTimeout(waitSettings,100);if(settings?.tts?.autoTuned===true){settings.tts.resourceMode='performance';const select=$('#ttsPerformanceProfile');if(select)select.value='performance';}refreshVoicePerformance0322();refreshPronunciation0322();};waitSettings();

  if(typeof refreshRuntimeStatus==='function'){
    const baseRefreshRuntimeStatus0322=refreshRuntimeStatus;refreshRuntimeStatus=async function(){await baseRefreshRuntimeStatus0322();await refreshVoicePerformance0322();};
  }
  if(typeof refreshPronunciationStatus==='function'){
    const baseRefreshPronunciationStatus0322=refreshPronunciationStatus;refreshPronunciationStatus=async function(){await baseRefreshPronunciationStatus0322();await refreshPronunciation0322();};
  }
  const pronunciationToggle=$('#pronunciationClaudeVerify');if(pronunciationToggle)pronunciationToggle.addEventListener('change',()=>setTimeout(refreshPronunciation0322,50));

  // La UI antigua todavía lee este select al guardar. Mantenerlo oculto y en
  // performance evita que un Guardar todos los cambios deshaga el perfil que
  // eligió la optimización automática.
  const save=$('#save');if(save)save.addEventListener('click',()=>{if(settings?.tts?.autoTuned===true){settings.tts.resourceMode='performance';const select=$('#ttsPerformanceProfile');if(select)select.value='performance';}},true);
})();
