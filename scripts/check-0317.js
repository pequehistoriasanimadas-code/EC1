'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ok=(v,m)=>{if(!v)throw new Error(m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const pkg=JSON.parse(read('package.json'));ok(['0.3.17','0.3.18','0.3.19','0.3.20'].includes(pkg.version),'package version debe ser 0.3.17 o posterior compatible');
const ttsPy=read('scripts/tts.py');ok(/--onnx-mode/.test(ttsPy)&&/--spin-duration-us/.test(ttsPy)&&/spin_backoff_max/.test(ttsPy),'tts.py no expone los controles avanzados de ONNX');ok(/ORT_PARALLEL/.test(ttsPy)&&/intra_op_num_threads=intra/.test(ttsPy),'tts.py no puede probar AUTO/ORT_PARALLEL');
const documents=read('src/services/documents.js');ok(/version0316Policy[\s\S]*version0317Policy[\s\S]*version0317RendererLoader/.test(documents),'la política/UI 0.3.17 no se instala después de 0.3.16');
const policySource=read('src/services/version0317Policy.js');for(const token of ['auto-sequential','auto-spin','fixed-spin','parallel-safe','performanceConfig','recentInferencePct'])ok(policySource.includes(token),`falta ${token} en la política 0.3.17`);
const uiSource=read('src/renderer-0317.js');ok(/ORT_PARALLEL/.test(uiSource)&&/AUTO CPU/.test(uiSource)&&/Cuello de botella/.test(uiSource)&&/inferencia/.test(uiSource),'la interfaz 0.3.17 no muestra diagnóstico/benchmark avanzado');
const loaderSource=read('src/services/version0317RendererLoader.js');ok(/renderer-0317\.js/.test(loaderSource)&&/web-contents-created/.test(loaderSource),'renderer-0317.js no se carga en la ventana de control');

require(path.join(root,'src/services/documents.js'));
const {SettingsStore}=require(path.join(root,'src/services/settings.js'));
const {KokoroTTS}=require(path.join(root,'src/services/kokoro.js'));
const {buildAdvancedCandidates,selectAdvancedCandidate}=require(path.join(root,'src/services/version0317Policy.js'));

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-0317-check-'));
try{
  const store=new SettingsStore(temp),s=store.load();s.tts.resourceMode='performance';s.tts.autoTuned=true;s.tts.performanceThreads=6;s.tts.performanceConfig={intraMode:'auto',intra:0,inter:1,executionMode:'sequential',spinDurationUs:1000,spinBackoffMax:8};store.save(s);
  const kokoro=new KokoroTTS({resourcesDir:root,dataDir:temp}),p=kokoro.profile();ok(p.intraMode==='auto'&&p.onnxIntra===0,'AUTO CPU no llega al perfil de Kokoro');ok(p.executionMode==='sequential'&&p.spinDurationUs===1000&&p.spinBackoffMax===8,'el perfil no conserva modo/spinning');ok(/AUTO CPU/.test(p.label),'el perfil no identifica AUTO CPU de forma humana');

  const cap=kokoro.performanceThreadCap(),candidates=buildAdvancedCandidates({savedThreads:6,maxSafeThreads:cap,currentConfig:s.tts.performanceConfig});ok(candidates.length>=4,'faltan configuraciones avanzadas para comparar');ok(candidates.some(x=>x.config.intraMode==='auto'),'el benchmark no prueba hilos AUTO');ok(candidates.some(x=>x.config.executionMode==='parallel'),'el benchmark no prueba ORT_PARALLEL');ok(candidates.some(x=>x.config.spinDurationUs===1000&&x.config.spinBackoffMax===8),'el benchmark no prueba spin 1 ms/backoff 8');ok(new Set(candidates.map(x=>JSON.stringify(x.config))).size===candidates.length,'hay configuraciones duplicadas en el benchmark');

  const chosen=selectAdvancedCandidate([{id:'fast',safe:true,realtimeFactor:1,cpuAverage:30},{id:'efficient',safe:true,realtimeFactor:1.02,cpuAverage:15},{id:'slow',safe:true,realtimeFactor:1.10,cpuAverage:8}],{tolerance:.03});ok(chosen?.id==='efficient','la selección no conserva margen de CPU dentro del 3% del mejor RTF');

  const rec={intraMode:'auto',intra:0,inter:1,executionMode:'sequential',spinDurationUs:1000,spinBackoffMax:8};global.__ec0317TtsRecommendation={settingsFile:store.file,performanceThreads:6,config:rec,summary:{recommendedId:'auto-spin'}};global.__ec0316TtsRecommendation={settingsFile:store.file,threads:6};const stale=store.load();stale.tts.performanceConfig={intraMode:'fixed',intra:6,inter:1,executionMode:'sequential',spinDurationUs:-1,spinBackoffMax:1};store.save(stale);const saved=store.load();ok(saved.tts.performanceConfig?.intraMode==='auto'&&saved.tts.performanceConfig?.spinBackoffMax===8,'un guardado posterior puede pisar la configuración ONNX recomendada');delete global.__ec0317TtsRecommendation;delete global.__ec0316TtsRecommendation;

  console.log(`EC 0.3.17 checks OK · AUTO CPU · spin 1 ms/backoff 8 · ORT_PARALLEL · diagnóstico UI · perfil persistente · cap=${cap}`);
}finally{try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
