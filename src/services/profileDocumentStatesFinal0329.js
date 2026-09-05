'use strict';
function installProfileDocumentStatesFinal0329(){
  const {AutomationEngine}=require('./automation0325'),p=AutomationEngine.prototype;
  if(p.__ec0329DocumentStateTransitions)return;
  Object.defineProperty(p,'__ec0329DocumentStateTransitions',{value:true});
  const state=p.state;
  p.state=function(...args){
    this.__ec0329DocumentStateCache=this.__ec0329DocumentStateCache||new Map();
    for(const item of this.queue||[]){
      if(item?.sourceType!=='generated'||!item.document?.fingerprint)continue;
      const next=item.status==='PENDIENTE'?'queued':item.status==='PROCESANDO'?'generating':item.status==='LISTA'||item.status==='AL AIRE'?'ready':item.status==='ERROR'?'failed':item.status==='EMITIDA'?'emitted':'';
      if(!next||this.__ec0329DocumentStateCache.get(item.id)===next)continue;
      this.__ec0329DocumentStateCache.set(item.id,next);
      try{this.__ecSetDocumentProcessed?.(item.document,next);}catch{}
    }
    for(const id of [...this.__ec0329DocumentStateCache.keys()])if(!(this.queue||[]).some(x=>x?.id===id))this.__ec0329DocumentStateCache.delete(id);
    return state.apply(this,args);
  };
}
module.exports={installProfileDocumentStatesFinal0329};
