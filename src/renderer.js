let settings=null,stories=[],currentStory=null,currentArticle=null,currentGenerated=null,currentAudio=null;
let automationState={processing:{running:false,paused:false},emission:{running:false,paused:false,currentTitle:''},counts:{processing:0,ready:0,onAir:0,emitted:0,error:0},queue:[]};
let currentOutputState={open:false,source:'none',title:'',format:'16:9',resolution:'1920×1080'};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const status=t=>$('#status').textContent=t;
const providerName=p=>({local:'IA local',claude:'Claude',gemini:'Gemini',none:'Ninguno'}[p]||p||'');
const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const DESIGN_DEFAULT={format:'16:9',fontFamily:'Arial',titleColor:'#FFFFFF',summaryColor:'#F3F3F3',categoryBgColor:'#F7C600',categoryTextColor:'#000000',lowerBgColor:'#000000',lowerOpacity:.88,animation:'auto',motionSpeed:'normal',tiktokSafe:true,showSafeGuides:true};
function tab(name){$$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$$('.tab').forEach(x=>x.classList.toggle('show',x.id===`tab-${name}`));}
$$('.nav').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));

function effectiveImage(){return currentStory?.image||currentArticle?.image||settings?.visual?.fallbackImageUrl||'';}
function hexRgba(hex,opacity){
  const m=String(hex||'#000').replace('#','');const h=m.length===3?m.split('').map(x=>x+x).join(''):m;
  const n=parseInt(h,16);if(Number.isNaN(n))return `rgba(0,0,0,${opacity})`;
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${opacity})`;
}
function design(){return {...DESIGN_DEFAULT,...(settings?.visual?.output||{})};}
function applyPreviewDesign(el,d,showGuide=false){
  if(!el)return;
  el.classList.toggle('format-9-16',d.format==='9:16');el.classList.toggle('format-16-9',d.format!=='9:16');
  el.classList.toggle('show-safe',showGuide&&d.format==='9:16'&&d.tiktokSafe&&d.showSafeGuides);
  el.style.fontFamily=`${d.fontFamily},sans-serif`;
  el.style.setProperty('--title-color',d.titleColor);
  el.style.setProperty('--summary-color',d.summaryColor);
  el.style.setProperty('--cat-bg',d.categoryBgColor);
  el.style.setProperty('--cat-color',d.categoryTextColor);
  el.style.setProperty('--lower-bg',hexRgba(d.lowerBgColor,Number(d.lowerOpacity)));
}
function refreshPreview(){
  $('#previewTitle').textContent=$('#title').value||'Titular';
  $('#previewCat').textContent=($('#category').value||'ACTUALIDAD').toUpperCase();
  $('#previewSummary').textContent=$('#summary').value||'';
  const i=effectiveImage();if(i){$('#previewImg').src=i;$('#designPreviewImg').src=i;}
  const d=design();applyPreviewDesign($('#editorPreview'),d,d.showSafeGuides);applyPreviewDesign($('#designPreview'),d,true);
  $('#previewFormat').textContent=d.format;$('#designFormatBadge').textContent=d.format;
}
function refreshOutputStatus(s=currentOutputState){
  currentOutputState=s||currentOutputState;
  const el=$('#outputStatus');
  if(!s?.open){el.textContent='OUTPUT · cerrado';el.className='status-pill neutral';return;}
  const source=s.source==='automatic'?'Automático':s.source==='editor'?'Editor':'sin fuente';
  const res=s.resolution|| (s.format==='9:16'?'1080×1920':'1920×1080');
  el.textContent=`OUTPUT · ${res} · ${source}${s.title?` · ${s.title.slice(0,38)}`:''}`;
  el.className=`status-pill ${s.source==='automatic'?'live':s.source==='editor'?'pause':'ok'}`;
}
function refreshLocalPolicyUi(){
  if(!$('#localBackupMode'))return;
  const mode=$('#localBackupMode').value||'on_demand';
  const primary=$('#primary')?.value||settings?.ai?.primary;
  const backups=[$('#backup1')?.value,$('#backup2')?.value];
  const asBackup=primary!=='local'&&backups.includes('local');
  const asPrimary=primary==='local';
  $('#localIdleRow').classList.toggle('hidden',mode!=='on_demand');
  const info=$('#localPolicyInfo');
  if(asPrimary) info.textContent='Qwen está configurado como principal: se activará automáticamente al primer uso y permanecerá activo hasta que lo detengas o cierres la app.';
  else if(asBackup&&mode==='always') info.textContent='Qwen está como respaldo y se mantendrá cargado para responder inmediatamente si falla el proveedor principal.';
  else if(asBackup) info.textContent='Qwen está como respaldo bajo demanda: permanece apagado mientras el principal funcione; si hace falta, se activa automáticamente y se apaga tras el tiempo sin uso indicado.';
  else info.textContent='Esta opción se aplica cuando Qwen está configurado como respaldo. Si Qwen no está en la cadena, puede permanecer apagado.';
}
function refreshProviderUi(){
  if(!settings)return;
  const chain=[settings.ai.primary,settings.ai.backup1,settings.ai.backup2].filter(x=>x&&x!=='none');
  $('#providerSummary').textContent=`Cadena activa: ${chain.map(providerName).join(' → ')||'sin proveedor'}`;
  $('#claudeStatus').textContent=settings.ai.hasClaudeKey?'API Key guardada ✓':'API Key: no configurada';
  $('#geminiStatus').textContent=settings.ai.hasGeminiKey?'API Key guardada ✓':'API Key: no configurada';
  $('#claudeKey').placeholder=settings.ai.hasClaudeKey?'••••••••  API guardada · pega otra para reemplazar':'Pega una clave nueva';
  $('#geminiKey').placeholder=settings.ai.hasGeminiKey?'••••••••  API guardada · pega otra para reemplazar':'Pega una clave nueva';
  refreshLocalPolicyUi();
}
function normalizeProviders(showMessage=false){
  const p=$('#primary').value;let b1=$('#backup1').value,b2=$('#backup2').value;const changes=[];
  if(b1===p){b1='none';$('#backup1').value='none';changes.push('Respaldo 1 duplicaba al principal');}
  if(b2===p||(b2===b1&&b2!=='none')){b2='none';$('#backup2').value='none';changes.push('Respaldo 2 estaba duplicado');}
  settings.ai.primary=p;settings.ai.backup1=b1;settings.ai.backup2=b2;
  if(showMessage&&changes.length)status(`${changes.join('. ')}. Se ajustó a Ninguno.`);refreshProviderUi();
}

function setDesignControls(d){
  $('#outputFormat').value=d.format;$('#fontFamily').value=d.fontFamily;$('#imageAnimation').value=d.animation;$('#motionSpeed').value=d.motionSpeed;
  $('#titleColor').value=d.titleColor;$('#summaryColor').value=d.summaryColor;$('#categoryBgColor').value=d.categoryBgColor;$('#categoryTextColor').value=d.categoryTextColor;$('#lowerBgColor').value=d.lowerBgColor;$('#lowerOpacity').value=d.lowerOpacity;
  $('#tiktokSafe').checked=d.tiktokSafe!==false;$('#showSafeGuides').checked=d.showSafeGuides!==false;
  refreshDesignVisibility();
}
function readDesignControls(){
  return {format:$('#outputFormat').value,fontFamily:$('#fontFamily').value,titleColor:$('#titleColor').value,summaryColor:$('#summaryColor').value,categoryBgColor:$('#categoryBgColor').value,categoryTextColor:$('#categoryTextColor').value,lowerBgColor:$('#lowerBgColor').value,lowerOpacity:Number($('#lowerOpacity').value||.88),animation:$('#imageAnimation').value,motionSpeed:$('#motionSpeed').value,tiktokSafe:$('#tiktokSafe').checked,showSafeGuides:$('#showSafeGuides').checked};
}
function refreshDesignVisibility(){
  const vertical=$('#outputFormat').value==='9:16';$('#verticalSafeOptions').classList.toggle('hidden',!vertical);
  $('#designResolution').textContent=vertical?'1080×1920 · 9:16':'1920×1080 · 16:9';
}
function updateDesignFromControls(sendLive=true){
  const d=readDesignControls();settings.visual.output={...settings.visual.output,...d};refreshDesignVisibility();refreshPreview();
  if(sendLive)window.ECAPI.previewOutputDesign(d);
}

async function loadSettings(){
  settings=await window.ECAPI.getSettings();
  settings.visual.output={...DESIGN_DEFAULT,...(settings.visual.output||{})};
  $('#primary').value=settings.ai.primary;$('#backup1').value=settings.ai.backup1;$('#backup2').value=settings.ai.backup2;
  $('#claudeModel').value=settings.ai.claudeModel||'';$('#geminiModel').value=settings.ai.geminiModel||'';
  $('#localBackupMode').value=settings.ai.localBackupMode||'on_demand';$('#localIdleMinutes').value=settings.ai.localIdleMinutes||5;
  $('#voiceSpeed').value=settings.tts.speed||1;$('#bufferReady').value=settings.automation.bufferReady||15;$('#pauseSeconds').value=settings.visual.pauseSeconds||2.5;$('#maxAge').value=settings.automation.maxAgeHours||6;$('#avoidRepeats').checked=settings.automation.avoidRepeats!==false;
  $('#fallbackInfo').textContent=settings.visual.fallbackImage||'Sin imagen fallback';
  setDesignControls(settings.visual.output);renderFeeds();refreshProviderUi();refreshPreview();await refreshRuntimeStatus();await refreshPronunciationStatus();
  try{refreshAutomation(await window.ECAPI.automationStatus());}catch{}
  try{refreshOutputStatus(await window.ECAPI.outputStatus());}catch{}
}

function loadRendererPart(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));document.body.appendChild(s);});}
(async()=>{try{await loadRendererPart('renderer-ui.js');await loadRendererPart('renderer-actions.js');}catch(e){status(`Error de interfaz: ${e.message||e}`);}})();
