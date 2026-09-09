'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const {ProfileManager0329,atomicJson}=require('../src/services/profileManager0329');
const {ProfilePackage0329,writePackage,readPackage}=require('../src/services/profilePackage0329');

const defaults={
  ai:{primary:'local',backup1:'claude',backup2:'none',claudeKeyEnc:'LOCAL-KEY',geminiKeyEnc:'',claudeModel:'fixed',localResourceMode:'tuned',localAutoTuned:true,localTunedConfig:{gpuLayers:99},lastLocalBenchmark:{tokensPerSec:101}},
  tts:{voice:'ef_dora',speed:1,resourceMode:'performance',performanceThreads:24,engineOptimizations:{'qwen3tts:finetuned:a':{marker:'machine'}}},
  visual:{theme:{yellow:'#F7C600'},queueColors:{rss:'#111111'},fallbackImage:'',output:{format:'16:9',musicFile:'',verticalVideoBackground:''}},
  rssFeeds:[],rssPartialClose:{},exclusiveClose:{},canned:{},documents:{processed:{}},automation:{bufferReady:15}
};
function uuid(){return crypto.randomUUID();}
function payload({name='Perfil',profileSchemaVersion=1,kind='profile',settings={},globalSettings=null,packageSchemaVersion=1}={}){
  const id=uuid(),manifest={format:'GEC_PROFILE_PACKAGE',packageSchemaVersion,profileSchemaVersion,globalSchemaVersion:1,kind,createdBy:'test',createdAt:new Date().toISOString()};
  if(kind==='all')manifest.activeProfileId=id;
  return{manifest,globalSettings:kind==='all'?globalSettings:null,profiles:[{meta:{id,name,color:'#F7C600',schemaVersion:profileSchemaVersion},settings}],resources:[],voiceManifest:[]};
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab24-profile-'));
try{
  const m=new ProfileManager0329(root);
  atomicJson(m.globalSettingsFile,{
    ai:{claudeKeyEnc:'LOCAL-KEY',localResourceMode:'tuned',localAutoTuned:true,localTunedConfig:{gpuLayers:99},lastLocalBenchmark:{tokensPerSec:101}},
    tts:{resourceMode:'performance',performanceThreads:24,engineOptimizations:{machine:{keep:true}}},
    optimization0321:{fingerprint:'THIS-PC',summary:'optimización local'}
  });
  const pack=new ProfilePackage0329({manager:m,dataDir:root});

  // Perfil antiguo: faltan campos actuales y contiene optimización ajena.
  const legacyFile=path.join(root,'legacy.gecprofile');
  const legacy=payload({name:'Antiguo',profileSchemaVersion:0,settings:{
    rssFeeds:[{id:'old',name:'Vieja',url:'https://old.test'}],
    automation:{bufferReady:9},
    ai:{primary:'claude',localTunedConfig:{gpuLayers:1},lastLocalBenchmark:{tokensPerSec:1}},
    optimization0321:{fingerprint:'OTHER-PC'}
  }});
  delete legacy.manifest.packageSchemaVersion; // compatibilidad con paquete antiguo sin número explícito.
  writePackage(legacyFile,legacy);
  const legacyInfo=pack.readInfo(legacyFile);assert.equal(legacyInfo.packageSchemaVersion,1);assert.equal(legacyInfo.profileSchemaVersion,0);assert.equal(legacyInfo.legacyProfile,true,'schema 0 debe identificarse como perfil legacy');
  const lr=pack.importFile(legacyFile,'keep');assert(lr.ok);
  const oldId=lr.imported[0],oldSettings=m.readProfileSettings(oldId);
  assert.equal(oldSettings.rssFeeds[0].id,'old');assert.equal(oldSettings.automation.bufferReady,9);
  assert.equal(oldSettings.optimization0321,undefined,'perfil antiguo no puede traer optimización de otra PC');
  assert.equal(oldSettings.ai.localTunedConfig,undefined,'perfil antiguo no puede traer tuning de otra PC');
  let global=m.globalSettings(defaults);assert.equal(global.optimization0321.fingerprint,'THIS-PC');assert.equal(global.ai.localTunedConfig.gpuLayers,99);

  // Perfil actual: importa todos los campos operativos actuales.
  const currentFile=path.join(root,'current.gecprofile');
  const current=payload({name:'Actual',profileSchemaVersion:1,settings:{
    rssFeeds:[{id:'new',name:'Actual',url:'https://new.test'}],
    automation:{bufferReady:15,exclusiveEveryNews:4,openExclusiveArticles:true,exclusiveReserveMax:10},
    visual:{output:{format:'9:16',titleColor:'#FFFFFF'}},
    ai:{primary:'local'}
  }});
  writePackage(currentFile,current);const cr=pack.importFile(currentFile,'keep');assert(cr.ok);
  const now=m.readProfileSettings(cr.imported[0]);assert.equal(now.automation.openExclusiveArticles,true);assert.equal(now.visual.output.format,'9:16');

  // Perfil con schema de perfil más nuevo pero mismo contenedor: conserva campos desconocidos.
  const forwardFile=path.join(root,'forward.gecprofile');
  writePackage(forwardFile,payload({name:'Nuevo',profileSchemaVersion:2,settings:{automation:{bufferReady:12},futureFeature:{enabled:true,mode:'next'}}}));
  const fr=pack.importFile(forwardFile,'keep');assert(fr.ok);const fw=m.readProfileSettings(fr.imported[0]);assert.deepStrictEqual(fw.futureFeature,{enabled:true,mode:'next'});

  // Paquete completo no puede reemplazar benchmark/tuning de esta PC.
  const allFile=path.join(root,'all.gecpack');
  writePackage(allFile,payload({name:'Completo',kind:'all',settings:{automation:{bufferReady:7}},globalSettings:{
    ai:{localResourceMode:'foreign',localTunedConfig:{gpuLayers:2}},
    tts:{resourceMode:'foreign',performanceThreads:2,engineOptimizations:{foreign:true}},
    optimization0321:{fingerprint:'FOREIGN-PC'}
  }}));
  const ar=pack.importFile(allFile,'keep');assert(ar.ok);global=m.globalSettings(defaults);
  assert.equal(global.optimization0321.fingerprint,'THIS-PC');assert.equal(global.ai.localTunedConfig.gpuLayers,99);assert.equal(global.tts.performanceThreads,24);assert.deepStrictEqual(global.tts.engineOptimizations.machine,{keep:true});assert.deepStrictEqual(global.tts.engineOptimizations['qwen3tts:finetuned:a'],{marker:'machine'});assert.equal(global.tts.engineOptimizations.foreign,undefined,'el gecpack no puede importar optimizaciones TTS de otra PC');

  // Un package schema realmente más nuevo se rechaza con explicación clara.
  const futurePackage=path.join(root,'future-package.gecprofile');writePackage(futurePackage,payload({name:'Incompatible',packageSchemaVersion:2}));
  assert.throws(()=>readPackage(futurePackage),/versión más nueva de GEC/i);

  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const main=read('src/main.js'),stability=read('src/services/profileStability0329.js'),preload=read('src/preload.js'),control=read('src/control.html'),r0324=read('src/renderer-0324.js'),r0330=read('src/renderer-0330.js'),lan=read('src/renderer-lan-output.js'),css=read('src/control-lan-output.css'),optimizer=read('src/renderer-0321.js'),boot=read('src/bootstrap-v2lab.js'),boot0329=read('src/bootstrap-0329.js');
  assert(main.includes('CONTROL_LOAD_CANCELLED')&&main.includes('controlledShutdown()'),'reinicio controlado debe suprimir falsos errores de carga');
  assert(main.includes("Number(code)===-3")&&main.includes('CONTROL_LOAD_ABORTED')&&main.includes('CONTROL_UI_READY'),'startup lab.24 debe tratar ERR_ABORTED como transitorio y verificar la UI real');
  const startupBlock=main.slice(main.indexOf('function createControlWindow(){'),main.indexOf('function applyOutputWindowFormat'));
  assert(!startupBlock.includes('reloadIgnoringCache'),'startup lab.24 no debe competir con recargas automáticas del renderer');
  assert(startupBlock.includes("!uiReady&&!domReady")&&startupBlock.includes('CONTROL_UNRESPONSIVE_WAIT'),'unresponsive después de DOM-ready no debe disparar una nueva navegación');
  assert(stability.includes('__ecPrepareControlledRelaunch')&&stability.includes('__ecRefreshOutputAfterProfileChange'),'perfil debe coordinar relaunch y refresco Output');
  for(const v of ['renderer-0317.js','renderer-0318.js','renderer-0319.js','renderer-0320.js','renderer-0321.js','renderer-0322.js','renderer-0323.js'])assert(preload.includes(v),`falta restaurar ${v}`);
  assert(!control.includes('control-0324.css')&&!control.includes('renderer-0324.js'),'control.html no debe duplicar assets versionados que ya inyecta preload');
  assert(r0324.includes('__ec0323UiInstalled'),'0.3.24 debe esperar la cadena previa completa');
  const migrateBlock=r0330.slice(r0330.indexOf('async function migrateGlobalOptimization()'),r0330.indexOf('function enhanceCustomIntervalUi'));
  assert(migrateBlock.includes('gec:settings-updated')&&!migrateBlock.includes('location.reload'),'migración global no debe recargar la interfaz durante startup');
  assert(optimizer.includes('ecOptimizer0321')&&optimizer.includes('Optimización automática de EC'),'optimizador debe existir en Ajustes');
  assert(boot.includes('__ecSingleInstanceLockOwned')&&boot0329.includes('inheritedLock'),'V2 debe poseer un solo single-instance lock a través de la cadena legacy');
  assert(lan.includes('ecAutoRightColumn')&&lan.includes('outputLanEnsure')&&lan.includes("'profile:changed'"),'monitor debe quedar arriba de la cola y recuperarse');
  assert(css.includes('#ecAutoRightColumn'),'layout de monitor/cola no aplicado');
  console.log('check-v2lab-profile-compat: OK · schema legacy 0 · startup sin reload competitivo · ERR_ABORTED recuperable · lock único · monitor recuperable');
}finally{fs.rmSync(root,{recursive:true,force:true});}
