'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {app}=require('electron');

const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const tempDir=path.join(os.tmpdir(),`ec-0317-onnx-smoke-${process.pid}`);
const assert=(ok,message)=>{if(!ok)throw new Error(message);};

app.whenReady().then(async()=>{
  fs.mkdirSync(tempDir,{recursive:true});let kokoro=null;
  try{
    const {SettingsStore}=require(path.join(appRoot,'src','services','settings.js'));
    const {KokoroTTS}=require(path.join(appRoot,'src','services','kokoro.js'));
    require(path.join(appRoot,'src','services','documents.js'));
    const store=new SettingsStore(tempDir),s=store.load();s.tts.resourceMode='performance';s.tts.autoTuned=true;s.tts.performanceThreads=4;s.tts.performanceConfig={intraMode:'fixed',intra:4,inter:2,executionMode:'parallel',spinDurationUs:1000,spinBackoffMax:8};store.save(s);
    kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});assert(kokoro.ready(),'Kokoro empaquetado incompleto');let p=kokoro.profile();assert(p.executionMode==='parallel'&&p.onnxIntra===4&&p.inter===2,'el perfil paralelo 0.3.17 no llegó a Kokoro');assert(p.spinDurationUs===1000&&p.spinBackoffMax===8,'el perfil de spinning no llegó a Kokoro');
    const voices=await kokoro.listVoices(),voice=voices.includes('ef_dora')?'ef_dora':voices[0];const sample=await kokoro.generate('Prueba breve del modo paralelo de ONNX Runtime en EC Automatic News.',{voice,speed:1});assert(sample.path&&fs.existsSync(sample.path)&&fs.statSync(sample.path).size>1000,'ORT_PARALLEL no generó un WAV real');assert(sample.executionMode==='parallel','tts.py no aplicó ORT_PARALLEL al worker real');assert(Number(sample.inferenceMs)>0&&Number(sample.phonemeMs)>=0,'el WAV no devolvió tiempos separados de fonetización e inferencia');kokoro.cleanupAudio(sample.path);await kokoro.stopAndWait('0317-parallel-smoke');

    const auto=store.load();auto.tts.performanceConfig={intraMode:'auto',intra:0,inter:1,executionMode:'sequential',spinDurationUs:1000,spinBackoffMax:8};store.save(auto);kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});p=kokoro.profile();assert(p.intraMode==='auto'&&p.onnxIntra===0,'AUTO CPU no se conserva en el paquete');const env=kokoro.envFor(p);assert(!Object.prototype.hasOwnProperty.call(env,'OMP_NUM_THREADS'),'AUTO CPU sigue limitado por OMP_NUM_THREADS');kokoro.stop('0317-auto-smoke');kokoro=null;

    fs.rmSync(tempDir,{recursive:true,force:true});console.log(`PACKAGED ONNX 0.3.17 OK · ORT_PARALLEL WAV · tiempos fonema/inferencia · AUTO CPU · spin 1 ms/backoff 8 · voz=${voice}`);app.exit(0);
  }catch(e){console.error(e.stack||e);try{kokoro?.stop('0317-smoke-error');}catch{}try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{}app.exit(1);}
});
