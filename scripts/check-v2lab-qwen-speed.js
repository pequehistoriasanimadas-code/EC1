'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {TTSLabRuntime,CACHE_REVISION}=require(path.join(root,'src','services','ttsLabRuntime.js'));

(async()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.26');
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true,gpu_name:'RTX TEST',gpu_vram_mb:12288});
  rt.stopAndWait=async()=>true;
  let generateCalls=0;
  rt.generate=async(id,text,{params={}}={})=>{
    generateCalls++;
    assert.strictEqual(id,'qwen3tts');
    const warm=String(text).length<80,batchMode=params.batchBenchmarkMode===true,batch=Number(params.batchSize||1),hidden=params.predictorHiddenStates!==false,subSample=params.subtalkerDoSample!==false,subK=Number(params.subtalkerTopK||50),profile=params.profileStages===true;
    let rtf=2.80,duration=12;
    if(!hidden)rtf=2.50;
    if(!hidden&&subK===20)rtf=2.30;
    if(!hidden&&subK===10)rtf=2.35;
    if(!hidden&&!subSample)rtf=1.95;
    if(batchMode){
      duration=64;
      rtf=({1:2.30,2:1.45,4:.95,8:.75})[batch]||2.30;
    }
    if(warm){duration=4;rtf=2.4;}
    const elapsed=Math.round(rtf*duration*1000),frames=batchMode?800:150,predictor=frames*15;
    const vram=({1:6000,2:7000,4:9000,8:11600})[batch]||6000;
    return{path:'',realtimeFactor:rtf,synthesisRealtimeFactor:Number((rtf*.96).toFixed(3)),elapsedMs:elapsed,durationSec:duration,gpuVramMb:12288,cudaPeakAllocatedMb:5200,cudaPeakReservedMb:6100,audioPeak:.51,audioRms:.07,
      gpuTelemetry:params.profileGpu?{samples:20,gpu_util_avg_pct:batchMode?Math.min(96,36+batch*8):42,gpu_util_max_pct:batchMode?Math.min(99,55+batch*5):68,power_avg_w:batchMode?150:120,power_max_w:batchMode?250:180,vram_max_mb:vram,graphics_clock_avg_mhz:1710}: {},
      stageTimings:{total_ms:elapsed,autoregressive_ms:Math.round(elapsed*.97),decode_ms:Math.round(elapsed*.02),wrapper_overhead_ms:Math.round(elapsed*.01),talker_steps:frames,talker_output_frames:frames,code_predictor_steps:predictor,code_predictor_calls:profile?Math.round(frames/Math.max(1,batch)):0,code_predictor_ms:profile?Math.round(elapsed*.73):0,code_predictor_ms_per_step:profile?Number((elapsed*.73/predictor).toFixed(3)):0,prefill_tokens_max:60,num_code_groups:16,rtf_synthesis:Number((rtf*.96).toFixed(3))}};
  };
  const progress=[];
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio',temperature:.78,speed:1}},e=>progress.push(e));
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.sampleCount,5);
  assert.strictEqual(result.batchSampleCount,2);
  assert.strictEqual(result.recommendedParams.dtypeMode,'bf16');
  assert.strictEqual(result.recommendedParams.attentionMode,'auto');
  assert.strictEqual(result.recommendedParams.predictorHiddenStates,false);
  assert.strictEqual(result.recommendedParams.subtalkerDoSample,true);
  assert.strictEqual(result.recommendedParams.subtalkerTopK,20,'Top-k 20 debe ganar entre candidatos elegibles');
  assert.strictEqual(result.recommendedParams.batchSize,4,'B8 debe rechazarse por margen VRAM < 1 GB');
  assert.strictEqual(result.recommendedParams.chunkChars,360);
  assert(result.gainPct>15,'Hidden OFF + top-k 20 debe mejorar single-stream');
  assert(result.batchGainPct>50,'B4 debe mejorar claramente el throughput');
  assert.strictEqual(result.batchEffectiveRealtimeFactor,.95);
  assert.strictEqual(result.diagnostic.numCodeGroups,16);
  assert(result.diagnostic.codePredictorSteps>0);
  assert(result.diagnostic.codePredictorMsPerStep>0,'Lab.20 debe corregir ms/paso');
  assert.strictEqual(result.diagnostic.batchSize,4);
  assert(result.diagnostic.batchVramHeadroomMb>1024);
  assert(result.results.every(x=>x.runCount===5&&x.sampleCount===5));
  assert(result.batchResults.every(x=>x.error||x.runCount===2));
  assert.strictEqual(result.results.find(x=>x.id==='subgreedy')?.eligible,false,'Greedy predictor es diagnóstico, nunca auto-promoción');
  assert.strictEqual(result.batchResults.find(x=>x.id==='batch-8')?.vramSafe,false,'B8 debe descartarse por VRAM');
  assert(progress.some(x=>x.phase==='measure'&&x.repeatIndex===5)&&progress.some(x=>x.phase==='batch-run'&&x.repeatIndex===2)&&progress.some(x=>x.phase==='done'),'Lab.20 debe reportar sampling, batching y fin');
  assert(generateCalls>=50,'Lab.20 debe ejecutar N=5 sampling + N=2 batching + perfiles');
  assert.strictEqual(CACHE_REVISION,'lab11-r1');
  const worker=fs.readFileSync(path.join(root,'src','tts_lab_worker.py'),'utf8');
  const runtime=fs.readFileSync(path.join(root,'src','services','ttsLabRuntime.js'),'utf8');
  for(const token of ['QWEN_PERF_REVISION = 4','predictorHiddenStates','subtalkerTopK','batchSize','generate_qwen_finetuned_batch','kwargs["output_hidden_states"] = False','code_predictor_ms_per_step'])assert(worker.includes(token),`Worker lab.23 missing ${token}`);
  for(const token of ['sampleCount=5','batchSampleCount=2','subtalkerTopK:20','subtalkerTopK:10','batchSizes=String(params.voiceMode||\'reference\')===\'finetuned\'?[1,2,4,8]','batchVramHeadroomMb','stableRuns=id===\'qwen3tts\'?5:3'])assert(runtime.includes(token),`Runtime lab.23 missing ${token}`);
  assert(!runtime.includes("add('fp16-sdpa'"),'Lab.20 no debe reintroducir FP16');
  console.log('check-v2lab-qwen-speed: OK · lab.23 · sampling audit · hidden-state optimization · batching · VRAM guard');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
