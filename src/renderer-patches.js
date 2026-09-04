'use strict';

(function installEc0316UiPatches(){
  if(typeof renderQueue!=='function'||typeof badgeInfo!=='function'||typeof renderFeeds!=='function'||typeof testFeedAt!=='function'||typeof refreshAutomation!=='function'||!document.querySelector('#optimizeTts')){setTimeout(installEc0316UiPatches,60);return;}
  if(window.__ec0316UiPatchesInstalled)return;window.__ec0316UiPatchesInstalled=true;

  renderQueue=function(s){
    if(window.__ecQueueRenderOwner==='0332')return;
    const box=$('#queue');if(!box)return;const items=s.queue||[],colors={...QUEUE_COLOR_DEFAULT,...(settings?.visual?.queueColors||{})};if(!items.length){box.innerHTML='<div class="empty">Sin actividad</div>';return;}
    box.innerHTML=items.map(x=>{
      const type=x.sourceType||'rss',color=x.status==='ERROR'?colors.error:(colors[type]||colors.rss),[badge,badgeClass]=badgeInfo(x.status),human=x.reason?`Omitida · ${x.reason}`:(x.planText||humanTiming(x)||stageName(x.stage,x.status)),tech=technicalLine(x),classes=`queue-item${x.planned?' planned':''}${x.history?' history':''}`;
      const isNews=type==='rss'||type==='generated',fixed=Number(x.sessionSeq)||0,indexLabel=isNews&&fixed>0?`${fixed}.`:'';
      return`<div class="${classes}" style="--type-color:${escapeHtml(color)}"><div class="queue-main"><span class="queue-index">${indexLabel}</span><div class="queue-text"><div class="queue-headline"><span class="queue-type">${sourceTypeName(type)}</span><span class="queue-title">${escapeHtml(x.title)}</span></div><div class="queue-meta">${escapeHtml(human)}</div>${x.error?`<div class="queue-meta" style="color:#ffb3b3">${escapeHtml(x.error)}</div>`:''}${tech?`<details class="technical-details"><summary>Ver detalles técnicos</summary><div>${escapeHtml(tech)}</div></details>`:''}</div><span class="queue-badge ${badgeClass}">${badge}</span></div></div>`;
    }).join('');
  };

  // Estados reales del Generador: se obtienen del fingerprint persistido y de
  // la cola activa, no de una etiqueta binaria “Procesada/Pendiente”.
  renderDocuments=function(){
    const box=$('#documentList');if(!box)return;const files=documentScan.files||[];if(!files.length){box.innerHTML='<div class="empty">No se encontraron archivos TXT o DOCX.</div>';return;}
    box.innerHTML=files.map(x=>{
      const image=x.imageUrl?`<div class="document-image" style="background-image:url('${escapeHtml(x.imageUrl.replace(/'/g,'%27'))}')"></div>`:'<div class="document-image"></div>',cat=x.categoryFromFolder||'Categoría automática',img=x.imageSource==='document'?'imagen propia':x.imageSource==='category'?'imagen de categoría':'imagen de respaldo';
      const state=x.documentStatus||(x.processed?'emitted':'pending'),label=x.documentStatusLabel||({pending:'Pendiente',preparing:'Preparando',ready:'Lista',on_air:'Al aire',emitted:'Emitida',error:'Error'}[state]||'Pendiente'),done=['ready','on_air','emitted'].includes(state);
      return`<div class="document-item ${done?'processed':''} doc-${escapeHtml(state)}">${image}<div class="document-copy"><div class="document-title">${escapeHtml(x.title||x.name)}</div><div class="document-meta">${escapeHtml(cat)} · ${escapeHtml(x.ext.toUpperCase())} · ${escapeHtml(img)}</div></div><span class="document-badge ${done?'done':''}">${escapeHtml(label)}</span></div>`;
    }).join('');
  };

  async function saveAutomationOnly(message=''){
    if(!settings)return;try{const r=await window.ECAPI.saveSettings(settings);if(settings.ai){settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;}const s=await window.ECAPI.automationStatus();refreshAutomation(s);if(message)status(message);}catch(e){status(`Ajustes automáticos: ${humanError(e)}`);}
  }

  function injectGeneratedScheduler(){
    if($('#generatedSchedulerControls'))return true;const anchor=$('#documentWatch')?.closest('.switch-row');if(!anchor)return false;
    const wrap=document.createElement('div');wrap.id='generatedSchedulerControls';wrap.className='subcard top-gap';wrap.innerHTML=`<h3>Programación de Notas Generadas</h3><p class="note">Define cada cuántas noticias RSS debe entrar una nota ya preparada por el Generador. Si todavía no está lista, la emisión continúa con las RSS disponibles.</p><label>Intercalar una Nota Generada después de<input id="generatedEveryRss" type="number" min="0" max="50" step="1"><small>Recomendado: 5 RSS → 1 Nota Generada. Usa 0 para desactivar la mezcla automática.</small></label><div id="generatedSchedulerRuntimeInfo" class="note">Esperando datos de la emisión…</div>`;
    anchor.insertAdjacentElement('afterend',wrap);const sync=()=>{if(!settings)return setTimeout(sync,80);settings.automation=settings.automation||{};if(settings.automation.generatedEveryRss==null)settings.automation.generatedEveryRss=5;$('#generatedEveryRss').value=String(settings.automation.generatedEveryRss);};sync();
    $('#generatedEveryRss').onchange=async()=>{settings.automation=settings.automation||{};const n=Math.max(0,Math.min(50,Number($('#generatedEveryRss').value)||0));settings.automation.generatedEveryRss=n;$('#generatedEveryRss').value=String(n);await saveAutomationOnly(`Programación de Notas Generadas guardada: ${n?`1 cada ${n} RSS`:'desactivada'}.`);};return true;
  }
  function injectRecoveryControls(){
    if($('#recoveryControls'))return true;const anchor=$('#cannedInterval')?.closest('label');if(!anchor)return false;
    const wrap=document.createElement('div');wrap.id='recoveryControls';wrap.className='subcard top-gap';wrap.innerHTML=`<h3>Recuperación de autonomía</h3><p class="note">EC puede escoger un contenido corto o largo según cuánto material necesita recuperar sin detener la emisión.</p><label>Autonomía objetivo para recuperación (min)<input id="targetAutonomyMin" type="number" min="3" max="60" step="1"><small>El tiempo del anuncio posterior también cuenta para la recuperación.</small></label><div id="recoveryRuntimeInfo" class="note">Esperando datos de la emisión…</div>`;
    anchor.insertAdjacentElement('afterend',wrap);const sync=()=>{if(!settings)return setTimeout(sync,80);settings.automation=settings.automation||{};settings.canned=settings.canned||{};if(settings.automation.targetAutonomyMin==null)settings.automation.targetAutonomyMin=15;settings.canned.adaptiveDuration=true;$('#targetAutonomyMin').value=String(settings.automation.targetAutonomyMin);};sync();
    $('#targetAutonomyMin').onchange=async()=>{settings.automation=settings.automation||{};settings.canned=settings.canned||{};const n=Math.max(3,Math.min(60,Number($('#targetAutonomyMin').value)||15));settings.automation.targetAutonomyMin=n;settings.canned.adaptiveDuration=true;$('#targetAutonomyMin').value=String(n);await saveAutomationOnly(`Autonomía objetivo guardada: ${n} min.`);};return true;
  }
  if(!injectGeneratedScheduler())setTimeout(injectGeneratedScheduler,150);if(!injectRecoveryControls())setTimeout(injectRecoveryControls,150);

  // El objetivo de reserva se guarda y entra en vigor en el motor sin reiniciar
  // Preparación. La tarjeta OBJETIVO se actualiza con el snapshot del backend.
  const buffer=$('#bufferReady');if(buffer)buffer.onchange=async()=>{if(!settings)return;settings.automation=settings.automation||{};const n=Math.max(1,Math.min(30,Number(buffer.value)||15));buffer.value=String(n);settings.automation.bufferReady=n;settings.automation.queueMax=Math.max(n,30);await saveAutomationOnly(`Objetivo actualizado: ${n} noticias listas.`);};

  const originalRefreshAutomation=refreshAutomation;let lastDocumentQueueSignature='',documentRefreshTimer=null;
  refreshAutomation=function(s){
    originalRefreshAutomation(s);const x=s?.scheduler,gen=$('#generatedSchedulerRuntimeInfo'),rec=$('#recoveryRuntimeInfo');
    if(x&&gen){const ratio=Number(x.generatedEveryRss)||0;gen.textContent=ratio?`Mezcla actual: ${x.rssSinceGenerated||0}/${ratio} RSS desde la última Nota Generada · ${x.generatedReady||0} Nota${Number(x.generatedReady)===1?'':'s'} Generada${Number(x.generatedReady)===1?'':'s'} lista${Number(x.generatedReady)===1?'':'s'}.`:'Mezcla automática desactivada.';}
    if(x&&rec){const rate=Number(x.productionRate)||0,avg=Number(x.averageAudioSec)||0;rec.textContent=`Autonomía objetivo ${x.targetAutonomyMin||15} min${rate?` · producción estimada ${(rate*100).toFixed(0)}% del tiempo real`:''}${avg?` · audio medio ${avg.toFixed(0)} s`:''}.`;}
    const signature=(s?.queue||[]).filter(q=>q.sourceType==='generated').map(q=>`${q.id||q.title}:${q.status}`).join('|');
    if(signature!==lastDocumentQueueSignature){lastDocumentQueueSignature=signature;clearTimeout(documentRefreshTimer);documentRefreshTimer=setTimeout(()=>refreshDocuments().catch(()=>{}),220);}
  };

  // RSS: una sola tarjeta editable; las nuevas permanecen abiertas hasta tener
  // Nombre + URL y superar la comprobación. El foco empieza siempre en Nombre.
  const draftFeedIds=new Set(),baseRenderFeeds=renderFeeds,baseTestFeedAt=testFeedAt;
  function liveFeedIds(){return new Set((settings?.rssFeeds||[]).map(f=>String(f.id||'')));}
  function syncDraftFeeds(){if(!settings)return;const live=liveFeedIds();for(const id of [...draftFeedIds])if(!live.has(id))draftFeedIds.delete(id);for(const f of settings.rssFeeds||[])if(!String(f.name||'').trim()||!String(f.url||'').trim())draftFeedIds.add(String(f.id||''));}
  function currentDraft(){syncDraftFeeds();return(settings?.rssFeeds||[]).find(f=>draftFeedIds.has(String(f.id||'')))||null;}
  function focusFeed(id,selectName=false){setTimeout(()=>{const i=(settings?.rssFeeds||[]).findIndex(f=>String(f.id)===String(id));if(i<0)return;const row=$(`.feedrow[data-feed-index="${i}"]`),f=settings.rssFeeds[i],target=!String(f.name||'').trim()?row?.querySelector('.f-name'):!String(f.url||'').trim()?row?.querySelector('.f-url'):row?.querySelector('.f-name');if(target){target.focus();if(selectName&&target.classList.contains('f-name'))target.select();}},0);}
  renderFeeds=function(){
    syncDraftFeeds();const box=$('#feeds'),draft=currentDraft();if(draft)editingFeedId=String(draft.id||'');
    if(box)box.querySelectorAll('.feedrow.editing').forEach(row=>{const f=settings?.rssFeeds?.[Number(row.dataset.feedIndex)];if(!f||String(f.id)!==String(editingFeedId))row.classList.remove('editing');});
    baseRenderFeeds();
    for(const id of draftFeedIds){const i=(settings?.rssFeeds||[]).findIndex(f=>String(f.id)===id),row=i>=0?$(`.feedrow[data-feed-index="${i}"]`):null;if(row&&!String(settings.rssFeeds[i]?.name||'').trim()){const title=row.querySelector('.feed-title');if(title)title.textContent='Nueva fuente';}}
    $$('.f-edit').forEach(btn=>btn.onclick=e=>{const i=Number(e.currentTarget.dataset.i),f=settings?.rssFeeds?.[i];if(!f)return;const id=String(f.id||''),draftNow=currentDraft();if(draftNow&&String(draftNow.id)!==id){editingFeedId=String(draftNow.id);renderFeeds();focusFeed(draftNow.id);status('Completa la nueva fuente antes de editar otra RSS.');return;}if(draftFeedIds.has(id)){editingFeedId=id;renderFeeds();focusFeed(id);status('Completa Nombre y URL y comprueba la fuente antes de minimizarla.');return;}editingFeedId=String(editingFeedId)===id?'':id;renderFeeds();if(editingFeedId)focusFeed(id);});
    $$('.f-name').forEach(input=>{const oldInput=input.oninput;input.oninput=e=>{oldInput?.call(input,e);};input.onchange=e=>{const i=Number(e.currentTarget.dataset.i),f=settings?.rssFeeds?.[i];if(!f)return;const value=String(e.currentTarget.value||'').trim();if(draftFeedIds.has(String(f.id||''))){f.name=value;e.currentTarget.value=value;}else{f.name=value||'Fuente';e.currentTarget.value=f.name;}const row=e.currentTarget.closest('.feedrow'),title=row?.querySelector('.feed-title');if(title)title.textContent=f.name||'Nueva fuente';};});
  };
  testFeedAt=async function(i,silent=false){const id=String(settings?.rssFeeds?.[i]?.id||''),result=await baseTestFeedAt(i,silent),f=settings?.rssFeeds?.find(x=>String(x.id)===id);if(f&&draftFeedIds.has(id)){const complete=!!String(f.name||'').trim()&&!!String(f.url||'').trim();if(complete&&result?.ok){draftFeedIds.delete(id);if(String(editingFeedId)===id)editingFeedId='';renderFeeds();status(`${f.name}: fuente RSS guardada y lista.`);}else{editingFeedId=id;renderFeeds();focusFeed(id);}}return result;};
  $('#addFeed').onclick=()=>{const pending=currentDraft();if(pending){editingFeedId=String(pending.id);renderFeeds();focusFeed(pending.id,true);status('Completa la nueva fuente que ya está abierta.');return;}const id=`rss-${Date.now()}`;settings.rssFeeds.push({id,name:'',url:'',enabled:true,priority:50,publisherName:'',publisherWeb:'',partialCtaEnabled:false,partialCtaTemplate:'Para más información, visita {web}.'});draftFeedIds.add(id);editingFeedId=id;renderFeeds();focusFeed(id,true);};

  async function saveVoiceOnly(){
    if(!settings?.tts)throw new Error('Los ajustes de voz todavía no están disponibles');const voice=$('#voice')?.value;if(voice)settings.tts.voice=voice;
    settings.tts.speed=Math.max(.7,Math.min(1.4,Number($('#voiceSpeed')?.value)||1));settings.tts.resourceMode=$('#ttsPerformanceProfile')?.value||settings.tts.resourceMode||'safe_streaming';settings.tts.persistent=true;settings.tts.persistentIdleMinutes=5;
    const r=await window.ECAPI.saveSettings(settings);settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;return r;
  }
  function updateFastHint(t=null){if(!settings?.tts)return;const threads=Math.max(1,Number(t?.threads||settings.tts.performanceThreads)||6),cap=Number(t?.maxSafeThreads)||0;if(settings.tts.resourceMode==='performance'||$('#ttsPerformanceProfile')?.value==='performance')$('#ttsPerformanceHint').textContent=`Rápido optimizado para esta computadora · ${threads} hilos${cap?` · límite seguro ${cap}`:''}.`;}
  const originalRefreshRuntimeStatus=refreshRuntimeStatus;
  refreshRuntimeStatus=async function(){await originalRefreshRuntimeStatus();try{const t=await window.ECAPI.ttsStatus();if(t?.ready){const base=t.workerRunning?'Motor de voz preparado ✓ · permanece listo entre notas':'Motor de voz disponible ✓ · se preparará al generar la primera locución',recent=Number(t.recentRealtimeFactor)||0;$('#ttsInfo').textContent=`${base} · ${t.profileLabel||'Perfil'}: ${t.threads||'?'} hilos${recent?` · RTF real reciente ${recent.toFixed(2)}× (${t.recentSamples||0})`:''}`;updateFastHint(t);}}catch{}};
  const syncTtsHint=()=>{if(!settings?.tts)return setTimeout(syncTtsHint,80);updateFastHint();};syncTtsHint();
  $('#optimizeTts').onclick=async()=>{
    const btn=$('#optimizeTts');btn.disabled=true;$('#ttsBenchmarkResult').textContent='Calentando Kokoro y probando configuraciones dentro del límite seguro de tu procesador. Puede tardar varios minutos…';status('Buscando la configuración más rápida y estable para el único worker de Kokoro…');
    try{await saveVoiceOnly();const r=await window.ECAPI.benchmarkTts();if(!r.ok)throw new Error(r.error||'No se pudo completar la prueba de rendimiento de voz');settings.tts.resourceMode='performance';settings.tts.performanceThreads=Math.max(1,Number(r.recommendedThreads)||1);settings.tts.autoTuned=true;$('#ttsPerformanceProfile').value='performance';await window.ECAPI.saveSettings(settings);const best=Number(r.bestRealtimeFactor||0),tests=(r.results||[]).map(x=>x.error?`${x.threads} hilos: descartado${Number(x.cpuPeak)?` (CPU pico ${Number(x.cpuPeak).toFixed(0)}%)`:''}`:`${x.threads} hilos: RTF ${Number(x.realtimeFactor).toFixed(2)} · CPU ${Number(x.cpuAverage||0).toFixed(0)}%`).join(' · '),detail=best>0?` · RTF ${best.toFixed(2)}×`:'';$('#ttsPerformanceHint').textContent=`Rápido optimizado para esta computadora · ${settings.tts.performanceThreads} hilos · máximo probado ${r.maxSafeThreads||settings.tts.performanceThreads}.`;$('#ttsBenchmarkResult').textContent=`Optimización completada ✓ · Rápido: ${settings.tts.performanceThreads} hilos${detail}${tests?` · ${tests}`:''}`;status(`Voz optimizada: ${settings.tts.performanceThreads} hilos${detail}.`);await refreshRuntimeStatus();}catch(e){$('#ttsBenchmarkResult').textContent=`No se pudo completar la optimización: ${humanError(e)}`;status(`Voz: ${humanError(e)}`);}finally{btn.disabled=false;}
  };

  const originalRefreshPronunciationStatus=refreshPronunciationStatus;
  refreshPronunciationStatus=async function(){await originalRefreshPronunciationStatus();try{const p=await window.ECAPI.pronunciationStatus(),r=p?.migrationReport;if(r&&!window.__ec0316MigrationNoticeShown){window.__ec0316MigrationNoticeShown=true;const parts=[`Aprendizaje de pronunciación actualizado.`,`\n${r.found||0} pronunciaciones encontradas.`,`\n${r.manualProtected||0} ajuste${Number(r.manualProtected)===1?'':'s'} protegido${Number(r.manualProtected)===1?'':'s'} como manual${Number(r.manualProtected)===1?'':'es'}.`,`\n${r.removed||0} regla${Number(r.removed)===1?'':'s'} automática${Number(r.removed)===1?'':'s'} problemática${Number(r.removed)===1?'':'s'} retirada${Number(r.removed)===1?'':'s'} del aprendizaje activo.`,r.backup?'\nSe creó una copia de seguridad antes de la migración.':'',r.error?`\nAviso: ${r.error}`:''];alert(parts.join(''));}}catch{}};
  const importBtn=$('#importPronunciationLearning');if(importBtn)importBtn.onclick=async()=>{try{const r=await window.ECAPI.importPronunciationLearning();if(r.cancelled)return;$('#pronunciationLearningInfo').textContent=`Importación completada · ${r.total||0} pronunciaciones disponibles${r.manualChanges?` · ${r.manualChanges} cambio${r.manualChanges===1?'':'s'} protegido${r.manualChanges===1?'':'s'} como manual${r.manualChanges===1?'':'es'}`:''}`;status(r.manualChanges?`Aprendizaje importado · ${r.manualChanges} corrección${r.manualChanges===1?'':'es'} manual${r.manualChanges===1?'':'es'} protegida${r.manualChanges===1?'':'s'}.`:'Aprendizaje importado.');await refreshPronunciationStatus();}catch(e){status(`Importar: ${humanError(e)}`);}};
})();
