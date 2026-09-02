'use strict';

const path=require('path');
const crypto=require('crypto');
const {app,ipcMain,BrowserWindow}=require('electron');
const {ProfileManager0329,getProfileManager,readJson,atomicJson}=require('./profileManager0329');
const {ProfilePackage0329}=require('./profilePackage0329');
const profilePolicy=require('./profilePolicy0329');
const {AutomationEngine}=require('./automation0325');
const {baseStoryKey}=require('./storyKey0324');

const AI_PHYSICAL_KEYS=new Set(['localResourceMode','localAutoTuned','localTunedConfig','lastLocalBenchmark','performanceConfig','lastBenchmark','lastHardwareBenchmark','lastAdvancedBenchmark','benchmark','hardware','acceleration']);
const TTS_PROFILE_KEYS=new Set(['voice','speed']);
const TTS_MACHINE_KEYS=new Set(['performanceThreads','resourceMode','autoTune','autoTuned','benchmark','lastBenchmark','gpuProvider','performanceConfig','lastAdvancedBenchmark','lastHardwareBenchmark','acceleration','maxSafeThreads','recommendedThreads']);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const dynamicPattern=/\b(?:hor[oó]scopo|feriados?|calendario|tabla de posiciones|ranking|resultados?|cotizaciones?|predicciones?|fixture)\b/i;

function dataRoot(){const portable=process.env.PORTABLE_EXECUTABLE_DIR;if(portable)return path.join(portable,'EC Automatic News Data');if(app.isPackaged)return path.join(path.dirname(process.execPath),'EC Automatic News Data');return path.join(app.getPath('userData'),'EC Automatic News Data');}
function manager(){return global.__ec0329ProfileManager||getProfileManager(dataRoot());}
function controlWindow(){return BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&!/OUTPUT/i.test(w.getTitle?.()||''))||null;}
function outputWindows(){return BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()&&(/OUTPUT/i.test(w.getTitle?.()||'')||/output\.html/i.test(w.webContents?.getURL?.()||'')));}

function stripProfilePhysical(settings={}){
  const out=clone(settings)||{};delete out.optimization0321;
  if(out.ai)for(const k of AI_PHYSICAL_KEYS)delete out.ai[k];
  if(out.tts){for(const k of Object.keys(out.tts))if(!TTS_PROFILE_KEYS.has(k))delete out.tts[k];}
  return out;
}
function physicalFrom(settings={}){
  const out={ai:{},tts:{}};if(settings.optimization0321)out.optimization0321=clone(settings.optimization0321);
  for(const k of AI_PHYSICAL_KEYS)if(settings.ai&&settings.ai[k]!==undefined)out.ai[k]=clone(settings.ai[k]);
  for(const k of TTS_MACHINE_KEYS)if(settings.tts&&settings.tts[k]!==undefined)out.tts[k]=clone(settings.tts[k]);
  return out;
}
function applyPhysical(target={},physical={}){
  const out=clone(target)||{};out.ai={...(out.ai||{})};out.tts={...(out.tts||{})};
  if(physical.optimization0321)out.optimization0321=clone(physical.optimization0321);
  for(const[k,v]of Object.entries(physical.ai||{}))out.ai[k]=clone(v);
  for(const[k,v]of Object.entries(physical.tts||{}))out.tts[k]=clone(v);
  if(out.ai.localAutoTuned===true&&out.ai.localTunedConfig)out.ai.localResourceMode='tuned';
  return out;
}
function sanitizeExportPhysical(settings={}){
  const out=clone(settings)||{};delete out.optimization0321;if(out.ai)for(const k of AI_PHYSICAL_KEYS)delete out.ai[k];if(out.tts)for(const k of TTS_MACHINE_KEYS)delete out.tts[k];return out;
}
function optimizationTime(opt={}){const n=Date.parse(opt.at||opt.updatedAt||'');return Number.isFinite(n)?n:0;}
function migrateOptimizationForFingerprint(m,fingerprint){
  const fp=String(fingerprint||'');if(!fp)return{ok:false,changed:false,reason:'fingerprint-empty'};
  const globalRaw=readJson(m.globalSettingsFile,{})||{},candidates=[];
  if(globalRaw.optimization0321?.fingerprint===fp)candidates.push({source:'global',settings:globalRaw,opt:globalRaw.optimization0321});
  for(const meta of m.list()){const raw=readJson(m.profileSettingsFile(meta.id),{})||{};if(raw.optimization0321?.fingerprint===fp)candidates.push({source:meta.id,settings:raw,opt:raw.optimization0321});}
  candidates.sort((a,b)=>optimizationTime(b.opt)-optimizationTime(a.opt));const winner=candidates[0]||null;
  let nextGlobal=clone(globalRaw)||{},changed=false;
  if(winner){const p=physicalFrom(winner.settings);nextGlobal=applyPhysical(nextGlobal,p);if(JSON.stringify(nextGlobal)!==JSON.stringify(globalRaw)){atomicJson(m.globalSettingsFile,nextGlobal);changed=true;}}
  for(const meta of m.list()){const file=m.profileSettingsFile(meta.id),raw=readJson(file,{})||{},clean=stripProfilePhysical(raw);if(JSON.stringify(clean)!==JSON.stringify(raw)){atomicJson(file,clean);changed=true;}}
  return{ok:true,changed,matched:!!winner,source:winner?.source||'',optimization:nextGlobal.optimization0321||null};
}

function installGlobalTuning(){
  const p=ProfileManager0329.prototype;if(p.__ec0330GlobalTuning)return;Object.defineProperty(p,'__ec0330GlobalTuning',{value:true});
  const read=p.readProfileSettings,write=p.writeProfileSettings,effective=p.effectiveSettings,save=p.saveEffective;
  p.readProfileSettings=function(id){return stripProfilePhysical(read.call(this,id));};
  p.writeProfileSettings=function(id,settings){return write.call(this,id,stripProfilePhysical(settings));};
  p.effectiveSettings=function(defaults){let out=effective.call(this,defaults),globalRaw=readJson(this.globalSettingsFile,{})||{};out=applyPhysical(out,physicalFrom(globalRaw));return out;};
  p.saveEffective=function(defaults,effectiveSettings){const incoming=clone(effectiveSettings)||{},physical=physicalFrom(incoming),result=save.call(this,defaults,incoming),globalRaw=readJson(this.globalSettingsFile,{})||{},next=applyPhysical(globalRaw,physical);if(JSON.stringify(next)!==JSON.stringify(globalRaw))atomicJson(this.globalSettingsFile,next);return applyPhysical(result,physicalFrom(next));};
  try{ipcMain.removeHandler('optimization:migrateGlobal');}catch{}ipcMain.handle('optimization:migrateGlobal',(_,fingerprint)=>migrateOptimizationForFingerprint(manager(),String(fingerprint||'')));
}

function installPackageTuningGuard(){
  const p=ProfilePackage0329.prototype;if(p.__ec0330TuningGuard)return;Object.defineProperty(p,'__ec0330TuningGuard',{value:true});const profile=p.profilePayload,all=p.allPayload,imp=p.importFile;
  p.profilePayload=function(...args){const payload=profile.apply(this,args);for(const row of payload.profiles||[])row.settings=stripProfilePhysical(row.settings||{});return payload;};
  p.allPayload=function(...args){const payload=all.apply(this,args);payload.globalSettings=sanitizeExportPhysical(payload.globalSettings||{});for(const row of payload.profiles||[])row.settings=stripProfilePhysical(row.settings||{});return payload;};
  p.importFile=function(...args){const before=readJson(this.manager.globalSettingsFile,{})||{},machine=physicalFrom(before),result=imp.apply(this,args);let after=readJson(this.manager.globalSettingsFile,{})||{};after=applyPhysical(after,machine);atomicJson(this.manager.globalSettingsFile,after);for(const meta of this.manager.list()){const file=this.manager.profileSettingsFile(meta.id),raw=readJson(file,{})||{},clean=stripProfilePhysical(raw);if(JSON.stringify(raw)!==JSON.stringify(clean))atomicJson(file,clean);}return result;};
}

function pending(engine){const out=[];if(engine?.inFlight?.size)out.push(`${engine.inFlight.size} noticia(s) IA/TTS`);if(engine?.documentWorkerRunning||engine?.documentWorkerPromise)out.push('Generador de Notas');if(engine?.aiStageBusy)out.push('IA local');if(engine?.voiceStageBusy)out.push('voz');if(engine?.localHeavyRunning)out.push('proceso local pesado');if(engine?.providers?.localRuntime?.generationActive)out.push('Qwen activo');if(engine?.currentKind&&engine.currentKind!=='none')out.push('reproducción actual');return[...new Set(out)];}
function resetPipeline(engine){if(!engine)return;engine.aiStageTail=Promise.resolve();engine.voiceStageTail=Promise.resolve();engine.localHeavyTail=Promise.resolve();engine.aiStageBusy=false;engine.voiceStageBusy=false;engine.localHeavyRunning=false;engine.__ec0328Reservation=null;engine.__ec0328AdReservation=null;engine.__ec0328LastContentNewsMarker=-1;engine.__ec0330ContentAnchorNews=0;engine.__ecBroadcastScheduler={sessionSeq:0,rssSinceGenerated:0,samples:[]};if(engine.providers?.localRuntime){engine.providers.localRuntime.generationTail=Promise.resolve();engine.providers.localRuntime.generationActive=false;}if(engine.kokoro?.generationTail!==undefined)engine.kokoro.generationTail=Promise.resolve();}
async function waitQuiet(engine,ms){const end=Date.now()+ms;while(Date.now()<end){if(!pending(engine).length)return true;await wait(100);}return !pending(engine).length;}
async function stopAndSwitch(id){
  const m=manager(),engine=global.__ec0329AutomationRef||global.__ec0328AutomationRef;if(id===m.activeId())return{ok:true,unchanged:true,profile:m.active()};if(!m.list().some(x=>x.id===id))throw new Error('Perfil no encontrado');
  if(engine)engine.__ec0329Switching=true;try{engine?.stopEmission?.();}catch{}try{engine?.stopProcessing?.();}catch{}for(const w of outputWindows())try{w.close();}catch{}
  let quiet=await waitQuiet(engine,2500);if(!quiet){
    try{engine?.providers?.cancelActiveRequests?.('cambio de perfil');}catch{}try{engine.processingRunning=false;engine.emissionRunning=false;engine.processingEpoch=(Number(engine.processingEpoch)||0)+1;engine.emissionEpoch=(Number(engine.emissionEpoch)||0)+1;}catch{}try{engine?.finishPlayback?.('profile-switch-force');}catch{}try{await Promise.race([Promise.resolve(engine?.kokoro?.stopAndWait?.('profile-switch-force')),wait(1800)]);}catch{}try{engine?.pronunciation?.stop?.('profile-switch-force');}catch{}try{engine?.providers?.localRuntime?.stop?.('profile-switch-force');}catch{}quiet=await waitQuiet(engine,5500);
  }
  if(!quiet){if(engine)engine.__ec0329Switching=false;const e=new Error(`Todavía no se pudo detener: ${pending(engine).join(', ')||'un proceso activo'}. Reinicia GEC para cambiar de perfil de forma segura.`);e.code='PROFILE_SWITCH_RESTART_REQUIRED';throw e;}
  if(engine){resetPipeline(engine);try{engine.__ec0329DiscardSessionDocuments?.();}catch{}profilePolicy.resetEngineSession(engine);}m.activate(id);if(engine){profilePolicy.resetEngineSession(engine);resetPipeline(engine);engine.__ec0329Switching=false;try{if(engine.canned)engine.canned.__ec0329Role='content';if(engine.ads)engine.ads.__ec0329Role='ad';}catch{}}
  try{controlWindow()?.webContents.send('profile:changed',m.status());}catch{}return{ok:true,profile:m.active(),forced:true};
}
function installSmartSwitch(){try{ipcMain.removeHandler('profiles:switch');}catch{}ipcMain.handle('profiles:switch',(_,p={})=>stopAndSwitch(String(p.id||'')));}

function installCannedLifecycle(){
  const p=AutomationEngine.prototype;if(p.__ec0330CannedLifecycle)return;Object.defineProperty(p,'__ec0330CannedLifecycle',{value:true});
  const baseReason=p.cannedReason,basePlay=p.playCanned,baseSkip=p.skipCurrent,baseReset=p.resetSessionCounters,baseProgress=p.scheduledProgress;
  p.scheduledProgress=function(interval){const n=Math.max(0,Number(interval)||0),total=Math.max(0,Number(this.scheduledNewsTotal)||0);if(!n)return{due:false,nextIn:null,progress:0};const fallback=typeof baseProgress==='function'?baseProgress.call(this,n):{},anchor=Number.isFinite(Number(this.__ec0330ContentAnchorNews))?Math.max(0,Number(this.__ec0330ContentAnchorNews)):Math.max(0,Number(this.lastScheduledCannedAt)||0),delta=Math.max(0,total-anchor);return{...fallback,due:delta>=n,nextIn:Math.max(0,n-delta),progress:Math.min(n,delta)};};
  p.cannedReason=function(s,hasReady){if(!this.emissionRunning)return'';return baseReason.call(this,s,hasReady);};
  p.playCanned=async function(s,reason){const result=await basePlay.call(this,s,reason);if(result){this.__ec0330ContentAnchorNews=Math.max(0,Number(this.scheduledNewsTotal)||0);this.lastScheduledCannedAt=this.__ec0330ContentAnchorNews;}return result;};
  p.skipCurrent=function(){if(this.emissionRunning&&this.currentKind==='canned'){this.__ec0330ContentAnchorNews=Math.max(0,Number(this.scheduledNewsTotal)||0);this.lastScheduledCannedAt=this.__ec0330ContentAnchorNews;this.__ec0328AdReservation=null;this.__ec0328Reservation=null;}return baseSkip.call(this);};
  p.resetSessionCounters=function(){this.__ec0330ContentAnchorNews=0;return baseReset.call(this);};
}

function isNewsItem(x){return!!x&&['rss','generated'].includes(x.sourceType||'rss');}
function rowFor(item){return{id:item.id||'',title:item.story?.title||item.result?.title||'',status:item.status,sourceType:item.sourceType||'rss',provider:item.provider||'',model:item.model||'',attempts:item.attempts||[],metrics:item.metrics||null,error:item.error||'',stage:item.stage||'',outputRetries:item.outputRetries||0,priority:item.priority||'normal',isExclusive:!!(item.result?.isExclusive||item.isExclusive),accessStatus:item.result?.accessStatus||item.accessStatus||item.article?.access?.status||'',feedName:String(item.story?.feedName||''),feedId:String(item.story?.feedId||''),category:String(item.result?.category||item.story?.category||''),storyUrl:String(item.story?.link||''),sessionSeq:Number(item.sessionSeq)||0};}
function projectedNews(engine,s){const remaining=(engine.queue||[]).filter(x=>x.status==='LISTA'&&isNewsItem(x)),out=[];let since=Math.max(0,Number(engine.newsSinceExclusive)||0);const every=Math.max(0,Math.min(20,Number(s?.automation?.exclusiveEveryNews)||4));while(remaining.length){let chosen;if(!every)chosen=remaining[0];else{const due=since>=Math.max(0,every-1),exclusive=remaining.find(x=>!!(x.result?.isExclusive||x.isExclusive)),normal=remaining.find(x=>!(x.result?.isExclusive||x.isExclusive));chosen=due&&exclusive?exclusive:!due&&normal?normal:remaining[0];}remaining.splice(remaining.indexOf(chosen),1);out.push(rowFor(chosen));if(chosen.result?.isExclusive||chosen.isExclusive)since=0;else since++;}return out;}
function insertPlans(ready,plans){const out=[...ready];for(const plan of plans){const after=Math.max(0,Number(plan.planAfter)||0),index=after<=0?0:Math.min(out.length,after);out.splice(index,0,{...plan});}return out;}
function installQueueProjection(){
  const p=AutomationEngine.prototype;if(p.__ec0330QueueProjection)return;Object.defineProperty(p,'__ec0330QueueProjection',{value:true});const base=p.displayQueue;
  p.displayQueue=function(s=this.getSettings?.()||{}){const baseRows=base.call(this,s),plans=baseRows.filter(x=>x.planned&&['content','ad'].includes(x.sourceType)),air=baseRows.filter(x=>x.status==='AL AIRE'),ready=projectedNews(this,s),effective=insertPlans(ready,plans),preparing=(this.queue||[]).filter(x=>isNewsItem(x)&&!['LISTA','AL AIRE','EMITIDA','ERROR'].includes(x.status)&&!(x.status==='PROCESANDO'&&x.uiVisible===false)).map(rowFor);let pos=0;const final=[];for(const row of [...air,...effective]){if(row.history)continue;final.push({...row,queueGroup:'effective',displayPosition:++pos,sessionSeq:++this.__ec0330DisplaySeq||pos});}for(const row of preparing)final.push({...row,queueGroup:'preparing',displayPosition:0,sessionSeq:0});return final;};
}

function dynamicStory(story={}){return dynamicPattern.test(`${story.title||''} ${story.description||''} ${story.link||''}`)&&!/lbposting|liveblog|live-blog|live_blog/i.test(String(story.link||''));}
function dynamicEventId(story,article){const fp=String(article?.contentFingerprint||'').trim();const stable=fp||crypto.createHash('sha256').update(`${story.title||''}|${story.pubDate||article?.pubDate||''}|${String(article?.body||'').slice(0,8000)}`).digest('hex');return`dyn-${stable.slice(0,32)}`;}
function installDynamicVersioning(){
  const p=AutomationEngine.prototype;if(p.__ec0330DynamicVersioning)return;Object.defineProperty(p,'__ec0330DynamicVersioning',{value:true});const eligible=p.eligible,fetchRetry=p.fetchArticleRetry;
  p.eligible=function(story,s){const normal=eligible.call(this,story,s);if(normal||!dynamicStory(story)||!s?.automation?.avoidRepeats||!this.history?.has?.(story.link))return normal;if(!story?.link||this.queuedUrls.has(story.link)||!this.isFeedActive(story,s)||this.isOmittedBlocked(story)||this.urlOnCooldown(story)||this.feedOnCooldown(story))return false;if((this.queue||[]).some(x=>baseStoryKey(x.story)===baseStoryKey(story)&&!['EMITIDA','ERROR'].includes(x.status)))return false;const maxAge=(Number(s.automation?.maxAgeHours)||6)*3600000,now=Date.now(),t=Date.parse(story.pubDate||'');if(t&&t>now+600000)return false;if(t&&now-t>maxAge)return false;return true;};
  p.fetchArticleRetry=async function(story,...args){const article=await fetchRetry.call(this,story,...args);if(dynamicStory(story)&&!article?.eventId)article.eventId=dynamicEventId(story,article);return article;};
}

function installRelease0330(){installGlobalTuning();installPackageTuningGuard();installSmartSwitch();installCannedLifecycle();installQueueProjection();installDynamicVersioning();}

module.exports={installRelease0330,stripProfilePhysical,physicalFrom,applyPhysical,sanitizeExportPhysical,migrateOptimizationForFingerprint,pending,resetPipeline,dynamicStory,dynamicEventId,projectedNews};
