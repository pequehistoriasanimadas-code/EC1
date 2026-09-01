'use strict';
const {app,ipcMain,BrowserWindow,Notification}=require('electron');
const {ProfileManager0329,safeName}=require('./profileManager0329');
const {ProfilePackage0329,readPackage}=require('./profilePackage0329');
const {Providers}=require('./providers');
const {validateEditorialResult,correctivePrompt}=require('./editorial');

const MAX_PROFILES=30;
const CONTENT_RETRY_CODES=new Set(['BAD_JSON','EMPTY_RESPONSE','BAD_STATUS','BAD_QUALITY','EMPTY_FIELDS','FORMAT_GARBAGE','SOURCE_CTA','TOO_SHORT','UNSUPPORTED_NUMBER','TOO_LONG']);
const NON_RETRY_CODES=new Set(['NO_KEY','401','403','NO_MODEL','404','UNKNOWN_PROVIDER']);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const keyName=v=>safeName(v).toLocaleLowerCase('es');

function profileLimitError(){const e=new Error(`GEC admite un máximo de ${MAX_PROFILES} perfiles. Elimina o reemplaza un perfil antes de añadir otro.`);e.code='PROFILE_LIMIT';return e;}
function installProfileLimit(){
  const p=ProfileManager0329.prototype;if(p.__ec0329ReleaseLimit)return;Object.defineProperty(p,'__ec0329ReleaseLimit',{value:true});
  const create=p.create,duplicate=p.duplicate,status=p.status;
  p.create=function(payload={}){if((this.registry?.profiles||[]).length>=MAX_PROFILES)throw profileLimitError();return create.call(this,payload);};
  p.duplicate=function(id,payload={}){if((this.registry?.profiles||[]).length>=MAX_PROFILES)throw profileLimitError();return duplicate.call(this,id,payload);};
  p.status=function(){const out=status.call(this),count=(out.profiles||[]).length;return{...out,maxProfiles:MAX_PROFILES,profileCount:count,canCreate:count<MAX_PROFILES};};
}
function importAddCount(manager,pkg,mode){const existing=manager.list(),incoming=(pkg.profiles||[]).map(x=>x?.meta).filter(Boolean);if(mode==='keep')return incoming.length;let add=0;for(const meta of incoming){const same=existing.some(e=>keyName(e.name)===keyName(meta.name));if(!same)add++;}return add;}
function installImportLimit(){
  const p=ProfilePackage0329.prototype;if(p.__ec0329ReleaseLimit)return;Object.defineProperty(p,'__ec0329ReleaseLimit',{value:true});const base=p.importFile;
  p.importFile=function(file,mode='keep'){
    const normalized=['replace','keep','skip'].includes(mode)?mode:'keep',pkg=readPackage(file),current=this.manager.list().length,adds=importAddCount(this.manager,pkg,normalized);
    if(current+adds>MAX_PROFILES)throw profileLimitError();
    return base.call(this,file,normalized);
  };
}

function cancelledError(reason='Cambio de perfil'){const e=new Error(`${reason}: se descartó una solicitud de IA pendiente.`);e.code='PROVIDER_CANCELLED';return e;}
function retryable(e){return !NON_RETRY_CODES.has(String(e?.code||''));}
function circuitDuration(streak){return Math.min(90000,15000*Math.max(1,Math.min(6,2**Math.max(0,streak-1))));}
function installProviderResilience(){
  const p=Providers.prototype;if(p.__ec0329ReleaseResilience)return;Object.defineProperty(p,'__ec0329ReleaseResilience',{value:true});
  p.cancelActiveRequests=function(reason='cancelled'){this.__ec0329Generation=(Number(this.__ec0329Generation)||0)+1;this.__ec0329CancelReason=String(reason||'cancelled');return{ok:true,generation:this.__ec0329Generation};};
  p.generationBlockStatus=function(){const until=Number(this.__ec0329CircuitUntil)||0;if(until>Date.now())return{blocked:true,until,retryAfterMs:until-Date.now(),streak:Number(this.__ec0329FailureStreak)||0};if(until){this.__ec0329CircuitUntil=0;}return{blocked:false,until:0,retryAfterMs:0,streak:Number(this.__ec0329FailureStreak)||0};};
  p.generateBuilt=async function(built,settings,order){
    const providers=[...new Set((order||[]).filter(x=>x&&x!=='none'))],attempts=[];if(!providers.length){const e=new Error('No hay un proveedor de IA configurado');e.code='NO_PROVIDERS';throw e;}
    const block=this.generationBlockStatus();if(block.blocked){const e=new Error(`Los proveedores de IA están temporalmente en pausa tras fallos consecutivos. Reintento en ${Math.max(1,Math.ceil(block.retryAfterMs/1000))} s.`);e.code='AI_CIRCUIT_OPEN';e.retryAfter=Math.ceil(block.retryAfterMs/1000);e.details=[];throw e;}
    const generation=Number(this.__ec0329Generation)||0;let totalGenerations=0,hadContentFailure=false;
    for(const provider of providers){
      if((Number(this.__ec0329Generation)||0)!==generation)throw cancelledError(this.__ec0329CancelReason);
      const cooldown=Math.max(0,(this.cooldownUntil?.[provider]||0)-Date.now());if(cooldown>0){attempts.push({provider,attempt:0,ok:false,code:'COOLDOWN',message:`En espera por límite de uso (${Math.ceil(cooldown/1000)} s)`});continue;}
      let correction=null;
      for(let providerAttempt=1;providerAttempt<=2;providerAttempt++){
        if((Number(this.__ec0329Generation)||0)!==generation)throw cancelledError(this.__ec0329CancelReason);
        const effectivePrompt=correction?correctivePrompt(built.prompt,correction):built.prompt;totalGenerations++;
        try{
          const out=await this.callProvider(provider,effectivePrompt,settings);
          if((Number(this.__ec0329Generation)||0)!==generation)throw cancelledError(this.__ec0329CancelReason);
          const result=validateEditorialResult(out.result,built.sourceText,built),metrics={...(out.metrics||{}),inputChars:built.inputChars,promptTokens:built.promptTokens||0,sourceBudgetChars:built.sourceBudgetChars||0,generationCount:totalGenerations};
          attempts.push({provider,attempt:providerAttempt,ok:true,model:out.model||'',elapsedMs:metrics.elapsedMs||0});this.__ec0329FailureStreak=0;this.__ec0329CircuitUntil=0;return{provider,model:out.model||'',result,attempts,metrics};
        }catch(e){
          if(String(e?.code||'')==='PROVIDER_CANCELLED'||(Number(this.__ec0329Generation)||0)!==generation)throw cancelledError(this.__ec0329CancelReason);
          this.setCooldown?.(provider,e);const code=String(e?.code||'');attempts.push({provider,attempt:providerAttempt,ok:false,message:e?.message||String(e),code});
          if(CONTENT_RETRY_CODES.has(code)){hadContentFailure=true;if(providerAttempt===1){correction=e;await wait(250);continue;}}
          if(providerAttempt===1&&retryable(e)&&!CONTENT_RETRY_CODES.has(code)){await wait(e?.retryAfter?Math.min(Number(e.retryAfter)*1000,5000):300);}
          break;
        }
      }
    }
    const infraFailure=!hadContentFailure;let retryAfter=0;if(infraFailure){this.__ec0329FailureStreak=Math.max(1,(Number(this.__ec0329FailureStreak)||0)+1);const ms=circuitDuration(this.__ec0329FailureStreak);this.__ec0329CircuitUntil=Date.now()+ms;retryAfter=Math.ceil(ms/1000);}else{this.__ec0329FailureStreak=0;this.__ec0329CircuitUntil=0;}
    const err=new Error(infraFailure?'Todos los proveedores de IA están temporalmente indisponibles':'Todos los intentos de IA fallaron para esta noticia');err.code=infraFailure?'ALL_PROVIDERS_UNAVAILABLE':'ALL_PROVIDERS_FAILED';err.details=attempts;err.retryAfter=retryAfter;throw err;
  };
}

function installAutomationResilience(){
  let AutomationEngine;try{AutomationEngine=require('./automation0325').AutomationEngine;}catch{return;}const p=AutomationEngine?.prototype;if(!p||p.__ec0329ReleaseResilience)return;Object.defineProperty(p,'__ec0329ReleaseResilience',{value:true});
  const candidate=p.candidateFrom;if(typeof candidate==='function')p.candidateFrom=function(items,s,options={}){const block=this.providers?.generationBlockStatus?.();if(block?.blocked){this.processingNotice=`IA en pausa de seguridad · reintento en ${Math.max(1,Math.ceil(block.retryAfterMs/1000))} s. La cola existente se conserva.`;return null;}return candidate.call(this,items,s,options);};
  const process=p.process;if(typeof process==='function')p.process=async function(...args){const m=global.__ec0329ProfileManager,startId=m?.activeId?.()||'',startGeneration=String(m?.registry?.updatedAt||'');const out=await process.apply(this,args);const now=global.__ec0329ProfileManager;if(startId&&now&&(startId!==now.activeId?.()||startGeneration!==String(now.registry?.updatedAt||''))){const e=new Error('El trabajo pertenece al perfil anterior');e.code='PROCESSING_CANCELLED';throw e;}return out;};
  const processDocument=p.processDocument;if(typeof processDocument==='function')p.processDocument=async function(...args){const m=global.__ec0329ProfileManager,startId=m?.activeId?.()||'',startGeneration=String(m?.registry?.updatedAt||'');const out=await processDocument.apply(this,args);const now=global.__ec0329ProfileManager;if(startId&&now&&(startId!==now.activeId?.()||startGeneration!==String(now.registry?.updatedAt||''))){const e=new Error('El documento pertenece al perfil anterior');e.code='PROCESSING_CANCELLED';throw e;}return out;};
  const snapshot=p.snapshot;if(typeof snapshot==='function')p.snapshot=function(...args){this.__ec0329SessionSeq=Number(this.__ec0329SessionSeq)||0;for(const item of this.queue||[]){const type=item?.sourceType||'rss';if((type==='rss'||type==='generated')&&!item.history&&!Number(item.sessionSeq)){item.sessionSeq=++this.__ec0329SessionSeq;}}return snapshot.apply(this,args);};
  try{const policy=require('./profilePolicy0329'),baseReset=policy.resetEngineSession;if(typeof baseReset==='function'&&!baseReset.__ec0329ReleaseWrapped){const wrapped=function(engine){const r=baseReset(engine);if(engine)engine.__ec0329SessionSeq=0;return r;};Object.defineProperty(wrapped,'__ec0329ReleaseWrapped',{value:true});policy.resetEngineSession=wrapped;}}catch{}
}

let lastNotifyKey='',lastNotifyAt=0;
function notificationKey(title,body){const text=`${String(title||'')} ${String(body||'')}`.replace(/\s+/g,' ').trim();if(/todos los (?:intentos|proveedores) de ia|AI_CIRCUIT_OPEN|ALL_PROVIDERS/i.test(text))return'AI_PROVIDER_OUTAGE';return text.slice(0,260);}
function installNotificationPolicy(){
  try{ipcMain.removeAllListeners('notify');}catch{}
  ipcMain.on('notify',(_,payload={})=>{const title=String(payload?.title||'EC Automatic News'),body=String(payload?.body||'').trim();if(!body)return;if(/^Pronunciación:\s*\d+\s+palabras procesadas,\s*\d+\s+nuevas,\s*\d+\s+actualizadas\.?$/i.test(body))return;const k=notificationKey(title,body),now=Date.now();if(k===lastNotifyKey&&now-lastNotifyAt<45000)return;lastNotifyKey=k;lastNotifyAt=now;try{if(Notification.isSupported())new Notification({title,body}).show();}catch{}});
}

function isControl(win){try{return !!win&&!win.isDestroyed()&&!/OUTPUT/i.test(win.getTitle?.()||'');}catch{return false;}}
function focusControl(){const w=BrowserWindow.getAllWindows().find(isControl);if(!w)return{ok:false};try{if(w.isMinimized())w.restore();w.show();w.focus();w.webContents?.focus?.();return{ok:true};}catch{return{ok:false};}}
function installFocusPolicy(){
  try{ipcMain.removeHandler('ui:focusControl');}catch{}ipcMain.handle('ui:focusControl',()=>focusControl());
  app.on('browser-window-focus',(_,w)=>{if(isControl(w))setTimeout(()=>{try{w.webContents?.focus?.();}catch{}},0);});
  app.on('browser-window-created',(_,w)=>{try{w.webContents?.on('did-finish-load',()=>{if(isControl(w))setTimeout(()=>{try{w.focus();w.webContents?.focus?.();}catch{}},60);});}catch{}});
}

function installReleaseStability0329(){installProfileLimit();installImportLimit();installProviderResilience();installAutomationResilience();installNotificationPolicy();installFocusPolicy();}
module.exports={installReleaseStability0329,MAX_PROFILES,importAddCount,profileLimitError};
