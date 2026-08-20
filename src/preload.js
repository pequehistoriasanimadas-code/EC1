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

ipcRenderer.on('local:event',(_,e)=>{
  if(e?.type==='local-ai-starting')localStarting=true;
  if(['local-ai-started','local-ai-exit','local-ai-stopped','local-ai-error'].includes(e?.type))localStarting=false;
  prettyProcessingStages();
});

window.addEventListener('DOMContentLoaded',()=>setTimeout(injectTtsProfileControl,0));
