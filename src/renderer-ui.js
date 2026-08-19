function renderFeeds(){
  const box=$('#feeds');box.innerHTML='';
  settings.rssFeeds.forEach((f,i)=>{
    const d=document.createElement('div');d.className='feedrow';
    d.innerHTML=`<div class="feed-head"><span class="feed-title">${escapeHtml(f.name||'Fuente RSS')}</span><label class="switch-row" style="margin:0;padding:7px 9px;min-width:150px"><span><b>RSS activo</b></span><input type="checkbox" class="f-enabled" data-i="${i}" ${f.enabled?'checked':''}><span class="switch-ui"></span></label></div><label>Nombre<input class="f-name" data-i="${i}" value="${escapeHtml(f.name)}"></label><label>URL<input class="f-url" data-i="${i}" value="${escapeHtml(f.url)}"></label><div class="buttons"><button class="f-test" data-i="${i}">Probar RSS</button><button class="f-del dark" data-i="${i}">Eliminar</button></div><div class="feed-status" data-status-i="${i}">Sin comprobar</div>`;
    box.appendChild(d);
  });
  $$('.f-enabled').forEach(x=>x.onchange=e=>settings.rssFeeds[+e.target.dataset.i].enabled=e.target.checked);
  $$('.f-name').forEach(x=>x.oninput=e=>{const i=+e.target.dataset.i;settings.rssFeeds[i].name=e.target.value;const h=e.target.closest('.feedrow').querySelector('.feed-title');h.textContent=e.target.value||'Fuente RSS';});
  $$('.f-url').forEach(x=>x.oninput=e=>settings.rssFeeds[+e.target.dataset.i].url=e.target.value);
  $$('.f-test').forEach(x=>x.onclick=async e=>{
    const i=+e.target.dataset.i,f=settings.rssFeeds[i],el=$(`[data-status-i="${i}"]`);el.className='feed-status';el.textContent='Comprobando...';
    try{const r=await window.ECAPI.testRss(f);el.className=`feed-status ${r.ok?'ok':r.mode==='UNRECOGNIZED'?'warn':'error'}`;el.textContent=`${r.ok?'RSS OK':'Atención'} · ${r.count} noticias · ${r.mode} · ${r.detail||''}`;status(`${f.name}: ${r.count} noticias (${r.mode})`);}catch(err){el.className='feed-status error';el.textContent=`Error · ${err.message||err}`;status(`RSS error: ${err.message||err}`);}
  });
  $$('.f-del').forEach(x=>x.onclick=e=>{settings.rssFeeds.splice(+e.target.dataset.i,1);renderFeeds();});
  const filter=$('#feedFilter');filter.innerHTML='<option value="">Todos los RSS</option>'+settings.rssFeeds.map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('');
}

async function refreshRuntimeStatus(){
  try{
    const s=await window.ECAPI.localStatus();
    const idle=s.idleStopScheduled?` · apagado automático en ~${Math.max(1,Math.ceil((s.idleStopInSec||0)/60))} min`:'';
    const p=s.profile||{};
    const profile=p.label?` · Perfil: ${p.label} · ctx ${p.ctx} · GPU ${p.gpuLayers} capas · CPU ${p.threads} hilos`:'';
    $('#localInfo').innerHTML=`Runtime: ${s.runtime?'✓':'✕'} · Modelo: ${s.model?'✓':'✕'} · Servidor: ${s.running?'activo':'detenido'}${profile}${idle}`;
    $('#startLocal').disabled=!s.model||s.running;
    $('#stopLocal').disabled=!s.running;
  }catch(e){$('#localInfo').textContent='IA local no disponible';$('#startLocal').disabled=true;$('#stopLocal').disabled=true;}
  try{const t=await window.ECAPI.ttsStatus();$('#ttsInfo').textContent=t.ready?'Kokoro integrado y listo · prioridad reducida para proteger la transmisión':'Kokoro no disponible en esta build';const v=$('#voice');v.innerHTML='';(t.voices||[]).filter(x=>/^e[fm]_/.test(x)).forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;v.appendChild(o)});if(!v.options.length)(t.voices||[]).slice(0,50).forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;v.appendChild(o)});if([...v.options].some(o=>o.value===settings.tts.voice))v.value=settings.tts.voice;}catch{$('#ttsInfo').textContent='Error al cargar Kokoro';}
}

async function loadNews(){
  status('Actualizando RSS...');
  try{
    const r=await window.ECAPI.loadRss();stories=r.items||[];renderNews();
    const fallback=(r.feedStatus||[]).filter(x=>x.mode==='WEB_FALLBACK').length;
    status(`${stories.length} noticias · ${r.errors?.length||0} RSS con error${fallback?` · ${fallback} usando fallback web`:''}`);
  }catch(e){status(`Error RSS: ${e.message||e}`);}
}
function renderNews(){
  const q=$('#search').value.toLowerCase(),ff=$('#feedFilter').value,list=$('#newsList');list.innerHTML='';
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
  normalizeProviders(true);updateDesignFromControls(false);
  settings.ai.claudeModel=$('#claudeModel').value.trim();settings.ai.geminiModel=$('#geminiModel').value.trim();settings.ai.claudeKey=$('#claudeKey').value.trim();settings.ai.geminiKey=$('#geminiKey').value.trim();
  settings.ai.localBackupMode=$('#localBackupMode').value||'on_demand';settings.ai.localIdleMinutes=Math.max(1,Math.min(60,Number($('#localIdleMinutes').value)||5));
  settings.tts.voice=$('#voice').value||settings.tts.voice;settings.tts.speed=Number($('#voiceSpeed').value||1);settings.automation.bufferReady=Number($('#bufferReady').value||5);settings.automation.maxAgeHours=Number($('#maxAge').value||6);settings.automation.avoidRepeats=$('#avoidRepeats').checked;settings.visual.pauseSeconds=Number($('#pauseSeconds').value||2.5);
  const r=await window.ECAPI.saveSettings(settings);settings.ai.hasClaudeKey=!!r.hasClaudeKey;settings.ai.hasGeminiKey=!!r.hasGeminiKey;settings.ai.claudeKey='';settings.ai.geminiKey='';$('#claudeKey').value='';$('#geminiKey').value='';refreshProviderUi();await refreshRuntimeStatus();if(!options.quiet)status('Ajustes guardados');return r;
}

function stateText(group,type){
  if(!group.running)return type==='processing'?'DETENIDO':'DETENIDA';
  if(group.paused)return type==='processing'?'PAUSADO':'PAUSADA';
  if(type==='emission')return group.currentTitle?'AL AIRE':'ACTIVA · EN ESPERA';
  return 'PROCESANDO';
}
function refreshAutomation(s){
  automationState=s||automationState;const p=s.processing||{},e=s.emission||{};
  const pe=$('#processingState'),ee=$('#emissionState');pe.textContent=stateText(p,'processing');ee.textContent=stateText(e,'emission');
  pe.className=`status-pill ${!p.running?'neutral':p.paused?'pause':'ok'}`;ee.className=`status-pill ${!e.running?'neutral':e.paused?'pause':'live'}`;
  $('#processStart').disabled=!!p.running&&!p.paused;$('#processPause').disabled=!p.running||p.paused;$('#processResume').disabled=!p.running||!p.paused;$('#processStop').disabled=!p.running;
  $('#emissionStart').disabled=!!e.running&&!e.paused;$('#emissionPause').disabled=!e.running||e.paused;$('#emissionResume').disabled=!e.running||!e.paused;$('#emissionStop').disabled=!e.running;
  const c=s.counts||{};$('#queueSummary').innerHTML=`<div class="queue-stat"><b>${c.ready||0}</b><span>LISTAS</span></div><div class="queue-stat"><b>${c.processing||0}</b><span>PROCESANDO</span></div><div class="queue-stat"><b>${c.onAir||0}</b><span>AL AIRE</span></div><div class="queue-stat"><b>${c.error||0}</b><span>ERRORES</span></div>`;
  renderQueue(s.queue||[]);
}
function renderQueue(q){
  const box=$('#queue');if(!q.length){box.innerHTML='<div class="empty">Sin actividad</div>';return;}
  box.innerHTML=q.map((x,i)=>{
    const failures=(x.attempts||[]).filter(a=>!a.ok);
    const used=x.provider?`${providerName(x.provider)}${x.model?` · ${x.model}`:''}`:'';
    const failedProviders=[...new Set(failures.map(a=>providerName(a.provider)))];
    const usedFallback=used&&failedProviders.length?`Fallback usado tras fallo de ${failedProviders.join(', ')}`:'';
    const failureDetail=failures.map(a=>{
      const msg=String(a.message||'Error').replace(/\s+/g,' ').slice(0,240);
      return `${providerName(a.provider)}${a.code?` [${a.code}]`:''}: ${msg}`;
    }).join(' | ');
    const m=x.metrics||{};
    const timing=m.elapsedMs?`IA ${(m.elapsedMs/1000).toFixed(1)} s`:'';
    const tokens=m.inputTokens?`Tokens ${Number(m.inputTokens).toLocaleString()} → ${Number(m.outputTokens||0).toLocaleString()}`:'';
    const inputSize=m.inputChars?`Fuente IA ${Number(m.inputChars).toLocaleString()} caracteres`:'';
    const stage=x.stage&&x.status==='PROCESANDO'?`Etapa: ${x.stage}`:'';
    const generic=x.error&&!failureDetail?x.error:'';
    const meta=[used,timing,tokens,inputSize,usedFallback,failureDetail,stage,generic].filter(Boolean).join(' · ');
    const cls=x.status==='LISTA'?'ready':x.status==='PROCESANDO'?'processing':x.status==='AL AIRE'?'air':x.status==='ERROR'?'error':'';
    return `<div class="queue-item"><div class="queue-main"><span class="queue-index">${i+1}.</span><div class="queue-text"><div class="queue-title">${escapeHtml(x.title)}</div>${meta?`<div class="queue-meta">${escapeHtml(meta)}</div>`:''}</div><span class="queue-badge ${cls}">${escapeHtml(x.status)}</span></div></div>`;
  }).join('');
}
