'use strict';

const fs=require('fs');
const path=require('path');
const {AutomationEngine}=require('./automation');
const {KokoroTTS,TTS_PROFILES}=require('./kokoro');
const {PronunciationNormalizer}=require('./pronunciation');
const {candidateThreads,selectEfficientCandidate}=require('./ttsOptimizer');

const MIGRATION_VERSION=3;
const keyOf=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('es');
const nowIso=()=>new Date().toISOString();
const statusLabel=s=>({pending:'Pendiente',preparing:'Preparando',ready:'Lista',on_air:'Al aire',emitted:'Emitida',error:'Error'}[s]||'Pendiente');

function atomicJson(file,value){
  const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');fs.renameSync(tmp,file);
}

function installKokoroPolicy(){
  const proto=KokoroTTS.prototype;if(proto.__ec0316KokoroInstalled)return;Object.defineProperty(proto,'__ec0316KokoroInstalled',{value:true});
  // 0.3.15 todavía podía ser sobrescrito por documentAutoPolicy. Desde aquí
  // Kokoro vuelve a tener una sola fuente de verdad y un único worker.
  proto.profile=function(){
    const s=this.settings(),name=this.profileName(s),base={name,...TTS_PROFILES[name]};if(name!=='performance')return base;
    const cap=this.performanceThreadCap(),saved=Number(s?.tts?.performanceThreads),fallback=Math.min(6,cap),intra=Math.max(1,Math.min(cap,Number.isFinite(saved)&&saved>0?Math.round(saved):fallback));
    return{...base,intra,inter:1,priority:'below',label:`Rápido · ${intra} hilos`};
  };
  proto.benchmark=function({voice='ef_dora',speed=1}={}){
    const task=async()=>{
      if(!this.ready())return{ok:false,error:'El motor de voz no está disponible en esta instalación',results:[]};
      const logicalCpus=this.logicalCpuCount(),maxSafeThreads=this.performanceThreadCap(),candidates=candidateThreads(logicalCpus),baselineCpu=await this.measureCpuBaseline(1200);
      if(baselineCpu>=75)return{ok:false,error:`La computadora ya tiene ${baselineCpu.toFixed(0)}% de uso de CPU. Cierra o pausa tareas pesadas y vuelve a ejecutar la optimización.`,logicalCpus,maxSafeThreads,candidates,baselineCpu,results:[]};
      const results=[];for(const threads of candidates){const result=await this.benchmarkCandidate(threads,{voice,speed});results.push(result);if(result.safe===false&&result.cpuPeak>=85)break;}
      const recommended=selectEfficientCandidate(results,{tolerance:.03});
      if(!recommended)return{ok:false,error:'No se encontró una configuración de Kokoro que completara la prueba dentro del margen de seguridad.',logicalCpus,maxSafeThreads,candidates,baselineCpu,results};
      const valid=results.filter(x=>x.safe!==false&&!x.error&&Number.isFinite(Number(x.realtimeFactor))),fastest=valid.length?Math.min(...valid.map(x=>Number(x.realtimeFactor))):Number(recommended.realtimeFactor);
      const answer={ok:true,recommended:'performance',recommendedThreads:Number(recommended.threads),bestRealtimeFactor:Number(recommended.realtimeFactor),fastestRealtimeFactor:Number(fastest.toFixed(3)),logicalCpus,maxSafeThreads,candidates,baselineCpu,efficiencyTolerancePct:3,results};
      // Persistencia desde backend: si la ventana se cierra justo al acabar la
      // prueba, la cantidad ganadora de hilos no se pierde.
      try{const s=this.settings();s.tts={...(s.tts||{}),resourceMode:'performance',performanceThreads:answer.recommendedThreads,autoTuned:true};atomicJson(this.settingsFile,s);}catch{}
      return answer;
    };
    const queued=this.generationTail.then(task,task);this.generationTail=queued.catch(()=>{});return queued;
  };
}

function installPronunciationPolicy(){
  const proto=PronunciationNormalizer.prototype;if(proto.__ec0316PronunciationInstalled)return;Object.defineProperty(proto,'__ec0316PronunciationInstalled',{value:true});
  const originalLoad=proto.loadLearning,originalCandidates=proto.candidates,originalImport=proto.importLearning,originalLearn=proto.learn,originalStatus=proto.status;

  proto.__ec0316Migration=function(){
    const marker=path.join(this.dataDir,`pronunciation-migration-v${MIGRATION_VERSION}.json`);if(fs.existsSync(marker))return;
    const report={version:MIGRATION_VERSION,at:nowIso(),found:Object.keys(this.learning?.entries||{}).length,removed:0,manualProtected:0,backup:''};
    try{
      if(fs.existsSync(this.learningFile)){
        const backup=path.join(this.dataDir,'pronunciation-learning.backup-0.3.16.json');if(!fs.existsSync(backup))fs.copyFileSync(this.learningFile,backup);report.backup=backup;
      }
      const semantic=new Set(['us','fen','link','cpi-w']);
      for(const [k,entry] of Object.entries(this.learning?.entries||{})){
        const term=String(entry?.term||'').trim(),pron=String(entry?.pronunciation||'').trim(),manual=/manual/i.test(entry?.source||'');
        // Conserva ajustes identificables que el usuario hizo en el JSON de la
        // versión anterior. Los futuros cambios importados se detectan solos.
        if((k==='mx'&&keyOf(pron)==='mex')||(k==='pucp'&&keyOf(pron)==='puc')||(k==='danza pucp'&&/\bpuc\b/i.test(pron))){entry.source='manual';entry.confidence=1;entry.updatedAt=nowIso();report.manualProtected++;continue;}
        if(manual)continue;
        // Nunca debe aprender una sustitución que atraviese el final de una
        // oración ni una reescritura semántica global dependiente del contexto.
        if(/[.!?;\r\n]/.test(term)||semantic.has(k)){delete this.learning.entries[k];report.removed++;}
      }
      if(report.removed||report.manualProtected)this.saveLearning();atomicJson(marker,report);this.__ec0316MigrationReport=report;
    }catch(e){this.__ec0316MigrationReport={...report,error:e.message||String(e)};}
  };
  proto.loadLearning=function(){const r=originalLoad.call(this);this.__ec0316Migration();return r;};
  proto.candidates=function(text){return originalCandidates.call(this,text).filter(x=>{const term=String(x?.term||'');if(/[.!?;\r\n]/.test(term))return false;const words=term.trim().split(/\s+/).filter(Boolean);if(words.length===1&&Number(x?.score||0)<=2)return false;return true;});};
  proto.learn=function(term,pronunciation,needsReplacement,source,confidence){const current=this.learning?.entries?.[keyOf(term)];if(current&&/manual/i.test(current.source||''))return current;return originalLearn.call(this,term,pronunciation,needsReplacement,source,confidence);};
  proto.importLearning=function(data){
    const incoming=this.normalizeLearning(data);let manualChanges=0;
    for(const [k,next] of Object.entries(incoming.entries||{})){
      const current=this.learning?.entries?.[k];if(!current)continue;
      const changed=keyOf(current.pronunciation)!==keyOf(next.pronunciation)||!!current.needsReplacement!==!!next.needsReplacement;
      if(changed){next.source='manual';next.confidence=1;next.updatedAt=nowIso();next.lastValidated=nowIso();manualChanges++;}
    }
    const r=originalImport.call(this,{schemaVersion:incoming.schemaVersion,updatedAt:incoming.updatedAt,entries:Object.values(incoming.entries||{})});return{...r,manualChanges};
  };
  proto.status=function(){return{...originalStatus.call(this),migrationReport:this.__ec0316MigrationReport||null,migrationVersion:MIGRATION_VERSION};};
}

function documentStore(engine){try{return engine.__ecDocumentSettingsStore?.()||null;}catch{return null;}}
function documentRecord(engine,doc,patch={}){
  const fingerprint=String(doc?.fingerprint||'').trim();if(!fingerprint)return null;const store=documentStore(engine);if(!store)return null;
  const s=store.load();s.documents=s.documents||{};s.documents.processed=s.documents.processed&&typeof s.documents.processed==='object'?s.documents.processed:{};const old=s.documents.processed[fingerprint]||{};
  s.documents.processed[fingerprint]={...old,path:String(doc?.path||old.path||''),title:String(doc?.title||old.title||''),...patch};const entries=Object.entries(s.documents.processed);if(entries.length>2000)s.documents.processed=Object.fromEntries(entries.slice(-2000));store.save(s);return s.documents.processed[fingerprint];
}
function recoverGeneratedAfterRestart(engine){
  if(engine.__ec0316DocumentRecoveryDone)return;engine.__ec0316DocumentRecoveryDone=true;const store=documentStore(engine);if(!store)return;
  try{const s=store.load();s.documents=s.documents||{};s.documents.processed=s.documents.processed&&typeof s.documents.processed==='object'?s.documents.processed:{};let changed=false,requeued=0,legacy=0;
    for(const [fingerprint,entry] of Object.entries(s.documents.processed)){
      if(entry?.status==='ready'&&!entry?.emittedAt){delete s.documents.processed[fingerprint];changed=true;requeued++;continue;}
      if(entry?.completedAt&&!entry?.status&&!entry?.emittedAt){entry.status='emitted';entry.emittedAt=entry.completedAt;entry.migratedLegacy=true;changed=true;legacy++;}
    }
    if(changed)store.save(s);engine.__ec0316DocumentRecovery={requeued,legacy};
  }catch{}
}

function installAutomationPolicy(){
  const proto=AutomationEngine.prototype;if(proto.__ec0316AutomationInstalled)return;Object.defineProperty(proto,'__ec0316AutomationInstalled',{value:true});
  const originalSnapshot=proto.snapshot,originalSetProcessed=proto.__ecSetDocumentProcessed,originalAddHistory=proto.addEmissionHistory,originalDisplayQueue=proto.displayQueue,originalPlayCanned=proto.playCanned;
  proto.snapshot=function(...args){global.__ec0316Automation=this;recoverGeneratedAfterRestart(this);return originalSnapshot.apply(this,args);};
  proto.__ecSetDocumentProcessed=function(doc,completed){
    const fingerprint=String(doc?.fingerprint||'').trim();if(!fingerprint)return originalSetProcessed?.call(this,doc,completed);
    if(!completed)return originalSetProcessed?.call(this,doc,false);
    const at=nowIso();return documentRecord(this,doc,{completedAt:at,generatedAt:at,status:'ready',emittedAt:''});
  };
  proto.addEmissionHistory=function(type,title,status='EMITIDA',extra={}){
    if(type==='generated'&&status==='EMITIDA'&&this.currentItem?.document?.fingerprint){const at=nowIso();documentRecord(this,this.currentItem.document,{status:'emitted',emittedAt:at,completedAt:this.currentItem?.document?.generatedAt||undefined});}
    return originalAddHistory.call(this,type,title,status,extra);
  };

  // Reserva el anuncio que la cola está mostrando para que no desaparezca
  // mientras el contenido está al aire y sea el mismo que sale a continuación.
  proto.playCanned=async function(s,reason){
    this.__ec0316ReservedAd=null;const c=s?.canned||{},folder=String(c.adsFolder||'').trim();if(folder&&c.insertAdAfterContent!==false){try{const ad=this.ads?.peek?.(folder);if(ad)this.__ec0316ReservedAd={...ad,folder};}catch{}}
    const result=await originalPlayCanned.call(this,s,reason);if(!result&&this.currentKind!=='ad')this.__ec0316ReservedAd=null;return result;
  };
  proto.playAdAfterCanned=async function(s,reason){
    const c=s.canned||{},folder=String(c.adsFolder||'').trim();if(!folder||c.insertAdAfterContent===false||Date.now()<this.adsUnavailableUntil){this.__ec0316ReservedAd=null;return false;}
    let media=this.__ec0316ReservedAd;this.__ec0316ReservedAd=null;
    try{
      if(media){const bag=Array.isArray(this.ads?.bag)?this.ads.bag:null,index=bag?bag.findIndex(x=>x?.path===media.path):-1;if(index>=0)bag.splice(index,1);if(this.ads)this.ads.lastPath=media.path;}
      else media=this.ads?.pick(folder);
    }catch(e){this.adsUnavailableUntil=Date.now()+30000;this.emit('error-item',{title:'Anuncios',error:e.message||'No hay anuncios disponibles',stage:'ads'});this.state({notice:'No hay un anuncio disponible; la emisión continúa.'});return false;}
    if(!media)return false;this.adsUnavailableUntil=0;this.currentKind='ad';this.currentCanned=media;this.currentItem=null;this.state({notice:`Anuncio al aire: ${media.name}`});
    const sent=this.sendAutomaticOutput({source:'automatic',kind:'canned',mediaRole:'ad',title:media.name,videoUrl:media.url,cannedReason:`ad-after-${reason||'content'}`});if(!sent){this.currentKind='none';this.currentCanned=null;this.emissionPaused=true;this.state({notice:'Output no disponible'});return false;}
    const result=await this.waitPlayback(6*60*60*1000);if(result==='ended'){this.adsPlayed++;this.addEmissionHistory('ad',media.name);}else if(result==='error'||result==='timeout'){this.emissionPaused=true;this.addEmissionHistory('ad',media.name,'ERROR',{error:result==='timeout'?'Tiempo máximo excedido':'No se pudo reproducir'});this.emit('error-item',{title:media.name,error:result==='timeout'?'Anuncio: tiempo máximo excedido':'Anuncio: no se pudo reproducir el video',stage:'ads'});}else if(result==='closed'||result==='interrupted')this.emissionPaused=true;this.currentKind='none';this.currentCanned=null;this.state();return result==='ended';
  };
  proto.displayQueue=function(s){
    let rows=originalDisplayQueue.call(this,s);if(this.currentKind!=='canned'||!this.currentCanned)return rows;
    const ad=this.__ec0316ReservedAd;if(!ad)return rows;rows=rows.filter(x=>!(x?.planned&&x.sourceType==='ad'));
    const active=rows.findIndex(x=>x.sourceType==='content'&&x.status==='AL AIRE'),row={title:ad.name,status:'PROGRAMADO',sourceType:'ad',planned:true,stage:'',planAfter:0,planText:'Después del contenido',planReason:'reserved',durationSec:Number(ad.durationSec)||0};
    rows.splice(active>=0?active+1:0,0,row);return rows;
  };
}

function augmentDocumentList(result){
  const engine=global.__ec0316Automation,queue=new Map();for(const x of engine?.queue||[]){if(x?.sourceType!=='generated')continue;const f=String(x.document?.fingerprint||'');if(f)queue.set(f,x.status);}
  let processed={};try{processed=documentStore(engine)?.load()?.documents?.processed||{};}catch{}
  return{...result,files:(result?.files||[]).map(x=>{const q=queue.get(String(x.fingerprint||'')),record=processed?.[x.fingerprint]||null;let state='pending';if(q==='PROCESANDO')state='preparing';else if(q==='LISTA')state='ready';else if(q==='AL AIRE')state='on_air';else if(q==='ERROR')state='error';else if(q==='PENDIENTE')state='pending';else if(record?.emittedAt||record?.status==='emitted'||(!engine&&x.processed))state='emitted';else if(record?.generatedAt||record?.status==='ready'||x.processed)state='ready';return{...x,processed:['ready','on_air','emitted'].includes(state),documentStatus:state,documentStatusLabel:statusLabel(state),generatedAt:record?.generatedAt||'',emittedAt:record?.emittedAt||''};})};
}

function installIpcPolicy(){
  let ipcMain=null;try{ipcMain=require('electron')?.ipcMain;}catch{}if(!ipcMain?.handle||ipcMain.__ec0316HandleInstalled)return;Object.defineProperty(ipcMain,'__ec0316HandleInstalled',{value:true});
  const original=ipcMain.handle.bind(ipcMain);ipcMain.handle=function(channel,listener){if(channel==='documents:list')return original(channel,async(...args)=>augmentDocumentList(await listener(...args)));return original(channel,listener);};
}

function installVersion0316Policy(){installKokoroPolicy();installPronunciationPolicy();installAutomationPolicy();installIpcPolicy();}

module.exports={installVersion0316Policy,augmentDocumentList,MIGRATION_VERSION};
