'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert(['2.0.0-lab.28','2.0.0-lab.29'].includes(pkg.version),`Versión V2 Lab no compatible con este smoke: ${pkg.version}`);
  const ui=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const runtime=fs.readFileSync(path.join(appRoot,'src','services','ttsLabRuntime.js'),'utf8');
  const routing=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Lab.js'),'utf8');
  const prod=fs.readFileSync(path.join(appRoot,'src','services','releaseV2ProductionFidelity.js'),'utf8');
  const preload=fs.readFileSync(path.join(appRoot,'src','preload.js'),'utf8');

  assert(!ui.includes('id="v2ChatterVariant"'));
  assert(!ui.includes('Multilingual V3'));
  assert(ui.includes('Español latinoamericano ✓')&&ui.includes('Comprobar consistencia'));
  assert(!worker.includes('ChatterboxMultilingualTTS.from_pretrained'));
  assert(worker.includes('requested = "chatterbox-latam"')&&worker.includes('variant = "latam"'));
  assert(worker.includes('forceSingleChunk'));
  assert(runtime.includes("chatterboxVariant(params={}){return'latam';}")&&runtime.includes('checkChatterboxConsistency'));
  assert(routing.includes("bind('tts-lab:checkConsistency'"));
  assert(preload.includes('ttsLabCheckConsistency'));
  assert(prod.includes("const PROFILE_VERSION='2.0-lab.25'"));

  console.log(`PACKAGED V2 LATAM ONLY ${pkg.version} OK · no Multilingual route · consistency comparison packaged`);
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
