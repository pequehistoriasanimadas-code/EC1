'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ok=(v,m)=>{if(!v)throw new Error(m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const pkg=JSON.parse(read('package.json'));ok(['0.3.16','0.3.17','0.3.18'].includes(pkg.version),'package version debe ser 0.3.16 o posterior compatible');
const docPolicy=read('src/services/documentAutoPolicy.js');ok(!/installTtsPerformancePolicy|KokoroTTS/.test(docPolicy),'documentAutoPolicy todavía contiene el optimizador Kokoro antiguo');
const documentsSource=read('src/services/documents.js');ok(/broadcastSchedulerPolicy[\s\S]*version0316Policy/.test(documentsSource),'la política final 0.3.16 no se instala después del scheduler');
const ui=read('src/renderer-patches.js');ok(/generatedSchedulerControls/.test(ui)&&/recoveryControls/.test(ui),'la programación de Notas Generadas no está separada de Recuperación de autonomía');ok(/buffer\.onchange/.test(ui)&&/saveAutomationOnly/.test(ui),'Objetivo de noticias listas no se sincroniza en vivo');ok(/documentStatusLabel/.test(ui)&&/Al aire/.test(ui)&&/Emitida/.test(ui),'Generador no muestra el ciclo completo de estados');
const policySource=read('src/services/version0316Policy.js');ok(/performanceThreads:answer\.recommendedThreads/.test(policySource)&&/baselineCpu>=75/.test(policySource)&&/tolerance:\.03/.test(policySource),'Kokoro 0.3.16 no conserva optimización segura/persistente');ok(/source='manual'/.test(policySource)&&/manualChanges/.test(policySource),'cambios importados de pronunciación no quedan protegidos como manuales');ok(/pronunciation-learning\.backup-0\.3\.16\.json/.test(policySource),'falta backup de migración de pronunciación');ok(/__ec0316ReservedAd/.test(policySource)&&/Después del contenido/.test(policySource),'el anuncio no queda reservado/visible durante el contenido');

require(path.join(root,'src/services/documents.js'));
const {SettingsStore}=require(path.join(root,'src/services/settings.js'));
const {PronunciationNormalizer}=require(path.join(root,'src/services/pronunciation.js'));
const {AutomationEngine}=require(path.join(root,'src/services/automation.js'));
const {augmentDocumentList}=require(path.join(root,'src/services/version0316Policy.js'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-0316-check-'));
try{
  const store=new SettingsStore(temp),initial=store.load();initial.tts.resourceMode='performance';initial.tts.autoTuned=true;initial.tts.performanceThreads=6;store.save(initial);
  global.__ec0316TtsRecommendation={settingsFile:store.file,threads:10};const stale=store.load();stale.tts.performanceThreads=6;store.save(stale);ok(store.load().tts.performanceThreads===10,'un save posterior puede pisar performanceThreads recomendado');delete global.__ec0316TtsRecommendation;

  const learningFile=path.join(temp,'pronunciation-learning.json');fs.writeFileSync(learningFile,JSON.stringify({schemaVersion:2,entries:[{term:'MX',pronunciation:'eme equis',needsReplacement:true,source:'claude',confidence:.93,uses:0}]},null,2));
  const pron=new PronunciationNormalizer({resourcesDir:temp,dataDir:temp,getSettings:()=>({tts:{pronunciationSmart:true,pronunciationClaudeVerify:false,pronunciationMaxSeconds:15}})});
  const imported=pron.importLearning({schemaVersion:2,entries:[{term:'MX',pronunciation:'mex',needsReplacement:true,source:'claude',confidence:.93,uses:0}]});ok(imported.manualChanges===1,'el cambio externo MX→mex no se detectó como manual');let mx=pron.learning.entries.mx;ok(mx?.source==='manual'&&mx.pronunciation==='mex'&&mx.confidence===1,'MX manual no quedó protegido');
  const beforeUses=mx.uses;const normalizedPromise=pron.normalize('MX ganó.',{smart:true});Promise.resolve(normalizedPromise).then(()=>{});

  const settings={automation:{bufferReady:15,queueMax:30,targetAutonomyMin:15,generatedEveryRss:5,recoveryAutonomyMin:8,criticalAutonomyMin:3},canned:{enabled:true,interval:10,folder:'C',adsFolder:'A',insertAdAfterContent:true,emergency:true,adaptiveDuration:true},visual:{pauseSeconds:0}};
  const makeEngine=()=>new AutomationEngine({rss:{},fetchArticle:null,providers:null,kokoro:null,pronunciation:null,canned:{peek:()=>({name:'CONTENIDO.mp4'}),peekForDuration:()=>({name:'CONTENIDO.mp4'}),requestDuration:()=>{}},ads:{peek:()=>({name:'ANUNCIO.mp4'})},history:{file:path.join(temp,'history.json'),add:()=>{}},getSettings:()=>settings,getFallbackUrl:()=>'',sendAutomaticOutput:()=>true,isOutputReady:()=>true,controlOutput:()=>{}});

  (async()=>{
    const normalized=await normalizedPromise;ok(/\bmex\b/i.test(normalized.text),'la regla aprendida MX→mex no llegó al texto de locución');ok(normalized.smartUsed===true,'el normalizador no reportó uso del aprendizaje');ok(normalized.qwenAttempted===false,'Qwen fue consultado aunque MX ya estaba aprendido');mx=pron.learning.entries.mx;ok(mx.uses===beforeUses+1,'el uso de la regla aprendida no se contabilizó');pron.learn('MX','eme equis',true,'claude',1);ok(pron.learning.entries.mx.pronunciation==='mex'&&pron.learning.entries.mx.source==='manual','Claude pudo sobrescribir una regla manual');
    ok(!pron.candidates('Además informó el resultado.').some(x=>x.term==='Además'),'una palabra española solo capitalizada sigue entrando como candidata');ok(!pron.candidates('FOX One. En Estados Unidos hubo cambios.').some(x=>/[.!?;\r\n]/.test(x.term)),'una candidata de pronunciación atraviesa el final de una oración');

    const doc={fingerprint:'doc-0316',path:path.join(temp,'nota.txt'),title:'Nota 0316'};fs.writeFileSync(doc.path,'texto');const e1=makeEngine();e1.__ecSetDocumentProcessed(doc,true);let rec=new SettingsStore(temp).load().documents.processed[doc.fingerprint];ok(rec?.status==='ready'&&rec.generatedAt&&!rec.emittedAt,'documento listo no persiste generatedAt/status ready');
    const e2=makeEngine();e2.snapshot();rec=new SettingsStore(temp).load().documents.processed[doc.fingerprint];ok(!rec,'una nota lista pero no emitida queda bloqueada después de reiniciar');e2.__ecSetDocumentProcessed(doc,true);e2.currentItem={sourceType:'generated',document:doc,metrics:{},audio:{durationSec:30}};e2.addEmissionHistory('generated',doc.title,'EMITIDA',{durationSec:30});rec=new SettingsStore(temp).load().documents.processed[doc.fingerprint];ok(rec?.status==='emitted'&&rec.emittedAt&&rec.generatedAt,'documento emitido no conserva estado/timestamps');e2.snapshot();const listed=augmentDocumentList({files:[{fingerprint:doc.fingerprint,processed:true}]});ok(listed.files[0].documentStatus==='emitted'&&listed.files[0].documentStatusLabel==='Emitida','documents:list no traduce el estado persistido a Emitida');

    e2.currentKind='canned';e2.currentCanned={name:'CONTENIDO.mp4'};e2.__ec0316ReservedAd={name:'ANUNCIO.mp4',path:'A/anuncio.mp4'};const rows=e2.displayQueue(settings),contentAt=rows.findIndex(x=>x.sourceType==='content'&&x.status==='AL AIRE'),adAt=rows.findIndex(x=>x.sourceType==='ad'&&x.status==='PROGRAMADO');ok(contentAt>=0&&adAt===contentAt+1&&rows[adAt].planText==='Después del contenido','el anuncio desaparece o cambia de posición mientras el contenido está al aire');
    console.log('EC 0.3.16 checks OK · documentos persistentes · anuncio reservado · pronunciación manual · objetivo UI · Kokoro único');
  })().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{try{fs.rmSync(temp,{recursive:true,force:true});}catch{}});
}catch(e){try{fs.rmSync(temp,{recursive:true,force:true});}catch{}throw e;}
