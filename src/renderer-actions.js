$('#refresh').onclick=loadNews;$('#search').oninput=renderNews;$('#feedFilter').onchange=renderNews;
$('#openOutput').onclick=async()=>{try{await window.ECAPI.openOutput();status('Output abierto. No inicia ninguna reproducción por sí solo.');}catch(e){status(`Output: ${e.message||e}`);}};
$('#addFeed').onclick=()=>{settings.rssFeeds.push({id:`rss-${Date.now()}`,name:'Nuevo RSS',url:'',enabled:true,priority:50});renderFeeds();};
$('#pickFallback').onclick=async()=>{const r=await window.ECAPI.pickFallback();if(r.ok){settings.visual.fallbackImage=r.path;settings.visual.fallbackImageUrl=r.url;$('#fallbackInfo').textContent=r.path;refreshPreview();}};
$('#save').onclick=()=>saveSettings();
['primary','backup1','backup2'].forEach(id=>$('#'+id).onchange=()=>normalizeProviders(true));
$('#testClaude').onclick=async()=>{try{await saveSettings({quiet:true});$('#claudeStatus').textContent='Probando conexión...';status('Probando Claude...');const r=await window.ECAPI.testProvider('claude');settings.ai.hasClaudeKey=!!r.keyStored;$('#claudeStatus').textContent=`Conexión OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;refreshProviderUi();$('#claudeStatus').textContent=`Conexión OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Claude OK · ${r.models?.length||0} modelos disponibles`);}catch(e){$('#claudeStatus').textContent=`Error: ${e.message||e}`;status(`Claude error: ${e.message||e}`);}};
$('#testGemini').onclick=async()=>{try{await saveSettings({quiet:true});$('#geminiStatus').textContent='Probando conexión...';status('Probando Gemini...');const r=await window.ECAPI.testProvider('gemini');settings.ai.hasGeminiKey=!!r.keyStored;refreshProviderUi();$('#geminiStatus').textContent=`Conexión OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Gemini OK · ${r.models?.length||0} modelos disponibles`);}catch(e){$('#geminiStatus').textContent=`Error: ${e.message||e}`;status(`Gemini error: ${e.message||e}`);}};
$('#downloadModel').onclick=async()=>{status('Descargando Qwen (~5 GB)...');try{await window.ECAPI.downloadLocalModel();status('Qwen descargado');await refreshRuntimeStatus();}catch(e){status(`Descarga error: ${e.message||e}`);}};
$('#startLocal').onclick=async()=>{status('Iniciando IA local...');try{await window.ECAPI.startLocal();status('IA local lista');await refreshRuntimeStatus();}catch(e){status(String(e.message||e).includes('MODEL_MISSING')?'Primero descarga Qwen':`IA local error: ${e.message||e}`);}};

$('#genScript').onclick=async()=>{if(!currentStory)return;await saveSettings({quiet:true});status('Generando guion...');try{const r=await window.ECAPI.generate(currentStory,currentArticle||{});currentGenerated=r;$('#title').value=r.result.title||currentStory.title;$('#category').value=r.result.category||'ACTUALIDAD';$('#summary').value=r.result.summary||'';$('#script').value=r.result.script||'';refreshPreview();const fallbacks=(r.attempts||[]).filter(a=>!a.ok).map(a=>providerName(a.provider));status(`Guion generado con ${providerName(r.provider)}${fallbacks.length?` · fallback tras ${[...new Set(fallbacks)].join(', ')}`:''}`);}catch(e){status(`IA error: ${e.message||e}`);}};
$('#genVoice').onclick=async()=>{const text=$('#script').value.trim();if(!text)return status('Primero genera o escribe el guion');await saveSettings({quiet:true});status('Generando voz con Kokoro...');try{currentAudio=await window.ECAPI.generateTts(text);$('#previewAudio').src=currentAudio.url;status(`Voz lista · ${Math.round(currentAudio.durationSec||0)} s`);}catch(e){status(`Kokoro error: ${e.message||e}`);}};
$('#sendOutput').onclick=async()=>{const image=effectiveImage();try{const r=await window.ECAPI.sendManualOutput({title:$('#title').value,category:$('#category').value,summary:$('#summary').value,image,fallbackImage:settings.visual.fallbackImageUrl||'',audioUrl:currentAudio?.url||'',audioDurationSec:currentAudio?.durationSec||0});if(r.cancelled)return status('Emisión manual cancelada');status('Noticia del Editor enviada a Output');}catch(e){status(`Output: ${e.message||e}`);}};
$('#title').oninput=refreshPreview;$('#category').oninput=refreshPreview;$('#summary').oninput=refreshPreview;

$('#processStart').onclick=async()=>{await saveSettings({quiet:true});try{refreshAutomation(await window.ECAPI.processingStart());status('Procesamiento automático iniciado. Output no se abrirá ni reproducirá.');}catch(e){status(`Procesamiento: ${e.message||e}`);}};
$('#processPause').onclick=async()=>{refreshAutomation(await window.ECAPI.processingPause());status('Procesamiento pausado. La cola preparada se conserva.');};
$('#processResume').onclick=async()=>{refreshAutomation(await window.ECAPI.processingResume());status('Procesamiento reanudado.');};
$('#processStop').onclick=async()=>{refreshAutomation(await window.ECAPI.processingStop());status('Procesamiento detenido. La cola preparada se conserva.');};
$('#emissionStart').onclick=async()=>{await saveSettings({quiet:true});try{refreshAutomation(await window.ECAPI.emissionStart());status('Emisión automática iniciada.');}catch(e){status(String(e.message||e).includes('OUTPUT_NOT_OPEN')?'Primero abre Output y luego inicia la emisión automática.':`Emisión: ${e.message||e}`);}};
$('#emissionPause').onclick=async()=>{refreshAutomation(await window.ECAPI.emissionPause());status('Emisión pausada: la noticia actual terminará y no se enviará la siguiente.');};
$('#emissionResume').onclick=async()=>{try{refreshAutomation(await window.ECAPI.emissionResume());status('Emisión automática reanudada.');}catch(e){status(String(e.message||e).includes('OUTPUT_NOT_OPEN')?'Abre Output para reanudar la emisión.':`Emisión: ${e.message||e}`);}};
$('#emissionStop').onclick=async()=>{refreshAutomation(await window.ECAPI.emissionStop());status('Emisión automática detenida. Las noticias listas permanecen en cola.');};
$('#clearQueue').onclick=async()=>{if(!confirm('¿Vaciar las noticias preparadas y los errores de la cola?'))return;try{refreshAutomation(await window.ECAPI.clearQueue());status('Cola vaciada.');}catch(e){status(e.message||e);}};

const designIds=['outputFormat','fontFamily','imageAnimation','motionSpeed','titleColor','summaryColor','categoryBgColor','categoryTextColor','lowerBgColor','lowerOpacity','tiktokSafe','showSafeGuides'];
designIds.forEach(id=>$('#'+id).addEventListener('input',()=>updateDesignFromControls(true)));
$('#saveDesign').onclick=async()=>{await saveSettings({quiet:true});status('Diseño de emisión guardado.');};
$('#resetDesign').onclick=()=>{settings.visual.output={...DESIGN_DEFAULT};setDesignControls(settings.visual.output);updateDesignFromControls(true);status('Diseño restaurado. Pulsa Guardar diseño para conservarlo.');};

window.ECAPI.on('automation:state',refreshAutomation);
window.ECAPI.on('automation:itemError',e=>{const d=(e.details||[]).map(x=>`${providerName(x.provider)}: ${x.message}`).join(' | ');status(`Automático · ${e.stage||'error'}: ${e.error}${d?` · ${d}`:''}`);});
window.ECAPI.on('automation:engineError',e=>status(`Automático: ${e.message}`));
window.ECAPI.on('output:state',refreshOutputStatus);
window.ECAPI.on('local:event',e=>{if(e.type==='model-download'){$('#downloadProgress div').style.width=`${e.percent||0}%`;status(`Descargando Qwen: ${e.percent||0}%`);}if(e.type==='local-ai-exit')refreshRuntimeStatus();});

(async()=>{await loadSettings();await loadNews();})();
