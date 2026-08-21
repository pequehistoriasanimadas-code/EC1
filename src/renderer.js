'use strict';
let settings=null,stories=[],currentStory=null,currentArticle=null,currentGenerated=null,currentAudio=null;
let automationState={processing:{running:false,paused:false},emission:{running:false,paused:false,currentTitle:'',currentKind:'none'},counts:{processing:0,ready:0,onAir:0,emitted:0,error:0},queue:[]};
let currentOutputState={open:false,source:'none',kind:'none',title:'',format:'16:9',resolution:'1920×1080'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const status=t=>{const el=$('#status');if(el)el.textContent=String(t||'');};
const providerName=p=>({local:'IA local',claude:'Claude Haiku 4.5',gemini:'Gemini',none:'Ninguno'}[p]||p||'');
const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const SELF_TEST=new URLSearchParams(location.search).get('selftest')==='1';
const DESIGN_DEFAULT={
  format:'16:9',fontFamily:'Arial',dateFontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,
  animation:'auto',motionSpeed:'normal',tiktokSafe:true,showSafeGuides:true,
  verticalVideoBackground:'',verticalVideoBackgroundUrl:'',musicFile:'',musicUrl:'',musicEnabled:false,musicLoop:true,musicVolume:20,voiceVolume:100,cannedVolume:100,
  transitionEnabled:true,transitionType:'fade',transitionDuration:.7
};

function fatalInterface(message){
  status(`ERROR DE INTERFAZ · ${message}`);
  document.body.classList.add('bridge-error');
  $$('button,input,select,textarea').forEach(el=>{if(el.id!=='status')el.disabled=true;});
}
if(!window.ECAPI||typeof window.ECAPI.getSettings!=='function')fatalInterface('El puente seguro de Electron no está disponible. Reinicia EC o reinstala esta versión.');

function tab(name){$$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.tab').forEach(x=>x.classList.toggle('show',x.id===`tab-${name}`));}
$$('.nav').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
function effectiveImage(){return currentStory?.image||currentArticle?.image||settings?.visual?.fallbackImageUrl||'';}
function formatPubDate(value){
  if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';
  try{return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(d).replace(/\./g,'').toUpperCase();}catch{return'';}
}
function ensureDateUi(){
  const c=$('#previewCat');
  if(c&&!$('#previewDate')){
    const d=document.createElement('span');d.id='previewDate';d.className='preview-date';d.textContent='20 AGO 2026';c.insertAdjacentElement('afterend',d);
  }
}
function hexRgba(hex,opacity){
  const m=String(hex||'#000').replace('#','');const h=m.length===3?m.split('').map(x=>x+x).join(''):m;
  const n=parseInt(h,16);if(Number.isNaN(n))return`rgba(0,0,0,${opacity})`;
  return`rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${opacity})`;
}
function design(){return{...DESIGN_DEFAULT,...(settings?.visual?.output||{})};}
function previewMotionMode(img,d){
  let mode=d.animation||'auto';
  if(mode==='auto'){
    const w=img?.naturalWidth||16,h=img?.naturalHeight||9,ar=w/Math.max(1,h);
    mode=ar<1?'vertical':ar>1.9?'horizontal':'zoom';
  }
  return mode;
}
function applyPreviewMotion(el,d){
  const image=el?.querySelector('img');if(!image)return;
  image.classList.remove('preview-motion-zoom','preview-motion-vertical','preview-motion-horizontal','preview-motion-none');
  const mode=previewMotionMode(image,d);
  image.classList.add(`preview-motion-${['zoom','vertical','horizontal','none'].includes(mode)?mode:'zoom'}`);
  const seconds={slow:26,normal:18,fast:11}[d.motionSpeed]||18;
  el.style.setProperty('--preview-motion-duration',`${seconds}s`);
}
function applyPreviewDesign(el,d,showGuide=false){
  if(!el)return;
  el.classList.toggle('format-9-16',d.format==='9:16');el.classList.toggle('format-16-9',d.format!=='9:16');
  el.classList.toggle('show-safe',showGuide&&d.format==='9:16'&&d.tiktokSafe&&d.showSafeGuides);
  el.style.fontFamily=`${d.fontFamily},sans-serif`;
  el.style.setProperty('--title-color',d.titleColor);el.style.setProperty('--summary-color',d.summaryColor);
  el.style.setProperty('--cat-bg',d.categoryBgColor);el.style.setProperty('--cat-color',d.categoryTextColor);
  el.style.setProperty('--lower-bg',hexRgba(d.lowerBgColor,Number(d.lowerOpacity)));
  el.querySelectorAll('.preview-date').forEach(x=>{x.style.fontFamily=`${d.dateFontFamily||d.fontFamily},sans-serif`;x.style.color=d.summaryColor;});
  applyPreviewMotion(el,d);
}
function refreshPreview(){
  ensureDateUi();
  if($('#previewTitle'))$('#previewTitle').textContent=$('#title')?.value||'Titular';
  if($('#previewCat'))$('#previewCat').textContent=($('#category')?.value||'ACTUALIDAD').toUpperCase();
  if($('#previewSummary'))$('#previewSummary').textContent=$('#summary')?.value||'';
  if($('#previewDate'))$('#previewDate').textContent=formatPubDate(currentStory?.pubDate||currentArticle?.pubDate||'')||'20 AGO 2026';
  if($('#designPreviewDate'))$('#designPreviewDate').textContent=formatPubDate(currentStory?.pubDate||'')||'20 AGO 2026';
  const i=effectiveImage();if(i){if($('#previewImg'))$('#previewImg').src=i;if($('#designPreviewImg'))$('#designPreviewImg').src=i;}
  const d=design();applyPreviewDesign($('#editorPreview'),d,d.showSafeGuides);applyPreviewDesign($('#designPreview'),d,true);
  if($('#previewFormat'))$('#previewFormat').textContent=d.format;if($('#designFormatBadge'))$('#designFormatBadge').textContent=d.format;
}
function refreshOutputStatus(s=currentOutputState){
  currentOutputState=s||currentOutputState;const el=$('#outputStatus'),btn=$('#openOutput');if(!el)return;
  if(!s?.open){el.textContent='OUTPUT · cerrado';el.className='status-pill neutral';if(btn)btn.textContent='Abrir Output';return;}
  const kind=s.kind==='canned'?' · Contenido':s.kind==='ad'?' · Anuncio':'';
  const source=s.source==='automatic'?`Automático${kind}`:s.source==='editor'?'Editor':'sin fuente';
  const res=s.resolution||(s.format==='9:16'?'1080×1920':'1920×1080');
  el.textContent=`OUTPUT · ${res} · ${source}${s.title?` · ${s.title.slice(0,34)}`:''}`;
  el.className=`status-pill ${s.source==='automatic'?'live':s.source==='editor'?'pause':'ok'}`;if(btn)btn.textContent='Cerrar Output';
}
function refreshLocalPolicyUi(){
  if(!$('#localBackupMode')||!settings)return;
  const mode=$('#localBackupMode').value||'on_demand';const primary=$('#primary')?.value||settings.ai.primary;const backups=[$('#backup1')?.value,$('#backup2')?.value];
  const asBackup=primary!=='local'&&backups.includes('local'),asPrimary=primary==='local';
  $('#localIdleRow')?.classList.toggle('hidden',mode!=='on_demand');const info=$('#localPolicyInfo');if(!info)return;
  if(asPrimary)info.textContent='Qwen está configurado como principal: se activará automáticamente al primer uso y permanecerá activo hasta que lo detengas o cierres la app.';
  else if(asBackup&&mode==='always')info.textContent='Qwen está como respaldo y se mantendrá cargado para responder inmediatamente si falla el proveedor principal.';
  else if(asBackup)info.textContent='Qwen está como respaldo bajo demanda: permanece apagado mientras el principal funcione; si hace falta, se activa automáticamente y luego se libera por inactividad.';
  else info.textContent='Esta opción se aplica cuando Qwen está configurado como respaldo.';
}
function refreshProviderUi(){
  if(!settings)return;const chain=[settings.ai.primary,settings.ai.backup1,settings.ai.backup2].filter(x=>x&&x!=='none');
  $('#providerSummary').textContent=`Cadena activa: ${chain.map(providerName).join(' → ')||'sin proveedor'}`;
  $('#claudeStatus').textContent=settings.ai.hasClaudeKey?'API Key guardada ✓ · Claude Haiku 4.5':'API Key: no configurada';
  $('#geminiStatus').textContent=settings.ai.hasGeminiKey?'API Key guardada ✓':'API Key: no configurada';
  $('#claudeKey').placeholder=settings.ai.hasClaudeKey?'••••••••  API guardada · pega otra para reemplazar':'Pega una clave nueva';
  $('#geminiKey').placeholder=settings.ai.hasGeminiKey?'••••••••  API guardada · pega otra para reemplazar':'Pega una clave nueva';
  $('#claudeModel').value='claude-haiku-4-5-20251001';refreshLocalPolicyUi();
}
function normalizeProviders(showMessage=false){
  if(!settings)return;const p=$('#primary').value;let b1=$('#backup1').value,b2=$('#backup2').value;const changes=[];
  if(b1===p){b1='none';$('#backup1').value='none';changes.push('Respaldo 1 duplicaba al principal');}
  if(b2===p||(b2===b1&&b2!=='none')){b2='none';$('#backup2').value='none';changes.push('Respaldo 2 estaba duplicado');}
  settings.ai.primary=p;settings.ai.backup1=b1;settings.ai.backup2=b2;
  if(showMessage&&changes.length)status(`${changes.join('. ')}. Se ajustó a Ninguno.`);refreshProviderUi();
}
function updateRangeLabels(){
  if($('#musicVolumeValue'))$('#musicVolumeValue').textContent=`${$('#musicVolume').value}%`;
  if($('#voiceVolumeValue'))$('#voiceVolumeValue').textContent=`${$('#voiceVolume').value}%`;
  if($('#cannedVolumeValue'))$('#cannedVolumeValue').textContent=`${$('#cannedVolume').value}%`;
}
function setDesignControls(d){
  const value=(id,v)=>{if($('#'+id))$('#'+id).value=v;};
  value('outputFormat',d.format);value('fontFamily',d.fontFamily);value('dateFontFamily',d.dateFontFamily||d.fontFamily||'Arial');value('imageAnimation',d.animation);value('motionSpeed',d.motionSpeed);
  value('titleColor',d.titleColor);value('summaryColor',d.summaryColor);value('categoryBgColor',d.categoryBgColor);value('categoryTextColor',d.categoryTextColor);value('lowerBgColor',d.lowerBgColor);value('lowerOpacity',d.lowerOpacity);
  $('#tiktokSafe').checked=d.tiktokSafe!==false;$('#showSafeGuides').checked=d.showSafeGuides!==false;
  $('#musicEnabled').checked=!!d.musicEnabled;$('#musicLoop').checked=d.musicLoop!==false;value('musicVolume',Number(d.musicVolume??20));value('voiceVolume',Number(d.voiceVolume??100));value('cannedVolume',Number(d.cannedVolume??100));
  $('#transitionEnabled').checked=d.transitionEnabled!==false;value('transitionType',d.transitionType||'fade');value('transitionDuration',Number(d.transitionDuration||.7));
  $('#verticalVideoBackgroundInfo').textContent=d.verticalVideoBackground||'Sin fondo: se usará negro.';$('#musicInfo').textContent=d.musicFile||'Sin música cargada.';
  updateRangeLabels();refreshDesignVisibility();
}
function readDesignControls(){
  const existing=settings?.visual?.output||DESIGN_DEFAULT;
  return{
    format:$('#outputFormat').value,fontFamily:$('#fontFamily').value,dateFontFamily:$('#dateFontFamily').value,titleColor:$('#titleColor').value,summaryColor:$('#summaryColor').value,
    categoryBgColor:$('#categoryBgColor').value,categoryTextColor:$('#categoryTextColor').value,lowerBgColor:$('#lowerBgColor').value,lowerOpacity:Number($('#lowerOpacity').value||.88),animation:$('#imageAnimation').value,motionSpeed:$('#motionSpeed').value,
    tiktokSafe:$('#tiktokSafe').checked,showSafeGuides:$('#showSafeGuides').checked,verticalVideoBackground:existing.verticalVideoBackground||'',verticalVideoBackgroundUrl:existing.verticalVideoBackgroundUrl||'',
    musicFile:existing.musicFile||'',musicUrl:existing.musicUrl||'',musicEnabled:$('#musicEnabled').checked,musicLoop:$('#musicLoop').checked,musicVolume:Number($('#musicVolume').value||0),voiceVolume:Number($('#voiceVolume').value||0),cannedVolume:Number($('#cannedVolume').value||0),
    transitionEnabled:$('#transitionEnabled').checked,transitionType:$('#transitionType').value||'fade',transitionDuration:Math.max(.2,Math.min(2,Number($('#transitionDuration').value)||.7))
  };
}
function refreshDesignVisibility(){
  if(!$('#outputFormat'))return;const vertical=$('#outputFormat').value==='9:16';$('#verticalSafeOptions').classList.toggle('hidden',!vertical);$('#verticalVideoBackgroundOptions').classList.toggle('hidden',!vertical);$('#designResolution').textContent=vertical?'1080×1920 · 9:16':'1920×1080 · 16:9';
}
function updateDesignFromControls(sendLive=true){
  if(!settings?.visual?.output)return;const d=readDesignControls();settings.visual.output={...settings.visual.output,...d};refreshDesignVisibility();refreshPreview();updateRangeLabels();if(sendLive)window.ECAPI.previewOutputDesign(d);
}
function ttsProfileHint(name){
  return({safe_streaming:'ONNX 2 hilos · prioridad baja · recomendado durante OBS',balanced:'ONNX 3 hilos · equilibrio entre CPU y velocidad',performance:'ONNX 6 hilos · mayor velocidad y mayor consumo de CPU'}[name]||'');
}
async function loadSettings(){
  if(!window.ECAPI)throw new Error('ECAPI no disponible');
  ensureDateUi();settings=await window.ECAPI.getSettings();
  if(!settings?.ai||!settings?.tts||!settings?.visual)throw new Error('Ajustes incompletos');
  settings.visual.output={...DESIGN_DEFAULT,...(settings.visual.output||{})};
  settings.canned={enabled:false,folder:'',adsFolder:'',insertAdAfterContent:true,emergency:true,interval:10,...(settings.canned||{})};
  $('#primary').value=settings.ai.primary;$('#backup1').value=settings.ai.backup1;$('#backup2').value=settings.ai.backup2;
  $('#claudeModel').value='claude-haiku-4-5-20251001';$('#geminiModel').value=settings.ai.geminiModel||'';
  $('#localBackupMode').value=settings.ai.localBackupMode||'on_demand';$('#localIdleMinutes').value=settings.ai.localIdleMinutes||5;
  $('#voiceSpeed').value=settings.tts.speed||1;$('#ttsPerformanceProfile').value=settings.tts.resourceMode||'safe_streaming';$('#ttsPerformanceHint').textContent=ttsProfileHint($('#ttsPerformanceProfile').value);
  $('#pronunciationClaudeVerify').checked=settings.tts.pronunciationClaudeVerify!==false;$('#pronunciationMaxSeconds').value=Math.max(5,Math.min(30,Number(settings.tts.pronunciationMaxSeconds)||15));
  $('#bufferReady').value=settings.automation.bufferReady||15;$('#pauseSeconds').value=settings.visual.pauseSeconds||2.5;$('#maxAge').value=settings.automation.maxAgeHours||6;$('#avoidRepeats').checked=settings.automation.avoidRepeats!==false;
  $('#fallbackInfo').textContent=settings.visual.fallbackImage||'Sin imagen fallback';$('#cannedEnabled').checked=!!settings.canned.enabled;$('#cannedEmergency').checked=settings.canned.emergency!==false;$('#adsAfterCanned').checked=settings.canned.insertAdAfterContent!==false;
  const interval=Number(settings.canned.interval)||0;if([0,10,20,30].includes(interval))$('#cannedInterval').value=String(interval);else{$('#cannedInterval').value='custom';$('#cannedCustomInterval').value=interval||15;}
  setDesignControls(settings.visual.output);renderFeeds();refreshProviderUi();refreshPreview();refreshCannedIntervalUi();
  await refreshRuntimeStatus();await refreshPronunciationStatus();await refreshCannedList();await refreshAdsList();
  try{refreshAutomation(await window.ECAPI.automationStatus());}catch{}try{refreshOutputStatus(await window.ECAPI.outputStatus());}catch{}
}
function loadRendererPart(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));document.body.appendChild(s);});}
(async()=>{
  if(!window.ECAPI)return;
  try{await loadRendererPart('renderer-ui.js');await loadRendererPart('renderer-actions.js');}
  catch(e){fatalInterface(`No se pudo cargar la interfaz: ${e.message||e}`);}
})();
