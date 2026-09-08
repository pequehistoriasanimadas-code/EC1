'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {app,ipcMain}=require('electron');
const {SettingsStore}=require('./settings');
const {LocalRuntime}=require('./localRuntime');
const {AutomationEngine}=require('./automation0325');
const {optimizationKey,qwenModelIdentity,ttsRuntimeSignature}=require('./releaseV2Lab');

const PROFILE_SCHEMA=1;
const PROFILE_VERSION='2.0-lab.16';
const PROFILE_FILE='active-production-profile.json';
const PIPELINE_MODES=new Set(['split','simultaneous','gpu-coordinated','gpu-swap']);
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

function dataRoot(){
  const portable=process.env.PORTABLE_EXECUTABLE_DIR;
  if(portable)return path.join(portable,'EC Automatic News Data');
  if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');
  return path.join(app.getPath('userData'),'EC Automatic News Data');
}
function profileFile(root=dataRoot()){return path.join(root,'tts-lab',PROFILE_FILE);}
function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp-'+process.pid+'-'+Date.now();
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');
  fs.renameSync(tmp,file);
}
function clamp(n,min,max,fallback){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function intSeed(value){
  const h=crypto.createHash('sha1').update(String(value||'gec-aurelio')).digest();
  const n=h.readUInt32LE(0)&0x7fffffff;
  return n||20260907;
}
function normalizeLocalConfig(raw={}){
  return{
    label:String(raw.label||'Optimizado para esta PC'),
    ctx:Math.round(clamp(raw.ctx,3072,8192,4096)),
    gpuLayers:Math.round(clamp(raw.gpuLayers,0,99,20)),
    batch:Math.round(clamp(raw.batch,128,768,384)),
    ubatch:Math.round(clamp(raw.ubatch,64,512,192)),
    threads:Math.round(clamp(raw.threads,1,24,4)),
    parallel:1,
    prio:Math.round(clamp(raw.prio,-1,1,-1)),
    poll:Math.round(clamp(raw.poll,0,100,0)),
    warmup:raw.warmup===true
  };
}
function configComparable(raw={}){
  const c=normalizeLocalConfig(raw);
  return{ctx:c.ctx,gpuLayers:c.gpuLayers,batch:c.batch,ubatch:c.ubatch,threads:c.threads,parallel:1,prio:c.prio,poll:c.poll,warmup:c.warmup};
}
function sameConfig(a={},b={}){return JSON.stringify(configComparable(a))===JSON.stringify(configComparable(b));}
function localRequired(settings={}){
  const ai=settings.ai||{};
  return[ai.primary,ai.backup1,ai.backup2].includes('local');
}
function selectedPipeline(payload={},settings={}){
  const raw=String(payload.pipelineMode||payload?.localResult?.summary?.coexistenceMode||payload?.localResult?.coexistence?.mode||settings?.optimization0321?.local?.coexistenceMode||settings?.ai?.lastLocalBenchmark?.coexistenceMode||'');
  if(PIPELINE_MODES.has(raw))return raw;
  return localRequired(settings)&&String(settings?.tts?.engine||'kokoro')!=='kokoro'?'gpu-coordinated':'split';
}
function buildProfile(settings={},payload={}){
  const tts=settings.tts||{},engine=String(tts.engine||'kokoro'),identity=engine==='qwen3tts'?qwenModelIdentity(tts):{mode:'',id:'',fingerprint:'',name:''};
  const q=tts.engineParams?.qwen3tts||{},ch=tts.engineParams?.chatterbox||{},localConfig=normalizeLocalConfig(payload?.localResult?.recommendedConfig||settings?.ai?.localTunedConfig||{});
  const pipelineMode=selectedPipeline(payload,settings),swapValidated=pipelineMode==='gpu-swap'&&!!(payload?.localResult?.summary?.swapValidated||payload?.localResult?.coexistence?.swapValidated||settings?.ai?.lastLocalBenchmark?.swapValidated);
  const localSummary=payload?.localResult?.summary||settings?.ai?.lastLocalBenchmark||{},expectedTps=Number(pipelineMode==='gpu-coordinated'?(localSummary.coordinatedTps||localSummary.tokensPerSec||0):(localSummary.tokensPerSec||0));
  const expectedRtf=Number(payload?.ttsResult?.stableRealtimeFactor||payload?.ttsResult?.bestRealtimeFactor||payload?.ttsResult?.realtimeFactor||settings?.optimization0321?.voice?.medianRtf||0);
  const qBaseTemp=clamp(q.temperature,0.1,1.5,.78),chBaseTemp=clamp(ch.temperature,0.1,1.5,.8),stableTemp=engine==='chatterbox'?Math.min(chBaseTemp,.60):engine==='qwen3tts'&&identity.mode==='finetuned'?Math.min(qBaseTemp,.55):qBaseTemp;
  const voiceIdentity=engine==='chatterbox'?String(tts.referenceVoiceId||'')+'|'+String(ch.variant||'latam'):identity.fingerprint||identity.id||identity.name||String(tts.referenceVoiceId||'')||engine;
  const productionSeed=intSeed(voiceIdentity);
  const runtimeParams=engine==='qwen3tts'?{
    dtypeMode:String(q.dtypeMode||payload?.qwenPerf?.recommendedParams?.dtypeMode||'bf16'),
    attentionMode:String(q.attentionMode||payload?.qwenPerf?.recommendedParams?.attentionMode||'auto'),
    chunkChars:Math.round(clamp(q.chunkChars||payload?.qwenPerf?.recommendedParams?.chunkChars,240,900,360)),
    temperature:qBaseTemp,
    productionTemperature:stableTemp,
    productionSeed,
    consistencyMode:'stable-v1'
  }:engine==='chatterbox'?{
    chunkChars:540,
    productionTemperature:stableTemp,
    productionSeed,
    consistencyMode:'stable-v1'
  }:{};
  const now=new Date().toISOString();
  const profile={
    schemaVersion:PROFILE_SCHEMA,
    version:PROFILE_VERSION,
    id:crypto.createHash('sha1').update([engine,identity.id||'',identity.fingerprint||'',payload.fingerprint||'',now].join('|')).digest('hex').slice(0,16),
    at:now,
    fingerprint:String(payload.fingerprint||settings?.optimization0321?.fingerprint||''),
    hardwareLabel:String(payload.hardwareLabel||settings?.optimization0321?.hardwareLabel||''),
    source:String(payload.source||'optimizer'),
    runtimeSignature:ttsRuntimeSignature(tts),
    tts:{
      engine,
      optimizationKey:optimizationKey(tts),
      mode:identity.mode||'',
      modelId:identity.id||'',
      modelFingerprint:identity.fingerprint||'',
      modelName:identity.name||'',
      referenceVoiceId:engine==='chatterbox'||(engine==='qwen3tts'&&identity.mode!=='finetuned')?String(tts.referenceVoiceId||''):'',
      runtimeParams,
      expectedRtf
    },
    localAi:{
      required:localRequired(settings),
      mode:localRequired(settings)?'tuned':'unused',
      config:localConfig,
      expectedTokensPerSec:expectedTps,
      recommendedId:String(payload?.localResult?.recommendedId||settings?.ai?.lastLocalBenchmark?.recommendedId||''),
      recommendedLabel:String(payload?.localResult?.recommendedLabel||settings?.ai?.lastLocalBenchmark?.recommendedLabel||'')
    },
    pipeline:{
      mode:pipelineMode,
      validated:!!payload.validated||String(payload.source||'optimizer')==='optimizer',
      swapValidated,
      coordinatedValidated:pipelineMode==='gpu-coordinated'&&!!(payload?.localResult?.summary?.coordinatedValidated||payload?.localResult?.coexistence?.coordinatedValidated),
      simultaneousSafe:pipelineMode==='simultaneous'
    },
    voiceConsistency:{
      mode:engine==='qwen3tts'||engine==='chatterbox'?'stable-v1':'default',
      source:engine==='qwen3tts'&&identity.mode==='finetuned'?'fine-tuned-model':engine==='chatterbox'?'reference-audio':engine==='qwen3tts'?'reference-audio':'builtin',
      productionTemperature:stableTemp,
      productionSeed,
      chunkDiagnostics:true,
      naturalSpeed:true
    }
  };
  if(profile.pipeline.mode==='gpu-swap'&&!profile.pipeline.swapValidated){
    profile.pipeline.mode='gpu-coordinated';
    profile.pipeline.downgradedFrom='gpu-swap-unvalidated';
  }
  return profile;
}
function compatibility(settings={},profile=null){
  if(!profile)return{ok:false,reason:'sin perfil de producción'};
  if(Number(profile.schemaVersion)!==PROFILE_SCHEMA)return{ok:false,reason:'perfil antiguo'};
  if(String(profile.version||'')!==PROFILE_VERSION)return{ok:false,reason:`perfil ${profile.version||'anterior'} pendiente de revalidación ${PROFILE_VERSION}`};
  if(profile.pipeline?.validated!==true)return{ok:false,reason:'perfil pendiente de revalidación lab.16'};
  if(profile.pipeline?.mode==='gpu-coordinated'&&profile.pipeline?.coordinatedValidated!==true)return{ok:false,reason:'GPU coordinada no fue validada con la prueba secuencial lab.16'};
  if(profile.pipeline?.mode==='gpu-swap'&&profile.pipeline?.swapValidated!==true)return{ok:false,reason:'GPU SWAP no validado'};
  const tts=settings.tts||{},engine=String(tts.engine||'kokoro');
  if(String(profile.tts?.engine||'')!==engine)return{ok:false,reason:'motor TTS distinto'};
  const sig=ttsRuntimeSignature(tts);
  if(profile.runtimeSignature&&sig!==profile.runtimeSignature)return{ok:false,reason:'runtime/modelo TTS cambió'};
  if(engine==='qwen3tts'){
    const id=qwenModelIdentity(tts);
    if(String(profile.tts?.modelId||'')!==String(id.id||''))return{ok:false,reason:'modelo fine-tuned distinto'};
    if(profile.tts?.modelFingerprint&&String(profile.tts.modelFingerprint)!==String(id.fingerprint||''))return{ok:false,reason:'fingerprint del modelo cambió'};
    if(id.mode!=='finetuned'&&String(profile.tts?.referenceVoiceId||'')!==String(tts.referenceVoiceId||''))return{ok:false,reason:'referencia Qwen distinta'};
  }
  if(engine==='chatterbox'&&String(profile.tts?.referenceVoiceId||'')!==String(tts.referenceVoiceId||''))return{ok:false,reason:'voz de referencia Chatterbox distinta'};
  return{ok:true,reason:''};
}
function hydrateSettings(settings={},root=dataRoot()){
  const s=settings&&typeof settings==='object'?settings:{};
  let profile=readJson(profileFile(root),null);
  const cmp=compatibility(s,profile);
  if(profile){
    s.activeOptimizationV2={...clone(profile),valid:cmp.ok,invalidReason:cmp.reason||''};
  }
  if(!profile||!cmp.ok)return s;
  s.ai=s.ai||{};s.tts=s.tts||{};s.tts.engineParams=s.tts.engineParams||{};
  if(profile.localAi?.required){
    s.ai.localResourceMode='tuned';
    s.ai.localAutoTuned=true;
    s.ai.localTunedConfig=clone(profile.localAi.config);
    s.ai.lastLocalBenchmark={...(s.ai.lastLocalBenchmark||{}),tokensPerSec:Number(profile.localAi.expectedTokensPerSec||0),coexistenceMode:String(profile.pipeline?.mode||'gpu-coordinated'),swapValidated:!!profile.pipeline?.swapValidated,recommendedId:String(profile.localAi.recommendedId||''),recommendedLabel:String(profile.localAi.recommendedLabel||'')};
  }
  if(profile.tts?.engine==='qwen3tts'){
    s.tts.engineParams.qwen3tts={...(s.tts.engineParams.qwen3tts||{}),...(profile.tts.runtimeParams||{})};
  }else if(profile.tts?.engine==='chatterbox'){
    s.tts.engineParams.chatterbox={...(s.tts.engineParams.chatterbox||{}),...(profile.tts.runtimeParams||{})};
  }
  s.tts.speed=1;
  if(s.optimization0321){
    s.optimization0321={...s.optimization0321,version:PROFILE_VERSION,productionProfileId:profile.id,local:{...(s.optimization0321.local||{}),coexistenceMode:String(profile.pipeline?.mode||'gpu-coordinated')}};
  }
  return s;
}
function migrateLegacy(settings={},root=dataRoot()){
  if(readJson(profileFile(root),null))return null;
  const o=settings?.optimization0321,local=settings?.ai?.localTunedConfig;
  if(!o||!settings?.ai?.localAutoTuned||!local)return null;
  const p=buildProfile(settings,{
    source:'legacy-lab15-migration',
    fingerprint:o.fingerprint||'',
    hardwareLabel:o.hardwareLabel||'',
    localResult:{recommendedConfig:local,summary:settings?.ai?.lastLocalBenchmark||o.local||{},recommendedId:settings?.ai?.lastLocalBenchmark?.recommendedId||'',recommendedLabel:settings?.ai?.lastLocalBenchmark?.recommendedLabel||''},
    ttsResult:{stableRealtimeFactor:o?.voice?.medianRtf||0},
    validated:false
  });
  atomicJson(profileFile(root),p);
  return p;
}
function expectedVsRuntime(profile,status={}){
  if(!profile?.localAi?.required)return{ok:true,reason:'IA local no requerida',expected:null,active:null,differences:[]};
  const expected=configComparable(profile.localAi.config),active=configComparable(status.profile||{});
  const modeOk=String(status.resourceMode||'')==='tuned';
  const differences=Object.keys(expected).filter(k=>expected[k]!==active[k]).map(k=>({field:k,expected:expected[k],active:active[k]}));
  const ok=modeOk&&!differences.length;
  const diffText=differences.map(d=>`${d.field}: esperado ${d.expected}, activo ${d.active}`).join(' · ');
  return{ok,reason:ok?'':!modeOk?`LocalRuntime activo en ${status.resourceMode||'desconocido'}, se esperaba tuned`:`La configuración local activa no coincide con el perfil optimizado${diffText?`: ${diffText}`:''}`,expected,active,differences};
}
async function currentStatus(root=dataRoot()){
  const store=new SettingsStore(root),settings=store.load(),profile=settings.activeOptimizationV2||null,cmp=profile?{ok:profile.valid!==false,reason:profile.invalidReason||''}:{ok:false,reason:'sin perfil de producción'};
  let runtime=null,match={ok:!profile?.localAi?.required,reason:'LocalRuntime todavía no inicializado'};
  const local=global.__ec0320LocalRuntime;
  if(local?.status){try{runtime=await local.status();match=expectedVsRuntime(profile,runtime);}catch(e){match={ok:false,reason:String(e?.message||e)};}}
  return{ok:true,profile,compatible:cmp.ok,reason:cmp.reason||'',runtime,profileMatch:match};
}
async function commitProfile(payload={}){
  const root=dataRoot(),store=new SettingsStore(root),settings=store.load(),profile=buildProfile(settings,{...payload,source:'optimizer',validated:true});
  atomicJson(profileFile(root),profile);
  const local=global.__ec0320LocalRuntime;
  if(profile.localAi.required&&local?.configure){
    local.configure('tuned',profile.localAi.config);
  }
  return currentStatus(root);
}

function installSettingsHydration(){
  const p=SettingsStore.prototype;if(p.__gecV2ProductionProfile)return;Object.defineProperty(p,'__gecV2ProductionProfile',{value:true});
  const baseLoad=p.load,baseSave=p.save;
  p.load=function(){
    const s=baseLoad.call(this),root=this.baseDir||dataRoot();
    if(!readJson(profileFile(root),null))migrateLegacy(s,root);
    return hydrateSettings(s,root);
  };
  p.save=function(settings){
    const s=clone(settings)||{};delete s.activeOptimizationV2;
    return baseSave.call(this,s);
  };
}
function productionProfileFrom(settings={}){const p=settings.activeOptimizationV2;return p&&p.valid!==false?p:null;}
function resolvePipelineMode(settings={}){
  const engine=String(settings?.tts?.engine||'kokoro');
  if(engine==='kokoro')return'split';
  const usesLocal=localRequired(settings);if(!usesLocal)return'split';
  const profile=productionProfileFrom(settings);
  if(profile?.pipeline?.validated){
    const mode=String(profile.pipeline.mode||'gpu-coordinated');
    if(mode==='gpu-swap'&&!profile.pipeline.swapValidated)return'gpu-coordinated';
    if(PIPELINE_MODES.has(mode))return mode;
  }
  const legacy=String(settings?.ai?.lastLocalBenchmark?.coexistenceMode||settings?.optimization0321?.local?.coexistenceMode||'');
  if(legacy==='simultaneous'||legacy==='gpu-coordinated')return legacy;
  if(legacy==='gpu-swap'&&settings?.ai?.lastLocalBenchmark?.swapValidated===true)return'gpu-swap';
  return'gpu-coordinated';
}
async function preflightAutomation(engine){
  const s=engine.getSettings?.()||{},rawProfile=s.activeOptimizationV2||null,profile=productionProfileFrom(s);
  engine.__v2ProductionProfile=profile||null;
  if(rawProfile&&rawProfile.valid===false){const e=new Error(`El perfil optimizado necesita revalidación antes de producción: ${rawProfile.invalidReason||'ejecuta Optimizar GEC'}`);e.code='PRODUCTION_PROFILE_INVALID';throw e;}
  if(!profile&&s.optimization0321){const e=new Error('Existe una optimización anterior, pero falta el perfil de producción lab.16. Ejecuta Optimizar GEC una vez.');e.code='PRODUCTION_PROFILE_REOPTIMIZE_REQUIRED';throw e;}
  if(!profile)return{ok:true,optimized:false,pipeline:resolvePipelineMode(s),reason:'sin perfil previo; modo coordinado seguro explícito'};
  if(profile.localAi?.required){
    const local=engine.localRuntime||global.__ec0320LocalRuntime;
    if(!local?.configure||!local?.status){const e=new Error('No se encontró la instancia de Qwen local para aplicar el perfil optimizado');e.code='PRODUCTION_PROFILE_RUNTIME_MISSING';throw e;}
    local.configure('tuned',profile.localAi.config);
    const st=await local.status(),match=expectedVsRuntime(profile,st);
    if(!match.ok){const e=new Error(`Perfil optimizado no aplicado: ${match.reason}`);e.code='PRODUCTION_PROFILE_MISMATCH';e.details=match;throw e;}
    engine.__v2ProfileRuntime=st;
  }
  return{ok:true,optimized:true,pipeline:resolvePipelineMode(s),profileId:profile.id};
}
function installAutomationFidelity(){
  const p=AutomationEngine.prototype;if(p.__gecV2ProductionFidelity)return;Object.defineProperty(p,'__gecV2ProductionFidelity',{value:true});
  const baseMode=p.coexistenceMode,baseStart=p.startProcessing,baseStop=p.stopProcessing,baseProcess=p.process;
  p.coexistenceMode=function(settings=this.getSettings?.()||{}){const mode=resolvePipelineMode(settings);return mode||baseMode.call(this,settings);};
  if(typeof baseStart==='function')p.startProcessing=async function(...args){const check=await preflightAutomation(this);this.__v2Preflight=check;return baseStart.apply(this,args);};
  if(typeof baseStop==='function')p.stopProcessing=function(...args){const out=baseStop.apply(this,args);const queued=Array.isArray(this.gpuStageQueue)?this.gpuStageQueue.splice(0):[];for(const req of queued){try{clearTimeout(req.queueTimer);const e=new Error('Preparación detenida por el usuario');e.code='PROCESSING_CANCELLED';req.reject?.(e);}catch{}}this.processingNotice='Deteniendo motores y liberando GPU…';this.state?.();Promise.allSettled([Promise.resolve(this.kokoro?.stopAndWait?.('processing-stop-lab16',7000)),Promise.resolve(this.localRuntime?.stopAndWait?.('processing-stop-lab16',7000))]).then(()=>{if(!this.processingRunning){this.processingNotice='Preparación detenida · motores liberados ✓';this.state?.();}});return out;};
  if(typeof baseProcess==='function')p.process=async function(story,s,holder,epoch){
    const out=await baseProcess.call(this,story,s,holder,epoch);if(!out||out.omitted)return out;
    const active=productionProfileFrom(s)||this.__v2ProductionProfile,metrics={...(out.metrics||{})};
    if(active){
      const expectedLayers=Number(active.localAi?.config?.gpuLayers||0),actualLayers=Number(metrics.localGpuLayers||metrics.gpuLayers||0),expectedTps=Number(active.localAi?.expectedTokensPerSec||0),actualTps=Number(metrics.localTokensPerSec||metrics.tokensPerSec||metrics.textTokensPerSec||0),ratio=expectedTps>0&&actualTps>0?actualTps/expectedTps:0;
      Object.assign(metrics,{
        productionProfileId:active.id,
        productionProfileVersion:active.version,
        profileExpectedGpuLayers:expectedLayers,
        profileActiveGpuLayers:actualLayers,
        profileLocalConfigMatch:!active.localAi?.required||actualLayers===expectedLayers,
        profileExpectedTokensPerSec:expectedTps,
        profileTokensPerSecRatio:Number(ratio.toFixed(3)),
        profilePerformanceDegraded:ratio>0&&ratio<0.55,
        pipelineModeExpected:String(active.pipeline?.mode||''),
        pipelineModeActive:this.coexistenceMode(s),
        ttsExpectedRtf:Number(active.tts?.expectedRtf||0),
        ttsExpectedChunkChars:Number(active.tts?.runtimeParams?.chunkChars||0),
        ttsProductionTemperature:Number(active.tts?.runtimeParams?.productionTemperature||0),
        ttsProductionSeed:Number(active.tts?.runtimeParams?.productionSeed||0),
        voiceConsistencyMode:String(active.voiceConsistency?.mode||'default'),
        voiceConsistencySource:String(active.voiceConsistency?.source||'')
      });const degraded=ratio>0&&ratio<0.55;this.__v2DegradedCount=degraded?Number(this.__v2DegradedCount||0)+1:0;if(this.__v2DegradedCount>=2){metrics.profilePerformanceWarning=`Rendimiento de IA local por debajo del perfil validado en ${this.__v2DegradedCount} noticias consecutivas`;this.processingNotice='Advertencia: el rendimiento real está por debajo del perfil optimizado. Revisa Detalles técnicos.';this.state?.();}
    }
    if(out.audio?.chunkDiagnostics)metrics.ttsChunkDiagnostics=clone(out.audio.chunkDiagnostics);
    out.metrics=metrics;if(holder)holder.metrics=metrics;return out;
  };
}
function installIpc(){
  const bind=(name,fn)=>{try{ipcMain.removeHandler(name);}catch{}ipcMain.handle(name,fn);};
  bind('optimization-v2:status',()=>currentStatus());
  bind('optimization-v2:commit',(_,payload={})=>commitProfile(payload));
  bind('optimization-v2:clear',()=>{try{fs.rmSync(profileFile(),{force:true});}catch{}return{ok:true};});
}
function installV2ProductionFidelity(){installSettingsHydration();installAutomationFidelity();installIpc();}
module.exports={PROFILE_SCHEMA,PROFILE_VERSION,PROFILE_FILE,profileFile,buildProfile,compatibility,hydrateSettings,migrateLegacy,resolvePipelineMode,expectedVsRuntime,productionProfileFrom,normalizeLocalConfig,sameConfig,installV2ProductionFidelity};
