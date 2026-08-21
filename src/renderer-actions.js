'use strict';
$('#refresh').onclick=loadNews;$('#search').oninput=renderNews;$('#feedFilter').onchange=renderNews;
$('#openOutput').onclick=async()=>{
  try{
    if(currentOutputState?.open){const r=await window.ECAPI.closeOutput();if(r.cancelled)return status('Cierre de Output cancelado.');status('Output cerrado. Si la emisión automática estaba activa quedó pausada; el procesamiento continúa.');}
    else{const r=await window.ECAPI.openOutput();refreshOutputStatus(r.state);status(`Output abierto en ${r.state?.resolution||'resolución nativa'}.`);}
  }catch(e){status(`Output: ${e.message||e}`);}
};
$('#addFeed').onclick=()=>{settings.rssFeeds.push({id:`rss-${Date.now()}`,name:'Nuevo RSS',url:'',enabled:true,priority:50});renderFeeds();};
$('#pickFallback').onclick=async()=>{try{const r=await window.ECAPI.pickFallback();if(r.ok){settings.visual.fallbackImage=r.path;settings.visual.fallbackImageUrl=r.url;$('#fallbackInfo').textContent=r.path;refreshPreview();}}catch(e){status(`Imagen fallback: ${e.message||e}`);}};
$('#save').onclick=()=>saveSettings().catch(e=>status(`Ajustes: ${e.message||e}`));
['primary','backup1','backup2'].forEach(id=>$('#'+id).onchange=()=>{normalizeProviders(true);refreshLocalPolicyUi();});
$('#localBackupMode').onchange=refreshLocalPolicyUi;

$('#testClaude').onclick=async()=>{
  try{await saveSettings({quiet:true});$('#claudeStatus').textContent='Probando Claude Haiku 4.5...';status('Probando Claude Haiku 4.5 con una generación real...');const r=await window.ECAPI.testProvider('claude');settings.ai.hasClaudeKey=!!r.keyStored;refreshProviderUi();$('#claudeStatus').textContent=`Conexión y generación OK ✓ · ${r.model}`;status(`Claude Haiku 4.5 OK · ${r.models?.length||0} modelos visibles en la cuenta`);}
  catch(e){$('#claudeStatus').textContent=`Error de Claude Haiku 4.5: ${e.message||e}`;status(`Claude error: ${e.message||e}`);}
};
$('#testGemini').onclick=async()=>{
  try{await saveSettings({quiet:true});$('#geminiStatus').textContent='Probando conexión...';const r=await window.ECAPI.testProvider('gemini');settings.ai.hasGeminiKey=!!r.keyStored;refreshProviderUi();$('#geminiStatus').textContent=`Conexión OK ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Gemini OK · ${r.models?.length||0} modelos disponibles`);}
  catch(e){$('#geminiStatus').textContent=`Error: ${e.message||e}`;status(`Gemini error: ${e.message||e}`);}
};

$('#downloadModel').onclick=async()=>{
  $('#downloadModel').disabled=true;status('Descargando Qwen 8B (~5 GB)...');
  try{await window.ECAPI.downloadLocalModel();status('Qwen 8B descargado.');await refreshRuntimeStatus();}
  catch(e){status(`Descarga Qwen: ${e.message||e}`);await refreshRuntimeStatus();}
};
$('#startLocal').onclick=async()=>{status('Activando IA local...');try{await window.ECAPI.startLocal();status('IA local activa.');await refreshRuntimeStatus();}catch(e){status(String(e.message||e).includes('MODEL_MISSING')?'Primero descarga Qwen 8B':`IA local: ${e.message||e}`);}};
$('#stopLocal').onclick=async()=>{try{await window.ECAPI.stopLocal();status('IA local detenida.');await refreshRuntimeStatus();}catch(e){status(`No se pudo detener Qwen: ${e.message||e}`);}};

$('#downloadPronunciationModel').onclick=async()=>{
  $('#downloadPronunciationModel').disabled=true;status('Descargando Qwen 0.6B para pronunciación (~430 MB)...');$('#pronunciationInfo').textContent='Descargando modelo inteligente...';
  try{await window.ECAPI.downloadPronunciationModel();status('Normalizador Qwen 0.6B descargado.');await refreshPronunciationStatus();}
  catch(e){const msg=e.message||String(e);$('#pronunciationInfo').textContent=`Error de descarga: ${msg}`;status(`Normalizador: ${msg}`);await refreshPronunciationStatus();}
};
$('#testPronunciation').onclick=async()=>{
  status('Probando normalizador y Kokoro...');$('#pronunciationTestResult').textContent='Procesando términos de prueba...';
  try{
    await saveSettings({quiet:true});const r=await window.ECAPI.testPronunciation();
    const mode=r.claudeUsed?' · validado con Claude Haiku 4.5':r.smartUsed?' · aprendizaje inteligente aplicado':r.smartFailed?' · fallback a reglas básicas':' · reglas locales';
    $('#pronunciationTestResult').textContent=`Texto para locución: ${r.text}${mode} · ${r.learningEntries||0} pronunciaciones guardadas`;
    $('#pronunciationTestAudio').src=r.audioUrl||'';status('Prueba de pronunciación lista.');await refreshPronunciationStatus();
  }catch(e){$('#pronunciationTestResult').textContent=`Error: ${e.message||e}`;status(`Prueba de pronunciación: ${e.message||e}`);}
};
$('#exportPronunciationLearning').onclick=async()=>{
  try{const r=await window.ECAPI.exportPronunciationLearning();if(r.cancelled)return;$('#pronunciationLearningInfo').textContent=`Exportado: ${r.path} · ${r.count||0} entradas`;status('Aprendizaje de pronunciación exportado.');}
  catch(e){status(`Exportar aprendizaje: ${e.message||e}`);}
};
$('#importPronunciationLearning').onclick=async()=>{
  try{const r=await window.ECAPI.importPronunciationLearning();if(r.cancelled)return;$('#pronunciationLearningInfo').textContent=`Importado: +${r.added||0} nuevas · ${r.updated||0} actualizadas · ${r.kept||0} conservadas`;status(`Aprendizaje importado · ${r.total||0} entradas totales`);await refreshPronunciationStatus();}
  catch(e){status(`Importar aprendizaje: ${e.message||e}`);}
};
$('#clearPronunciationLearning').onclick=async()=>{
  if(!confirm('¿Borrar todo el aprendizaje automático de pronunciación? Las reglas integradas y los modelos descargados no se eliminarán.'))return;
  try{await window.ECAPI.clearPronunciationLearning();$('#pronunciationLearningInfo').textContent='Aprendizaje automático borrado.';status('Aprendizaje de pronunciación borrado.');await refreshPronunciationStatus();}
  catch(e){status(`Borrar aprendizaje: ${e.message||e}`);}
};
$('#pronunciationClaudeVerify').onchange=()=>saveSettings({quiet:true}).then(refreshPronunciationStatus).catch(e=>status(`Pronunciación: ${e.message||e}`));
$('#pronunciationMaxSeconds').onchange=()=>saveSettings({quiet:true}).then(refreshPronunciationStatus).catch(e=>status(`Pronunciación: ${e.message||e}`));

$('#ttsPerformanceProfile').onchange=async()=>{
  $('#ttsPerformanceHint').textContent=ttsProfileHint($('#ttsPerformanceProfile').value);
  try{await saveSettings({quiet:true});await refreshRuntimeStatus();status(`Perfil Kokoro: ${$('#ttsPerformanceProfile option:checked').textContent}`);}catch(e){status(`Kokoro: ${e.message||e}`);}
};
$('#voice').onchange=()=>saveSettings({quiet:true}).then(()=>status(`Voz Kokoro seleccionada: ${$('#voice option:checked').textContent}`)).catch(e=>status(`Voz Kokoro: ${e.message||e}`));
$('#voiceSpeed').onchange=()=>saveSettings({quiet:true}).catch(e=>status(`Velocidad de voz: ${e.message||e}`));

$('#genScript').onclick=async()=>{if(!currentStory)return;await saveSettings({quiet:true});status('Generando guion...');try{const r=await window.ECAPI.generate(currentStory,currentArticle||{});currentGenerated=r;$('#title').value=r.result.title||currentStory.title;$('#category').value=r.result.category||'ACTUALIDAD';$('#summary').value=r.result.summary||'';$('#script').value=r.result.script||'';refreshPreview();const fallbacks=(r.attempts||[]).filter(a=>!a.ok).map(a=>providerName(a.provider));status(`Guion generado con ${providerName(r.provider)}${fallbacks.length?` · fallback tras ${[...new Set(fallbacks)].join(', ')}`:''}`);}catch(e){status(`IA: ${e.message||e}`);}};
$('#genVoice').onclick=async()=>{
  const script=$('#script').value.trim();if(!script)return status('Primero genera o escribe el guion');await saveSettings({quiet:true});status('Normalizando pronunciación y generando voz con Kokoro...');
  try{const head=$('#title').value.trim();const clean=x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();const spoken=head&&!clean(script.slice(0,Math.max(220,head.length*2))).startsWith(clean(head))?`${head}. ${script}`:script;currentAudio=await window.ECAPI.generateTts(spoken);$('#previewAudio').src=currentAudio.url;const p=currentAudio.pronunciation||{};status(`Voz lista · ${Math.round(currentAudio.durationSec||0)} s · TTS ${((currentAudio.elapsedMs||0)/1000).toFixed(1)} s${p.claudeUsed?' · pronunciación Claude':p.smartUsed?' · pronunciación aprendida':p.smartFailed?' · pronunciación básica (fallback)':''}`);}catch(e){status(`Kokoro: ${e.message||e}`);}
};
$('#sendOutput').onclick=async()=>{const image=effectiveImage();try{const r=await window.ECAPI.sendManualOutput({title:$('#title').value,category:$('#category').value,pubDate:currentStory?.pubDate||currentArticle?.pubDate||'',summary:$('#summary').value,image,fallbackImage:settings.visual.fallbackImageUrl||'',audioUrl:currentAudio?.url||'',audioDurationSec:currentAudio?.durationSec||0});if(r.cancelled)return status('Emisión manual cancelada');status('Noticia del Editor enviada a Output');}catch(e){status(`Output: ${e.message||e}`);}};
$('#title').oninput=refreshPreview;$('#category').oninput=refreshPreview;$('#summary').oninput=refreshPreview;

$('#processStart').onclick=async()=>{await saveSettings({quiet:true});try{refreshAutomation(await window.ECAPI.processingStart());status('Procesamiento automático iniciado.');}catch(e){status(`Procesamiento: ${e.message||e}`);}};
$('#processPause').onclick=async()=>{try{refreshAutomation(await window.ECAPI.processingPause());status('Procesamiento pausado. Los trabajos ya iniciados pueden terminar su etapa actual.');}catch(e){status(`Procesamiento: ${e.message||e}`);}};
$('#processResume').onclick=async()=>{try{refreshAutomation(await window.ECAPI.processingResume());status('Procesamiento reanudado.');}catch(e){status(`Procesamiento: ${e.message||e}`);}};
$('#processStop').onclick=async()=>{try{refreshAutomation(await window.ECAPI.processingStop());status('Procesamiento detenido. La cola lista se conserva.');}catch(e){status(`Procesamiento: ${e.message||e}`);}};
$('#emissionStart').onclick=async()=>{await saveSettings({quiet:true});try{refreshAutomation(await window.ECAPI.emissionStart());status('Emisión automática iniciada.');}catch(e){status(String(e.message||e).includes('OUTPUT_NOT_OPEN')?'Primero abre Output y luego inicia la emisión automática.':`Emisión: ${e.message||e}`);}};
$('#emissionPause').onclick=async()=>{try{refreshAutomation(await window.ECAPI.emissionPause());status('Emisión pausada: el contenido actual termina y no se enviará el siguiente.');}catch(e){status(`Emisión: ${e.message||e}`);}};
$('#emissionResume').onclick=async()=>{try{refreshAutomation(await window.ECAPI.emissionResume());status('Emisión automática reanudada.');}catch(e){status(String(e.message||e).includes('OUTPUT_NOT_OPEN')?'Abre Output para reanudar la emisión.':`Emisión: ${e.message||e}`);}};
$('#emissionStop').onclick=async()=>{try{refreshAutomation(await window.ECAPI.emissionStop());status('Emisión automática detenida. Las noticias listas permanecen en cola.');}catch(e){status(`Emisión: ${e.message||e}`);}};
$('#clearQueue').onclick=async()=>{if(!confirm('¿Vaciar las noticias preparadas y los errores de la cola?'))return;try{refreshAutomation(await window.ECAPI.clearQueue());status('Cola vaciada.');}catch(e){status(e.message||e);}};
$('#resetSessionCounters').onclick=async()=>{try{refreshAutomation(await window.ECAPI.resetSessionCounters());status('Contadores visibles reiniciados. La programación de contenidos conserva su posición.');}catch(e){status(`Contadores: ${e.message||e}`);}};

$('#pickCannedFolder').onclick=async()=>{try{const r=await window.ECAPI.cannedPickFolder();if(!r.ok)return;settings.canned.folder=r.folder;status(`Carpeta de contenidos: ${r.count||0} videos.`);await refreshCannedList();}catch(e){status(`Contenidos: ${e.message||e}`);}};
$('#refreshCanned').onclick=async()=>{await refreshCannedList();status('Contenidos actualizados.');};
$('#cannedInterval').onchange=async()=>{refreshCannedIntervalUi();await saveSettings({quiet:true});};$('#cannedCustomInterval').onchange=()=>saveSettings({quiet:true});$('#cannedEnabled').onchange=()=>saveSettings({quiet:true});$('#cannedEmergency').onchange=()=>saveSettings({quiet:true});
$('#launchCannedNow').onclick=async()=>{try{refreshAutomation(await window.ECAPI.cannedLaunchNow());status('Contenido programado para salir al terminar lo que está al aire.');}catch(e){const m=String(e.message||e);status(m.includes('ENLATADOS_DISABLED')?'Activa Contenidos primero.':m.includes('CANNED_FOLDER_MISSING')?'Selecciona una carpeta de contenidos.':m.includes('EMISSION_NOT_RUNNING')?'Inicia la emisión automática para lanzar un contenido.':`Contenidos: ${m}`);}};

$('#pickAdsFolder').onclick=async()=>{try{const r=await window.ECAPI.cannedPickAdsFolder();if(!r.ok)return;settings.canned.adsFolder=r.folder;settings.canned.insertAdAfterContent=true;$('#adsAfterCanned').checked=true;await refreshAdsList();status(`Carpeta de anuncios: ${r.count||0} videos.`);}catch(e){status(`Anuncios: ${e.message||e}`);}};
$('#refreshAds').onclick=async()=>{await refreshAdsList();status('Anuncios actualizados.');};
$('#adsAfterCanned').onchange=async()=>{settings.canned.insertAdAfterContent=$('#adsAfterCanned').checked;try{await saveSettings({quiet:true});await refreshAdsList();status($('#adsAfterCanned').checked?'Anuncio después de cada contenido: activado.':'Anuncios automáticos desactivados.');}catch(e){status(`Anuncios: ${e.message||e}`);}};

$('#pickVerticalVideoBackground').onclick=async()=>{try{const r=await window.ECAPI.pickVerticalVideoBackground();if(r.ok){settings.visual.output.verticalVideoBackground=r.path;settings.visual.output.verticalVideoBackgroundUrl=r.url;$('#verticalVideoBackgroundInfo').textContent=r.path;window.ECAPI.previewOutputDesign(design());status('Fondo vertical cargado.');}}catch(e){status(`Fondo vertical: ${e.message||e}`);}};
$('#clearVerticalVideoBackground').onclick=async()=>{try{await window.ECAPI.clearVerticalVideoBackground();settings.visual.output.verticalVideoBackground='';settings.visual.output.verticalVideoBackgroundUrl='';$('#verticalVideoBackgroundInfo').textContent='Sin fondo: se usará negro.';window.ECAPI.previewOutputDesign(design());status('Fondo vertical eliminado.');}catch(e){status(`Fondo vertical: ${e.message||e}`);}};
$('#pickMusic').onclick=async()=>{try{const r=await window.ECAPI.pickMusic();if(r.ok){settings.visual.output.musicFile=r.path;settings.visual.output.musicUrl=r.url;$('#musicInfo').textContent=r.path;window.ECAPI.previewOutputDesign(design());status('Música de fondo cargada.');}}catch(e){status(`Música: ${e.message||e}`);}};
$('#clearMusic').onclick=async()=>{try{await window.ECAPI.clearMusic();settings.visual.output.musicFile='';settings.visual.output.musicUrl='';$('#musicInfo').textContent='Sin música cargada.';window.ECAPI.previewOutputDesign(design());status('Música de fondo eliminada.');}catch(e){status(`Música: ${e.message||e}`);}};

const designIds=['outputFormat','fontFamily','dateFontFamily','imageAnimation','motionSpeed','titleColor','summaryColor','categoryBgColor','categoryTextColor','lowerBgColor','lowerOpacity','tiktokSafe','showSafeGuides','musicEnabled','musicLoop','musicVolume','voiceVolume','cannedVolume','transitionEnabled','transitionType','transitionDuration'];
designIds.forEach(id=>{const el=$('#'+id);if(el){el.addEventListener('input',()=>updateDesignFromControls(true));el.addEventListener('change',()=>updateDesignFromControls(true));}});
$('#saveDesign').onclick=async()=>{try{await saveSettings({quiet:true});status('Diseño de emisión guardado.');}catch(e){status(`Diseño: ${e.message||e}`);}};
$('#resetDesign').onclick=()=>{settings.visual.output={...DESIGN_DEFAULT};setDesignControls(settings.visual.output);updateDesignFromControls(true);status('Diseño restaurado. Pulsa Guardar diseño para conservarlo.');};

window.ECAPI.on('automation:state',refreshAutomation);
window.ECAPI.on('automation:itemError',e=>{const d=(e.details||[]).map(x=>`${providerName(x.provider)}${x.code?` [${x.code}]`:''}: ${x.message}`).join(' | ');status(`Automático · ${e.stage||'error'}: ${e.error}${d?` · ${d}`:''}`);});
window.ECAPI.on('automation:engineError',e=>status(`Automático: ${e.message}`));window.ECAPI.on('output:state',refreshOutputStatus);
window.ECAPI.on('local:event',e=>{
  if(e.type==='model-download'){$('#downloadProgress div').style.width=`${e.percent||0}%`;status(`Descargando Qwen 8B: ${e.percent||0}%`);}
  if(e.type==='model-downloaded')status('Qwen 8B descargado.');if(e.type==='model-download-error')status(`Descarga Qwen: ${e.message||'error'}`);
  if(e.type==='local-ai-started')status('IA local activa.');if(e.type==='local-ai-idle-scheduled')status(`Qwen se apagará tras ${Math.round((e.seconds||0)/60)} min sin uso.`);if(e.type==='local-ai-stopped'&&e.reason==='idle')status('Qwen se apagó por inactividad.');if(e.type==='local-ai-error')status(`IA local: ${e.message||'error'}`);
  if(['local-ai-exit','local-ai-started','local-ai-stopped','local-ai-idle-scheduled','model-downloaded','model-download-error'].includes(e.type))refreshRuntimeStatus();
});
window.ECAPI.on('pronunciation:event',e=>{
  if(e.type==='pronunciation-download'){$('#pronunciationProgress div').style.width=`${e.percent||0}%`;status(e.percent?`Descargando normalizador: ${e.percent}%`:'Descargando normalizador...');}
  if(e.type==='pronunciation-downloaded'){status('Normalizador inteligente listo.');refreshPronunciationStatus();}
  if(e.type==='pronunciation-warning')status(`Pronunciación: ${e.message||'se usará fallback cuando corresponda'}`);
  if(['pronunciation-started','pronunciation-stopped','pronunciation-exit'].includes(e.type))refreshPronunciationStatus();
});

(async()=>{
  try{await loadSettings();if(!SELF_TEST)await loadNews();else status('SELF-TEST UI listo');}
  catch(e){fatalInterface(`No se pudo inicializar EC: ${e.message||e}`);}
})();
