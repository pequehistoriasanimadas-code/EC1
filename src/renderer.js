let settings=null, stories=[], currentStory=null, currentArticle=null, currentGenerated=null, currentAudio=null;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const status=t=>$('#status').textContent=t;
const providerName=p=>({local:'IA local',claude:'Claude',gemini:'Gemini',none:'Ninguno'}[p]||p||'');
function tab(name){$$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.tab').forEach(x=>x.classList.toggle('show',x.id===`tab-${name}`));}
$$('.nav').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));

function effectiveImage(){return currentStory?.image||currentArticle?.image||settings?.visual?.fallbackImageUrl||'';}
function refreshPreview(){
  $('#previewTitle').textContent=$('#title').value||'Titular';
  $('#previewCat').textContent=($('#category').value||'ACTUALIDAD').toUpperCase();
  $('#previewSummary').textContent=$('#summary').value||'';
  const i=effectiveImage();if(i)$('#previewImg').src=i;
}
function refreshProviderUi(){
  if(!settings)return;
  const chain=[settings.ai.primary,settings.ai.backup1,settings.ai.backup2].filter(x=>x&&x!=='none');
  $('#providerSummary').textContent=`Cadena activa: ${chain.map(providerName).join(' → ')||'sin proveedor'}`;
  $('#claudeStatus').textContent=settings.ai.hasClaudeKey?'API Key guardada ✓':'API Key: no configurada';
  $('#geminiStatus').textContent=settings.ai.hasGeminiKey?'API Key guardada ✓':'API Key: no configurada';
}
function normalizeProviders(showMessage=false){
  const p=$('#primary').value;
  let b1=$('#backup1').value,b2=$('#backup2').value;
  const changes=[];
  if(b1===p){b1='none';$('#backup1').value='none';changes.push('Respaldo 1 duplicaba al principal');}
  if(b2===p||b2===b1&&b2!=='none'){b2='none';$('#backup2').value='none';changes.push('Respaldo 2 estaba duplicado');}
  settings.ai.primary=p;settings.ai.backup1=b1;settings.ai.backup2=b2;
  if(showMessage&&changes.length)status(`${changes.join('. ')}. Se ajustó a Ninguno.`);
  refreshProviderUi();
}

async function loadSettings(){
  settings=await window.ECAPI.getSettings();
  $('#primary').value=settings.ai.primary;$('#backup1').value=settings.ai.backup1;$('#backup2').value=settings.ai.backup2;
  $('#claudeModel').value=settings.ai.claudeModel||'';$('#geminiModel').value=settings.ai.geminiModel||'';
  $('#voiceSpeed').value=settings.tts.speed||1;$('#bufferReady').value=settings.automation.bufferReady||3;$('#pauseSeconds').value=settings.visual.pauseSeconds||2.5;$('#maxAge').value=settings.automation.maxAgeHours||6;$('#avoidRepeats').checked=settings.automation.avoidRepeats!==false;
  $('#fallbackInfo').textContent=settings.visual.fallbackImage||'Sin imagen fallback';
  renderFeeds();refreshProviderUi();await refreshRuntimeStatus();
}

function renderFeeds(){
  const box=$('#feeds');box.innerHTML='';
  settings.rssFeeds.forEach((f,i)=>{
    const d=document.createElement('div');d.className='feedrow';d.innerHTML=`<label><input type="checkbox" class="f-enabled" data-i="${i}" ${f.enabled?'checked':''}> Activo</label><label>Nombre</label><input class="f-name" data-i="${i}" value="${f.name.replace(/"/g,'&quot;')}"><label>URL</label><input class="f-url" data-i="${i}" value="${f.url.replace(/"/g,'&quot;')}"><div class="buttons"><button class="f-test" data-i="${i}">Probar</button><button class="f-del dark" data-i="${i}">Eliminar</button></div>`;box.appendChild(d);
  });
  $$('.f-enabled').forEach(x=>x.onchange=e=>settings.rssFeeds[+e.target.dataset.i].enabled=e.target.checked);
  $$('.f-name').forEach(x=>x.oninput=e=>settings.rssFeeds[+e.target.dataset.i].name=e.target.value);
  $$('.f-url').forEach(x=>x.oninput=e=>settings.rssFeeds[+e.target.dataset.i].url=e.target.value);
  $$('.f-test').forEach(x=>x.onclick=async e=>{const f=settings.rssFeeds[+e.target.dataset.i];status(`Probando ${f.name}...`);try{const r=await window.ECAPI.testRss(f);status(`${f.name}: ${r.count} noticias`);}catch(err){status(`RSS error: ${err.message||err}`);}});
  $$('.f-del').forEach(x=>x.onclick=e=>{settings.rssFeeds.splice(+e.target.dataset.i,1);renderFeeds();});
  const filter=$('#feedFilter');filter.innerHTML='<option value="">Todos los RSS</option>'+settings.rssFeeds.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
}

async function refreshRuntimeStatus(){
  try{const s=await window.ECAPI.localStatus();$('#localInfo').innerHTML=`Runtime: ${s.runtime?'✓':'✕'} · Modelo: ${s.model?'✓':'✕'} · Servidor: ${s.running?'activo':'detenido'}`;}catch(e){$('#localInfo').textContent='IA local no disponible';}
  try{const t=await window.ECAPI.ttsStatus();$('#ttsInfo').textContent=t.ready?'Kokoro integrado y listo':'Kokoro no disponible en esta build';const v=$('#voice');v.innerHTML='';(t.voices||[]).filter(x=>/^e[fm]_/.test(x)).forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;v.appendChild(o)});if(!v.options.length)(t.voices||[]).slice(0,50).forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;v.appendChild(o)});if([...v.options].some(o=>o.value===settings.tts.voice))v.value=settings.tts.voice;}catch(e){$('#ttsInfo').textContent='Error al cargar Kokoro';}
}

async function loadNews(){
  status('Actualizando RSS...');
  try{const r=await window.ECAPI.loadRss();stories=r.items||[];renderNews();status(`${stories.length} noticias · ${r.errors?.length||0} RSS con error`);}catch(e){status(`Error RSS: ${e.message||e}`);}
}
function renderNews(){
  const q=$('#search').value.toLowerCase(),ff=$('#feedFilter').value;const list=$('#newsList');list.innerHTML='';
  stories.filter(s=>(!ff||s.feedId===ff)&&(!q||`${s.title} ${s.description}`.toLowerCase().includes(q))).forEach(s=>{
    const el=document.createElement('div');el.className='newsItem';el.innerHTML=`<div class="thumb" style="background-image:url('${(s.image||'').replace(/'/g,'%27')}')"></div><div class="meta"><h3>${s.title}</h3><p>${s.feedName} · ${s.category||'Sin categoría'}</p><p>${s.description||''}</p></div><button class="edit">Editar</button>`;el.querySelector('.edit').onclick=()=>openStory(s);list.appendChild(el);
  });
}
async function openStory(s){
  currentStory=s;status('Cargando artículo...');
  try{currentArticle=await window.ECAPI.fetchArticle(s.link);}catch(e){currentArticle={title:s.title,description:s.description,body:s.description,image:''};status('Artículo parcial: se usará el RSS');}
  $('#title').value=s.title||currentArticle.title||'';$('#category').value=s.category||currentArticle.category||'ACTUALIDAD';$('#summary').value=s.description||currentArticle.description||'';$('#script').value='';refreshPreview();tab('editor');status('Noticia lista para editar');
}

async function saveSettings(options={}){
  normalizeProviders(true);
  settings.ai.claudeModel=$('#claudeModel').value.trim();settings.ai.geminiModel=$('#geminiModel').value.trim();
  settings.ai.claudeKey=$('#claudeKey').value.trim();settings.ai.geminiKey=$('#geminiKey').value.trim();
  settings.tts.voice=$('#voice').value||settings.tts.voice;settings.tts.speed=Number($('#voiceSpeed').value||1);
  settings.automation.bufferReady=Number($('#bufferReady').value||3);settings.automation.maxAgeHours=Number($('#maxAge').value||6);settings.automation.avoidRepeats=$('#avoidRepeats').checked;settings.visual.pauseSeconds=Number($('#pauseSeconds').value||2.5);
  const r=await window.ECAPI.saveSettings(settings);
  settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;
  settings.ai.claudeKey='';settings.ai.geminiKey='';$('#claudeKey').value='';$('#geminiKey').value='';
  refreshProviderUi();if(!options.quiet)status('Ajustes guardados');return r;
}

$('#refresh').onclick=loadNews;$('#search').oninput=renderNews;$('#feedFilter').onchange=renderNews;$('#openOutput').onclick=()=>window.ECAPI.openOutput();
$('#addFeed').onclick=()=>{settings.rssFeeds.push({id:`rss-${Date.now()}`,name:'Nuevo RSS',url:'',enabled:true,priority:50});renderFeeds();};
$('#pickFallback').onclick=async()=>{const r=await window.ECAPI.pickFallback();if(r.ok){settings.visual.fallbackImage=r.path;settings.visual.fallbackImageUrl=r.url;$('#fallbackInfo').textContent=r.path;refreshPreview();}};
$('#save').onclick=()=>saveSettings();
['primary','backup1','backup2'].forEach(id=>$('#'+id).onchange=()=>{normalizeProviders(true);});
$('#testClaude').onclick=async()=>{try{await saveSettings({quiet:true});$('#claudeStatus').textContent='Probando conexión...';status('Probando Claude...');const r=await window.ECAPI.testProvider('claude');settings.ai.hasClaudeKey=!!r.keyStored;$('#claudeStatus').textContent=`Conexión OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Claude OK · ${r.models?.length||0} modelos disponibles`);}catch(e){$('#claudeStatus').textContent=`Error: ${e.message||e}`;status(`Claude error: ${e.message||e}`);}};
$('#testGemini').onclick=async()=>{try{await saveSettings({quiet:true});$('#geminiStatus').textContent='Probando conexión...';status('Probando Gemini...');const r=await window.ECAPI.testProvider('gemini');settings.ai.hasGeminiKey=!!r.keyStored;$('#geminiStatus').textContent=`Conexión OK ✓ · API guardada ✓ · ${r.model||r.models?.[0]||'modelo detectado'}`;status(`Gemini OK · ${r.models?.length||0} modelos disponibles`);}catch(e){$('#geminiStatus').textContent=`Error: ${e.message||e}`;status(`Gemini error: ${e.message||e}`);}};
$('#downloadModel').onclick=async()=>{status('Descargando Qwen (~5 GB)...');try{await window.ECAPI.downloadLocalModel();status('Qwen descargado');await refreshRuntimeStatus();}catch(e){status(`Descarga error: ${e.message||e}`);}};
$('#startLocal').onclick=async()=>{status('Iniciando IA local...');try{await window.ECAPI.startLocal();status('IA local lista');await refreshRuntimeStatus();}catch(e){status(e.message==='MODEL_MISSING'?'Primero descarga Qwen':`IA local error: ${e.message||e}`);}};

$('#genScript').onclick=async()=>{if(!currentStory)return;await saveSettings({quiet:true});status('Generando guion...');try{const r=await window.ECAPI.generate(currentStory,currentArticle||{});currentGenerated=r;$('#title').value=r.result.title||currentStory.title;$('#category').value=r.result.category||'ACTUALIDAD';$('#summary').value=r.result.summary||'';$('#script').value=r.result.script||'';refreshPreview();const fallbacks=(r.attempts||[]).filter(a=>!a.ok).map(a=>providerName(a.provider));status(`Guion generado con ${providerName(r.provider)}${fallbacks.length?` · fallback tras fallo de ${[...new Set(fallbacks)].join(', ')}`:''}`);}catch(e){status(`IA error: ${e.message||e}`);}};
$('#genVoice').onclick=async()=>{const text=$('#script').value.trim();if(!text)return status('Primero genera o escribe el guion');await saveSettings({quiet:true});status('Generando voz con Kokoro...');try{currentAudio=await window.ECAPI.generateTts(text);$('#previewAudio').src=currentAudio.url;status(`Voz lista · ${Math.round(currentAudio.durationSec||0)} s`);}catch(e){status(`Kokoro error: ${e.message||e}`);}};
$('#sendOutput').onclick=()=>{const image=effectiveImage();window.ECAPI.openOutput();window.ECAPI.sendOutput({title:$('#title').value,category:$('#category').value,summary:$('#summary').value,image,fallbackImage:settings.visual.fallbackImageUrl||'',audioUrl:currentAudio?.url||''});status('Enviado a Output');};
$('#title').oninput=refreshPreview;$('#category').oninput=refreshPreview;$('#summary').oninput=refreshPreview;

$('#outPlay').onclick=()=>window.ECAPI.controlOutput('play');$('#outPause').onclick=()=>window.ECAPI.controlOutput('pause');$('#outStop').onclick=()=>window.ECAPI.controlOutput('stop');
$('#autoStart').onclick=async()=>{await saveSettings({quiet:true});await window.ECAPI.openOutput();await window.ECAPI.autoStart();status(`Automático iniciado · principal: ${providerName(settings.ai.primary)}`);};$('#autoPause').onclick=()=>window.ECAPI.autoPause();$('#autoResume').onclick=()=>window.ECAPI.autoResume();$('#autoStop').onclick=()=>window.ECAPI.autoStop();
window.ECAPI.on('automation:state',s=>{$('#queue').textContent=(s.queue||[]).map((x,i)=>{const failed=[...new Set((x.attempts||[]).filter(a=>!a.ok).map(a=>providerName(a.provider)))];const used=x.provider?` · ${providerName(x.provider)}${x.model?` [${x.model}]`:''}`:'';const fb=failed.length?` · fallback: ${failed.join(', ')} falló`:'';const err=x.error?` · ${x.error}`:'';return `${i+1}. ${x.status.padEnd(11)} ${x.title}${used}${fb}${err}`;}).join('\n')||'Sin noticias en cola';});
window.ECAPI.on('automation:itemError',e=>{const d=(e.details||[]).map(x=>`${providerName(x.provider)}: ${x.message}`).join(' | ');status(`Automático: ${e.error}${d?` · ${d}`:''}`);window.ECAPI.notify({title:'EC Automatic News',body:`Error en noticia: ${e.error}`});});
window.ECAPI.on('automation:engineError',e=>status(`Automático: ${e.message}`));
window.ECAPI.on('local:event',e=>{if(e.type==='model-download'){$('#downloadProgress div').style.width=`${e.percent||0}%`;status(`Descargando Qwen: ${e.percent||0}%`);}if(e.type==='local-ai-exit')refreshRuntimeStatus();});

(async()=>{await loadSettings();await loadNews();})();
