$('#refresh').onclick=loadNews;$('#search').oninput=renderNews;$('#feedFilter').onchange=renderNews;
$('#openOutput').onclick=async()=>{
  try{
    if(currentOutputState?.open){
      const r=await window.ECAPI.closeOutput();
      if(r.cancelled)return status('Cierre de Output cancelado.');
      status('Output cerrado. Si la emisión automática estaba activa quedó pausada; el procesamiento continúa.');
    }else{
      const r=await window.ECAPI.openOutput();refreshOutputStatus(r.state);status(`Output abierto en ${r.state?.resolution||'resolución nativa'}. Las animaciones continúan en segundo plano.`);
    }
  }catch(e){status(`Output: ${e.message||e}`);}
};
$('#addFeed').onclick=()=>{settings.rssFeeds.push({id:`rss-${Date.now()}`,name:'Nuevo RSS',url:'',enabled:true,priority:50});renderFeeds();};
$('#pickFallback').onclick=async()=>{const r=await window.ECAPI.pickFallback();if(r.ok){settings.visual.fallbackImage=r.path;settings.visual.fallbackImageUrl=r.url;$('#fallbackInfo').textContent=r.path;refreshPreview();}};
$('#save').onclick=()=>saveSettings();
['primary','backup1','backup2'].forEach(id=>$('#'+id).onchange=()=>{normalizeProviders(true);refreshLocalPolicyUi();});
$('#localBackupMode').onchange=refreshLocalPolicyUi;
$('#testClaude').onclick=async()=>{try{await saveSettings({quiet:true});$('#claudeStatus').textContent='Probando conexión y generación real...';status('Probando Claude con una generación real...');const r=await window.ECAPI.testProvider('claude');settings.ai.hasClaudeKey=!!r.keyStored;refreshProviderUi();$('#claudeStatus').textContent=`Conexión y generación OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Claude OK · generación real correcta · ${r.models?.length||0} modelos disponibles`);}catch(e){$('#claudeStatus').textContent=`Error real de Claude: ${e.message||e}`;status(`Claude error: ${e.message||e}`);}};
$('#testGemini').onclick=async()=>{try{await saveSettings({quiet:true});$('#geminiStatus').textContent='Probando conexión...';status('Probando Gemini...');const r=await window.ECAPI.testProvider('gemini');settings.ai.hasGeminiKey=!!r.keyStored;refreshProviderUi();$('#geminiStatus').textContent=`Conexión OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Gemini OK · ${r.models?.length||0} modelos disponibles`);}catch(e){$('#geminiStatus').textContent=`Error: ${e.message||e}`;status(`Gemini error: ${e.message||e}`);}};
$('#downloadModel').onclick=async()=>{status('Descargando Qwen 8B (~5 GB)...');try{await window.ECAPI.downloadLocalModel();status('Qwen descargado. Ya puedes activarlo o dejar que se inicie automáticamente si entra como respaldo.');await refreshRuntimeStatus();}catch(e){status(`Descarga error: ${e.message||e}`);}};
$('#startLocal').onclick=async()=>{status('Activando IA local...');try{await window.ECAPI.startLocal();status('IA local activa. Mientras permanezca activa consume recursos del equipo.');await refreshRuntimeStatus();}catch(e){status(String(e.message||e).includes('MODEL_MISSING')?'Primero descarga Qwen':`IA local error: ${e.message||e}`);}};
$('#stopLocal').onclick=async()=>{try{await window.ECAPI.stopLocal();status('IA local detenida. El modelo sigue descargado y se han liberado sus recursos de ejecución.');await refreshRuntimeStatus();}catch(e){status(`No se pudo detener la IA local: ${e.message||e}`);}};
$('#downloadPronunciationModel').onclick=async()=>{
  status('Descargando normalizador inteligente Qwen 0.6B (~430 MB)...');$('#pronunciationInfo').textContent='Descargando modelo inteligente...';
  try{await window.ECAPI.downloadPronunciationModel();status('Normalizador inteligente descargado. Se iniciará automáticamente solo cuando haga falta.');await refreshPronunciationStatus();}
  catch(e){const msg=e.message||String(e);$('#pronunciationInfo').textContent=`Error de descarga: ${msg}`;status(`Error al descargar normalizador: ${msg}`);}
};
$('#testPronunciation').onclick=async()=>{
  status('Probando normalizador y Kokoro...');$('#pronunciationTestResult').textContent='Procesando: Apple TV, YouTube y 25%...';
  try{const r=await window.ECAPI.testPronunciation();$('#pronunciationTestResult').textContent=`Texto para locución: ${r.text}${r.smartUsed?' · normalizador inteligente utilizado':' · reglas locales'}`;$('#pronunciationTestAudio').src=r.audioUrl||'';status('Prueba de pronunciación lista.');}
  catch(e){$('#pronunciationTestResult').textContent=`Error: ${e.message||e}`;status(`Prueba de pronunciación: ${e.message||e}`);}
};

$('#genScript').onclick=async()=>{if(!currentStory)return;await saveSettings({quiet:true});status('Generando guion...');try{const r=await window.ECAPI.generate(currentStory,currentArticle||{});currentGenerated=r;$('#title').value=r.result.title||currentStory.title;$('#category').value=r.result.category||'ACTUALIDAD';$('#summary').value=r.result.summary||'';$('#script').value=r.result.script||'';refreshPreview();const fallbacks=(r.attempts||[]).filter(a=>!a.ok).map(a=>providerName(a.provider));status(`Guion generado con ${providerName(r.provider)}${fallbacks.length?` · fallback tras ${[...new Set(fallbacks)].join(', ')}`:''}`);}catch(e){status(`IA error: ${e.message||e}`);}};
$('#genVoice').onclick=async()=>{const script=$('#script').value.trim();if(!script)return status('Primero genera o escribe el guion');await saveSettings({quiet:true});status('Normalizando pronunciación y generando voz con Kokoro...');try{const head=$('#title').value.trim();const clean=x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();const spoken=head&&!clean(script.slice(0,Math.max(220,head.length*2))).startsWith(clean(head))?`${head}. ${script}`:script;currentAudio=await window.ECAPI.generateTts(spoken);$('#previewAudio').src=currentAudio.url;const p=currentAudio.pronunciation||{};status(`Voz lista · ${Math.round(currentAudio.durationSec||0)} s · TTS ${((currentAudio.elapsedMs||0)/1000).toFixed(1)} s${p.smartUsed?' · pronunciación inteligente':''}`);}catch(e){status(`Kokoro error: ${e.message||e}`);}};
$('#sendOutput').onclick=async()=>{const image=effectiveImage();try{const r=await window.ECAPI.sendManualOutput({title:$('#title').value,category:$('#category').value,pubDate:currentStory?.pubDate||currentArticle?.pubDate||'',summary:$('#summary').value,image,fallbackImage:settings.visual.fallbackImageUrl||'',audioUrl:currentAudio?.url||'',audioDurationSec:currentAudio?.durationSec||0});if(r.cancelled)return status('Emisión manual cancelada');status('Noticia del Editor enviada a Output');}catch(e){status(`Output: ${e.message||e}`);}};
$('#title').oninput=refreshPreview;$('#category').oninput=refreshPreview;$('#summary').oninput=refreshPreview;

$('#processStart').onclick=async()=>{await saveSettings({quiet:true});try{refreshAutomation(await window.ECAPI.processingStart());status('Procesamiento automático iniciado. El pipeline adelanta Claude mientras Kokoro genera una sola voz a la vez.');}catch(e){status(`Procesamiento: ${e.message||e}`);}};
$('#processPause').onclick=async()=>{refreshAutomation(await window.ECAPI.processingPause());status('Procesamiento pausado. La cola preparada se conserva.');};
$('#processResume').onclick=async()=>{refreshAutomation(await window.ECAPI.processingResume());status('Procesamiento reanudado.');};
$('#processStop').onclick=async()=>{refreshAutomation(await window.ECAPI.processingStop());status('Procesamiento detenido. La cola preparada se conserva.');};
$('#emissionStart').onclick=async()=>{await saveSettings({quiet:true});try{refreshAutomation(await window.ECAPI.emissionStart());status('Emisión automática iniciada.');}catch(e){status(String(e.message||e).includes('OUTPUT_NOT_OPEN')?'Primero abre Output y luego inicia la emisión automática.':`Emisión: ${e.message||e}`);}};
$('#emissionPause').onclick=async()=>{refreshAutomation(await window.ECAPI.emissionPause());status('Emisión pausada: el contenido actual terminará y no se enviará el siguiente.');};
$('#emissionResume').onclick=async()=>{try{refreshAutomation(await window.ECAPI.emissionResume());status('Emisión automática reanudada.');}catch(e){status(String(e.message||e).includes('OUTPUT_NOT_OPEN')?'Abre Output para reanudar la emisión.':`Emisión: ${e.message||e}`);}};
$('#emissionStop').onclick=async()=>{refreshAutomation(await window.ECAPI.emissionStop());status('Emisión automática detenida. Las noticias listas permanecen en cola.');};
$('#clearQueue').onclick=async()=>{if(!confirm('¿Vaciar las noticias preparadas y los errores de la cola?'))return;try{refreshAutomation(await window.ECAPI.clearQueue());status('Cola vaciada.');}catch(e){status(e.message||e);}};

$('#pickCannedFolder').onclick=async()=>{
  try{const r=await window.ECAPI.cannedPickFolder();if(!r.ok)return;settings.canned.folder=r.folder;status(`Carpeta de Enlatados seleccionada: ${r.count||0} videos.`);await refreshCannedList();await saveSettings({quiet:true});}
  catch(e){status(`Enlatados: ${e.message||e}`);}
};
$('#refreshCanned').onclick=async()=>{await refreshCannedList();status('Carpeta de Enlatados actualizada.');};
$('#cannedInterval').onchange=async()=>{refreshCannedIntervalUi();await saveSettings({quiet:true});};
$('#cannedCustomInterval').onchange=()=>saveSettings({quiet:true});
$('#cannedEnabled').onchange=()=>saveSettings({quiet:true});
$('#cannedEmergency').onchange=()=>saveSettings({quiet:true});
$('#launchCannedNow').onclick=async()=>{
  try{refreshAutomation(await window.ECAPI.cannedLaunchNow());status('Enlatado programado para salir al terminar el contenido actual.');}
  catch(e){const m=String(e.message||e);status(m.includes('ENLATADOS_DISABLED')?'Activa Enlatados primero.':m.includes('CANNED_FOLDER_MISSING')?'Selecciona una carpeta de Enlatados.':m.includes('EMISSION_NOT_RUNNING')?'Inicia la emisión automática para lanzar un Enlatado.':`Enlatados: ${m}`);}
};

$('#pickVerticalVideoBackground').onclick=async()=>{try{const r=await window.ECAPI.pickVerticalVideoBackground();if(r.ok){settings.visual.output.verticalVideoBackground=r.path;settings.visual.output.verticalVideoBackgroundUrl=r.url;$('#verticalVideoBackgroundInfo').textContent=r.path;window.ECAPI.previewOutputDesign(design());status('Fondo vertical cargado.');}}catch(e){status(`Fondo vertical: ${e.message||e}`);}};
$('#clearVerticalVideoBackground').onclick=async()=>{try{const r=await window.ECAPI.clearVerticalVideoBackground();settings.visual.output.verticalVideoBackground='';settings.visual.output.verticalVideoBackgroundUrl='';$('#verticalVideoBackgroundInfo').textContent='Sin fondo: se usará negro.';window.ECAPI.previewOutputDesign(design());status('Fondo vertical eliminado.');}catch(e){status(`Fondo vertical: ${e.message||e}`);}};
$('#pickMusic').onclick=async()=>{try{const r=await window.ECAPI.pickMusic();if(r.ok){settings.visual.output.musicFile=r.path;settings.visual.output.musicUrl=r.url;$('#musicInfo').textContent=r.path;window.ECAPI.previewOutputDesign(design());status('Música de fondo cargada.');}}catch(e){status(`Música: ${e.message||e}`);}};
$('#clearMusic').onclick=async()=>{try{await window.ECAPI.clearMusic();settings.visual.output.musicFile='';settings.visual.output.musicUrl='';$('#musicInfo').textContent='Sin música cargada.';window.ECAPI.previewOutputDesign(design());status('Música de fondo eliminada.');}catch(e){status(`Música: ${e.message||e}`);}};

const designIds=['outputFormat','fontFamily','dateFontFamily','imageAnimation','motionSpeed','titleColor','summaryColor','categoryBgColor','categoryTextColor','lowerBgColor','lowerOpacity','tiktokSafe','showSafeGuides','musicEnabled','musicLoop','musicVolume','voiceVolume','cannedVolume','transitionEnabled','transitionType','transitionDuration'];
designIds.forEach(id=>{const el=$('#'+id);if(el)el.addEventListener('input',()=>updateDesignFromControls(true));});
$('#saveDesign').onclick=async()=>{await saveSettings({quiet:true});status('Diseño de emisión guardado.');};
$('#resetDesign').onclick=()=>{settings.visual.output={...DESIGN_DEFAULT};setDesignControls(settings.visual.output);updateDesignFromControls(true);status('Diseño restaurado. Pulsa Guardar diseño para conservarlo.');};

window.ECAPI.on('automation:state',refreshAutomation);
window.ECAPI.on('automation:itemError',e=>{const d=(e.details||[]).map(x=>`${providerName(x.provider)}${x.code?` [${x.code}]`:''}: ${x.message}`).join(' | ');status(`Automático · ${e.stage||'error'}: ${e.error}${d?` · ${d}`:''}`);});
window.ECAPI.on('automation:engineError',e=>status(`Automático: ${e.message}`));
window.ECAPI.on('output:state',refreshOutputStatus);
window.ECAPI.on('local:event',e=>{
  if(e.type==='model-download'){$('#downloadProgress div').style.width=`${e.percent||0}%`;status(`Descargando Qwen: ${e.percent||0}%`);}
  if(e.type==='local-ai-started')status('IA local activa.');
  if(e.type==='local-ai-idle-scheduled')status(`Qwen se apagará automáticamente tras ${Math.round((e.seconds||0)/60)} min sin uso.`);
  if(e.type==='local-ai-stopped'&&e.reason==='idle')status('Qwen se apagó automáticamente por inactividad y liberó recursos.');
  if(e.type==='local-ai-error')status(`IA local: ${e.message||'error'}`);
  if(['local-ai-exit','local-ai-started','local-ai-stopped','local-ai-idle-scheduled'].includes(e.type))refreshRuntimeStatus();
});
window.ECAPI.on('pronunciation:event',e=>{
  if(e.type==='pronunciation-download'){$('#pronunciationProgress div').style.width=`${e.percent||0}%`;status(e.percent?`Descargando normalizador: ${e.percent}%`:'Descargando normalizador...');}
  if(e.type==='pronunciation-downloaded'){status('Normalizador inteligente listo.');refreshPronunciationStatus();}
  if(e.type==='pronunciation-error')status(`Pronunciación: se usaron reglas básicas porque el modelo inteligente falló: ${e.message||''}`);
  if(['pronunciation-started','pronunciation-stopped','pronunciation-exit'].includes(e.type))refreshPronunciationStatus();
});

(async()=>{await loadSettings();await loadNews();})();
