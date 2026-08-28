'use strict';

const fs=require('fs');
const path=require('path');
const {AutomationEngine}=require('./automation');
const {KokoroTTS}=require('./kokoro');
const {PronunciationNormalizer}=require('./pronunciation');
const {SettingsStore}=require('./settings');
const {buildAdvancedCandidates,normalizeConfig,configLabel}=require('./version0317Policy');
const {median}=require('./ttsOptimizer');

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const nowIso=()=>new Date().toISOString();
const BENCHMARK_TEXTS={
  short:'El equipo confirmó nuevas medidas para esta semana. La información incluye cifras, fechas y nombres propios para comprobar una locución breve y natural.',
  medium:'EC Automatic News realiza una prueba de rendimiento con una noticia de longitud media. El texto combina nombres, cifras, porcentajes y pausas naturales para medir cuánto tarda Kokoro en generar una locución similar a las que se usan durante una transmisión automática.',
  long:'EC Automatic News valida el motor de voz con una pieza más extensa para comprobar que el rendimiento se mantiene estable cuando la noticia crece. Esta muestra incorpora frases de distinta longitud, referencias temporales, cantidades, porcentajes y nombres propios. El objetivo no es obtener un récord aislado, sino encontrar una configuración que mantenga un tiempo de generación predecible, conserve margen para OBS y permita que la inteligencia artificial local prepare la siguiente noticia mientras Kokoro termina la voz de la anterior.'
};
const WARMUP_TEXT='EC Automatic News prepara Kokoro antes de medir el rendimiento real de esta computadora.';

function atomicJson(file,value){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}
function finite(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}

function installOmittedQueuePolicy(){
  const proto=AutomationEngine.prototype;if(proto.__ec0319OmittedInstalled)return;Object.defineProperty(proto,'__ec0319OmittedInstalled',{value:true});
  const baseMark=proto.markOmitted,baseRemove=proto.removeItem,baseDisplay=proto.displayQueue,baseSnapshot=proto.snapshot;

  proto.__ec0319PruneOmitted=function(limit=12){
    const omitted=(this.queue||[]).filter(x=>x?.status==='OMITIDA').sort((a,b)=>finite(b.omittedAt)-finite(a.omittedAt));
    const keep=new Set(omitted.slice(0,Math.max(3,limit)));if(omitted.length<=keep.size)return;
    this.queue=(this.queue||[]).filter(x=>x?.status!=='OMITIDA'||keep.has(x));
  };
  proto.markOmitted=function(story,reason='fuente insuficiente',sourceType='rss'){
    const result=baseMark.call(this,story,reason,sourceType),key=this.omittedKey?.(story),item=(this.queue||[]).find(x=>x?.story===story||(key&&this.omittedKey?.(x?.story)===key));
    if(item){item.status='OMITIDA';item.stage='omitted';item.omittedReason=String(reason||'omitida');item.omittedAt=Date.now();item.error='';item.audio=null;}
    this.__ec0319PruneOmitted(12);return result;
  };
  proto.removeItem=function(item){
    if(item?.status==='OMITIDA'){
      try{this.cleanupItemAudio?.(item);}catch{}item.audio=null;
      if(item?.sourceType==='rss'&&item?.story?.link)this.queuedUrls?.delete(item.story.link);
      return false;
    }
    return baseRemove.call(this,item);
  };
  proto.displayQueue=function(settings){
    const rows=baseDisplay.call(this,settings),byId=new Map((this.queue||[]).filter(x=>x?.id).map(x=>[x.id,x]));
    return (rows||[]).map(row=>{const item=row?.id?byId.get(row.id):null;if(!item||item.status!=='OMITIDA')return row;return{...row,status:'OMITIDA',stage:'omitted',reason:item.omittedReason||'fuente insuficiente',sessionSeq:Number(item.sessionSeq)||Number(row.sessionSeq)||0,provider:item.provider||row.provider||'',model:item.model||row.model||'',attempts:item.attempts||row.attempts||[]};});
  };
  proto.snapshot=function(extra={}){const snap=baseSnapshot.call(this,extra);snap.counts=snap.counts||{};snap.counts.omitted=(this.queue||[]).filter(x=>x?.status==='OMITIDA').length;return snap;};
}

function installLocalPipelineOverlap(){
  const proto=AutomationEngine.prototype;if(proto.__ec0319OverlapInstalled)return;Object.defineProperty(proto,'__ec0319OverlapInstalled',{value:true});
  const baseSnapshot=proto.snapshot;

  proto.__ec0319PipelineState=function(){if(!this.__ec0319Pipeline)this.__ec0319Pipeline={mode:'auto',active:false,workers:1,reason:'modo seguro',disabledUntil:0,lastRtf:0};return this.__ec0319Pipeline;};
  proto.__ec0319WorkerLimit=function(settings){
    if(settings?.ai?.primary!=='local'){const st=this.__ec0319PipelineState();st.active=false;st.workers=2;st.reason='proveedor remoto: dos preparaciones';return 2;}
    const st=this.__ec0319PipelineState(),tts=this.kokoro?.status?.()||{},recent=finite(tts.recentRealtimeFactor),samples=finite(tts.recentSamples),bench=finite(settings?.tts?.lastAdvancedBenchmark?.realtimeFactor||settings?.tts?.lastHardwareBenchmark?.cpuRtf);
    st.lastRtf=recent||bench||0;
    if(samples>=3&&recent>1.20){st.disabledUntil=Date.now()+120000;st.reason=`pausa automática: RTF reciente ${recent.toFixed(2)}`;}
    if(Date.now()<st.disabledUntil){st.active=false;st.workers=1;return 1;}
    const reference=recent||bench;
    if(reference>1.15){st.active=false;st.workers=1;st.reason=`secuencial para proteger voz · RTF ${reference.toFixed(2)}`;return 1;}
    if(!reference){st.active=false;st.workers=1;st.reason='ejecuta Optimizar velocidad de voz para habilitar solapamiento';return 1;}
    st.active=true;st.workers=2;st.reason='IA local redacta la siguiente nota mientras Kokoro genera la voz';return 2;
  };
  proto.producer=async function(epoch){
    while(this.processingRunning&&epoch===this.processingEpoch){try{
      if(this.processingPaused){await wait(400);continue;}
      if(Date.now()<this.badSourceBackoffUntil){await wait(Math.min(1000,this.badSourceBackoffUntil-Date.now()));continue;}
      if(this.documentWorkerRunning){this.processingNotice='Generador de Notas trabajando; se reserva CPU antes de preparar otra noticia.';await wait(300);continue;}
      const s=this.getSettings(),target=Math.max(1,Math.min(30,Number(s.automation.bufferReady)||15)),readyCount=this.readyItems().length,workers=this.__ec0319WorkerLimit(s),availableSlots=Math.max(0,target-readyCount),allowedWorkers=Math.min(workers,availableSlots);
      if(readyCount>=target||allowedWorkers<=0||this.inFlight.size>=allowedWorkers){this.processingNotice=readyCount>=target?`Reserva lista: ${readyCount}/${target} noticias preparadas.`:`Preparando reserva: ${readyCount}/${target} listas.`;this.kickDocumentWorker();await wait(350);continue;}
      await this.refreshFeedCache(s,false);let candidate=this.candidateFrom(this.cachedItems,s);if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){await this.refreshFeedCache(s,true);candidate=this.candidateFrom(this.cachedItems,s);}
      if(!candidate){if(!this.lastNoRssAt)this.lastNoRssAt=Date.now();this.processingNotice='No hay noticias nuevas en las fuentes; esperando actualización.';this.state();this.kickDocumentWorker();await wait(2500);continue;}
      this.lastNoRssAt=0;this.processingNotice=`Preparando reserva: ${readyCount}/${target} listas.`;this.launchCandidate(candidate,s,epoch);await wait(120);
    }catch(e){this.emit('engine-error',e);await wait(1200);}}
  };
  proto.snapshot=function(extra={}){const snap=baseSnapshot.call(this,extra),st=this.__ec0319PipelineState();snap.processing={...(snap.processing||{}),pipelineOverlap:{mode:'auto',active:!!st.active,workers:Number(st.workers)||1,reason:st.reason||'',recentRtf:finite(st.lastRtf)}};return snap;};
}

function installPronunciationLocalFirst(){
  const proto=PronunciationNormalizer.prototype;if(proto.__ec0319PronunciationInstalled)return;Object.defineProperty(proto,'__ec0319PronunciationInstalled',{value:true});
  const baseNormalize=proto.normalize,baseStatus=proto.status;
  proto.normalize=async function(script,options={}){
    const current=this.getSettings?.()||{},primary=String(current?.ai?.primary||'local');
    if(primary==='claude')return baseNormalize.call(this,script,options);
    const originalGet=this.getSettings;
    this.getSettings=()=>{const s=originalGet?.call(this)||current;return{...s,tts:{...(s.tts||{}),pronunciationClaudeVerify:false,pronunciationMaxSeconds:Math.min(8,Math.max(5,Number(s?.tts?.pronunciationMaxSeconds)||8))}};};
    try{return await baseNormalize.call(this,script,options);}finally{this.getSettings=originalGet;}
  };
  proto.status=function(){const s=baseStatus.call(this),cfg=this.getSettings?.()||{},primary=String(cfg?.ai?.primary||'local');return{...s,localFirst:primary!=='claude',claudeVerifyEffective:primary==='claude'&&s.claudeVerifyEnabled!==false};};
}

function candidateProfile(kokoro,candidate){
  const cap=kokoro.performanceThreadCap(),saved=Math.max(1,Math.min(cap,Number(kokoro.settings()?.tts?.performanceThreads)||Math.min(6,cap))),c=normalizeConfig(candidate.config,saved,cap);
  return{config:c,profile:{name:`benchmark-0319-${candidate.id}`,label:candidate.label,priority:'below',intra:c.intraMode==='auto'?cap:c.intra,onnxIntra:c.intra,inter:c.inter,intraMode:c.intraMode,executionMode:c.executionMode,spinDurationUs:c.spinDurationUs,spinBackoffMax:c.spinBackoffMax,provider:'cpu',gpuMemoryLimitMb:0}};
}
function select0319(results){
  const valid=(results||[]).filter(x=>x&&x.safe&&!x.error&&finite(x.medianRealtimeFactor)>0&&finite(x.medianRealtimeFactor)<20);if(!valid.length)return null;
  const stable=valid.filter(x=>finite(x.worstRealtimeFactor)<=1.05),pool=stable.length?stable:valid;
  const bestMedian=Math.min(...pool.map(x=>finite(x.medianRealtimeFactor,999))),within=pool.filter(x=>finite(x.medianRealtimeFactor,999)<=bestMedian*1.04);
  return within.sort((a,b)=>finite(a.cpuAverage,999)-finite(b.cpuAverage,999)||finite(a.worstRealtimeFactor,999)-finite(b.worstRealtimeFactor,999)||finite(a.medianRealtimeFactor,999)-finite(b.medianRealtimeFactor,999))[0]||pool[0];
}

function installKokoroLongBenchmarkAndGpuGuard(){
  const proto=KokoroTTS.prototype;if(proto.__ec0319BenchmarkInstalled)return;Object.defineProperty(proto,'__ec0319BenchmarkInstalled',{value:true});
  const baseBenchmarkGpu=proto.benchmarkGpu,baseProfile=proto.profile;
  proto.__ec0319BenchmarkCandidate=async function(candidate,{voice='ef_dora',speed=1}={}){
    const {config,profile}=candidateProfile(this,candidate),stamp=`bench-0319-${candidate.id}-${Date.now()}`,warmTxt=path.join(this.audioDir,`${stamp}-warm.txt`),warmWav=path.join(this.audioDir,`${stamp}-warm.wav`),runs=[];
    fs.writeFileSync(warmTxt,WARMUP_TEXT,'utf8');
    try{
      await this.stopAndWait('benchmark-0319-switch');await this.ensureWorker(profile,true);await this.workerCommand({cmd:'generate',text_file:warmTxt,output:warmWav,voice,speed:Number(speed)},180000);if(!fs.existsSync(warmWav)||fs.statSync(warmWav).size<1000)throw new Error('El warm-up de Kokoro no produjo audio válido');
      for(const [kind,text] of Object.entries(BENCHMARK_TEXTS)){
        const txt=path.join(this.audioDir,`${stamp}-${kind}.txt`),wav=path.join(this.audioDir,`${stamp}-${kind}.wav`);fs.writeFileSync(txt,text,'utf8');try{const run=await this.benchmarkPass(profile,txt,wav,{voice,speed});runs.push({...run,kind});if(run.cpuOverloaded)break;}finally{try{fs.rmSync(txt,{force:true});}catch{}}
      }
      const safe=runs.length===3&&!runs.some(x=>x.cpuOverloaded),rtfs=runs.map(x=>finite(x.realtimeFactor,999)),medianRtf=Number(median(rtfs).toFixed(3)),worstRtf=Number(Math.max(...rtfs).toFixed(3)),cpuAverage=Number(median(runs.map(x=>finite(x.cpuAverage))).toFixed(1)),cpuPeak=Number(Math.max(...runs.map(x=>finite(x.cpuPeak)),0).toFixed(1)),phonemeMs=Number(median(runs.map(x=>finite(x.phonemeMs))).toFixed(1)),inferenceMs=Number(median(runs.map(x=>finite(x.inferenceMs))).toFixed(1));
      return{id:candidate.id,label:candidate.label,config,threads:config.intraMode==='auto'?'AUTO CPU':String(config.intra),safe,realtimeFactor:medianRtf,medianRealtimeFactor:medianRtf,worstRealtimeFactor:worstRtf,cpuAverage,cpuPeak,phonemeMs,inferenceMs,runs,error:safe?'':runs.some(x=>x.cpuOverloaded)?'La carga total de CPU superó 85% de forma sostenida':'No se completaron corto, medio y largo'};
    }catch(e){return{id:candidate.id,label:candidate.label,config,safe:false,realtimeFactor:999,medianRealtimeFactor:999,worstRealtimeFactor:999,cpuAverage:0,cpuPeak:0,phonemeMs:0,inferenceMs:0,runs,error:e.message||String(e)};}finally{this.cleanupAudio(warmWav);try{fs.rmSync(warmTxt,{force:true});}catch{}await this.stopAndWait('benchmark-0319-finished');}
  };
  proto.benchmark=function({voice='ef_dora',speed=1}={}){
    const task=async()=>{
      if(!this.ready())return{ok:false,error:'El motor de voz no está disponible en esta instalación',results:[]};const baselineCpu=await this.measureCpuBaseline(1200),logicalCpus=this.logicalCpuCount(),maxSafeThreads=this.performanceThreadCap();if(baselineCpu>=75)return{ok:false,error:`La computadora ya tiene ${baselineCpu.toFixed(0)}% de uso de CPU. Espera a que baje antes de optimizar.`,baselineCpu,results:[]};
      const s=this.settings(),savedThreads=Math.max(1,Math.min(maxSafeThreads,Number(s?.tts?.performanceThreads)||Math.min(6,maxSafeThreads))),candidates=buildAdvancedCandidates({savedThreads,maxSafeThreads,currentConfig:s?.tts?.performanceConfig||null}),results=[];for(const candidate of candidates)results.push(await this.__ec0319BenchmarkCandidate(candidate,{voice,speed}));
      const recommended=select0319(results);if(!recommended)return{ok:false,error:'No se encontró una configuración estable en las tres longitudes de prueba.',baselineCpu,logicalCpus,maxSafeThreads,results};const valid=results.filter(x=>x.safe&&!x.error),fastest=valid.length?Math.min(...valid.map(x=>finite(x.medianRealtimeFactor,999))):finite(recommended.medianRealtimeFactor),performanceThreads=recommended.config.intraMode==='fixed'?recommended.config.intra:savedThreads,summary={at:nowIso(),recommendedId:recommended.id,recommendedLabel:recommended.label,realtimeFactor:finite(recommended.medianRealtimeFactor),worstRealtimeFactor:finite(recommended.worstRealtimeFactor),fastestRealtimeFactor:Number(fastest.toFixed(3)),cpuAverage:finite(recommended.cpuAverage),phonemeMs:finite(recommended.phonemeMs),inferenceMs:finite(recommended.inferenceMs),sampleMode:'short-medium-long'};
      global.__ec0317TtsRecommendation={settingsFile:this.settingsFile,performanceThreads,config:{...recommended.config},summary};global.__ec0316TtsRecommendation={settingsFile:this.settingsFile,threads:performanceThreads,at:Date.now()};
      try{const saved=this.settings();saved.tts={...(saved.tts||{}),resourceMode:'performance',performanceThreads,performanceConfig:{...recommended.config},lastAdvancedBenchmark:summary,autoTuned:true};atomicJson(this.settingsFile,saved);}catch{}
      return{ok:true,recommended:'performance',recommendedThreads:performanceThreads,recommendedConfig:{...recommended.config},recommendedId:recommended.id,recommendedLabel:recommended.label,bestRealtimeFactor:finite(recommended.medianRealtimeFactor),worstRealtimeFactor:finite(recommended.worstRealtimeFactor),fastestRealtimeFactor:Number(fastest.toFixed(3)),logicalCpus,maxSafeThreads,baselineCpu,results,bottleneck:{phonemeMs:finite(recommended.phonemeMs),inferenceMs:finite(recommended.inferenceMs),inferencePct:0},sampleMode:'short-medium-long'};
    };const queued=this.generationTail.then(task,task);this.generationTail=queued.catch(()=>{});return queued;
  };
  proto.profile=function(){const p=baseProfile.call(this),s=this.settings();if(String(s?.ai?.primary||'local')==='local'&&p.provider==='cuda')return{...p,provider:'cpu',label:String(p.label||'').replace(/\s*·\s*NVIDIA CUDA/i,'')+' · CPU reservada para voz',forcedCpuForLocal:true};return p;};
  if(typeof baseBenchmarkGpu==='function')proto.benchmarkGpu=async function(options={}){const result=await baseBenchmarkGpu.call(this,options);if(!result?.ok)return result;const s=this.settings(),localPrimary=String(s?.ai?.primary||'local')==='local',gain=finite(result.gainPct),required=localPrimary?25:20,qualifies=!localPrimary&&result.gpu&&result.cpu&&finite(result.gpu.realtimeFactor)<finite(result.cpu.realtimeFactor)&&gain>=required;if(!qualifies){try{await this.useCpuAcceleration?.();}catch{}result.recommended='cpu';result.selectionReason=localPrimary?`CPU conservada: la IA local usa GPU/Vulkan y Kokoro no debe competir por VRAM durante producción.`:`CPU conservada: la mejora GPU de ${gain.toFixed(1)}% no alcanza el umbral de ${required}%.`;result.productionGuard=true;}return result;};
}

function installSettingsLocalGpuGuard(){
  const proto=SettingsStore.prototype;if(proto.__ec0319SettingsInstalled)return;Object.defineProperty(proto,'__ec0319SettingsInstalled',{value:true});const baseSave=proto.save;
  proto.save=function(settings){if(String(settings?.ai?.primary||'local')==='local'&&settings?.tts)settings={...settings,tts:{...settings.tts,acceleration:'cpu'}};return baseSave.call(this,settings);};
}

function installVersion0319Policy(){installSettingsLocalGpuGuard();installOmittedQueuePolicy();installLocalPipelineOverlap();installPronunciationLocalFirst();installKokoroLongBenchmarkAndGpuGuard();}
module.exports={installVersion0319Policy,select0319,BENCHMARK_TEXTS};
