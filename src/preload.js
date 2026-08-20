const {contextBridge,ipcRenderer}=require('electron');

const TTS_PROFILES={
  safe_streaming:{label:'Seguro para streaming',threads:2,detail:'ONNX 2 hilos · prioridad baja · recomendado durante OBS'},
  balanced:{label:'Equilibrado',threads:3,detail:'ONNX 3 hilos · equilibrio entre CPU y velocidad'},
  performance:{label:'Rápido',threads:6,detail:'ONNX 6 hilos · mayor velocidad y mayor consumo de CPU'}
};
let ttsProfileOverride='';
let ttsReadyState=null;
let aiPrimary='local';
let localStarting=false;
let soundSaveTimer=null;

function profileInfo(name=ttsProfileOverride){const key=TTS_PROFILES[name]?name:'safe_streaming';return{key,...TTS_PROFILES[key]};}
async function getSettings(){
  const s=await ipcRenderer.invoke('settings:get');
  if(!ttsProfileOverride)ttsProfileOverride=TTS_PROFILES[s?.tts?.resourceMode]?s.tts.resourceMode:'safe_streaming';
  aiPrimary=s?.ai?.primary||aiPrimary;
  return s;
}
async function saveSettings(s){
  const next={...s,tts:{...(s?.tts||{}),resourceMode:ttsProfileOverride||s?.tts?.resourceMode||'safe_streaming'}};
  return ipcRenderer.invoke('settings:save',next);
}
async function ttsStatus(){
  const r=await ipcRenderer.invoke('tts:status');
  if(!ttsProfileOverride){try{const s=await getSettings();ttsProfileOverride=s?.tts?.resourceMode||'safe_streaming';}catch{}}
  const p=profileInfo();ttsReadyState=!!r?.ready;
  return{...r,threads:p.threads,profile:p.key,profileLabel:p.label,onnxInterThreads:1,executionMode:'sequential'};
}

contextBridge.exposeInMainWorld('ECAPI',{
  getSettings,
  saveSettings,
  loadRss:()=>ipcRenderer.invoke('rss:load'),
  testRss:f=>ipcRenderer.invoke('rss:test',f),
  fetchArticle:u=>ipcRenderer.invoke('article:fetch',u),
  testProvider:p=>ipcRenderer.invoke('providers:test',p),
  generate:(story,article)=>ipcRenderer.invoke('providers:generate',story,article),
  localStatus:()=>ipcRenderer.invoke('local:status'),
  downloadLocalModel:()=>ipcRenderer.invoke('local:downloadModel'),
  startLocal:()=>ipcRenderer.invoke('local:start'),
  stopLocal:()=>ipcRenderer.invoke('local:stop'),
  pronunciationStatus:()=>ipcRenderer.invoke('pronunciation:status'),
  downloadPronunciationModel:()=>ipcRenderer.invoke('pronunciation:downloadModel'),
  stopPronunciation:()=>ipcRenderer.invoke('pronunciation:stop'),
  testPronunciation:()=>ipcRenderer.invoke('pronunciation:test'),
  ttsStatus,
  generateTts:text=>ipcRenderer.invoke('tts:generate',text),
  pickFallback:()=>ipcRenderer.invoke('fallback:pick'),
  pickVerticalVideoBackground:()=>ipcRenderer.invoke('output:pickVerticalBackground'),
  clearVerticalVideoBackground:()=>ipcRenderer.invoke('output:clearVerticalBackground'),
  pickMusic:()=>ipcRenderer.invoke('output:pickMusic'),
  clearMusic:()=>ipcRenderer.invoke('output:clearMusic'),
  cannedPickFolder:()=>ipcRenderer.invoke('canned:pickFolder'),
  cannedList:()=>ipcRenderer.invoke('canned:list'),
  cannedLaunchNow:()=>ipcRenderer.invoke('canned:launchNow'),
  openOutput:()=>ipcRenderer.invoke('output:open'),
  closeOutput:()=>ipcRenderer.invoke('output:close'),
  outputStatus:()=>ipcRenderer.invoke('output:status'),
  sendManualOutput:p=>ipcRenderer.invoke('output:manualSend',p),
  controlOutput:a=>ipcRenderer.send('output:control',a),
  previewOutputDesign:d=>ipcRenderer.send('output:designPreview',d),
  outputPlayback:e=>ipcRenderer.send('output:playback',e),
  automationStatus:()=>ipcRenderer.invoke('automation:status'),
  processingStart:()=>ipcRenderer.invoke('automation:processingStart'),
  processingPause:()=>ipcRenderer.invoke('automation:processingPause'),
  processingResume:()=>ipcRenderer.invoke('automation:processingResume'),
  processingStop:()=>ipcRenderer.invoke('automation:processingStop'),
  emissionStart:()=>ipcRenderer.invoke('automation:emissionStart'),
  emissionPause:()=>ipcRenderer.invoke('automation:emissionPause'),
  emissionResume:()=>ipcRenderer.invoke('automation:emissionResume'),
  emissionStop:()=>ipcRenderer.invoke('automation:emissionStop'),
  clearQueue:()=>ipcRenderer.invoke('automation:clearQueue'),
  resetSessionCounters:()=>ipcRenderer.invoke('automation:resetCounters'),
  resetHistory:()=>ipcRenderer.invoke('history:reset'),
  notify:p=>ipcRenderer.send('notify',p),
  on:(channel,cb)=>{
    const allowed=['automation:state','automation:itemError','automation:engineError','local:event','pronunciation:event','output:story','output:control','output:design','output:state'];
    if(allowed.includes(channel))ipcRenderer.on(channel,(_,p)=>cb(p));
  }
});

function renderTtsProfileInfo(){
  const info=document.getElementById('ttsInfo');
  if(!info)return;
  const p=profileInfo();
  const unavailable=ttsReadyState===false||/no disponible|error/i.test(info.textContent||'');
  const text=unavailable?'Kokoro no disponible en esta build':`Kokoro integrado · Perfil: ${p.label} · ONNX ${p.threads} hilos · inter-op 1 · secuencial · una voz a la vez`;
  if(info.textContent!==text)info.textContent=text;
  const hint=document.getElementById('ttsPerformanceHint');if(hint)hint.textContent=p.detail;
}
function prettyProcessingStages(){
  const provider=aiPrimary==='local'?'Qwen 8B':aiPrimary==='claude'?'Claude':aiPrimary==='gemini'?'Gemini':'IA';
  document.querySelectorAll('.queue-meta').forEach(el=>{
    let t=el.textContent||'';
    t=t.replace(/Etapa:\s*article\b/gi,'Descargando artículo…');
    t=t.replace(/Etapa:\s*ai\b/gi,localStarting&&aiPrimary==='local'?'Cargando Qwen 8B…':`Generando guion con ${provider}…`);
    t=t.replace(/Etapa:\s*pronunciation\b/gi,'Ajustando pronunciación…');
    t=t.replace(/Etapa:\s*tts\b/gi,'Generando voz con Kokoro…');
    t=t.replace(/TTS\s+([\d.]+)\s+s\s+·\s+(\d+)\s+hilos/gi,'TTS $1 s · ONNX $2 hilos');
    if(t!==el.textContent)el.textContent=t;
  });
}
async function injectTtsProfileControl(){
  try{
    const s=await getSettings();
    ttsProfileOverride=TTS_PROFILES[s?.tts?.resourceMode]?s.tts.resourceMode:'safe_streaming';
    aiPrimary=s?.ai?.primary||'local';
  }catch{ttsProfileOverride='safe_streaming';}
  const speed=document.getElementById('voiceSpeed');
  if(speed&&!document.getElementById('ttsPerformanceProfile')){
    const wrap=document.createElement('div');wrap.id='ttsPerformanceProfileRow';wrap.className='subcard';
    const label=document.createElement('label');label.textContent='Perfil de rendimiento de Kokoro';
    const select=document.createElement('select');select.id='ttsPerformanceProfile';
    for(const [key,p] of Object.entries(TTS_PROFILES)){
      const o=document.createElement('option');o.value=key;o.textContent=`${p.label} — ${p.threads} hilos ONNX`;select.appendChild(o);
    }
    select.value=ttsProfileOverride;
    const hint=document.createElement('div');hint.id='ttsPerformanceHint';hint.className='note';
    label.appendChild(select);wrap.appendChild(label);wrap.appendChild(hint);
    const anchor=speed.closest('label')||speed;anchor.insertAdjacentElement('afterend',wrap);
    select.addEventListener('change',async()=>{
      ttsProfileOverride=TTS_PROFILES[select.value]?select.value:'safe_streaming';
      try{
        const current=await ipcRenderer.invoke('settings:get');
        const next={...current,tts:{...(current.tts||{}),resourceMode:ttsProfileOverride}};
        await ipcRenderer.invoke('settings:save',next);
      }catch{}
      renderTtsProfileInfo();
    });
  }
  try{await ttsStatus();}catch{}
  renderTtsProfileInfo();prettyProcessingStages();
  const info=document.getElementById('ttsInfo');
  if(info)new MutationObserver(renderTtsProfileInfo).observe(info,{childList:true,subtree:true,characterData:true});
  const queue=document.getElementById('queue');
  if(queue)new MutationObserver(prettyProcessingStages).observe(queue,{childList:true,subtree:true});
}

function updateSessionCounters(state={}){
  const session=state.session||{};
  const news=document.getElementById('sessionNewsEmitted');
  const canned=document.getElementById('sessionCannedEmitted');
  if(news)news.textContent=String(session.newsEmitted||0);
  if(canned)canned.textContent=String(session.cannedEmitted||0);
}
function injectSessionCounters(){
  const summary=document.getElementById('queueSummary');
  if(!summary||document.getElementById('sessionCounters'))return;
  const row=document.createElement('div');
  row.id='sessionCounters';row.className='queue-summary';row.style.marginTop='10px';
  row.innerHTML='<div class="queue-stat"><b id="sessionNewsEmitted">0</b><span>NOTAS EMITIDAS</span></div><div class="queue-stat"><b id="sessionCannedEmitted">0</b><span>ENLATADOS EMITIDOS</span></div><div class="queue-stat"><button id="resetSessionCounters" class="dark compact">Reiniciar contadores</button><span>SESIÓN ACTUAL</span></div>';
  summary.insertAdjacentElement('afterend',row);
  const btn=document.getElementById('resetSessionCounters');
  if(btn)btn.addEventListener('click',async()=>{
    try{const state=await ipcRenderer.invoke('automation:resetCounters');updateSessionCounters(state);}catch{}
  });
  ipcRenderer.invoke('automation:status').then(updateSessionCounters).catch(()=>{});
}

async function persistSoundControls(){
  try{
    const current=await ipcRenderer.invoke('settings:get');
    const output={...(current?.visual?.output||{})};
    const musicEnabled=document.getElementById('musicEnabled');
    const musicLoop=document.getElementById('musicLoop');
    const musicVolume=document.getElementById('musicVolume');
    const voiceVolume=document.getElementById('voiceVolume');
    const cannedVolume=document.getElementById('cannedVolume');
    if(musicEnabled)output.musicEnabled=!!musicEnabled.checked;
    if(musicLoop)output.musicLoop=!!musicLoop.checked;
    if(musicVolume)output.musicVolume=Number(musicVolume.value||0);
    if(voiceVolume)output.voiceVolume=Number(voiceVolume.value||0);
    if(cannedVolume)output.cannedVolume=Number(cannedVolume.value||0);
    await ipcRenderer.invoke('settings:save',{...current,visual:{...(current.visual||{}),output}});
  }catch{}
}
function injectSoundAutoSave(){
  const ids=['musicEnabled','musicLoop','musicVolume','voiceVolume','cannedVolume'];
  for(const id of ids){
    const el=document.getElementById(id);if(!el||el.dataset.autoSaveBound==='1')continue;
    el.dataset.autoSaveBound='1';
    const schedule=()=>{clearTimeout(soundSaveTimer);soundSaveTimer=setTimeout(persistSoundControls,300);};
    el.addEventListener('input',schedule);el.addEventListener('change',schedule);
  }
}

ipcRenderer.on('local:event',(_,e)=>{
  if(e?.type==='local-ai-starting')localStarting=true;
  if(['local-ai-started','local-ai-exit','local-ai-stopped','local-ai-error'].includes(e?.type))localStarting=false;
  prettyProcessingStages();
});
ipcRenderer.on('automation:state',(_,state)=>updateSessionCounters(state||{}));

window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
  injectTtsProfileControl();injectSessionCounters();injectSoundAutoSave();
},0));
