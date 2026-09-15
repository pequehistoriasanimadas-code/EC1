'use strict';

const fs=require('fs');
const {TTSLabRuntime}=require('./ttsLabRuntime');
const automationModule=require('./automation0325');
const {AutomationEngine}=automationModule;

const CHATTERBOX_WARMUP_RUNS=3;
const GPU_SWAP_BATCH_SIZE=4;
const CHATTERBOX_BENCHMARK_TEXT='GEC Automatic News realiza esta prueba para medir el nuevo motor de voz con una locución periodística realista. El sistema compara el tiempo de creación, la estabilidad y el comportamiento mientras la inteligencia artificial local continúa preparando noticias.';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const baseSelectGpuRequestIndex=automationModule.selectGpuRequestIndex;

function cleanup(_runtime,audio){try{if(audio?.path)fs.rmSync(audio.path,{force:true});}catch{}}

function gpuWorkerLimit(mode,voiceBacklog,desired=GPU_SWAP_BATCH_SIZE){
  const target=Math.max(1,Number(desired)||1);
  if(String(mode||'')==='gpu-swap')return Math.max(1,Math.min(GPU_SWAP_BATCH_SIZE,target));
  return Number(voiceBacklog||0)>=2?1:2;
}

function selectGpuRequestIndex(queue=[],voiceBurst=0,maxVoiceBurst=2,policy={}){
  if(String(policy?.mode||'')!=='gpu-swap')return typeof baseSelectGpuRequestIndex==='function'?baseSelectGpuRequestIndex(queue,voiceBurst,maxVoiceBurst):-1;
  if(!queue.length)return-1;
  const lastKind=String(policy?.lastKind||''),burst=Math.max(0,Number(policy?.swapBurstCount)||0),maxBurst=Math.max(1,Number(policy?.maxSwapBurst)||GPU_SWAP_BATCH_SIZE);
  const sameIndex=lastKind?queue.findIndex(x=>String(x?.kind||'')===lastKind):-1;
  const oppositeIndex=lastKind?queue.findIndex(x=>['ai','voice'].includes(String(x?.kind||''))&&String(x?.kind||'')!==lastKind):-1;
  if(lastKind&&burst<maxBurst&&sameIndex>=0)return sameIndex;
  if(lastKind&&burst>=maxBurst&&oppositeIndex>=0)return oppositeIndex;
  if(sameIndex>=0)return sameIndex;
  return 0;
}

function installBenchmarkPolicy(){
  const p=TTSLabRuntime.prototype;
  if(p.__gecChatterboxWarmBenchmarkLab29)return;
  Object.defineProperty(p,'__gecChatterboxWarmBenchmarkLab29',{value:true});
  const baseBenchmark=p.benchmark;
  if(typeof baseBenchmark!=='function')return;
  p.benchmark=async function(id,options={}){
    if(String(id||'')!=='chatterbox')return baseBenchmark.call(this,id,options);
    const preWarmups=[];
    for(let i=0;i<CHATTERBOX_WARMUP_RUNS-1;i++){
      const audio=await this.generate('chatterbox',CHATTERBOX_BENCHMARK_TEXT,options);
      preWarmups.push(audio||{});
      cleanup(this,audio);
    }
    const result=await baseBenchmark.call(this,id,options);
    const cold=preWarmups[0]||{};
    const extraWarmupMs=preWarmups.reduce((sum,x)=>sum+Number(x?.elapsedMs||0),0);
    return{
      ...result,
      coldStartRealtimeFactor:Number(Number(cold.realtimeFactor||result?.coldStartRealtimeFactor||0).toFixed(3)),
      warmupElapsedMs:extraWarmupMs+Number(result?.warmupElapsedMs||0),
      warmupRuns:CHATTERBOX_WARMUP_RUNS,
      preWarmupRuns:CHATTERBOX_WARMUP_RUNS-1,
      warmupPolicy:'chatterbox-cuda-hot-v1'
    };
  };
}

function installGpuSwapBatching(){
  const p=AutomationEngine.prototype;
  if(p.__gecGpuSwapBatchingLab29)return;
  Object.defineProperty(p,'__gecGpuSwapBatchingLab29',{value:true});

  // Make the enhanced selectors available to diagnostics and all callers of
  // the shared automation module. Non-SWAP modes preserve the legacy policy.
  automationModule.selectGpuRequestIndex=selectGpuRequestIndex;
  automationModule.gpuWorkerLimit=gpuWorkerLimit;

  const baseNext=p.nextGpuRequest;
  p.nextGpuRequest=function(){
    const queue=Array.isArray(this.gpuStageQueue)?this.gpuStageQueue:[];
    const mode=String(queue.find(x=>x?.mode)?.mode||this.coexistenceMode?.()||'');
    if(mode!=='gpu-swap'){
      this.__ecGpuSwapPolicyMode=mode;this.__ecGpuSwapLastKind='';this.__ecGpuSwapBurstCount=0;
      return typeof baseNext==='function'?baseNext.call(this):null;
    }
    if(this.__ecGpuSwapPolicyMode!==mode){this.__ecGpuSwapPolicyMode=mode;this.__ecGpuSwapLastKind='';this.__ecGpuSwapBurstCount=0;}
    const idx=selectGpuRequestIndex(queue,this.gpuVoiceBurst,this.gpuMaxVoiceBurst,{mode,lastKind:this.__ecGpuSwapLastKind,swapBurstCount:this.__ecGpuSwapBurstCount,maxSwapBurst:GPU_SWAP_BATCH_SIZE});
    if(idx<0)return null;
    const [req]=queue.splice(idx,1);if(!req)return null;
    const kind=String(req.kind||'');
    if(kind&&kind===this.__ecGpuSwapLastKind)this.__ecGpuSwapBurstCount=Number(this.__ecGpuSwapBurstCount||0)+1;
    else{this.__ecGpuSwapLastKind=kind;this.__ecGpuSwapBurstCount=1;}
    return req;
  };

  // GPU SWAP benefits from a small staging block: several articles may finish
  // their AI phase while Qwen is resident, then several voices are generated
  // while Chatterbox is resident. The normal coordinated mode keeps its
  // existing 1/2-worker backpressure.
  p.producer=async function(epoch){
    while(this.processingRunning&&epoch===this.processingEpoch){try{
      if(this.processingPaused){await wait(350);continue;}if(Date.now()<this.badSourceBackoffUntil){await wait(Math.min(900,this.badSourceBackoffUntil-Date.now()));continue;}if(this.documentWorkerRunning){this.processingNotice='Generador de Notas trabajando; se reserva CPU antes de preparar otra noticia.';await wait(250);continue;}
      const s=this.getSettings(),target=Math.max(1,Math.min(30,Number(s.automation?.bufferReady)||15)),readyCount=this.readyItems().length,sched=this.processingSchedulerState(s),needDueExclusive=sched.everyNews>0&&sched.due,desired=target+(needDueExclusive?1:0),voiceBacklog=this.gpuStageQueue.filter(x=>x.kind==='voice').length+(this.gpuStageCurrent==='voice'?1:0),mode=this.coexistenceMode(s),maxWorkers=gpuWorkerLimit(mode,voiceBacklog,desired);
      if(this.inFlight.size>=maxWorkers||readyCount+this.inFlight.size>=desired){this.processingNotice=readyCount>=target?`Reserva lista: ${readyCount}/${target} noticias · ${this.exclusiveReserve.length} exclusiva(s) reservada(s).`:`Preparando reserva: ${readyCount}/${target} listas · ${this.inFlight.size} en proceso.`;this.kickDocumentWorker();await wait(280);continue;}
      const maxQueue=Math.max(target+2,Math.min(60,Number(s.automation?.queueMax)||30)),activeCount=this.queue.filter(x=>!x.history&&x.status!=='EMITIDA').length;if(activeCount>=maxQueue){await wait(450);continue;}
      await this.refreshFeedCache(s,false);this.reserveKnownExclusives(this.cachedItems,s);
      if(needDueExclusive&&this.exclusiveReserve.length){
        const reserved=this.takeReservedExclusive(s);if(reserved){this.lastNoRssAt=0;this.processingNotice=`Turno de exclusiva en la reserva de preparación · preparando una de ${this.exclusiveReserve.length+1} reservada(s).`;this.launchCandidate(reserved.story,s,epoch,{forceExclusiveDue:true,reservedArticle:reserved.article,fromReserve:true});await wait(100);continue;}
      }
      const selectionMode=needDueExclusive?{exclusiveOnly:true}:{publicOnly:true};let candidate=this.candidateFrom(this.cachedItems,s,selectionMode);if(!candidate&&Date.now()-this.lastFeedFetchAt>15000){await this.refreshFeedCache(s,true);this.reserveKnownExclusives(this.cachedItems,s);if(needDueExclusive&&this.exclusiveReserve.length){const reserved=this.takeReservedExclusive(s);if(reserved){this.lastNoRssAt=0;this.processingNotice=`Turno de exclusiva en la reserva de preparación · preparando una de ${this.exclusiveReserve.length+1} reservada(s).`;this.launchCandidate(reserved.story,s,epoch,{forceExclusiveDue:true,reservedArticle:reserved.article,fromReserve:true});await wait(100);continue;}}candidate=this.candidateFrom(this.cachedItems,s,selectionMode);}
      if(!candidate){if(!this.lastNoRssAt)this.lastNoRssAt=Date.now();this.processingNotice=needDueExclusive?`Turno de exclusiva pendiente · esperando una exclusiva elegible · ${this.exclusiveReserve.length} reservada(s).`:`Buscando noticias sin candado · faltan ${sched.nonExclusiveNeeded} pública(s) en la secuencia de preparación · ${this.exclusiveReserve.length} reservada(s).`;this.state();this.kickDocumentWorker();await wait(1800);continue;}
      this.lastNoRssAt=0;this.processingNotice=needDueExclusive?`Preparando exclusiva del turno · ${this.exclusiveReserve.length} reservada(s).`:`Priorizando noticia sin candado · faltan ${sched.nonExclusiveNeeded} pública(s) para el siguiente turno exclusivo.`;this.launchCandidate(candidate,s,epoch,{forceExclusiveDue:needDueExclusive&&this.knownExclusive(candidate,s)});await wait(100);
    }catch(e){this.emit('engine-error',e);await wait(900);}}
  };

  const baseStop=p.stopProcessing;
  if(typeof baseStop==='function')p.stopProcessing=function(...args){this.__ecGpuSwapPolicyMode='';this.__ecGpuSwapLastKind='';this.__ecGpuSwapBurstCount=0;return baseStop.apply(this,args);};

  const baseSnapshot=p.snapshot;
  if(typeof baseSnapshot==='function')p.snapshot=function(...args){const out=baseSnapshot.apply(this,args);if(this.coexistenceMode?.()==='gpu-swap'&&out?.processing){out.processing.pipelineMode=`staggered-${GPU_SWAP_BATCH_SIZE}-gpu-swap`;out.processing.gpuSwapBatchSize=GPU_SWAP_BATCH_SIZE;out.processing.gpuSwapLastKind=String(this.__ecGpuSwapLastKind||'');out.processing.gpuSwapBurstCount=Number(this.__ecGpuSwapBurstCount||0);}return out;};
}

function installReleaseV2ChatterboxPerformanceLab29(){installBenchmarkPolicy();installGpuSwapBatching();}

module.exports={CHATTERBOX_WARMUP_RUNS,GPU_SWAP_BATCH_SIZE,gpuWorkerLimit,selectGpuRequestIndex,installReleaseV2ChatterboxPerformanceLab29};
