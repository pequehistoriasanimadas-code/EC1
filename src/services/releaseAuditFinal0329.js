'use strict';
const {ProfilePackage0329}=require('./profilePackage0329');
const {Providers}=require('./providers');
const {safeName}=require('./profileManager0329');

const FINAL_FAILURE_THRESHOLD=3;
const FINAL_FAILURE_COOLDOWN_MS=15000;
const nameKey=v=>safeName(v).toLocaleLowerCase('es');

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
function installImportNameGuard(){
  const p=ProfilePackage0329.prototype;if(p.__ec0329UniqueImportedNames)return;Object.defineProperty(p,'__ec0329UniqueImportedNames',{value:true});
  const base=p.importFile;p.importFile=function(...args){const result=base.apply(this,args);const renamed=normalizeImportedNames(this.manager,result?.imported||[]);if(renamed.length)result.renamed=renamed;return result;};
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
function installReleaseAuditFinal0329(){installImportNameGuard();installMixedFailureCircuit();}
module.exports={installReleaseAuditFinal0329,normalizeImportedNames,importedCandidate,FINAL_FAILURE_THRESHOLD,FINAL_FAILURE_COOLDOWN_MS};
