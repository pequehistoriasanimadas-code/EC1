'use strict';
const {ProfilePackage0329}=require('./profilePackage0329');
const {Providers}=require('./providers');
const {safeName,atomicJson}=require('./profileManager0329');

const FINAL_FAILURE_THRESHOLD=3;
const FINAL_FAILURE_COOLDOWN_MS=15000;
const nameKey=v=>safeName(v).toLocaleLowerCase('es');
const SECRET_KEYS=new Set(['claudekey','geminikey','claudekeyenc','geminikeyenc','apikey','api_key','accesskey','access_key','accesstoken','access_token','refreshtoken','refresh_token','secret','token','hasclaudekey','hasgeminikey']);

function importedCandidate(base,n){
  const clean=safeName(base).replace(/\s*\(importado(?:\s+\d+)?\)$/i,'').trim()||'Perfil';
  const suffix=` (importado ${n})`;
  return safeName(`${clean.slice(0,Math.max(1,80-suffix.length))}${suffix}`);
}
function normalizeImportedNames(manager,ids=[]){
  const changed=[];
  for(const id of ids||[]){
    const row=manager.list().find(x=>x.id===id);if(!row)continue;
    const collision=manager.list().some(x=>x.id!==id&&nameKey(x.name)===nameKey(row.name));
    if(!collision)continue;
    let n=2,next='';
    do{next=importedCandidate(row.name,n++);}while(manager.list().some(x=>x.id!==id&&nameKey(x.name)===nameKey(next)));
    manager.update(id,{name:next,color:row.color});changed.push({id,from:row.name,to:next});
  }
  return changed;
}
function secretLike(key){const k=String(key||'').replace(/[-\s]/g,'_').toLowerCase();return SECRET_KEYS.has(k)||/api_?key(?:enc)?$/.test(k)||/(?:^|_)secret$/.test(k)||/(?:^|_)token$/.test(k);}
function scrubSecrets(value){
  if(Array.isArray(value))return value.map(scrubSecrets);
  if(!value||typeof value!=='object')return value;
  const out={};for(const[k,v]of Object.entries(value)){if(secretLike(k))continue;out[k]=scrubSecrets(v);}return out;
}
function scrubPackageSettings(payload){
  if(!payload||typeof payload!=='object')return payload;
  if(payload.globalSettings)payload.globalSettings=scrubSecrets(payload.globalSettings);
  if(Array.isArray(payload.profiles))for(const row of payload.profiles)if(row?.settings)row.settings=scrubSecrets(row.settings);
  return payload;
}
function sanitizeImportedState(manager,ids,preserved={}){
  for(const id of ids||[]){const clean=scrubSecrets(manager.readProfileSettings(id));manager.writeProfileSettings(id,clean);}
  const globalClean=scrubSecrets(manager.globalSettings({}));globalClean.ai={...(globalClean.ai||{}),claudeKeyEnc:String(preserved.claudeKeyEnc||''),geminiKeyEnc:String(preserved.geminiKeyEnc||'')};atomicJson(manager.globalSettingsFile,globalClean);return true;
}
function installExportSecretGuard(){
  const p=ProfilePackage0329.prototype;if(p.__ec0329ExportSecretGuard)return;Object.defineProperty(p,'__ec0329ExportSecretGuard',{value:true});
  const profilePayload=p.profilePayload,allPayload=p.allPayload;
  p.profilePayload=function(...args){return scrubPackageSettings(profilePayload.apply(this,args));};
  p.allPayload=function(...args){return scrubPackageSettings(allPayload.apply(this,args));};
}
function installImportNameGuard(){
  const p=ProfilePackage0329.prototype;if(p.__ec0329UniqueImportedNames)return;Object.defineProperty(p,'__ec0329UniqueImportedNames',{value:true});
  const base=p.importFile;p.importFile=function(...args){const before=this.manager.globalSettings({}),preserved={claudeKeyEnc:before.ai?.claudeKeyEnc||'',geminiKeyEnc:before.ai?.geminiKeyEnc||''},result=base.apply(this,args);sanitizeImportedState(this.manager,result?.imported||[],preserved);const renamed=normalizeImportedNames(this.manager,result?.imported||[]);if(renamed.length)result.renamed=renamed;result.secretsSanitized=true;return result;};
}
function installMixedFailureCircuit(){
  const p=Providers.prototype;if(p.__ec0329FinalFailureCircuit)return;Object.defineProperty(p,'__ec0329FinalFailureCircuit',{value:true});
  const base=p.generateBuilt;p.generateBuilt=async function(...args){
    try{const result=await base.apply(this,args);this.__ec0329FinalFailureStreak=0;return result;}
    catch(e){
      const code=String(e?.code||'');
      if(code==='ALL_PROVIDERS_FAILED'){
        this.__ec0329FinalFailureStreak=(Number(this.__ec0329FinalFailureStreak)||0)+1;
        if(this.__ec0329FinalFailureStreak>=FINAL_FAILURE_THRESHOLD){
          const until=Date.now()+FINAL_FAILURE_COOLDOWN_MS;this.__ec0329CircuitUntil=Math.max(Number(this.__ec0329CircuitUntil)||0,until);e.retryAfter=Math.max(Number(e.retryAfter)||0,Math.ceil(FINAL_FAILURE_COOLDOWN_MS/1000));e.finalFailureStreak=this.__ec0329FinalFailureStreak;
        }
      }else if(code!=='AI_CIRCUIT_OPEN'&&code!=='PROVIDER_CANCELLED')this.__ec0329FinalFailureStreak=0;
      throw e;
    }
  };
  const cancel=p.cancelActiveRequests;if(typeof cancel==='function')p.cancelActiveRequests=function(...args){this.__ec0329FinalFailureStreak=0;return cancel.apply(this,args);};
}
function installReleaseAuditFinal0329(){installExportSecretGuard();installImportNameGuard();installMixedFailureCircuit();}
module.exports={installReleaseAuditFinal0329,normalizeImportedNames,importedCandidate,scrubSecrets,scrubPackageSettings,sanitizeImportedState,secretLike,FINAL_FAILURE_THRESHOLD,FINAL_FAILURE_COOLDOWN_MS};
