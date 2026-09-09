'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {TTSLabRuntime}=require(path.join(root,'src','services','ttsLabRuntime.js'));
const {normalizeProfileTts}=require(path.join(root,'src','services','releaseV2Lab.js'));
const {buildProfile,PROFILE_VERSION}=require(path.join(root,'src','services','releaseV2ProductionFidelity.js'));

function writePcm16Wav(file,{seconds=20,sampleRate=16000,amp=.18}={}){
  const frames=Math.floor(seconds*sampleRate),dataSize=frames*2,b=Buffer.alloc(44+dataSize);
  b.write('RIFF',0);b.writeUInt32LE(36+dataSize,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(dataSize,40);
  for(let i=0;i<frames;i++){const v=Math.sin(2*Math.PI*180*i/sampleRate)*amp;b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(v*32767))),44+i*2);}
  fs.writeFileSync(file,b);
}

(async()=>{
  const pkg=JSON.parse(read('package.json')),ui=read('src/renderer-v2lab.js'),worker=read('src/tts_lab_worker.py'),routing=read('src/services/releaseV2Lab.js'),prod=read('src/services/releaseV2ProductionFidelity.js'),automation=read('src/services/automation0325.js');
  assert.strictEqual(pkg.version,'2.0.0-lab.22');
  assert.strictEqual(PROFILE_VERSION,'2.0-lab.22');

  assert(!ui.includes('id="v2ReadingSpeed"')&&!ui.includes('Velocidad de lectura'),'Lab.16 no debe mostrar velocidad de lectura');
  assert(ui.includes('Consistencia de voz: Automática ✓'),'La UI debe explicar consistencia sin parámetros técnicos');
  assert(ui.includes("baseSpeedLabel.classList.add('hidden')"),'El control heredado de velocidad debe quedar oculto');
  assert(ui.includes('Copiar diagnóstico de voz'),'Falta diagnóstico copiable');

  const normalized=normalizeProfileTts({engine:'chatterbox',speed:.75,engineParams:{chatterbox:{speed:.8,variant:'latam'},qwen3tts:{speed:1.2}}});
  assert.strictEqual(normalized.speed,1);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized.engineParams.chatterbox,'speed'),false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized.engineParams.qwen3tts,'speed'),false);

  assert(!worker.includes('def time_stretch_preserve_pitch'),'El time-stretch obsoleto debe eliminarse');
  assert(!worker.includes('phase_vocoder'),'No debe quedar phase-vocoder de velocidad');
  assert(worker.includes('speed = 1.0'),'Worker debe generar a velocidad natural');
  assert(worker.includes('0.60 if stable_mode else configured_temperature'),'Chatterbox debe tener consistencia automática interna');
  assert(worker.includes('chatter_chunk')&&worker.includes('540 if stable_mode else 360'),'Chatterbox estable debe reducir cambios de chunk');
  assert(worker.includes('chunk_seed = active_seed if active_seed else 0'),'Cada chunk debe ser reproducible');
  assert(worker.includes('voice_session_id')&&worker.includes('voice_config_fingerprint'),'Falta sesión de voz fija por noticia');
  assert(worker.includes('def cleanup_chatterbox_tail')&&worker.includes('post_silence_residual')&&worker.includes('low_level_tail'),'Chatterbox debe limpiar solo la cola de cada chunk');
  assert(worker.includes('chatterbox_tail_cleanup_ms')&&worker.includes('tail_cleanup_reason'),'La limpieza Chatterbox debe ser auditable por diagnóstico');

  assert(routing.includes('fallbackExplicit:true'),'Fallback debe quedar marcado explícitamente');
  assert(read('src/services/ttsLabRuntime.js').includes('automaticConsistency')&&read('src/services/ttsLabRuntime.js').includes("effectiveParams.productionSeed"),'La consistencia automática debe funcionar también antes de Optimizar GEC');
  assert(routing.includes("baseGenerate.call(this,text,{...options,speed:1})"),'Kokoro/fallback debe usar velocidad natural');
  assert(prod.includes("engine==='chatterbox'?{")&&prod.includes('chunkChars:540')&&prod.includes("consistencyMode:'stable-v1'"),'Perfil lab.22 debe estabilizar Chatterbox');
  assert(prod.includes("source:engine==='qwen3tts'&&identity.mode==='finetuned'?'fine-tuned-model':engine==='chatterbox'?'reference-audio'"),'Debe distinguir modelo entrenado vs referencia');
  assert(prod.includes('processing-stop-lab17')&&prod.includes('Promise.allSettled'),'Detener preparación debe liberar motores/GPU');
  assert(automation.includes('ttsVoiceSessionId')&&automation.includes('ttsChunkDiagnostics'),'Producción debe conservar diagnóstico de sesión/chunks');
  assert(automation.includes('ttsFallbackUsed'),'Producción debe registrar fallback');

  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab17-ref-'));
  try{
    const resources=path.join(tmp,'resources'),data=path.join(tmp,'data');fs.mkdirSync(resources,{recursive:true});fs.mkdirSync(data,{recursive:true});
    const runtime=new TTSLabRuntime({resourcesDir:resources,dataDir:data});
    const wav=path.join(tmp,'reference.wav');writePcm16Wav(wav,{seconds:20,amp:.18});
    const meta=runtime.importReference(wav);
    assert(meta.audioInfo,'La referencia importada debe analizarse');
    assert(meta.audioInfo.durationSec>19&&meta.audioInfo.durationSec<21);
    assert.strictEqual(meta.audioInfo.quality,'good');
    assert(meta.audioInfo.fingerprint);
    const listed=runtime.listVoices().find(x=>x.id===meta.id);
    assert(listed?.audioInfo?.quality==='good');

    const short=path.join(tmp,'short.wav');writePcm16Wav(short,{seconds:3,amp:.18});
    const shortMeta=runtime.importReference(short);
    assert.strictEqual(shortMeta.audioInfo.quality,'warning');
    assert(shortMeta.audioInfo.warnings.some(x=>/corta/i.test(x)));

    const settings={ai:{primary:'local',localTunedConfig:{gpuLayers:48,ctx:4096,batch:384,ubatch:192,threads:4}},tts:{engine:'chatterbox',referenceVoiceId:meta.id,engineParams:{chatterbox:{variant:'latam',temperature:.8}}}};
    const profile=buildProfile(settings,{source:'optimizer',validated:true,fingerprint:'hw',localResult:{recommendedConfig:settings.ai.localTunedConfig,summary:{tokensPerSec:100,coexistenceMode:'gpu-coordinated',coordinatedValidated:true,coordinatedTps:90}},ttsResult:{stableRealtimeFactor:.7},pipelineMode:'gpu-coordinated'});
    assert.strictEqual(profile.tts.referenceVoiceId,meta.id);
    assert.strictEqual(profile.tts.runtimeParams.chunkChars,540);
    assert.strictEqual(profile.tts.runtimeParams.consistencyMode,'stable-v1');
    assert(profile.tts.runtimeParams.productionSeed>0);
    assert(profile.tts.runtimeParams.productionTemperature<=.60);
    assert.strictEqual(profile.voiceConsistency.source,'reference-audio');
    assert.strictEqual(profile.voiceConsistency.naturalSpeed,true);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}

  console.log('check-v2lab-voice-consistency: OK · no speed control · natural audio · Chatterbox/Qwen consistency · reference quality · tail cleanup conservador · safe cancel · explicit fallback');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
