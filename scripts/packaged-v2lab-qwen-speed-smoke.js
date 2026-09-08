'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.19');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js');
  const {TTSLabRuntime,CACHE_REVISION}=require(runtimePath);
  assert.strictEqual(CACHE_REVISION,'lab11-r1');
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true});
  rt.stopAndWait=async()=>true;
  rt.generate=async(id,text,{params={}}={})=>{
    assert.strictEqual(id,'qwen3tts');
    const warm=String(text).length<80,chunk=Number(params.chunkChars||360),stream=params.nonStreamingMode===false,profile=params.profileStages===true;
    let rtf=stream?3.10:3.90,duration=12;
    if(String(params.performanceProfile||'').startsWith('lab19-')){duration=30;const byChunk={300:3.00,360:2.95,480:2.97,600:3.00};rtf=byChunk[chunk]||3.00;}
    if(warm){rtf=3.2;duration=4;}
    const elapsed=Math.round(rtf*duration*1000),talker=Math.round(duration*12.5),predictor=talker*15;
    return{path:'',realtimeFactor:rtf,synthesisRealtimeFactor:Number((rtf*.94).toFixed(3)),elapsedMs:elapsed,durationSec:duration,cudaPeakAllocatedMb:5000,cudaPeakReservedMb:6000,audioPeak:.5,audioRms:.06,
      gpuTelemetry:params.profileGpu?{samples:20,gpu_util_avg_pct:42,gpu_util_max_pct:68,power_avg_w:132,power_max_w:190,vram_max_mb:6200,graphics_clock_avg_mhz:1710}: {},
      stageTimings:{total_ms:elapsed,autoregressive_ms:Math.round(elapsed*.94),decode_ms:Math.round(elapsed*.04),wrapper_overhead_ms:Math.round(elapsed*.01),talker_steps:talker,code_predictor_steps:predictor,code_predictor_calls:profile?talker:0,code_predictor_ms:profile?Math.round(elapsed*.72):0,code_predictor_ms_per_step:profile?2.1:0,prefill_tokens_max:stream?10:110,num_code_groups:16,rtf_synthesis:Number((rtf*.94).toFixed(3))}};
  };
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio',temperature:.78}},()=>{});
  assert.strictEqual(result.sampleCount,5);
  assert.strictEqual(result.recommendedParams.dtypeMode,'bf16');
  assert.strictEqual(result.recommendedParams.attentionMode,'auto');
  assert.strictEqual(result.recommendedParams.nonStreamingMode,false);
  assert.strictEqual(result.recommendedParams.chunkChars,600);
  assert.strictEqual(result.recommendedParams.cacheImplementation,undefined);
  assert.strictEqual(result.diagnostic.streamingMode,'streaming-incremental');
  assert.strictEqual(result.diagnostic.numCodeGroups,16);
  assert(result.diagnostic.codePredictorSteps>0&&result.diagnostic.talkerSteps>0);
  assert.strictEqual(result.chunkConverged,true);
  assert(result.gainPct>20);
  assert(result.results.every(x=>x.runCount===5&&x.sampleCount===5));
  assert(!result.results.some(x=>String(x.id).includes('fp16')||String(x.id).includes('static')));

  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const ui=fs.readFileSync(path.join(appRoot,'src','renderer-0321.js'),'utf8');
  const v2=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  for(const token of ['QWEN_PERF_REVISION = 3','benchmarkDeterministic','torch.cuda.synchronize()','code_predictor_steps','ctypes.WinDLL("nvml.dll")','MODEL_REQUEST_KEY == request_key'])assert(worker.includes(token),`Qwen lab.19 worker missing ${token}`);
  for(const token of ['QWEN3-TTS LAB.19 · CANDIDATOS (N=5)','DIAGNÓSTICO GANADOR LAB.19','codePredictorMsPerStep',"version:'2.0-lab.19'"])assert(ui.includes(token),`Unified optimizer lab.19 UI missing ${token}`);
  assert(v2.includes("window.__GEC_V2LAB_RENDERER_RESPONSIVE__='lab19'"),'Renderer lab.19 marker missing');
  console.log('PACKAGED V2 QWEN SPEED lab.19 OK · N=5 · streaming incremental · step metrics · NVML');
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
