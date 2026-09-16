'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert(['2.0.0-lab.28','2.0.0-lab.29'].includes(pkg.version),`Versión V2 Lab no compatible con este smoke: ${pkg.version}`);
  const ui=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const routing=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Lab.js'),'utf8');
  const prod=fs.readFileSync(path.join(appRoot,'src','services','releaseV2ProductionFidelity.js'),'utf8');
  const runtime=fs.readFileSync(path.join(appRoot,'src','services','ttsLabRuntime.js'),'utf8');
  const automation=fs.readFileSync(path.join(appRoot,'src','services','automation0325.js'),'utf8');

  assert(!ui.includes('id="v2ReadingSpeed"')&&!ui.includes('Velocidad de lectura'));
  assert(ui.includes('Consistencia de voz: Automática ✓')&&ui.includes('Copiar diagnóstico de voz'));
  assert(!worker.includes('def time_stretch_preserve_pitch')&&!worker.includes('phase_vocoder'));
  assert(worker.includes('speed = 1.0')&&worker.includes('chunk_seed = active_seed if active_seed else 0'));
  assert(worker.includes('voice_session_id')&&worker.includes('540 if stable_mode else 360'));
  assert(worker.includes('def cleanup_chatterbox_tail')&&worker.includes('post_silence_residual')&&worker.includes('chatterbox_tail_cleanup_ms'),'Hotfix debe limpiar solo colas Chatterbox y reportarlo');
  assert(routing.includes('fallbackExplicit:true')&&routing.includes('speed:1'));
  assert(prod.includes("const PROFILE_VERSION='2.0-lab.25'")&&prod.includes('chunkChars:540')&&prod.includes('processing-stop-lab17'));
  assert(runtime.includes('inspectReferenceAudio')&&runtime.includes('audioInfo'));
  assert(automation.includes('ttsVoiceSessionId')&&automation.includes('ttsFallbackUsed'));

  console.log(`PACKAGED V2 VOICE CONSISTENCY ${pkg.version} OK · natural speed · stable Chatterbox/Qwen · tail cleanup conservador · reference QA · safe cancel`);
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
