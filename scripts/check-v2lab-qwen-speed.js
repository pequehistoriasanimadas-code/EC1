'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {TTSLabRuntime,CACHE_REVISION}=require(path.join(root,'src','services','ttsLabRuntime.js'));

(async()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.18');
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true,gpu_name:'RTX TEST',gpu_vram_mb:12288});
  rt.stopAndWait=async()=>true;
  rt.generate=async(id,text,{params={}}={})=>{
    assert.strictEqual(id,'qwen3tts');
    const long=String(text).length>400,att=String(params.attentionMode||'auto'),dtype=String(params.dtypeMode||'bf16'),chunk=Number(params.chunkChars||360),cache=String(params.cacheImplementation||'auto');
    let rtf=long?2.8:3.84,duration=long?48:12;
    if(!long&&att==='sdpa'&&dtype==='bf16')rtf=3.30;
    if(!long&&att==='sdpa'&&dtype==='fp16')rtf=3.00;
    if(!long&&att==='sdpa'&&dtype==='bf16'&&cache==='static')rtf=2.95;
    if(!long&&att==='sdpa'&&dtype==='fp16'&&cache==='static')rtf=2.70;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===300)rtf=2.80;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===360)rtf=2.70;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===480)rtf=2.40;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===600){rtf=1.80;duration=20;}
    const elapsed=Math.round(rtf*duration*1000);
    return{path:'',realtimeFactor:rtf,elapsedMs:elapsed,durationSec:duration,cudaPeakAllocatedMb:5200,cudaPeakReservedMb:6100,audioPeak:.51,audioRms:.07,
      gpuTelemetry:{samples:12,gpu_util_avg_pct:38,gpu_util_max_pct:47,power_avg_w:88,power_max_w:149,vram_max_mb:6260,graphics_clock_avg_mhz:1180,graphics_clock_max_mhz:1450},
      stageTimings:{total_ms:elapsed,autoregressive_ms:Math.round(elapsed*.78),decode_ms:Math.round(elapsed*.14),wrapper_overhead_ms:Math.round(elapsed*.06),prompt_ms:20,write_wav_ms:15}};
  };
  const progress=[];
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio',temperature:.78,speed:1}},e=>progress.push(e));
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.recommendedParams.dtypeMode,'fp16');
  assert.strictEqual(result.recommendedParams.attentionMode,'sdpa');
  assert.strictEqual(result.recommendedParams.cacheImplementation,'static');
  assert.strictEqual(result.recommendedParams.nonStreamingMode,true,'Fine-tuned debe conservar no-streaming oficial');
  assert.strictEqual(result.recommendedParams.chunkChars,480,'Chunk 600 truncado no debe ganar aunque sea más rápido');
  assert.strictEqual(result.recommendedParams.consistencyMode,'stable-v1');
  assert(result.recommendedParams.productionTemperature<=0.55);
  assert(result.gainPct>30,'Lab.18 debe medir mejora frente al baseline real');
  assert.strictEqual(result.diagnostic.bottleneck,'underutilized');
  assert(result.diagnostic.autoregressiveSharePct>70,'Debe identificar el peso de la fase autoregresiva');
  assert(result.chunkResults.find(x=>x.id==='chunk-600')?.durationSafe===false,'Debe rechazar audio truncado');
  assert(result.results.every(x=>x.error||x.gpuTelemetry),'Cada candidato medido debe conservar telemetría GPU');
  assert(progress.some(x=>x.phase==='candidate')&&progress.some(x=>x.phase==='chunk')&&progress.some(x=>x.phase==='done'),'Autotune debe reportar progreso');
  assert.strictEqual(CACHE_REVISION,'lab11-r1');

  const worker=fs.readFileSync(path.join(root,'src','tts_lab_worker.py'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'src','services','ttsLabRuntime.js'),'utf8');
  for(const token of ['QWEN_PERF_REVISION = 2','non_streaming_mode=non_streaming','cache_implementation','_timed_qwen_wrapper','autoregressive_ms','decode_ms','gpu_telemetry','_gpu_sampler'])assert(worker.includes(token),`Worker lab.18 missing ${token}`);
  for(const token of ['stageTimings:r.stage_timings','gpuTelemetry:r.gpu_telemetry','cacheImplementation','underutilized','profileGpu:true'])assert(runtime.includes(token),`Runtime lab.18 missing ${token}`);
  console.log('check-v2lab-qwen-speed: OK · lab.18 · GPU telemetry · AR/decode timing · cache/no-stream candidates · truncation guard');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
