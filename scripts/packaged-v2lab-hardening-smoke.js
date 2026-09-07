'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{let tmp='';try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.15');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js'),bootPath=path.join(appRoot,'src','bootstrap-v2lab.js');
  const {TTSLabRuntime,QWEN_ASSET_REVISION}=require(runtimePath);
  const source=fs.readFileSync(runtimePath,'utf8'),boot=fs.readFileSync(bootPath,'utf8'),renderer=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8'),worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8'),release=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Lab.js'),'utf8'),main=fs.readFileSync(path.join(appRoot,'src','main.js'),'utf8');
  assert.strictEqual(QWEN_ASSET_REVISION,2);
  assert(boot.includes('requestSingleInstanceLock')&&boot.includes("if(!gotLock){app.quit();}else{"),'Single-instance guard no empaquetado');
  assert(source.includes('withMaintenance')&&source.includes('waitForWorkersIdle')&&source.includes('workerStops'),'Maintenance/lifecycle guard no empaquetado');
  assert(source.includes('cuda-transaction.json')&&source.includes('recoverLegacyCudaOrphans')&&source.includes('activation-pending'),'Journal/recovery CUDA no empaquetado');
  assert(source.includes('site-packages.candidate')&&source.includes('requireMarker:false')&&source.includes('TTS_ENGINE_ROLLBACK_FAILED'),'Engine staging/rollback no empaquetado');
  assert(source.includes("PYTHONPATH:[engineSite,cudaSite]")&&!source.includes('engineSite,cudaSite,existingPy'),'Aislamiento PYTHONPATH no empaquetado');
  assert(renderer.includes('v2InstallProgress')&&renderer.includes('Reintentar activación')&&renderer.includes("window.__GEC_V2LAB_RENDERER_RESPONSIVE__='lab15'"),'UX lab.15 no empaquetada');
  assert(worker.includes('GEC_TTS_MODEL_OVERLAYS')&&worker.includes('chunk-heartbeat')&&worker.includes('QWEN_SHARED_REVISION = 2'),'Overlay/heartbeat Qwen no empaquetado');
  assert(release.includes('fallbackFrom:engine')&&release.includes('recoverAllTransactions'),'Fallback/recovery startup no empaquetado');
  assert(main.includes("show:false,title:'EC Automatic News'")&&main.includes('CONTROL_LOAD_SLOW')&&main.includes("controlWindow.on('unresponsive'"),'Startup renderer guard no empaquetado');
  assert(release.includes("browser-window-created")&&release.includes("control\\.html")&&!release.includes("setTimeout(recover,50)"),'Recovery TTS diferido hasta UI no empaquetado');

  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-packaged-lab15-'));
  const rt=new TTSLabRuntime({resourcesDir,dataDir:tmp}),src=path.join(tmp,'src-folder'),dst=path.join(tmp,'dst-folder');fs.mkdirSync(src,{recursive:true});
  const real=fs.promises.rename;let attempts=0;
  fs.promises.rename=async(a,b)=>{attempts++;if(attempts===1){const e=new Error('Windows lock simulation');e.code='EPERM';throw e;}return real.call(fs.promises,a,b);};
  try{const moved=await rt.renameWithRetry(src,dst,{attempts:[5,5]});assert(moved.ok&&attempts===2&&fs.existsSync(dst));}finally{fs.promises.rename=real;}
  const oldPy=process.env.PYTHONPATH;process.env.PYTHONPATH='C:\\PACKAGED_BAD_PYTHON';try{assert(!rt.env('qwen3tts').PYTHONPATH.includes('PACKAGED_BAD_PYTHON'));}finally{if(oldPy===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=oldPy;}

  fs.rmSync(tmp,{recursive:true,force:true});tmp='';
  console.log('PACKAGED V2 HARDENING lab.15 OK · single-instance · EPERM retry · maintenance · transactional engines · clean PYTHONPATH · overlay/heartbeat');
  app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
