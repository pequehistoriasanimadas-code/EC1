'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),Module=require('module');
let checks=0;const ok=(v,m)=>{checks++;assert.ok(v,m);},eq=(a,b,m)=>{checks++;assert.deepStrictEqual(a,b,m);};
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-stability-0329-'));
const originalLoad=Module._load;
try{
  Module._load=function(request,parent,isMain){if(request==='electron')return{app:{isPackaged:false,getPath:()=>tmp},ipcMain:{removeHandler(){},handle(){}},dialog:{},BrowserWindow:{getAllWindows:()=>[]}};return originalLoad.apply(this,arguments);};
  const stability=require('../src/services/profileStability0329');
  ok(stability.contrast('#F7C600')>=3,'amarillo de perfil legible');
  assert.throws(()=>stability.assertReadableColor('#050505'),/demasiado oscuro/i);checks++;
  eq(stability.assertReadableColor('#22C55E'),'#22C55E','verde de perfil aceptado');
  const normalized=stability.normalizeProcessedMap({documents:{processed:{queued:{queuedAt:'x'},done:{emittedAt:'y'},legacy:{path:'z'}}}});
  eq(normalized.documents.processed.queued.status,'queued','estado queued preservado');
  eq(normalized.documents.processed.done.status,'emitted','estado emitido inferido');
  eq(normalized.documents.processed.legacy.status,'emitted','legacy se considera procesado para compatibilidad');
}finally{Module._load=originalLoad;fs.rmSync(tmp,{recursive:true,force:true});}
const stabilitySrc=read('src/services/profileStability0329.js'),watcherSrc=read('src/services/profileWatcherFinal0329.js'),statesSrc=read('src/services/profileDocumentStatesFinal0329.js'),bootstrap=read('src/bootstrap-0329.js');
for(const token of ['installLegacyWatcherSuppression','queueNewDocumentsFromWatch','DOCUMENT_PROFILE_SWITCH','DOCUMENT_ALREADY_QUEUED',"status==='emitted'",'countRecursiveAsync',"info.kind==='profile'&&oldId","finally{if(e)e.__ec0329Switching=false",'backup1','localRuntime'])ok(stabilitySrc.includes(token),`stability: falta ${token}`);
ok(watcherSrc.includes('__ec0329WatchFallbackTimer')&&watcherSrc.includes('clearInterval'),'watcher fallback anterior se elimina');
for(const token of ["'queued'","'generating'","'ready'","'failed'","'emitted'"])ok(statesSrc.includes(token),`lifecycle documento: falta ${token}`);
ok(bootstrap.indexOf('installLegacyWatcherSuppression')<bootstrap.indexOf("require('./bootstrap-0328')"),'watcher legacy se suprime antes de cargar main');
ok(bootstrap.includes('installProfileDocumentStatesFinal0329')&&bootstrap.includes('installProfileWatcherFinal0329'),'capas finales conectadas');
console.log(`GEC 0.3.29 stability checks OK · ${checks} verificaciones`);
