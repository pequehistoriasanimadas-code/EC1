'use strict';
const path=require('path');
const {SettingsStore}=require('./settings');
const {AutomationEngine}=require('./automation');

const transientFingerprints=new Set();

function deferred(message,code='DOCUMENT_DEFERRED'){
  const e=new Error(message);e.code=code;return e;
}

function installSettingsSaveGuard(){
  const proto=SettingsStore.prototype;if(proto.__ecDocumentSaveGuardInstalled)return;
  const originalSave=proto.save;
  Object.defineProperty(proto,'__ecDocumentSaveGuardInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  proto.save=function(settings){
    if(!transientFingerprints.size||!settings?.documents?.processed)return originalSave.call(this,settings);
    const processed={...(settings.documents.processed||{})};
    for(const fingerprint of transientFingerprints){const entry=processed[fingerprint];if(entry&&!entry.completedAt)delete processed[fingerprint];}
    const safe={...settings,documents:{...settings.documents,processed}};return originalSave.call(this,safe);
  };
}

function installDocumentAutoPolicy(){
  installSettingsSaveGuard();
  const proto=AutomationEngine.prototype;
  if(proto.__ecDocumentAutoPolicyInstalled)return;
  Object.defineProperty(proto,'__ecDocumentAutoPolicyInstalled',{value:true,configurable:false,enumerable:false,writable:false});

  const originalEnqueue=proto.enqueueDocument;
  const originalCanRun=proto.documentCanRun;
  const originalProcessDocument=proto.processDocument;

  proto.__ecDocumentFailedSet=function(){
    if(!this.__ecDocumentFailedFingerprints)this.__ecDocumentFailedFingerprints=new Set();
    return this.__ecDocumentFailedFingerprints;
  };
  proto.__ecDocumentSettingsStore=function(){
    if(this.__ecDocumentStore)return this.__ecDocumentStore;
    const historyFile=String(this.history?.file||'').trim();
    if(!historyFile)return null;
    this.__ecDocumentStore=new SettingsStore(path.dirname(historyFile));
    return this.__ecDocumentStore;
  };
  proto.__ecSetDocumentProcessed=function(doc,completed){
    const fingerprint=String(doc?.fingerprint||'').trim();if(!fingerprint)return;
    transientFingerprints.delete(fingerprint);
    const store=this.__ecDocumentSettingsStore();if(!store)return;
    const s=store.load();s.documents=s.documents||{};s.documents.processed=s.documents.processed&&typeof s.documents.processed==='object'?s.documents.processed:{};
    if(completed)s.documents.processed[fingerprint]={path:String(doc?.path||''),title:String(doc?.title||''),completedAt:new Date().toISOString()};
    else delete s.documents.processed[fingerprint];
    const entries=Object.entries(s.documents.processed);if(entries.length>2000)s.documents.processed=Object.fromEntries(entries.slice(-2000));store.save(s);
  };
  proto.__ecGeneratedWorkActive=function(){
    return this.queue.some(x=>x?.sourceType==='generated'&&['PENDIENTE','PROCESANDO'].includes(x.status));
  };
  proto.__ecDocumentAdmissionAvailable=function(priority='normal'){
    if(!this.processingRunning||this.processingPaused)return false;
    if(this.__ecGeneratedWorkActive()||this.documentWorkerRunning||this.inFlight.size>0||this.localHeavyRunning)return false;
    if(priority==='high')return true;
    const s=this.getSettings()||{},health=this.bufferHealth(s),target=Math.max(1,Number(s.automation?.bufferReady)||15);
    if(health.level==='safe'||health.ready>=target)return true;
    if(this.lastNoRssAt&&Date.now()-this.lastNoRssAt>1800)return true;
    return false;
  };

  proto.enqueueDocument=function(doc,options={}){
    const fingerprint=String(doc?.fingerprint||'').trim(),priority=options.priority==='high'?'high':'normal';
    if(!this.processingRunning||this.processingPaused)throw deferred('La nota queda pendiente hasta que inicies Preparación de noticias.','DOCUMENT_PREPARATION_STOPPED');
    if(fingerprint&&this.__ecDocumentFailedSet().has(fingerprint))throw deferred('La nota ya falló en esta sesión y no se reintentará automáticamente.','DOCUMENT_FAILED_SESSION');
    if(fingerprint&&this.queue.some(x=>x?.sourceType==='generated'&&String(x.document?.fingerprint||'')===fingerprint&&['PENDIENTE','PROCESANDO','LISTA'].includes(x.status)))throw deferred('La nota ya está en la cola.','DOCUMENT_ALREADY_QUEUED');
    if(!this.__ecDocumentAdmissionAvailable(priority))throw deferred('EC esperará a que exista capacidad antes de admitir otra nota del Generador.','DOCUMENT_NO_CAPACITY');
    const result=originalEnqueue.call(this,doc,{...options,priority});
    if(fingerprint)transientFingerprints.add(fingerprint);
    return result;
  };

  proto.documentCanRun=function(item){
    if(!this.processingRunning||this.processingPaused)return false;
    return originalCanRun.call(this,item);
  };

  proto.processDocument=async function(holder){
    const doc=holder?.document||{},fingerprint=String(doc.fingerprint||'').trim();
    try{
      const outcome=await originalProcessDocument.call(this,holder);
      if(outcome?.omitted){if(fingerprint)this.__ecDocumentFailedSet().add(fingerprint);this.__ecSetDocumentProcessed(doc,false);}
      else{if(fingerprint)this.__ecDocumentFailedSet().delete(fingerprint);this.__ecSetDocumentProcessed(doc,true);}
      return outcome;
    }catch(e){if(fingerprint)this.__ecDocumentFailedSet().add(fingerprint);try{this.__ecSetDocumentProcessed(doc,false);}catch{}throw e;}
  };
}

module.exports={installDocumentAutoPolicy};
