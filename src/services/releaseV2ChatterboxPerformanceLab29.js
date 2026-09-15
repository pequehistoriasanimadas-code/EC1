'use strict';

const fs=require('fs');
const {TTSLabRuntime}=require('./ttsLabRuntime');

const CHATTERBOX_WARMUP_RUNS=3;
const CHATTERBOX_BENCHMARK_TEXT='GEC Automatic News realiza esta prueba para medir el nuevo motor de voz con una locución periodística realista. El sistema compara el tiempo de creación, la estabilidad y el comportamiento mientras la inteligencia artificial local continúa preparando noticias.';

function cleanup(runtime,audio){try{if(audio?.path)fs.rmSync(audio.path,{force:true});else if(audio?.path)runtime.cleanupAudio?.(audio.path);}catch{}}

function installReleaseV2ChatterboxPerformanceLab29(){
  const p=TTSLabRuntime.prototype;
  if(p.__gecChatterboxPerformanceLab29)return;
  Object.defineProperty(p,'__gecChatterboxPerformanceLab29',{value:true});
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

module.exports={CHATTERBOX_WARMUP_RUNS,installReleaseV2ChatterboxPerformanceLab29};
