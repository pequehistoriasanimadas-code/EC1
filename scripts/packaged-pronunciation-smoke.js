'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const tempDir=path.join(os.tmpdir(),`ec-0316-pronunciation-${process.pid}`);
const assert=(v,m)=>{if(!v)throw new Error(m);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));

app.whenReady().then(async()=>{
  let kokoro=null;
  try{
    fs.mkdirSync(tempDir,{recursive:true});
    const learning={schemaVersion:2,entries:[
      {term:'MX',pronunciation:'mex',needsReplacement:true,source:'manual',confidence:1,uses:0},
      {term:'PUCP',pronunciation:'puc',needsReplacement:true,source:'manual',confidence:1,uses:0}
    ]};
    fs.writeFileSync(path.join(tempDir,'pronunciation-learning.json'),JSON.stringify(learning,null,2),'utf8');
    const {installVersion0316Policy}=require(path.join(appRoot,'src','services','version0316Policy.js'));installVersion0316Policy();
    const {PronunciationNormalizer}=require(path.join(appRoot,'src','services','pronunciation.js'));
    const {KokoroTTS}=require(path.join(appRoot,'src','services','kokoro.js'));
    const pron=new PronunciationNormalizer({resourcesDir,dataDir:tempDir,getSettings:()=>({tts:{pronunciationSmart:true,pronunciationClaudeVerify:false,pronunciationMaxSeconds:15}})});
    const result=await pron.normalize('MX y PUCP anunciaron novedades.',{smart:true});
    assert(/\bmex\b/i.test(result.text)&&/\bpuc\b/i.test(result.text),`El JSON aprendido no llegó al texto TTS: ${result.text}`);
    assert(result.smartUsed===true,'El normalizador no reportó uso del aprendizaje JSON');
    assert(result.qwenAttempted===false,'Qwen fue consultado para términos que ya estaban aprendidos');
    const exported=pron.exportLearning(),mx=exported.entries.find(x=>x.term==='MX'),pucp=exported.entries.find(x=>x.term==='PUCP');assert(mx?.uses===1&&pucp?.uses===1,'Los contadores de uso no confirman que se consultó el aprendizaje');
    pron.learn('MX','eme equis',true,'claude',1);assert(pron.exportLearning().entries.find(x=>x.term==='MX')?.pronunciation==='mex','Claude pudo sobrescribir una corrección manual');

    kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});assert(kokoro.ready(),'Kokoro empaquetado no está completo');const voices=await kokoro.listVoices(),voice=voices.includes('ef_dora')?'ef_dora':voices[0];assert(voice,'No hay voces Kokoro disponibles');
    const health=await kokoro.healthCheck(true);assert(health.ok&&health.esSupported,'eSpeak no confirmó español en la prueba de pronunciación');
    const audio=await kokoro.generate(result.text,{voice,speed:1});assert(audio.path&&fs.existsSync(audio.path)&&fs.statSync(audio.path).size>1000,'Kokoro no generó WAV desde el texto corregido por el JSON');assert(audio.persistent===true,'La prueba end-to-end no utilizó el worker persistente');kokoro.cleanupAudio(audio.path);await kokoro.stopAndWait('pronunciation-smoke');kokoro=null;
    console.log(`PACKAGED PRONUNCIATION 0.3.16 OK · JSON → mex/puc → Kokoro WAV · Qwen no consultado · voz=${voice}`);
    await delay(150);try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{}app.exit(0);
  }catch(e){console.error(e.stack||e);try{await kokoro?.stopAndWait?.('pronunciation-smoke-error');}catch{}try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{}app.exit(1);}
});
