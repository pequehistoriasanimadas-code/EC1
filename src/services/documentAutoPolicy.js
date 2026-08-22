'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const {SettingsStore}=require('./settings');
const {AutomationEngine}=require('./automation');
const {KokoroTTS}=require('./kokoro');
const {Providers}=require('./providers');

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

function installQueueSessionPolicy(){
  const proto=AutomationEngine.prototype;if(proto.__ecQueueSessionPolicyInstalled)return;
  Object.defineProperty(proto,'__ecQueueSessionPolicyInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  const originalDisplayQueue=proto.displayQueue;
  const originalResetSessionCounters=proto.resetSessionCounters;

  proto.__ecEnsureNewsSequences=function(){
    if(!Number.isFinite(this.__ecNewsSequence))this.__ecNewsSequence=0;
    for(const item of this.queue||[]){
      if(!['rss','generated'].includes(item?.sourceType))continue;
      const existing=Number(item.sessionSeq)||0;
      if(existing>0){this.__ecNewsSequence=Math.max(this.__ecNewsSequence,existing);continue;}
      item.sessionSeq=++this.__ecNewsSequence;
    }
  };

  proto.displayQueue=function(settings){
    this.__ecEnsureNewsSequences();
    const byId=new Map((this.queue||[]).filter(x=>x?.id).map(x=>[x.id,x]));
    let rows=originalDisplayQueue.call(this,settings).filter(x=>!x?.history&&!['EMITIDA','OMITIDA'].includes(x?.status));
    rows=rows.map(row=>{const item=row?.id?byId.get(row.id):null;return item?.sessionSeq?{...row,sessionSeq:item.sessionSeq}:row;});

    const currentName=String(this.currentCanned?.name||'');
    if(this.currentKind==='canned'&&currentName){
      let index=rows.findIndex(x=>x.sourceType==='content'&&x.planned&&(x.title===currentName||!currentName));
      if(index<0)index=rows.findIndex(x=>x.sourceType==='content'&&x.planned);
      const active={title:currentName,status:'AL AIRE',sourceType:'content',planned:false,activeMedia:true,stage:'',planText:'Al aire'};
      if(index>=0)rows[index]={...rows[index],...active};else rows.unshift(active);
    }else if(this.currentKind==='ad'&&currentName){
      rows=rows.filter(x=>!(x.planned&&['content','ad'].includes(x.sourceType)));
      rows.unshift({title:currentName,status:'AL AIRE',sourceType:'ad',planned:false,activeMedia:true,stage:'',planText:'Al aire'});
    }
    return rows;
  };

  proto.resetSessionCounters=function(){
    this.__ecNewsSequence=0;
    for(const item of this.queue||[])if(['rss','generated'].includes(item?.sourceType))delete item.sessionSeq;
    return originalResetSessionCounters.call(this);
  };
}

function installTtsPerformancePolicy(){
  const proto=KokoroTTS.prototype;if(proto.__ecAdaptiveTtsInstalled)return;
  Object.defineProperty(proto,'__ecAdaptiveTtsInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  const originalProfile=proto.profile;

  proto.profile=function(){
    const base=originalProfile.call(this);if(base.name!=='performance')return base;
    const logical=Math.max(2,os.cpus()?.length||2),stored=Number(this.settings()?.tts?.performanceThreads)||0;
    const dynamic=Math.min(12,Math.max(6,Math.ceil(logical*.55))),threads=Math.max(2,Math.min(Math.min(12,logical),stored||dynamic));
    return{...base,intra:threads,inter:1,priority:'normal',label:`Rápido · ${threads} hilos`};
  };

  proto.benchmark=async function({voice='ef_dora',speed=1}={}){
    const phrase='Esta es una prueba de rendimiento de voz para que EC encuentre la configuración más rápida sin usar recursos innecesarios durante la transmisión.';
    const logical=Math.max(2,os.cpus()?.length||2),limit=Math.max(2,Math.min(12,logical));
    let candidates=[2,4,6,8,10,12].filter(x=>x<=limit);if(!candidates.includes(limit))candidates.push(limit);candidates=[...new Set(candidates)].sort((a,b)=>a-b);
    const results=[];this.stop('benchmark-adaptive');
    for(const threads of candidates){
      const profile={name:`benchmark_${threads}`,label:`${threads} hilos`,intra:threads,inter:1,priority:'normal'},id=`bench-${threads}-${Date.now()}`,txt=path.join(this.audioDir,`${id}.txt`),wav=path.join(this.audioDir,`${id}.wav`);fs.writeFileSync(txt,phrase,'utf8');const started=Date.now();
      try{
        const out=await this.run(['--text-file',txt,'--output',wav,'--voice',voice,'--speed',String(speed),'--model',this.model,'--voices',this.voices,'--onnx-intra',String(threads),'--onnx-inter','1'],profile,180000);let meta={};try{meta=JSON.parse(out);}catch{}
        const elapsedMs=Date.now()-started,durationSec=Number(meta.duration_sec||0),rtf=durationSec?elapsedMs/1000/durationSec:999;results.push({threads,label:`${threads} hilos`,elapsedMs,durationSec,realtimeFactor:Number(rtf.toFixed(3))});
      }catch(e){results.push({threads,label:`${threads} hilos`,error:e.message||String(e),realtimeFactor:999});}
      finally{try{fs.rmSync(txt,{force:true});fs.rmSync(wav,{force:true});}catch{}}
    }
    const valid=results.filter(x=>!x.error&&Number.isFinite(x.realtimeFactor)&&x.realtimeFactor<50);
    if(!valid.length)return{ok:false,recommended:'performance',recommendedThreads:Math.min(6,limit),results};
    const fastest=valid.reduce((a,b)=>b.realtimeFactor<a.realtimeFactor?b:a),near=valid.filter(x=>x.realtimeFactor<=fastest.realtimeFactor*1.08).sort((a,b)=>a.threads-b.threads),realtime=valid.filter(x=>x.realtimeFactor<=.90).sort((a,b)=>a.threads-b.threads);
    const selected=realtime[0]||near[0]||fastest;
    return{ok:true,recommended:'performance',recommendedThreads:selected.threads,bestRealtimeFactor:selected.realtimeFactor,fastestThreads:fastest.threads,fastestRealtimeFactor:fastest.realtimeFactor,results};
  };
}

function installDurationGuidance(){
  const proto=Providers.prototype;if(proto.__ecDurationGuidanceInstalled)return;
  Object.defineProperty(proto,'__ecDurationGuidanceInstalled',{value:true,configurable:false,enumerable:false,writable:false});
  const originalGenerate=proto.generate,originalGenerateDocument=proto.generateDocument;
  const guided=(settings,targetSeconds)=>{
    const target=Math.max(30,Math.min(180,Number(targetSeconds)||60)),min=Math.max(20,Math.round(target*.83)),max=Math.round(target*1.17);
    const rule=`DURACIÓN PRIORITARIA: si la fuente contiene hechos suficientes, desarrolla titular + guion cerca de ${target} segundos, normalmente entre ${min} y ${max} segundos. Solo entrega una pieza más corta cuando falte información útil; nunca repitas ni inventes para completar tiempo.`;
    const current=String(settings?.ai?.editorialInstructions||'').trim();return{...settings,ai:{...(settings?.ai||{}),editorialInstructions:`${rule}${current?`\n${current}`:''}`}};
  };
  proto.generate=function(story,article,settings,...rest){return originalGenerate.call(this,story,article,guided(settings,settings?.ai?.targetSeconds||60),...rest);};
  proto.generateDocument=function(doc,settings,options={},...rest){return originalGenerateDocument.call(this,doc,guided(settings,options?.targetSeconds||settings?.documents?.targetSeconds||60),options,...rest);};
}

function installDocumentAutoPolicy(){
  installSettingsSaveGuard();installQueueSessionPolicy();installTtsPerformancePolicy();installDurationGuidance();
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
