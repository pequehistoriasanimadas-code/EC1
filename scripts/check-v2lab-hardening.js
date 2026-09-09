'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {TTSLabRuntime,CUDA_RUNTIME,CUDA_CRITICAL_FILES,QWEN_ASSET_REVISION}=require(path.resolve(__dirname,'..','src','services','ttsLabRuntime.js'));
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),wait=ms=>new Promise(r=>setTimeout(r,ms));

function makePython(resources){const p=path.join(resources,'runtime','python','python.exe');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'fake');}
function writeCritical(site,tag='v2'){for(const rel of CUDA_CRITICAL_FILES){const p=path.join(site,...rel.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.from(tag+':'+rel));}}
function writeMarker(rt,rootDir=rt.cudaRoot){const site=path.join(rootDir,'site-packages'),manifest=rt.cudaManifestForSite(site);assert(manifest);fs.mkdirSync(rootDir,{recursive:true});fs.writeFileSync(rt.cudaMarker(rootDir),JSON.stringify({revision:CUDA_RUNTIME.revision,slot:CUDA_RUNTIME.slot,torch:CUDA_RUNTIME.torch,torchaudio:CUDA_RUNTIME.torchaudio,manifest},null,2));}

(async()=>{
  const pkg=JSON.parse(read('package.json')),runtimeSource=read('src/services/ttsLabRuntime.js'),worker=read('src/tts_lab_worker.py'),release=read('src/services/releaseV2Lab.js'),renderer=read('src/renderer-v2lab.js'),boot=read('src/bootstrap-v2lab.js'),main=read('src/main.js');
  assert.strictEqual(pkg.version,'2.0.0-lab.20');
  assert.strictEqual(QWEN_ASSET_REVISION,2);
  assert(boot.includes('requestSingleInstanceLock')&&boot.includes("if(!gotLock){app.quit();}else{")&&boot.indexOf("require('./bootstrap-0332')")>boot.indexOf("if(!gotLock)"),'Lab.14 debe impedir que una segunda instancia inicialice servicios');
  assert(runtimeSource.includes('withMaintenance')&&runtimeSource.includes('waitForWorkersIdle')&&runtimeSource.includes('workerStops'),'Falta coordinador global de mantenimiento/lifecycle TTS');
  assert(runtimeSource.includes('cuda-transaction.json')&&runtimeSource.includes('activation-pending')&&runtimeSource.includes('recoverLegacyCudaOrphans'),'Falta journal/recovery CUDA lab.20');
  assert(runtimeSource.includes('site-packages.candidate')&&runtimeSource.includes('site-packages.backup')&&runtimeSource.includes('requireMarker:false'),'Instalación de motores debe validar staging antes del marcador');
  assert(runtimeSource.includes("['EPERM','EBUSY','EACCES']")&&runtimeSource.includes('renameWithRetry'),'Faltan reintentos Windows EPERM/EBUSY/EACCES');
  assert(runtimeSource.includes("PYTHONPATH:[engineSite,cudaSite]")&&!runtimeSource.includes('engineSite,cudaSite,existingPy'),'Workers TTS no deben heredar PYTHONPATH externo');
  assert(runtimeSource.includes('expectedRtf')&&runtimeSource.includes('420000')&&worker.includes('chunk-heartbeat'),'Watchdog de voz debe usar RTF y heartbeat');
  assert(worker.includes('GEC_TTS_MODEL_OVERLAYS')&&worker.includes('QWEN_SHARED_REVISION = 2')&&worker.includes('return overlay, repaired'),'Qwen fine-tuned debe usar overlay sin modificar el checkpoint importado');
  assert(release.includes('fallbackToKokoro')&&release.includes('fallbackFrom:engine'),'Fallback Kokoro configurado no estaba conectado al routing real');
  assert(renderer.includes('v2InstallProgress')&&renderer.includes('Reintentar activación')&&renderer.includes('Instalación / preparación incompleta'),'UX de progreso/error persistente lab.20 incompleta');
  assert(main.includes("show:false,title:'EC Automatic News'")&&main.includes('CONTROL_LOAD_SLOW')&&main.includes("controlWindow.on('unresponsive'")&&main.includes("did-finish-load"),'La ventana principal debe esperar al renderer y vigilar arranques negros');
  assert(release.includes("browser-window-created")&&release.includes("control\\.html")&&release.includes("setTimeout(recover,8000)")&&!release.includes("setTimeout(recover,50)"),'La recuperación TTS debe esperar a la UI principal en lab.20');

  const base=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab17-hardening-'));
  try{
    // renameWithRetry: first EPERM recovers without caller intervention.
    {
      const data=path.join(base,'rename-data'),res=path.join(base,'rename-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data}),src=path.join(base,'rename-src'),dst=path.join(base,'rename-dst');fs.mkdirSync(src,{recursive:true});
      const real=fs.promises.rename;let calls=0;
      fs.promises.rename=async(a,b)=>{calls++;if(calls===1){const e=new Error('locked');e.code='EPERM';throw e;}return real.call(fs.promises,a,b);};
      try{const out=await rt.renameWithRetry(src,dst,{attempts:[5,5]});assert(out.ok&&calls===2&&fs.existsSync(dst));}
      finally{fs.promises.rename=real;}
    }

    // Permanent Windows lock must remain explicit/retryable.
    {
      const data=path.join(base,'rename2-data'),res=path.join(base,'rename2-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data}),src=path.join(base,'rename2-src'),dst=path.join(base,'rename2-dst');fs.mkdirSync(src,{recursive:true});
      const real=fs.promises.rename;fs.promises.rename=async()=>{const e=new Error('still locked');e.code='EPERM';throw e;};let err=null;
      try{await rt.renameWithRetry(src,dst,{attempts:[1,1]});}catch(e){err=e;}finally{fs.promises.rename=real;}
      assert(err&&err.code==='EPERM'&&fs.existsSync(src),'Un EPERM permanente debe conservar el origen y reportar EPERM');
    }

    // CUDA health remains healthy if only one engine package is broken.
    {
      const data=path.join(base,'health-data'),res=path.join(base,'health-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data});
      rt.cudaQuickHealth=()=>({ok:true,state:'ok'});rt.cudaLightHealth=()=>({ok:true,state:'ok'});
      rt.validateCudaSite=async()=>({ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true});
      rt.validateInstalledEnginesAgainstCuda=async()=>[{ok:false,engine:'qwen3tts',error:'engine package broken'},{ok:true,engine:'chatterbox'}];
      const h=await rt.healthCheckCudaRuntime({full:true,force:true});
      assert(h.ok&&h.engineFailures.length===1&&h.engineFailures[0].engine==='qwen3tts','Un motor roto no debe marcar CUDA como roto');
    }

    // Maintenance must block new worker use until the transaction ends.
    {
      const data=path.join(base,'gate-data'),res=path.join(base,'gate-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data}),existing={child:{},ready:true,pending:new Map()};rt.workers.set('chatterbox',existing);
      const maint=rt.withMaintenance('test-maintenance',async()=>{await wait(120);return true;});
      await wait(10);const t=Date.now(),got=await rt.ensureWorker('chatterbox');const elapsed=Date.now()-t;await maint;
      assert.strictEqual(got,existing);assert(elapsed>=90,'ensureWorker no esperó el maintenance lock');
    }

    // Engine staging is validated before .installed.json is written.
    {
      const data=path.join(base,'engine-data'),res=path.join(base,'engine-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data});rt.ensureCudaRuntimeHealthy=async()=>({ok:true});rt.recoverEngineTransaction=async()=>({ok:true,recovered:false,activeValid:false,candidateValid:false});rt.waitForWorkersIdle=async()=>true;rt.stopAndWait=async()=>true;rt.drainChildren=async()=>true;
      const validations=[];rt.validateEngineRuntime=async(id,opt)=>{validations.push({site:opt.engineSite,requireMarker:opt.requireMarker,marker:fs.existsSync(rt.marker(id))});return{ok:true,engine:id};};
      rt.runPip=async args=>{const i=args.indexOf('--target'),target=args[i+1];fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'package.keep'),'ok');};
      const result=await rt.install('qwen3tts');assert(result.ok);
      assert(validations.length>=2&&validations.every(v=>v.requireMarker===false),'La validación del candidato no debe depender del marcador');
      assert(validations[0].marker===false,'El marcador se escribió antes de validar la instalación');
      assert(fs.existsSync(rt.marker('qwen3tts'))&&fs.existsSync(rt.siteDir('qwen3tts')),'El motor validado no quedó activado');
    }

    // EPERM during CUDA activation preserves candidate, restores active and retry reuses download.
    {
      const data=path.join(base,'eperm-data'),res=path.join(base,'eperm-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data});rt.freeBytes=()=>20*1024*1024*1024;rt.validateInstalledEnginesAgainstCuda=async()=>[];rt.waitForWorkersIdle=async()=>true;rt.stopAndWait=async()=>true;rt.drainChildren=async()=>true;
      writeCritical(rt.cudaSite,'old');writeMarker(rt);
      let mode='first',activeRetryChecks=0,pipCount=0,activationFailures=0;
      rt.validateCudaSite=async site=>{if(site===rt.cudaSite){if(mode==='first')throw new Error('active runtime intentionally bad');if(mode==='retry'&&activeRetryChecks++===0)throw new Error('active still bad before retry');}return{ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true,site};};
      rt.runPip=async args=>{pipCount++;const i=args.indexOf('--target'),site=args[i+1];writeCritical(site,'candidate');};
      const realRename=rt.renameWithRetry.bind(rt);
      rt.renameWithRetry=async(src,dst,opts={})=>{if(src.endsWith('.candidate')&&activationFailures++===0){const e=new Error('simulated Windows lock');e.code='EPERM';throw e;}return realRename(src,dst,{...opts,attempts:[2,2]});};
      let failed=false;try{await rt.installCudaRuntime({force:true});}catch(e){failed=true;assert(e.activationPending===true);}
      assert(failed&&pipCount===1&&fs.existsSync(rt.cudaRoot)&&fs.existsSync(path.join(rt.root,CUDA_RUNTIME.slot+'.candidate')),'EPERM debe restaurar activo y preservar candidato');
      assert.strictEqual(rt.readJson(rt.cudaJournal()).stage,'activation-pending');
      mode='retry';const ok=await rt.installCudaRuntime({force:true});
      assert(ok.ok&&pipCount===1,'Reintento de activación no debe volver a descargar CUDA');
      assert(!fs.existsSync(rt.cudaJournal()),'Journal CUDA debe cerrarse después del reintento exitoso');
    }

    // Upgrade from lab.13: orphan backup is recovered even without lab.20 journal.
    {
      const data=path.join(base,'legacy-data'),res=path.join(base,'legacy-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data}),backup=path.join(rt.root,CUDA_RUNTIME.slot+'.backup-12345'),site=path.join(backup,'site-packages');
      writeCritical(site,'legacy-backup');writeMarker(rt,backup);rt.validateCudaSite=async()=>({ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true});
      const out=await rt.recoverLegacyCudaOrphans();assert(out.ok&&out.action==='backup-restored'&&fs.existsSync(rt.cudaRoot),'Lab.14 no recuperó backup huérfano de lab.13');
    }

    // User/system Python packages must never leak into experimental engines.
    {
      const data=path.join(base,'env-data'),res=path.join(base,'env-res');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(res,{recursive:true});makePython(res);
      const rt=new TTSLabRuntime({resourcesDir:res,dataDir:data}),old=process.env.PYTHONPATH;process.env.PYTHONPATH='C:\\BAD_EXTERNAL_PYTHON';
      try{const a=rt.env('chatterbox'),b=rt.env('qwen3tts');assert(!a.PYTHONPATH.includes('BAD_EXTERNAL')&&!b.PYTHONPATH.includes('BAD_EXTERNAL'));assert(a.PYTHONPATH.split(path.delimiter)[0]!==b.PYTHONPATH.split(path.delimiter)[0]);}
      finally{if(old===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=old;}
    }

    console.log('check-v2lab-hardening: OK · single instance · maintenance gate · transactional engines · EPERM retry/resume · lab13 recovery · CUDA/engine isolation · clean PYTHONPATH · overlay/heartbeat/fallback');
  }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
