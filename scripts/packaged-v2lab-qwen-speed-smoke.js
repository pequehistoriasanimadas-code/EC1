'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.11');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js');
  const {TTSLabRuntime,CACHE_REVISION}=require(runtimePath);
  assert.strictEqual(CACHE_REVISION,'lab11-r1');
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true});
  rt.stopAndWait=async()=>true;
  rt.generate=async(id,text,{params={}}={})=>{
    const long=String(text).length>400,att=String(params.attentionMode||'auto'),dtype=String(params.dtypeMode||'bf16'),chunk=Number(params.chunkChars||360);
    let rtf=2.05,duration=long?48:12;
    if(!long&&att==='sdpa'&&dtype==='fp16')rtf=1.05;
    else if(!long&&att==='sdpa')rtf=1.35;
    else if(!long&&att==='eager')rtf=1.7;
    if(long&&att==='sdpa'&&dtype==='fp16'&&chunk===360)rtf=1.2;
    if(long&&att==='sdpa'&&dtype==='fp16'&&chunk===600)rtf=.94;
    if(long&&att==='sdpa'&&dtype==='fp16'&&chunk===900){rtf=.68;duration=18;}
    return{path:'',realtimeFactor:rtf,elapsedMs:rtf*duration*1000,durationSec:duration,cudaPeakAllocatedMb:5000,cudaPeakReservedMb:6000,audioPeak:.5,audioRms:.06};
  };
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio'}},()=>{});
  assert.strictEqual(result.recommendedParams.dtypeMode,'fp16');
  assert.strictEqual(result.recommendedParams.attentionMode,'sdpa');
  assert.strictEqual(result.recommendedParams.chunkChars,600);
  assert(result.chunkResults.find(x=>x.id==='chunk-900')?.durationSafe===false);

  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const ui=fs.readFileSync(path.join(appRoot,'src','renderer-0321.js'),'utf8');
  const v2=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  const preload=fs.readFileSync(path.join(appRoot,'src','preload.js'),'utf8');
  assert(worker.includes('attn_implementation')&&worker.includes('torch.float16')&&worker.includes('torch.bfloat16'),'Qwen dtype/attention tuning not packaged');
  assert(worker.includes('torch.backends.cuda.matmul.allow_tf32')&&worker.includes('cudnn.benchmark'),'CUDA safe speed flags not packaged');
  assert(worker.includes('benchmarkSeed')&&worker.includes('audio_rms'),'Deterministic/signal safety checks not packaged');
  assert(ui.includes('ttsLabBenchmarkPerformance')&&ui.includes('OPTIMIZADA · VOZ LENTA')&&ui.includes("version:'2.0-lab.11'"),'Unified optimizer lab.11 UI not packaged');
  assert(v2.includes("gec:settings-updated")&&v2.includes('GPU SWAP'),'V2 synchronization/mode text not packaged');
  assert(preload.includes("'tts-lab:event'")&&preload.includes('ttsLabBenchmarkPerformance'),'Live Qwen benchmark bridge not packaged');
  console.log('PACKAGED V2 QWEN SPEED lab.11 OK · autotune · FP16/SDPA · chunk guard · state sync');
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
