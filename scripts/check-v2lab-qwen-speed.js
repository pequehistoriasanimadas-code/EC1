'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {TTSLabRuntime,CACHE_REVISION}=require(path.join(root,'src','services','ttsLabRuntime.js'));

(async()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.19');
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true,gpu_name:'RTX TEST',gpu_vram_mb:12288});
  rt.stopAndWait=async()=>true;
  let generateCalls=0;
  rt.generate=async(id,text,{params={}}={})=>{
    generateCalls++;
    assert.strictEqual(id,'qwen3tts');
    const warm=String(text).length<80,chunk=Number(params.chunkChars||360),stream=params.nonStreamingMode===false,profile=params.profileStages===true;
    let rtf=stream?3.10:3.90,duration=12;
    if(String(params.performanceProfile||'').startsWith('lab19-')){duration=30;const byChunk={300:3.00,360:2.95,480:2.97,600:3.00};rtf=byChunk[chunk]||3.00;}
    if(warm){rtf=3.2;duration=4;}
    const elapsed=Math.round(rtf*duration*1000),talker=Math.round(duration*12.5),predictor=talker*15;
    return{path:'',realtimeFactor:rtf,synthesisRealtimeFactor:Number((rtf*.94).toFixed(3)),elapsedMs:elapsed,durationSec:duration,cudaPeakAllocatedMb:5200,cudaPeakReservedMb:6100,audioPeak:.51,audioRms:.07,
      gpuTelemetry:params.profileGpu?{samples:20,gpu_util_avg_pct:42,gpu_util_max_pct:68,power_avg_w:132,power_max_w:190,vram_max_mb:6260,graphics_clock_avg_mhz:1710}: {},
      stageTimings:{total_ms:elapsed,autoregressive_ms:Math.round(elapsed*.94),decode_ms:Math.round(elapsed*.04),wrapper_overhead_ms:Math.round(elapsed*.01),talker_steps:talker,code_predictor_steps:predictor,code_predictor_calls:profile?talker:0,code_predictor_ms:profile?Math.round(elapsed*.72):0,code_predictor_ms_per_step:profile?2.1:0,prefill_tokens_max:stream?10:110,num_code_groups:16,rtf_synthesis:Number((rtf*.94).toFixed(3))}};
  };
  const progress=[];
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio',temperature:.78,speed:1}},e=>progress.push(e));
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.sampleCount,5);
  assert.strictEqual(result.recommendedParams.dtypeMode,'bf16');
  assert.strictEqual(result.recommendedParams.attentionMode,'auto');
  assert.strictEqual(result.recommendedParams.nonStreamingMode,false,'Lab.19 debe poder probar/promover streaming incremental en custom_voice');
  assert.strictEqual(result.recommendedParams.chunkChars,600,'Si los chunks convergen, debe preferir el mayor dentro de 3% del más rápido');
  assert.strictEqual(result.recommendedParams.cacheImplementation,undefined,'No debe persistir cacheImplementation: qwen_tts 0.1.1 lo descarta');
  assert.strictEqual(result.recommendedParams.benchmarkDeterministic,undefined);
  assert(result.gainPct>20,'La mejora confirmada debe calcularse con medianas N=5');
  assert.strictEqual(result.diagnostic.streamingMode,'streaming-incremental');
  assert.strictEqual(result.diagnostic.numCodeGroups,16);
  assert(result.diagnostic.codePredictorSteps>0&&result.diagnostic.talkerSteps>0);
  assert.strictEqual(result.chunkConverged,true);
  assert(result.chunkConvergencePct<5);
  assert(result.results.every(x=>x.runCount===5&&x.sampleCount===5),'Cada candidato debe tener cinco corridas válidas');
  assert(result.chunkResults.every(x=>x.runCount===5&&x.sampleCount===5),'Cada chunk debe tener cinco corridas válidas');
  assert(!result.results.some(x=>String(x.id).includes('fp16')||String(x.id).includes('static')),'FP16/cache no-op deben salir del barrido');
  assert(progress.some(x=>x.phase==='measure'&&x.repeatIndex===5)&&progress.some(x=>x.phase==='chunk-run'&&x.repeatIndex===5)&&progress.some(x=>x.phase==='done'),'Autotune lab.19 debe reportar repeticiones y fin');
  assert(generateCalls>=36,'Debe ejecutar calentamientos, N=5 y perfiles separados');
  assert.strictEqual(CACHE_REVISION,'lab11-r1');

  const worker=fs.readFileSync(path.join(root,'src','tts_lab_worker.py'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'src','services','ttsLabRuntime.js'),'utf8');
  for(const token of ['QWEN_PERF_REVISION = 3','benchmarkDeterministic','torch.cuda.synchronize()','code_predictor_steps','code_predictor_calls','ctypes.WinDLL("nvml.dll")','MODEL_REQUEST_KEY == request_key'])assert(worker.includes(token),`Worker lab.19 missing ${token}`);
  for(const token of ['sampleCount=5','nonStreamingMode:false','chunkConvergencePct','synthesisRealtimeFactor:Number(r.rtf_synthesis||0)','stableRuns=id===\'qwen3tts\'?5:3'])assert(runtime.includes(token),`Runtime lab.19 missing ${token}`);
  assert(!runtime.includes("add('fp16-sdpa'"),'Lab.19 no debe seguir probando FP16');
  console.log('check-v2lab-qwen-speed: OK · lab.19 · N=5 · streaming incremental · step metrics · NVML · no FP16/cache no-op');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
