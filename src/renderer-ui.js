'use strict';
function renderFeeds(){
  const box=$('#feeds');box.innerHTML='';
  settings.rssFeeds.forEach((f,i)=>{
    const d=document.createElement('div');d.className='feedrow';
    d.innerHTML=`<div class="feed-head"><span class="feed-title">${escapeHtml(f.name||'Fuente RSS')}</span><label class="switch-row" style="margin:0;padding:7px 9px;min-width:150px"><span><b>RSS activo</b></span><input type="checkbox" class="f-enabled" data-i="${i}" ${f.enabled?'checked':''}><span class="switch-ui"></span></label></div><label>Nombre<input class="f-name" data-i="${i}" value="${escapeHtml(f.name)}"></label><label>URL<input class="f-url" data-i="${i}" value="${escapeHtml(f.url)}"></label><div class="buttons"><button class="f-test" data-i="${i}">Probar RSS</button><button class="f-del dark" data-i="${i}">Eliminar</button></div><div class="feed-status" data-status-i="${i}">Sin comprobar</div>`;
    box.appendChild(d);
  });
  $$('.f-enabled').forEach(x=>x.onchange=e=>settings.rssFeeds[+e.target.dataset.i].enabled=e.target.checked);
  $$('.f-name').forEach(x=>x.oninput=e=>{const i=+e.target.dataset.i;settings.rssFeeds[i].name=e.target.value;e.target.closest('.feedrow').querySelector('.feed-title').textContent=e.target.value||'Fuente RSS';});
  $$('.f-url').forEach(x=>x.oninput=e=>settings.rssFeeds[+e.target.dataset.i].url=e.target.value);
  $$('.f-test').forEach(x=>x.onclick=async e=>{
    const i=+e.target.dataset.i,f=settings.rssFeeds[i],el=$(`[data-status-i="${i}"]`);el.className='feed-status';el.textContent='Comprobando...';
    try{const r=await window.ECAPI.testRss(f);el.className=`feed-status ${r.ok?'ok':r.mode==='UNRECOGNIZED'?'warn':'error'}`;el.textContent=`${r.ok?'RSS OK':'Atención'} · ${r.count} noticias · ${r.mode} · ${r.detail||''}`;status(`${f.name}: ${r.count} noticias (${r.mode})`);}catch(err){el.className='feed-status error';el.textContent=`Error · ${err.message||err}`;status(`RSS error: ${err.message||err}`);}
  });
  $$('.f-del').forEach(x=>x.onclick=e=>{settings.rssFeeds.splice(+e.target.dataset.i,1);renderFeeds();});
  const filter=$('#feedFilter');filter.innerHTML='<option value="">Todos los RSS</option>'+settings.rssFeeds.map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
}

function voiceLabel(name){
  const n=String(name||'');const gender=n.startsWith('ef_')?'femenina':n.startsWith('em_')?'masculina':'';
  const pretty=n.replace(/^e[fm]_?/,'').replace(/[_-]+/g,' ');
  return`${pretty||n}${gender?` · ${gender}`:''} (${n})`;
}
async function refreshRuntimeStatus(){
  try{
    const s=await window.ECAPI.localStatus();
    const idle=s.idleStopScheduled?` · apagado automático en ~${Math.max(1,Math.ceil((s.idleStopInSec||0)/60))} min`:'';
    const p=s.profile||{};const profile=p.label?` · Perfil: ${p.label} · ctx ${p.ctx} · GPU ${p.gpuLayers} capas · CPU ${p.threads} hilos`:'';
    $('#localInfo').textContent=`Runtime: ${s.runtime?'✓':'✕'} · Modelo: ${s.model?'✓':'✕'} · Servidor: ${s.running?'activo':'detenido'}${s.downloading?' · descargando':''}${profile}${idle}`;
    $('#downloadModel').disabled=!!s.model||!!s.downloading;$('#startLocal').disabled=!s.model||s.running;$('#stopLocal').disabled=!s.running;
  }catch(e){$('#localInfo').textContent=`IA local no disponible: ${e.message||e}`;$('#startLocal').disabled=true;$('#stopLocal').disabled=true;}
  try{
    const t=await window.ECAPI.ttsStatus();
    const profile=t.profileLabel||'Seguro para streaming';
    $('#ttsInfo').textContent=t.ready?`Kokoro integrado ✓ · ${profile} · ONNX ${t.threads||2} hilos · una voz a la vez`:'Kokoro no disponible en esta build';
    const v=$('#voice'),previous=settings?.tts?.voice||v.value;v.innerHTML='';
    const voices=(t.voices||[]).filter(x=>/^e[fm]_/.test(x));const usable=voices.length?voices:(t.voices||[]).slice(0,80);
    for(const name of usable){const o=document.createElement('option');o.value=name;o.textContent=voiceLabel(name);v.appendChild(o);}
    if(!v.options.length){const o=document.createElement('option');o.value='';o.textContent='No se encontraron voces';v.appendChild(o);v.disabled=true;}
    else{v.disabled=false;if([...v.options].some(o=>o.value===previous))v.value=previous;else{v.value=v.options[0].value;if(settings?.tts)settings.tts.voice=v.value;}}
  }catch(e){$('#ttsInfo').textContent=`Error al cargar Kokoro: ${e.message||e}`;$('#voice').innerHTML='<option value="">Error al cargar voces</option>';$('#voice').disabled=true;}
}
async function refreshPronunciationStatus(){
  try{
    const p=await window.ECAPI.pronunciationStatus();const el=$('#pronunciationInfo');if(!el)return;
    const learned=Number(p.learningEntries??p.cacheEntries??0);const claude=p.claudeVerifyEnabled?'Claude verificador: activado':'Claude verificador: desactivado';
    el.textContent=p.model
      ?`Normalizador listo ✓ · Runtime ${p.runtime?'✓':'✕'} · ${p.modelName||'Qwen 0.6B'} · ${learned} pronunciaciones aprendidas · ${claude} · límite ${p.maxSeconds||15} s${p.running?' · Qwen activo':' · bajo demanda'}`
      :`Reglas básicas activas ✓ · Qwen 0.6B opcional no descargado · ${learned} pronunciaciones conservadas · ${claude}`;
    $('#downloadPronunciationModel').disabled=!!p.model;
    $('#pronunciationLearningCount').textContent=`${learned} aprendidas`;
  }catch(e){$('#pronunciationInfo').textContent=`Normalizador básico disponible; estado inteligente no disponible: ${e.message||e}`;}
}

function refreshCannedIntervalUi(){if($('#cannedCustomRow'))$('#cannedCustomRow').classList.toggle('hidden',$('#cannedInterval').value!=='custom');}
function readCannedInterval(){const v=$('#cannedInterval').value;if(v==='custom')return Math.max(1,Math.min(999,Number($('#cannedCustomInterval').value)||15));return Math.max(0,Number(v)||0);}
async function refreshCannedList(){
  const box=$('#cannedList'),count=$('#cannedCount'),info=$('#cannedFolderInfo');if(!box)return;
  try{
    const r=await window.ECAPI.cannedList();if(r.folder)settings.canned.folder=r.folder;
    info.textContent=r.folder?`${r.folder}${r.ok?` · ${r.count||0} videos compatibles`:''}`:'Sin carpeta seleccionada.';count.textContent=`${r.count||0} videos`;
    if(!r.files?.length){box.innerHTML=`<div class="empty">${escapeHtml(r.message||'No hay contenidos compatibles.')}</div>`;return;}
    box.innerHTML=r.files.map(x=>`<div class="media-item"><div class="media-name">${escapeHtml(x.name)}</div><div class="media-meta">${Number(x.sizeMB||0).toFixed(1)} MB</div></div>`).join('');
  }catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message||e)}</div>`;count.textContent='0 videos';}
}
async function refreshAdsList(){
  const box=$('#adsList'),count=$('#adsCount'),info=$('#adsFolderInfo'),badge=$('#adsState');if(!box)return;
  try{
    const r=await window.ECAPI.cannedListAds();if(r.folder)settings.canned.adsFolder=r.folder;
    const folder=String(r.folder||settings.canned.adsFolder||'');
    info.textContent=folder?`${folder}${r.ok?` · ${r.count||0} videos compatibles`:''}`:'Sin carpeta seleccionada.';count.textContent=`${r.count||0} videos`;
    const enabled=settings.canned.insertAdAfterContent!==false;badge.textContent=!folder?'SIN CARPETA':enabled?'ACTIVO':'DESACTIVADO';badge.className=`status-pill ${folder&&enabled?'ok':'neutral'}`;
    if(!r.files?.length){box.innerHTML=`<div class="empty">${escapeHtml(r.message||'No hay anuncios compatibles.')}</div>`;return;}
    box.innerHTML=r.files.map(x=>`<div class="media-item"><div class="media-name">${escapeHtml(x.name)}</div><div class="media-meta">${Number(x.sizeMB||0).toFixed(1)} MB</div></div>`).join('');
  }catch(e){box.innerHTML=`<div class="empty">${escapeHtml(e.message||e)}</div>`;count.textContent='0 videos';badge.textContent='ERROR';badge.className='status-pill error';}
}

async function loadNews(){
  status('Actualizando RSS...');
  try{const r=await window.ECAPI.loadRss();stories=r.items||[];renderNews();const fallback=(r.feedStatus||[]).filter(x=>x.mode==='WEB_FALLBACK').length;status(`${stories.length} noticias · ${r.errors?.length||0} RSS con error${fallback?` · ${fallback} usando fallback web`:''}`);}catch(e){status(`Error RSS: ${e.message||e}`);}
}
function renderNews(){
  const q=($('#search')?.value||'').toLowerCase(),ff=$('#feedFilter')?.value||'',list=$('#newsList');if(!list)return;list.innerHTML='';
  stories.filter(s=>(!ff||s.feedId===ff)&&(!q||`${s.title} ${s.description}`.toLowerCase().includes(q))).forEach(s=>{
    const el=document.createElement('div');el.className='newsItem';el.innerHTML=`<div class="thumb" style="background-image:url('${escapeHtml((s.image||'').replace(/'/g,'%27'))}')"></div><div class="meta"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.feedName)} · ${escapeHtml(s.category||'Sin categoría')}</p><p>${escapeHtml(s.description||'')}</p></div><button class="edit">Editar</button>`;el.querySelector('.edit').onclick=()=>openStory(s);list.appendChild(el);
  });
}
async function openStory(s){
  currentStory=s;status('Cargando artículo...');
  try{currentArticle=await window.ECAPI.fetchArticle(s.link);}catch{currentArticle={title:s.title,description:s.description,body:s.description,image:''};status('Artículo parcial: se usará el RSS');}
  $('#title').value=s.title||currentArticle.title||'';$('#category').value=s.category||currentArticle.category||'ACTUALIDAD';$('#summary').value=s.description||currentArticle.description||'';$('#script').value='';refreshPreview();tab('editor');status('Noticia lista para editar');
}

async function saveSettings(options={}){
  if(!settings)throw new Error('Los ajustes todavía no están disponibles');
  normalizeProviders(true);updateDesignFromControls(false);
  settings.ai.claudeModel='claude-haiku-4-5-20251001';settings.ai.geminiModel=$('#geminiModel').value.trim();settings.ai.claudeKey=$('#claudeKey').value.trim();settings.ai.geminiKey=$('#geminiKey').value.trim();
  settings.ai.localBackupMode=$('#localBackupMode').value||'on_demand';settings.ai.localIdleMinutes=Math.max(1,Math.min(60,Number($('#localIdleMinutes').value)||5));
  const voice=$('#voice').value;if(voice)settings.tts.voice=voice;settings.tts.speed=Number($('#voiceSpeed').value||1);settings.tts.resourceMode=$('#ttsPerformanceProfile').value||'safe_streaming';
  settings.tts.pronunciationSmart=true;settings.tts.pronunciationClaudeVerify=$('#pronunciationClaudeVerify').checked;settings.tts.pronunciationMaxSeconds=Math.max(5,Math.min(30,Number($('#pronunciationMaxSeconds').value)||15));
  settings.canned.enabled=$('#cannedEnabled').checked;settings.canned.emergency=$('#cannedEmergency').checked;settings.canned.interval=readCannedInterval();settings.canned.insertAdAfterContent=$('#adsAfterCanned').checked;
  settings.automation.bufferReady=Math.max(1,Math.min(30,Number($('#bufferReady').value)||15);settings.automation.queueMax=Math.max(settings.automation.bufferReady,30);
  settings.automation.maxAgeHours=Math.max(1,Math.min(48,Number($('#maxAge').value)||6));settings.automation.avoidRepeats=$('#avoidRepeats').checked;settings.visual.pauseSeconds=Math.max(0,Math.min(10,Number($('#pauseSeconds').value)||2.5));
  const r=await window.ECAPI.saveSettings(settings);settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;settings.ai.claudeModel=r.claudeModel||'claude-haiku-4-5-20251001';settings.ai.claudeKey='';settings.ai.geminiKey='';$('#claudeKey').value='';$('#geminiKey').value='';
  refreshProviderUi();$('#ttsPerformanceHint').textContent=ttsProfileHint(settings.tts.resourceMode);
  if(!options.quiet){await refreshRuntimeStatus();await refreshPronunciationStatus();status('Ajustes guardados');}
  return r;
}

function stateText(group,type){
  if(!group.running)return type==='processing'?'DETENIDO':'DETENIDA';if(group.paused)return type==='processing'?'PAUSADO':'PAUSADA';
  if(type==='emission'){if(group.currentKind==='ad')return'ANUNCIO AL AIRE';if(group.currentKind==='canned')return'CONTENIDO AL AIRE';return group.currentTitle?'AL AIRE':'ACTIVA · EN ESPERA';}
  return'PROCESANDO';
}
function refreshSessionCounters(s){const x=s?.session||{};$('#sessionNewsEmitted').textContent=String(x.newsEmitted||0);$('#sessionCannedEmitted').textContent=String(x.cannedEmitted||0);$('#sessionAdsEmitted').textContent=String(x.adsEmitted||0);}
function refreshAutomation(s){
  automationState=s||automationState;const p=automationState.processing||{},e=automationState.emission||{};
  const pe=$('#processingState'),ee=$('#emissionState');pe.textContent=stateText(p,'processing');ee.textContent=stateText(e,'emission');
  pe.className=`status-pill ${!p.running?'neutral':p.paused?'pause':'ok'}`;ee.className=`status-pill ${!e.running?'neutral':e.paused?'pause':'live'}`;
  $('#processingDetail').textContent=p.message||(!p.running?'Procesamiento detenido.':p.paused?'Procesamiento pausado.':'Procesando noticias.');
  $('#processStart').disabled=!!p.running&&!p.paused;$('#processPause').disabled=!p.running||p.paused;$('#processResume').disabled=!p.running||!p.paused;$('#processStop').disabled=!p.running;
  $('#emissionStart').disabled=!!e.running&&!e.paused;$('#emissionPause').disabled=!e.running||e.paused;$('#emissionResume').disabled=!e.running||!e.paused;$('#emissionStop').disabled=!e.running;
  const c=automationState.counts||{},b=automationState.buffer||{},cs=automationState.canned||{},ad=automationState.ads||{};
  $('#queueSummary').innerHTML=`<div class="queue-stat"><b>${c.ready||0}</b><span>LISTAS</span></div><div class="queue-stat"><b>~${b.autonomyMin??0}</b><span>MIN AUTONOMÍA</span></div><div class="queue-stat"><b>${c.processing||0}</b><span>PROCESANDO</span></div><div class="queue-stat"><b>${b.target||15}</b><span>OBJETIVO</span></div><div class="queue-stat"><b>${c.error||0}</b><span>ERRORES</span></div>`;
  refreshSessionCounters(automationState);
  $('#cannedState').textContent=!cs.enabled?'DESACTIVADO':e.currentKind==='canned'?'AL AIRE':'ACTIVO';$('#cannedState').className=`status-pill ${!cs.enabled?'neutral':e.currentKind==='canned'?'live':'ok'}`;
  const adsBadge=$('#adsState');if(e.currentKind==='ad'){adsBadge.textContent='AL AIRE';adsBadge.className='status-pill live';}else{adsBadge.textContent=!ad.folderConfigured?'SIN CARPETA':ad.insertAfterCanned===false?'DESACTIVADO':'ACTIVO';adsBadge.className=`status-pill ${ad.folderConfigured&&ad.insertAfterCanned!==false?'ok':'neutral'}`;}
  $('#launchCannedNow').disabled=!cs.enabled||!e.running;
  if(!cs.enabled)$('#nextCannedInfo').textContent='Contenidos: desactivados.';
  else if(e.currentKind==='ad')$('#nextCannedInfo').textContent=`Anuncio al aire: ${ad.current||e.currentTitle||''} · después volverá al flujo automático.`;
  else if(e.currentKind==='canned')$('#nextCannedInfo').textContent=`Contenido al aire: ${cs.current||e.currentTitle||''} · el buffer sigue procesándose.`;
  else if(cs.interval>0)$('#nextCannedInfo').textContent=`Próximo contenido programado: en ${cs.nextIn} noticia${cs.nextIn===1?'':'s'} · total programable ${cs.scheduledTotal||0}.`;
  else $('#nextCannedInfo').textContent=`Contenido programado desactivado${cs.emergency?' · respaldo de emergencia activo.':'.'}`;
  renderQueue(automationState.queue||[]);
}
function renderQueue(q){
  const box=$('#queue');if(!q.length){box.innerHTML='<div class="empty">Sin actividad</div>';return;}
  box.innerHTML=q.map((x,i)=>{
    const failures=(x.attempts||[]).filter(a=>!a.ok);const used=x.provider?`${providerName(x.provider)}${x.model?` · ${x.model}`:''}`:'';
    const failedProviders=[...new Set(failures.map(a=>providerName(a.provider)))];const usedFallback=used&&failedProviders.length?`Fallback tras ${failedProviders.join(', ')}`:'';
    const failureDetail=failures.map(a=>`${providerName(a.provider)}${a.code?` [${a.code}]`:''}: ${String(a.message||'Error').replace(/\s+/g,' ').slice(0,180)}`).join(' | ');
    const m=x.metrics||{},timing=m.elapsedMs?`IA ${(m.elapsedMs/1000).toFixed(1)} s`:'',tokens=m.inputTokens?`Tokens ${Number(m.inputTokens).toLocaleString()} → ${Number(m.outputTokens||0).toLocaleString()}`:'',inputSize=m.inputChars?`Fuente IA ${Number(m.inputChars).toLocaleString()} caracteres`:'';
    const pron=m.pronunciationElapsedMs?`Pron. ${(m.pronunciationElapsedMs/1000).toFixed(1)} s${m.pronunciationClaude?' · Claude':m.pronunciationSmart?' · inteligente':''}${m.pronunciationLearned?` · ${m.pronunciationLearned} aprendida(s)`:''}${m.pronunciationSmartFailed?' · fallback básico':''}`:'';
    const audioLen=m.audioDurationSec?`Audio ${Number(m.audioDurationSec).toFixed(1)} s`:'',rtf=m.ttsRealtimeFactor?`RTF ${Number(m.ttsRealtimeFactor).toFixed(2)}×`:'',profile=m.ttsProfile?String(m.ttsProfile):'';
    const tts=m.ttsElapsedMs?`TTS ${(m.ttsElapsedMs/1000).toFixed(1)} s · ${audioLen||'Audio n/d'} · ONNX ${m.ttsThreads||2} hilos${profile?` · ${profile}`:''}${rtf?` · ${rtf}`:''}`:'';
    const stage=x.stage&&x.status==='PROCESANDO'?`Etapa: ${x.stage}`:'',generic=x.error&&!failureDetail?x.error:'',retry=x.outputRetries?`Reintentos Output ${x.outputRetries}`:'';
    const meta=[used,timing,tokens,inputSize,pron,tts,usedFallback,failureDetail,stage,retry,generic].filter(Boolean).join(' · ');
    const cls=x.status==='LISTA'?'ready':x.status==='PROCESANDO'?'processing':x.status==='AL AIRE'?'air':x.status==='ERROR'?'error':'';
    return`<div class="queue-item"><div class="queue-main"><span class="queue-index">${i+1}.</span><div class="queue-text"><div class="queue-title">${escapeHtml(x.title)}</div>${meta?`<div class="queue-meta">${escapeHtml(meta)}</div>`:''}</div><span class="queue-badge ${cls}">${escapeHtml(x.status)}</span></div></div>`;
  }).join('');
}
