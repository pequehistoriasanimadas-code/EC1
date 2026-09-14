'use strict';

const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {app,BrowserWindow,ipcMain}=require('electron');
const {SettingsStore}=require('./settings');
const {AutomationEngine}=require('./automation0325');
const {TTSLabRuntime}=require('./ttsLabRuntime');
const {ttsRuntimeSignature}=require('./releaseV2Lab');
const production=require('./releaseV2ProductionFidelity');
const {normalizePromoDesignRoot,formatKey}=require('./emissionDesignLab29');

const PROMO_DEFAULTS_REVISION='2026-09-14';
const APPROVED_PROMO_DEFAULTS={
  '16:9':{preset:'custom',centerXPercent:50,centerYPercent:82,widthPercent:84,minHeightPercent:23.8,ctaFontSize:30,titleFontSize:40,channelFontSize:30,backgroundOpacity:.66,thumbnailScale:1.45,borderRadius:14,paddingPercent:1.2,gapPx:18},
  '9:16':{preset:'custom',centerXPercent:46.4,centerYPercent:76,widthPercent:78,minHeightPercent:12,ctaFontSize:25,titleFontSize:35,channelFontSize:25,backgroundOpacity:.70,thumbnailScale:.97,borderRadius:14,paddingPercent:2,gapPx:18}
};
const LEGACY_PROMO_DEFAULTS={
  '16:9':[
    {preset:'bottom-left',centerXPercent:23.5,centerYPercent:87,widthPercent:39,minHeightPercent:16,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,paddingPercent:1.2,gapPx:18}
  ],
  '9:16':[
    {preset:'bottom-left',centerXPercent:47,centerYPercent:76,widthPercent:70,minHeightPercent:12,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,paddingPercent:2,gapPx:18},
    {preset:'bottom-left',centerXPercent:48,centerYPercent:78,widthPercent:78,minHeightPercent:12,ctaFontSize:22,titleFontSize:18,channelFontSize:14,backgroundOpacity:.85,thumbnailScale:1,borderRadius:14,paddingPercent:2,gapPx:18}
  ]
};
const PROMO_FIELDS=['preset','centerXPercent','centerYPercent','widthPercent','minHeightPercent','ctaFontSize','titleFontSize','channelFontSize','backgroundOpacity','thumbnailScale','borderRadius','paddingPercent','gapPx'];
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
let installed=false;

function dataRoot(){
  const labRoot=process.env.GEC_V2_TTS_LAB_ROOT;
  if(process.env.GEC_V2_TTS_LAB==='1'&&labRoot)return path.join(labRoot,'EC Automatic News Data');
  const portable=process.env.PORTABLE_EXECUTABLE_DIR;
  if(portable)return path.join(portable,'EC Automatic News Data');
  if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');
  return path.join(app.getPath('userData'),'EC Automatic News Data');
}
function storeRoot(store){return String(store?.baseDir||dataRoot());}
function modelCacheFile(root=dataRoot()){return path.join(root,'global','tts-model-optimizations-lab29.json');}
function readJson(file,fallback){try{const x=JSON.parse(fs.readFileSync(file,'utf8'));return x&&typeof x==='object'?x:fallback;}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function approx(a,b,t=.001){return Math.abs(Number(a)-Number(b))<=t;}
function samePromoFormat(a={},b={}){return PROMO_FIELDS.every(k=>k==='preset'?String(a[k]||'')===String(b[k]||''):approx(a[k],b[k]));}
function legacyPromoFormat(value,key){return LEGACY_PROMO_DEFAULTS[key].some(x=>samePromoFormat(value,x));}

function ensureApprovedPromoDefaults(settings={}){
  const s=settings&&typeof settings==='object'?settings:{};
  s.visual=s.visual||{};const out=s.visual.output=s.visual.output||{};
  let root=out.youtubePromoDesign;
  if(!root||typeof root!=='object'||!root.formats){
    root={schemaVersion:2,defaultsRevision:PROMO_DEFAULTS_REVISION,ctaText:String(out.youtubePromoCtaText??'Puedes ver el video aquí:'),formats:clone(APPROVED_PROMO_DEFAULTS)};
    out.youtubePromoDesign=root;out.youtubePromoCtaText=root.ctaText;return s;
  }
  root.formats=root.formats&&typeof root.formats==='object'?root.formats:{};
  if(String(root.defaultsRevision||'')!==PROMO_DEFAULTS_REVISION){
    for(const key of ['16:9','9:16']){
      const current=root.formats[key];
      if(!current||legacyPromoFormat(current,key))root.formats[key]=clone(APPROVED_PROMO_DEFAULTS[key]);
    }
    root.defaultsRevision=PROMO_DEFAULTS_REVISION;
  }
  out.youtubePromoCtaText=String(root.ctaText??out.youtubePromoCtaText??'Puedes ver el video aquí:');
  return s;
}

function modelOptimizationKey(tts={}){
  const engine=String(tts.engine||'kokoro');
  if(engine==='chatterbox')return'chatterbox:latam';
  if(engine==='qwen3tts'){
    const p=tts.engineParams?.qwen3tts||{},mode=String(p.voiceMode||'reference')==='finetuned'?'finetuned':'reference';
    return mode==='finetuned'?`qwen3tts:finetuned:${String(p.fineTunedModelId||'none')}`:'qwen3tts:reference:base';
  }
  return engine;
}
function normalizeCacheKey(key=''){
  const k=String(key||'');
  if(k.startsWith('qwen3tts:reference:'))return'qwen3tts:reference:base';
  if(k==='chatterbox'||k==='chatterbox:multilingual')return'chatterbox:latam';
  return k;
}
function uiOptimizationKey(tts={}){
  const engine=String(tts.engine||'kokoro');
  if(engine==='qwen3tts'){
    const p=tts.engineParams?.qwen3tts||{},mode=String(p.voiceMode||'reference')==='finetuned'?'finetuned':'reference';
    return mode==='finetuned'?`qwen3tts:finetuned:${String(p.fineTunedModelId||'none')}`:`qwen3tts:reference:${String(tts.referenceVoiceId||'none')}`;
  }
  return engine==='chatterbox'?'chatterbox:latam':engine;
}
function normalizeRuntimeSignature(sig=''){return String(sig||'').split('|').filter(x=>!/^reference=/.test(x)).join('|');}
function modelRuntimeSignature(tts={}){try{return normalizeRuntimeSignature(ttsRuntimeSignature(tts));}catch{return'';}}
function captureOptimization(s={}){
  if(!s.optimization0321)return null;
  return{
    optimization0321:clone(s.optimization0321),
    ai:{localResourceMode:s.ai?.localResourceMode||'safe_streaming',localAutoTuned:!!s.ai?.localAutoTuned,localTunedConfig:clone(s.ai?.localTunedConfig||null),lastLocalBenchmark:clone(s.ai?.lastLocalBenchmark||null)},
    tts:{resourceMode:s.tts?.resourceMode||'safe_streaming',performanceThreads:Number(s.tts?.performanceThreads)||6,autoTune:s.tts?.autoTune!==false,autoTuned:!!s.tts?.autoTuned,lastBenchmark:clone(s.tts?.lastBenchmark||null),lastAdvancedBenchmark:clone(s.tts?.lastAdvancedBenchmark||null),lastHardwareBenchmark:clone(s.tts?.lastHardwareBenchmark||null)}
  };
}
function restoreOptimization(s={},saved=null){
  if(!saved?.optimization0321)return false;
  s.ai=s.ai||{};s.tts=s.tts||{};
  s.optimization0321=clone(saved.optimization0321);
  Object.assign(s.ai,clone(saved.ai||{}));Object.assign(s.tts,clone(saved.tts||{}));
  const engine=String(s.tts.engine||'kokoro');
  s.optimization0321={...s.optimization0321,ttsEngine:engine,ttsVariant:engine==='chatterbox'?'latam':'',ttsOptimizationKey:uiOptimizationKey(s.tts),ttsRuntimeSignature:ttsRuntimeSignature(s.tts)};
  return true;
}
function cacheEnvelope(root){const raw=readJson(modelCacheFile(root),{});return{schemaVersion:1,entries:raw.entries&&typeof raw.entries==='object'?raw.entries:{}};}
function entryTimestamp(saved={}){const a=saved?.optimization0321?.at||saved?.optimization0321?.updatedAt||'';const t=Date.parse(a);return Number.isFinite(t)?t:0;}
function migrateLegacyOptimizationEntries(s,cache){
  const legacy=s.tts?.engineOptimizations&&typeof s.tts.engineOptimizations==='object'?s.tts.engineOptimizations:{};
  for(const [oldKey,saved] of Object.entries(legacy)){
    const key=normalizeCacheKey(oldKey);if(!key||!saved?.optimization0321)continue;
    const sig=normalizeRuntimeSignature(saved.optimization0321.ttsRuntimeSignature||'');
    const prev=cache.entries[key];
    if(!prev||entryTimestamp(saved)>=Number(prev.savedAtMs||0))cache.entries[key]={runtimeSignature:sig,saved:clone(saved),savedAtMs:entryTimestamp(saved)||Date.now(),source:'legacy-engineOptimizations'};
  }
}
function activeBelongsToCurrentModel(s){
  const opt=s.optimization0321;if(!opt)return false;
  const engine=String(s.tts?.engine||'kokoro');if(String(opt.ttsEngine||engine)!==engine)return false;
  const activeKey=normalizeCacheKey(opt.ttsOptimizationKey||opt.ttsEngine||'');
  return !activeKey||activeKey===modelOptimizationKey(s.tts);
}
function normalizeOptimizationForModel(s,root){
  s.tts=s.tts||{};s.ai=s.ai||{};s.tts.engineOptimizations=s.tts.engineOptimizations&&typeof s.tts.engineOptimizations==='object'?s.tts.engineOptimizations:{};
  const cache=cacheEnvelope(root);migrateLegacyOptimizationEntries(s,cache);
  const modelKey=modelOptimizationKey(s.tts),runtimeSig=modelRuntimeSignature(s.tts);
  if(activeBelongsToCurrentModel(s)){
    const saved=captureOptimization(s),sig=normalizeRuntimeSignature(saved?.optimization0321?.ttsRuntimeSignature||runtimeSig);
    if(saved&&(!sig||!runtimeSig||sig===runtimeSig))cache.entries[modelKey]={runtimeSignature:runtimeSig||sig,saved:clone(saved),savedAtMs:Date.now(),source:'active'};
  }
  const entry=cache.entries[modelKey];
  const activeRuntime=normalizeRuntimeSignature(s.optimization0321?.ttsRuntimeSignature||'');
  const activeUsable=activeBelongsToCurrentModel(s)&&(!runtimeSig||!activeRuntime||activeRuntime===runtimeSig);
  const entryUsable=!!entry?.saved?.optimization0321&&(!runtimeSig||!entry.runtimeSignature||normalizeRuntimeSignature(entry.runtimeSignature)===runtimeSig);
  if(!activeUsable&&entryUsable)restoreOptimization(s,entry.saved);
  if(s.optimization0321&&activeBelongsToCurrentModel(s)){
    s.optimization0321.ttsOptimizationKey=uiOptimizationKey(s.tts);
    try{s.optimization0321.ttsRuntimeSignature=ttsRuntimeSignature(s.tts);}catch{}
    s.tts.engineOptimizations[uiOptimizationKey(s.tts)]=captureOptimization(s);
    s.tts.engineOptimizations[modelKey]=captureOptimization(s);
    cache.entries[modelKey]={runtimeSignature:runtimeSig,saved:captureOptimization(s),savedAtMs:Date.now(),source:'model-cache'};
  }
  const invalid=String(s.activeOptimizationV2?.invalidReason||'');
  if(s.activeOptimizationV2&&/(referencia Qwen distinta|voz de referencia Chatterbox distinta)/i.test(invalid)){
    s.activeOptimizationV2.valid=true;s.activeOptimizationV2.invalidReason='';
  }
  atomicJson(modelCacheFile(root),cache);
  return s;
}
function installSettingsModelCacheAndPromoDefaults(){
  const p=SettingsStore.prototype;if(p.__ecFinalCorrectionsLab29)return;Object.defineProperty(p,'__ecFinalCorrectionsLab29',{value:true});
  const baseLoad=p.load,baseSave=p.save;
  p.load=function(...args){const s=baseLoad.apply(this,args);ensureApprovedPromoDefaults(s);return normalizeOptimizationForModel(s,storeRoot(this));};
  p.save=function(settings,...args){const s=ensureApprovedPromoDefaults(settings&&typeof settings==='object'?settings:{});normalizeOptimizationForModel(s,storeRoot(this));const result=baseSave.call(this,s,...args);ensureApprovedPromoDefaults(result);return normalizeOptimizationForModel(result,storeRoot(this));};
}

function effectivePromo(settings={}){
  const out=settings?.visual?.output||{},format=formatKey(out.format),root=normalizePromoDesignRoot(out.youtubePromoDesign,{legacyCta:out.youtubePromoCtaText,tiktokSafe:out.tiktokSafe!==false});
  return{format,ctaText:root.ctaText,design:{...clone(root.formats[format]),format}};
}
function installPromoSnapshotFidelity(){
  const p=AutomationEngine.prototype;if(p.__ecFinalPromoSnapshotLab29)return;const base=p.playCanned;if(typeof base!=='function')return;Object.defineProperty(p,'__ecFinalPromoSnapshotLab29',{value:true});
  p.playCanned=async function(...args){const original=this.sendAutomaticOutput;if(typeof original!=='function')return base.apply(this,args);this.sendAutomaticOutput=(payload)=>{let next=payload;if(String(payload?.mediaRole||'')==='content'&&payload?.youtubePromo?.enabled){const settings=this.getSettings?.()||{};const promo=effectivePromo(settings);next={...payload,youtubePromo:{...payload.youtubePromo,ctaText:promo.ctaText,design:promo.design}};}return original(next);};try{return await base.apply(this,args);}finally{this.sendAutomaticOutput=original;}};
}

function fixProjectedQueueOrder(rows,currentKind){
  if(!Array.isArray(rows)||!rows.length)return rows;
  let out=rows.map(x=>({...x}));
  const kind=String(currentKind||'none');
  const airIdx=out.findIndex(r=>String(r.status||'').toUpperCase()==='AL AIRE'&&(kind!=='canned'||r.sourceType==='content')&&(kind!=='ad'||r.sourceType==='ad'));
  if(airIdx>0){const [air]=out.splice(airIdx,1);out.unshift(air);}
  if(kind==='canned'&&out[0]?.sourceType==='content'){
    const content=out[0],adIdx=out.findIndex((r,i)=>i>0&&r.sourceType==='ad'&&String(r.status||'').toUpperCase()!=='AL AIRE'&&(/Después del contenido/i.test(String(r.planText||''))||String(r.planKey||'')&&String(r.planKey||'')===String(content.planKey||'')));
    if(adIdx>1){const [ad]=out.splice(adIdx,1);out.splice(1,0,ad);}
  }
  let pos=0;out=out.map(row=>{if(row.history||row.queueGroup==='preparing')return{...row,displayPosition:0,sessionSeq:0};const n=++pos;return{...row,displayPosition:n,sessionSeq:n};});
  return out;
}
function installQueueProjectionFix(){const p=AutomationEngine.prototype;if(p.__ecFinalQueueOrderLab29)return;const base=p.displayQueue;if(typeof base!=='function')return;Object.defineProperty(p,'__ecFinalQueueOrderLab29',{value:true});p.displayQueue=function(...args){return fixProjectedQueueOrder(base.apply(this,args),this.currentKind);};}

function runPythonCleanup(python,wav){return new Promise(resolve=>{const script=path.join(__dirname,'..','chatterbox_pause_cleanup_lab29.py');if(!fs.existsSync(script)||!wav||!fs.existsSync(wav))return resolve({ok:false,skipped:true});let stdout='',stderr='',done=false;const child=spawn(python||'python',[script,wav],{windowsHide:true});const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>{try{child.kill();}catch{}finish({ok:false,error:'timeout'});},15000);child.stdout.on('data',d=>stdout+=d.toString());child.stderr.on('data',d=>stderr+=d.toString());child.on('error',e=>finish({ok:false,error:String(e?.message||e)}));child.on('exit',code=>{if(code!==0)return finish({ok:false,error:(stderr||stdout||`exit ${code}`).trim().slice(-600)});try{finish(JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).pop()||'{}'));}catch{finish({ok:true,raw:stdout.trim().slice(-600)});}});});}
function installChatterboxPauseCleanup(){const p=TTSLabRuntime.prototype;if(p.__ecFinalChatterboxPauseCleanupLab29)return;const base=p.generate;if(typeof base!=='function')return;Object.defineProperty(p,'__ecFinalChatterboxPauseCleanupLab29',{value:true});p.generate=async function(id,...args){const result=await base.call(this,id,...args);if(String(id)!=='chatterbox'||!result?.path)return result;const cleanup=await runPythonCleanup(this.python,result.path);return{...result,pauseCleanup:cleanup};};}

function injectFile(win,file,kind='js'){
  try{const full=path.join(__dirname,'..',file);if(!fs.existsSync(full)||!win||win.isDestroyed())return;if(kind==='css'){win.webContents.insertCSS(fs.readFileSync(full,'utf8')).catch(()=>{});return;}const code=fs.readFileSync(full,'utf8');win.webContents.executeJavaScript(`(()=>{${code}\n})()`,true).catch(()=>{});}catch{}
}
function injectWindow(win){if(!win||win.isDestroyed())return;const run=()=>{if(!win||win.isDestroyed())return;const url=String(win.webContents.getURL()||'');if(/control\.html(?:[?#]|$)/i.test(url)){injectFile(win,'control-final-corrections-lab29.css','css');injectFile(win,'renderer-final-corrections-lab29.js','js');}else if(/output\.html(?:[?#]|$)/i.test(url)){injectFile(win,'output-youtube-promo-v2-lab29.css','css');injectFile(win,'output-youtube-promo-v2-lab29.js','js');}};win.webContents.on('did-finish-load',run);setTimeout(run,0);}
function installWindowPatches(){app.on('browser-window-created',(_,win)=>injectWindow(win));for(const win of BrowserWindow.getAllWindows())injectWindow(win);}
function installOptimizationClear(){
  try{ipcMain.removeHandler('optimization-v2:clear');}catch{}
  ipcMain.handle('optimization-v2:clear',()=>{const root=dataRoot();try{const s=new SettingsStore(root).load(),cache=cacheEnvelope(root);delete cache.entries[modelOptimizationKey(s.tts||{})];atomicJson(modelCacheFile(root),cache);}catch{}try{fs.rmSync(production.profileFile(),{force:true});}catch{}return{ok:true};});
}

function installReleaseV2FinalCorrectionsLab29(){
  if(installed)return;installed=true;
  installSettingsModelCacheAndPromoDefaults();
  installPromoSnapshotFidelity();
  installQueueProjectionFix();
  installChatterboxPauseCleanup();
  installOptimizationClear();
  installWindowPatches();
}

module.exports={APPROVED_PROMO_DEFAULTS,PROMO_DEFAULTS_REVISION,modelOptimizationKey,modelRuntimeSignature,ensureApprovedPromoDefaults,fixProjectedQueueOrder,installReleaseV2FinalCorrectionsLab29};
