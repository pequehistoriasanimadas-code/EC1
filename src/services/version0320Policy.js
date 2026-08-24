'use strict';

const {AutomationEngine}=require('./automation');
const {Providers}=require('./providers');
const {SettingsStore}=require('./settings');
const {KokoroTTS}=require('./kokoro');
const {parseEditorialJson,validateEditorialResult,correctivePrompt,STATUS_INSUFFICIENT}=require('./editorial');
const {installVersion0320LocalPolicy}=require('./version0320LocalPolicy');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const CONTENT_RETRY_CODES=new Set(['BAD_JSON','EMPTY_RESPONSE','BAD_STATUS','BAD_QUALITY','EMPTY_FIELDS','FORMAT_GARBAGE','SOURCE_CTA','TOO_SHORT','UNSUPPORTED_NUMBER','TOO_LONG']);
const retryableError=e=>!['NO_KEY','401','403','NO_MODEL','404','UNKNOWN_PROVIDER'].includes(String(e?.code||''));
const providerLabel=p=>({local:'Qwen local',claude:'Claude',gemini:'Gemini'}[p]||String(p||'IA'));
const CODE_LABEL={BAD_JSON:'JSON inválido',EMPTY_RESPONSE:'respuesta vacía',BAD_STATUS:'estado inválido',BAD_QUALITY:'calidad inválida',EMPTY_FIELDS:'campos incompletos',FORMAT_GARBAGE:'formato inválido',SOURCE_CTA:'incluyó enlace/CTA',TOO_SHORT:'texto demasiado corto',UNSUPPORTED_NUMBER:'cifra no respaldada',TOO_LONG:'texto demasiado largo',SOURCE_INSUFFICIENT:'fuente insuficiente',COOLDOWN:'límite temporal de uso'};
function conciseAttempt(a={}){const label=CODE_LABEL[String(a.code||'')]||String(a.message||a.code||'falló').replace(/^IA:\s*/i,'').slice(0,90);return`${providerLabel(a.provider)}: ${label}`;}
function failureReason(attempts=[]){const lastByProvider=new Map();for(const a of attempts||[])if(a?.provider)lastByProvider.set(a.provider,a);const parts=[...lastByProvider.values()].map(conciseAttempt);return parts.length?parts.join(' · '):'generación inválida';}

function installSettingsDefaults(){
  const proto=SettingsStore.prototype;if(proto.__ec0320SettingsInstalled)return;Object.defineProperty(proto,'__ec0320SettingsInstalled',{value:true});const baseLoad=proto.load;
  proto.load=function(){const s=baseLoad.call(this);s.ai=s.ai||{};s.ai.localAutoTuned=s.ai.localAutoTuned===true;s.ai.localTunedConfig=s.ai.localTunedConfig&&typeof s.ai.localTunedConfig==='object'?s.ai.localTunedConfig:null;s.ai.lastLocalBenchmark=s.ai.lastLocalBenchmark&&typeof s.ai.lastLocalBenchmark==='object'?s.ai.lastLocalBenchmark:null;if(s.ai.localAutoTuned&&s.ai.localTunedConfig)s.ai.localResourceMode='tuned';return s;};
}

function installProviderPipeline(){
  const proto=Providers.prototype;if(proto.__ec0320ProvidersInstalled)return;Object.defineProperty(proto,'__ec0320ProvidersInstalled',{value:true});const baseCall=proto.callProvider;
  proto.callProvider=async function(provider,prompt,settings){
    if(provider!=='local')return baseCall.call(this,provider,prompt,settings);
    const tuned=settings?.ai?.localAutoTuned===true&&settings?.ai?.localTunedConfig,mode=tuned?'tuned':(settings?.ai?.localResourceMode||'safe_streaming');this.localRuntime.configure(mode,tuned||null);const onDemand=this.localIsBackup(settings)&&(settings.ai.localBackupMode||'on_demand')==='on_demand',started=Date.now();
    try{const out=await this.localRuntime.generateDetailed(prompt),m=out.metrics||{};return{model:'Qwen3-8B-Q4_K_M',result:parseEditorialJson(out.text),metrics:{...m,elapsedMs:Number(m.elapsedMs)||Date.now()-started,localPromptTokens:Number(m.promptTokens)||0,localPromptMs:Number(m.promptMs)||0,localPromptTokensPerSec:Number(m.promptTokensPerSec)||0,localOutputTokens:Number(m.outputTokens)||0,localGenerationMs:Number(m.generationMs)||0,localTokensPerSec:Number(m.tokensPerSec)||0,localGpuLayers:Number(m.gpuLayers)||0,localThreads:Number(m.threads)||0,localBatch:Number(m.batch)||0,localUbatch:Number(m.ubatch)||0,localCtx:Number(m.ctx)||0,localProfileLabel:String(m.profileLabel||'')}};}
    finally{if(onDemand){const minutes=Math.max(1,Math.min(60,Number(settings.ai.localIdleMinutes)||5));this.localRuntime.scheduleIdleStop(minutes*60000);}}
  };
  proto.generateBuilt=async function(built,settings,order){
    const chain=[...new Set((order||[]).filter(x=>x&&x!=='none'))],attempts=[];if(!chain.length)throw new Error('No hay un proveedor de IA configurado');let lastInsufficient=null;
    for(let pIndex=0;pIndex<chain.length;pIndex++){
      const provider=chain[pIndex],cooldown=Math.max(0,(this.cooldownUntil[provider]||0)-Date.now());if(cooldown>0){attempts.push({provider,attempt:0,ok:false,code:'COOLDOWN',message:`En espera por límite de uso (${Math.ceil(cooldown/1000)} s)`});continue;}
      const maxAttempts=pIndex===0?2:1;let correction=null;
      for(let n=1;n<=maxAttempts;n++){
        const effectivePrompt=correction?correctivePrompt(built.prompt,correction):built.prompt;
        try{
          const out=await this.callProvider(provider,effectivePrompt,settings),result=validateEditorialResult(out.result,built.sourceText,built),metrics={...(out.metrics||{}),inputChars:built.inputChars,promptTokens:built.promptTokens||0,sourceBudgetChars:built.sourceBudgetChars||0,generationCount:attempts.length+1,fallbackUsed:pIndex>0};
          if(result.status===STATUS_INSUFFICIENT){attempts.push({provider,attempt:n,ok:true,code:'SOURCE_INSUFFICIENT',message:'La IA consideró insuficiente la fuente',model:out.model||'',elapsedMs:metrics.elapsedMs||0});lastInsufficient={provider,model:out.model||'',result,metrics};break;}
          attempts.push({provider,attempt:n,ok:true,model:out.model||'',elapsedMs:metrics.elapsedMs||0});return{provider,model:out.model||'',result,attempts,metrics};
        }catch(e){this.setCooldown(provider,e);const code=String(e?.code||'');attempts.push({provider,attempt:n,ok:false,message:e.message,code});const editorial=CONTENT_RETRY_CODES.has(code);if(editorial&&n<maxAttempts){correction=e;await wait(250);continue;}correction=null;if(!editorial&&n<maxAttempts&&retryableError(e)){await wait(e.retryAfter?Math.min(e.retryAfter*1000,5000):350);continue;}break;}
      }
    }
    if(lastInsufficient)return{...lastInsufficient,attempts,metrics:{...(lastInsufficient.metrics||{}),fallbackUsed:chain.indexOf(lastInsufficient.provider)>0,insufficientProviders:attempts.filter(x=>x.code==='SOURCE_INSUFFICIENT').map(x=>x.provider)}};
    const err=new Error('Todos los proveedores configurados fallaron');err.details=attempts;err.code='ALL_PROVIDERS_FAILED';throw err;
  };
}

function installOmissionDiagnostics(){
  const proto=AutomationEngine.prototype;if(proto.__ec0320OmissionInstalled)return;Object.defineProperty(proto,'__ec0320OmissionInstalled',{value:true});const baseIs=proto.isEditorialFailure,baseMark=proto.markOmitted,baseSnapshot=proto.snapshot;
  proto.isEditorialFailure=function(e){const yes=baseIs.call(this,e);if(yes)this.__ec0320EditorialFailure={at:Date.now(),attempts:Array.isArray(e?.details)?e.details:[],reason:failureReason(e?.details||[])};return yes;};
  proto.markOmitted=function(story,reason='fuente insuficiente',sourceType='rss'){
    let finalReason=String(reason||'fuente insuficiente'),attempts=[];const key=this.omittedKey?.(story),item=(this.queue||[]).find(x=>x?.story===story||(key&&this.omittedKey?.(x?.story)===key));
    if(/generación inválida/i.test(finalReason)&&this.__ec0320EditorialFailure&&Date.now()-this.__ec0320EditorialFailure.at<5000){finalReason=this.__ec0320EditorialFailure.reason;attempts=this.__ec0320EditorialFailure.attempts;}
    if(/^fuente insuficiente$/i.test(finalReason)&&item?.attempts?.length){const insuff=item.attempts.filter(x=>x.code==='SOURCE_INSUFFICIENT');if(insuff.length)finalReason=`Fuente insuficiente según ${[...new Set(insuff.map(x=>providerLabel(x.provider)))].join(' y ')}`;attempts=item.attempts;}
    const r=baseMark.call(this,story,finalReason,sourceType),after=(this.queue||[]).find(x=>x?.story===story||(key&&this.omittedKey?.(x?.story)===key));if(after){after.omittedReason=finalReason;if(attempts.length)after.attempts=attempts;}this.__ec0320EditorialFailure=null;return r;
  };
  proto.snapshot=function(extra={}){global.__ec0320Automation=this;return baseSnapshot.call(this,extra);};
}

function installKokoroHandle(){
  const proto=KokoroTTS.prototype;if(proto.__ec0320HandleInstalled)return;Object.defineProperty(proto,'__ec0320HandleInstalled',{value:true});const baseStatus=proto.status,baseProfile=proto.profile;
  proto.status=function(...args){global.__ec0320Kokoro=this;return baseStatus.apply(this,args);};
  proto.profile=function(...args){global.__ec0320Kokoro=this;return baseProfile.apply(this,args);};
}

function installLocalBenchmarkIpc(){
  if(global.__ec0320BenchmarkIpcInstalled)return;let electron=null;try{electron=require('electron');}catch{}if(!electron?.ipcMain?.handle)return;global.__ec0320BenchmarkIpcInstalled=true;
  try{electron.ipcMain.removeHandler('local:benchmark');}catch{}
  electron.ipcMain.handle('local:benchmark',async(_,publicSettings={})=>{
    const runtime=global.__ec0320LocalRuntime,automation=global.__ec0320Automation||global.__ec0316Automation,kokoro=global.__ec0320Kokoro||global.__ecKokoro0318;if(!runtime)throw new Error('La IA local todavía no terminó de inicializar');if(automation?.processingRunning||automation?.emissionRunning)return{ok:false,error:'Detén temporalmente Preparación y Emisión antes de optimizar la IA local.'};const settings=publicSettings&&typeof publicSettings==='object'?publicSettings:{};return runtime.benchmarkLocalAI({settings,kokoro,voice:settings?.tts?.voice||'ef_dora',speed:Number(settings?.tts?.speed)||1});
  });
}

function installVersion0320Policy(){installVersion0320LocalPolicy();installSettingsDefaults();installProviderPipeline();installOmissionDiagnostics();installKokoroHandle();installLocalBenchmarkIpc();}
module.exports={installVersion0320Policy,failureReason,conciseAttempt};