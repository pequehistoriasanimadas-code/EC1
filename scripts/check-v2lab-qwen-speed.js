'use strict';
const assert=require('assert'),path=require('path');
const {TTSLabRuntime,CACHE_REVISION}=require(path.resolve(__dirname,'..','src','services','ttsLabRuntime.js'));

(async()=>{
  const rt=Object.create(TTSLabRuntime.prototype);
  rt.qwenCapabilities=async()=>({flash_attention_2:false,sdpa:true,fp16:true,bf16:true,gpu_name:'RTX TEST',gpu_vram_mb:12288});
  rt.stopAndWait=async()=>true;
  const testTextThreshold=400;
  rt.generate=async(id,text,{params={}}={})=>{
    assert.strictEqual(id,'qwen3tts');
    const long=String(text).length>testTextThreshold;
    const att=String(params.attentionMode||'auto'),dtype=String(params.dtypeMode||'bf16'),chunk=Number(params.chunkChars||360);
    let rtf=2.05,duration=long?48:12;
    if(!long){
      if(att==='sdpa'&&dtype==='bf16')rtf=1.38;
      if(att==='sdpa'&&dtype==='fp16')rtf=1.08;
      if(att==='eager'&&dtype==='bf16')rtf=1.72;
      if(att==='eager'&&dtype==='fp16')rtf=1.61;
    }else{
      if(dtype==='fp16'&&att==='sdpa'&&chunk===360)rtf=1.18;
      if(dtype==='fp16'&&att==='sdpa'&&chunk===600)rtf=.92;
      if(dtype==='fp16'&&att==='sdpa'&&chunk===900){rtf=.70;duration=20;} // fake truncation: must be rejected
    }
    return{path:'',realtimeFactor:rtf,elapsedMs:Math.round(rtf*duration*1000),durationSec:duration,cudaPeakAllocatedMb:5200,cudaPeakReservedMb:6100,audioPeak:.51,audioRms:.07};
  };
  const progress=[];
  const result=await rt.benchmarkQwenPerformance({params:{voiceMode:'finetuned',fineTunedModelId:'aurelio',temperature:.78,speed:1}},e=>progress.push(e));
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.recommendedParams.dtypeMode,'fp16');
  assert.strictEqual(result.recommendedParams.attentionMode,'sdpa');
  assert.strictEqual(result.recommendedParams.chunkChars,600,'Chunk 900 truncado no debe ganar aunque sea más rápido');
  assert(result.gainPct>40,'Debe detectar una mejora importante sobre RTF 2.05');
  assert.strictEqual(result.capabilities.flash_attention_2,false,'No debe exigir Flash Attention si no existe');
  assert(result.chunkResults.find(x=>x.id==='chunk-900')?.durationSafe===false,'Debe marcar como insegura la duración truncada');
  assert(progress.some(x=>x.phase==='candidate')&&progress.some(x=>x.phase==='chunk')&&progress.some(x=>x.phase==='done'),'Autotune debe reportar progreso visible');
  assert.strictEqual(CACHE_REVISION,'lab11-r1');
  console.log('check-v2lab-qwen-speed: OK · FP16/SDPA · chunk 600 · truncation guard · live progress · no Flash dependency');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
