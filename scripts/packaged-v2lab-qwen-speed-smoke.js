'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.18');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js');
  const {TTSLabRuntime,CACHE_REVISION}=require(runtimePath);
  assert.strictEqual(CACHE_REVISION,'lab11-r1');
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true});
  rt.stopAndWait=async()=>true;
  rt.generate=async(id,text,{params={}}={})=>{
    const long=String(text).length>400,att=String(params.attentionMode||'auto'),dtype=String(params.dtypeMode||'bf16'),chunk=Number(params.chunkChars||360),cache=String(params.cacheImplementation||'auto');
    let rtf=long?2.8:3.84,duration=long?48:12;
    if(!long&&att==='sdpa'&&dtype==='bf16')rtf=3.3;
    if(!long&&att==='sdpa'&&dtype==='fp16')rtf=3.0;
    if(!long&&att==='sdpa'&&dtype==='fp16'&&cache==='static')rtf=2.7;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===360)rtf=2.7;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===480)rtf=2.4;
    if(long&&att==='sdpa'&&dtype==='fp16'&&cache==='static'&&chunk===600){rtf=1.8;duration=20;}
    const elapsed=Math.round(rtf*duration*1000);
    return{path:'',realtimeFactor:rtf,elapsedMs:elapsed,durationSec:duration,cudaPeakAllocatedMb:5000,cudaPeakReservedMb:6000,audioPeak:.5,audioRms:.06,
      gpuTelemetry:{samples:10,gpu_util_avg_pct:38,gpu_util_max_pct:46,power_avg_w:88,power_max_w:149,vram_max_mb:6200},
      stageTimings:{total_ms:elapsed,autoregressive_ms:Math.round(elapsed*.8),decode_ms:Math.round(elapsed*.12),wrapper_overhead_ms:Math.round(elapsed*.05)}};
  };
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio'}},()=>{});
  assert.strictEqual(result.recommendedParams.dtypeMode,'fp16');
  assert.strictEqual(result.recommendedParams.attentionMode,'sdpa');
  assert.strictEqual(result.recommendedParams.cacheImplementation,'static');
  assert.strictEqual(result.recommendedParams.chunkChars,480);
  assert.strictEqual(result.recommendedParams.nonStreamingMode,true);
  assert.strictEqual(result.diagnostic.bottleneck,'underutilized');
  assert(result.chunkResults.find(x=>x.id==='chunk-600')?.durationSafe===false);

  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const ui=fs.readFileSync(path.join(appRoot,'src','renderer-0321.js'),'utf8');
  const v2=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  const preload=fs.readFileSync(path.join(appRoot,'src','preload.js'),'utf8');
  for(const token of ['QWEN_PERF_REVISION = 2','non_streaming_mode=non_streaming','_timed_qwen_wrapper','gpu_telemetry','autoregressive_ms','decode_ms'])assert(worker.includes(token),`Qwen lab.18 worker missing ${token}`);
  for(const token of ['QWEN3-TTS LAB.18 · CANDIDATOS','DIAGNÓSTICO GANADOR','gpuTelemetry','autoregressiveSharePct',"version:'2.0-lab.18'"])assert(ui.includes(token),`Unified optimizer lab.18 UI missing ${token}`);
  assert(v2.includes("gec:settings-updated")&&v2.includes('GPU SWAP'),'V2 synchronization/mode text not packaged');
  assert(preload.includes("'tts-lab:event'")&&preload.includes('ttsLabBenchmarkPerformance'),'Live Qwen benchmark bridge not packaged');
  console.log('PACKAGED V2 QWEN SPEED lab.18 OK · telemetry · stage timing · safe candidate selection');
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
