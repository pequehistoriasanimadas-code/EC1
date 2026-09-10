'use strict';

const fs=require('fs');
const path=require('path');
const {app,BrowserWindow,ipcMain}=require('electron');
const {AutomationEngine}=require('./automation0325');
const {SettingsStore}=require('./settings');
const {getProfileManager}=require('./profileManager0329');
const fidelity=require('./releaseV2ProductionFidelity');

const SIDE_SCHEMA=1;
const SIDE_FILE='optimization-lab28.json';
const LEGACY_PROFILE_FILE='active-production-profile.json';
const DEFAULT_PROMO_CTA='Puedes ver el video aquí:';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
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
function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function activeProfile(base=dataRoot()){const m=getProfileManager(base),id=String(m.activeId?.()||'');return{m,id};}
function sideFile(base=dataRoot(),id=''){const ctx=activeProfile(base),profileId=String(id||ctx.id||'');return profileId?path.join(ctx.m.profileDir(profileId),SIDE_FILE):path.join(base,'profiles','_no-profile',SIDE_FILE);}
function legacyProfileFile(base=dataRoot()){return path.join(base,'tts-lab',LEGACY_PROFILE_FILE);}
function readSide(base=dataRoot(),id=''){return readJson(sideFile(base,id),null);}
function writeSide(base,id,value){atomicJson(sideFile(base,id),{schemaVersion:SIDE_SCHEMA,updatedAt:new Date().toISOString(),...value});}
function promoCta(settings={}){const value=settings?.visual?.output?.youtubePromoCtaText;return value==null?DEFAULT_PROMO_CTA:String(value);}

function applyProductionProfile(settings,profile){
  const s=settings&&typeof settings==='object'?settings:{};
  if(!profile)return s;
  const cmp=fidelity.compatibility(s,profile);
  s.activeOptimizationV2={...clone(profile),valid:cmp.ok,invalidReason:cmp.reason||''};
  if(!cmp.ok)return s;
  s.ai=s.ai||{};s.tts=s.tts||{};s.tts.engineParams=s.tts.engineParams||{};
  if(profile.localAi?.required){
    s.ai.localResourceMode='tuned';s.ai.localAutoTuned=true;s.ai.localTunedConfig=clone(profile.localAi.config);
    s.ai.lastLocalBenchmark={...(s.ai.lastLocalBenchmark||{}),tokensPerSec:Number(profile.localAi.expectedTokensPerSec||0),coexistenceMode:String(profile.pipeline?.mode||'gpu-coordinated'),swapValidated:!!profile.pipeline?.swapValidated,recommendedId:String(profile.localAi.recommendedId||''),recommendedLabel:String(profile.localAi.recommendedLabel||'')};
  }
  if(profile.tts?.engine==='qwen3tts')s.tts.engineParams.qwen3tts={...(s.tts.engineParams.qwen3tts||{}),...(profile.tts.runtimeParams||{})};
  else if(profile.tts?.engine==='chatterbox')s.tts.engineParams.chatterbox={...(s.tts.engineParams.chatterbox||{}),...(profile.tts.runtimeParams||{})};
  s.tts.speed=1;
  if(s.optimization0321)s.optimization0321={...s.optimization0321,productionProfileId:profile.id,local:{...(s.optimization0321.local||{}),coexistenceMode:String(profile.pipeline?.mode||'gpu-coordinated')}};
  return s;
}
function migrateSide(base,settings){
  const {id}=activeProfile(base);if(!id)return null;
  const existing=readSide(base,id);if(existing)return existing;
  const legacyProfile=readJson(legacyProfileFile(base),null),legacyOptimization=clone(settings?.optimization0321||null);
  if(!legacyProfile&&!legacyOptimization)return null;
  const value={cleared:false,optimization0321:legacyOptimization,productionProfile:legacyProfile,source:'lab27-global-migration'};
  writeSide(base,id,value);return value;
}
function installProfileScopedOptimization(){
  const p=SettingsStore.prototype;if(p.__ecLab28ProfileOptimization)return;Object.defineProperty(p,'__ecLab28ProfileOptimization',{value:true});
  const baseLoad=p.load,baseSave=p.save;
  p.load=function(...args){
    const base=this.baseDir||dataRoot(),s=baseLoad.apply(this,args),{id}=activeProfile(base);if(!id)return s;
    const side=readSide(base,id)||migrateSide(base,s);
    if(!side)return s;
    if(side.cleared===true){delete s.optimization0321;delete s.activeOptimizationV2;return s;}
    if(Object.prototype.hasOwnProperty.call(side,'optimization0321')){
      if(side.optimization0321)s.optimization0321=clone(side.optimization0321);else delete s.optimization0321;
    }
    if(side.productionProfile)applyProductionProfile(s,side.productionProfile);else delete s.activeOptimizationV2;
    return s;
  };
  p.save=function(settings,...args){
    const base=this.baseDir||dataRoot(),{id}=activeProfile(base),copy=clone(settings)||{};
    if(id&&Object.prototype.hasOwnProperty.call(copy,'optimization0321')){
      const old=readSide(base,id)||{};
      writeSide(base,id,{...old,cleared:false,optimization0321:clone(copy.optimization0321||null)});
    }
    return baseSave.call(this,settings,...args);
  };

  const status=async()=>{
    const base=dataRoot(),store=new SettingsStore(base),settings=store.load(),{id}=activeProfile(base),side=id?readSide(base,id):null,profile=side?.cleared?null:(side?.productionProfile||settings.activeOptimizationV2||null),cmp=profile?fidelity.compatibility(settings,profile):{ok:false,reason:'sin perfil de producción'};
    let runtime=null,match={ok:!profile?.localAi?.required,reason:profile?.localAi?.required?'LocalRuntime todavía no inicializado':'IA local no requerida'};
    const local=global.__ec0320LocalRuntime;
    if(profile?.localAi?.required&&local?.status){try{runtime=await local.status();match=fidelity.expectedVsRuntime(profile,runtime);}catch(e){match={ok:false,reason:String(e?.message||e)};}}
    return{ok:true,profileId:id,profile:profile?{...clone(profile),valid:cmp.ok,invalidReason:cmp.reason||''}:null,compatible:cmp.ok,reason:cmp.reason||'',runtime,profileMatch:match,profileScoped:true};
  };
  const commit=async(payload={})=>{
    const base=dataRoot(),store=new SettingsStore(base),settings=store.load(),{id}=activeProfile(base);if(!id)throw new Error('No hay un perfil activo');
    const profile=fidelity.buildProfile(settings,{...payload,source:'optimizer',validated:true}),old=readSide(base,id)||{};
    writeSide(base,id,{...old,cleared:false,optimization0321:clone(settings.optimization0321||old.optimization0321||null),productionProfile:profile,source:'lab28-profile-optimizer'});
    const local=global.__ec0320LocalRuntime;if(profile.localAi?.required&&local?.configure)local.configure('tuned',profile.localAi.config);
    return status();
  };
  const clear=async()=>{const base=dataRoot(),{id}=activeProfile(base);if(id)writeSide(base,id,{cleared:true,optimization0321:null,productionProfile:null,source:'lab28-clear'});return{ok:true,profileId:id,profileScoped:true};};
  for(const name of ['optimization-v2:status','optimization-v2:commit','optimization-v2:clear'])try{ipcMain.removeHandler(name);}catch{}
  ipcMain.handle('optimization-v2:status',status);ipcMain.handle('optimization-v2:commit',(_,payload={})=>commit(payload));ipcMain.handle('optimization-v2:clear',clear);
}

function installProducerFallback(){
  const p=AutomationEngine.prototype;if(p.__ecLab28ProducerFallback)return;Object.defineProperty(p,'__ecLab28ProducerFallback',{value:true});
  p.producer=async function(epoch){
    while(this.processingRunning&&epoch===this.processingEpoch){try{
      if(this.processingPaused){await wait(350);continue;}
      if(Date.now()<this.badSourceBackoffUntil){await wait(Math.min(900,this.badSourceBackoffUntil-Date.now()));continue;}
      if(this.documentWorkerRunning){this.processingNotice='Generador de Notas trabajando; se reserva CPU antes de preparar otra noticia.';await wait(250);continue;}
      const s=this.getSettings(),target=Math.max(1,Math.min(30,Number(s.automation?.bufferReady)||15)),readyCount=this.readyItems().length,sched=this.processingSchedulerState(s),needDueExclusive=sched.everyNews>0&&sched.due,desired=target+(needDueExclusive?1:0),voiceBacklog=this.gpuStageQueue.filter(x=>x.kind==='voice').length+(this.gpuStageCurrent==='voice'?1:0),maxWorkers=voiceBacklog>=2?1:2;
      if(this.inFlight.size>=maxWorkers||readyCount+this.inFlight.size>=desired){this.processingNotice=readyCount>=target?`Reserva lista: ${readyCount}/${target} noticias · ${this.exclusiveReserve.length} exclusiva(s) reservada(s).`:`Preparando reserva: ${readyCount}/${target} listas · ${this.inFlight.size} en proceso.`;this.kickDocumentWorker();await wait(280);continue;}
      const maxQueue=Math.max(target+2,Math.min(60,Number(s.automation?.queueMax)||30)),activeCount=this.queue.filter(x=>!x.history&&x.status!=='EMITIDA').length;if(activeCount>=maxQueue){await wait(450);continue;}
      await this.refreshFeedCache(s,false);this.reserveKnownExclusives(this.cachedItems,s);
      let candidate=null,publicFallback=false;
      if(needDueExclusive){
        if(this.exclusiveReserve.length){const reserved=this.takeReservedExclusive(s);if(reserved){this.lastNoRssAt=0;this.processingNotice=`Turno de exclusiva en la reserva de preparación · preparando una de ${this.exclusiveReserve.length+1} reservada(s).`;this.launchCandidate(reserved.story,s,epoch,{forceExclusiveDue:true,reservedArticle:reserved.article,fromReserve:true});await wait(100);continue;}}
        candidate=this.candidateFrom(this.cachedItems,s,{exclusiveOnly:true});
        if(!candidate){
          await this.refreshFeedCache(s,true);this.reserveKnownExclusives(this.cachedItems,s);
          if(this.exclusiveReserve.length){const reserved=this.takeReservedExclusive(s);if(reserved){this.lastNoRssAt=0;this.processingNotice=`Turno de exclusiva en la reserva de preparación · preparando una de ${this.exclusiveReserve.length+1} reservada(s).`;this.launchCandidate(reserved.story,s,epoch,{forceExclusiveDue:true,reservedArticle:reserved.article,fromReserve:true});await wait(100);continue;}}
          candidate=this.candidateFrom(this.cachedItems,s,{exclusiveOnly:true});
        }
        if(!candidate){candidate=this.candidateFrom(this.cachedItems,s,{publicOnly:true});publicFallback=!!candidate;if(candidate)candidate.__ecSelectionReason='fallback público: exclusiva no disponible';}
      }else{
        candidate=this.candidateFrom(this.cachedItems,s,{publicOnly:true});
        if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){await this.refreshFeedCache(s,true);this.reserveKnownExclusives(this.cachedItems,s);candidate=this.candidateFrom(this.cachedItems,s,{publicOnly:true});}
      }
      if(!candidate){if(!this.lastNoRssAt)this.lastNoRssAt=Date.now();this.processingNotice=needDueExclusive?'No hay exclusiva ni noticia pública elegible; esperando actualización de las fuentes.':`Buscando noticias sin candado · faltan ${sched.nonExclusiveNeeded} pública(s) en la secuencia de preparación · ${this.exclusiveReserve.length} reservada(s).`;this.state();this.kickDocumentWorker();await wait(1800);continue;}
      this.lastNoRssAt=0;this.processingNotice=publicFallback?'Turno exclusivo sin candidata disponible · continuando con noticia pública para no detener la reserva.':needDueExclusive?`Preparando exclusiva del turno · ${this.exclusiveReserve.length} reservada(s).`:`Priorizando noticia sin candado · faltan ${sched.nonExclusiveNeeded} pública(s) para el siguiente turno exclusivo.`;
      this.launchCandidate(candidate,s,epoch,{forceExclusiveDue:needDueExclusive&&this.knownExclusive(candidate,s)});await wait(100);
    }catch(e){this.emit('engine-error',e);await wait(900);}}
  };
}

function installActualYoutubeSnapshot(){
  const p=AutomationEngine.prototype;if(p.__ecLab28YoutubeSnapshot)return;const basePlay=p.playCanned;if(typeof basePlay!=='function')return;Object.defineProperty(p,'__ecLab28YoutubeSnapshot',{value:true});
  p.playCanned=async function(...args){
    const originalSend=this.sendAutomaticOutput;if(typeof originalSend!=='function')return basePlay.apply(this,args);
    this.sendAutomaticOutput=(payload)=>{
      let next=payload;const role=String(payload?.mediaRole||'');
      if(role==='content'&&this.currentCanned?.youtubePromo){const cta=promoCta(this.getSettings?.()||{});next={...payload,youtubePromo:{...clone(this.currentCanned.youtubePromo),ctaText:cta}};}
      else if(role==='ad')next={...payload,youtubePromo:null};
      return originalSend.call(this,next);
    };
    try{return await basePlay.apply(this,args);}finally{this.sendAutomaticOutput=originalSend;}
  };
}

function injectFile(win,file,kind){try{const full=path.join(__dirname,'..',file);if(!fs.existsSync(full))return;if(kind==='css'){win.webContents.insertCSS(fs.readFileSync(full,'utf8')).catch(()=>{});return;}const code=fs.readFileSync(full,'utf8');win.webContents.executeJavaScript(`(()=>{${code}\n})()`,true).catch(()=>{});}catch{}}
function injectWindow(win){if(!win||win.isDestroyed())return;const run=()=>{if(!win||win.isDestroyed())return;const url=String(win.webContents.getURL()||'');if(/control\.html(?:[?#]|$)/i.test(url)){injectFile(win,'control-stabilization-lab28.css','css');injectFile(win,'renderer-stabilization-lab28.js','js');}else if(/output\.html(?:[?#]|$)/i.test(url)){injectFile(win,'output-stabilization-lab28.css','css');injectFile(win,'output-stabilization-lab28.js','js');}};win.webContents.on('did-finish-load',run);setTimeout(run,0);}
function installWindowInjection(){app.on('browser-window-created',(_,win)=>injectWindow(win));for(const win of BrowserWindow.getAllWindows())injectWindow(win);}

function installReleaseV2Stabilization(){if(installed)return;installed=true;installProfileScopedOptimization();installProducerFallback();installActualYoutubeSnapshot();installWindowInjection();}

module.exports={SIDE_FILE,DEFAULT_PROMO_CTA,dataRoot,sideFile,promoCta,applyProductionProfile,installReleaseV2Stabilization};
