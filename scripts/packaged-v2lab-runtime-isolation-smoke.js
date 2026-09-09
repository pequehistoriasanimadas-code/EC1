'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{let tmp='';try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.24');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js');
  const {TTSLabRuntime,CUDA_RUNTIME,CUDA_CRITICAL_FILES}=require(runtimePath);
  assert.strictEqual(CUDA_RUNTIME.revision,2);
  assert.strictEqual(CUDA_RUNTIME.slot,'shared-cuda-v2');
  assert(CUDA_CRITICAL_FILES.includes('torch/torch_version.py'));

  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'GEC ÁREA DISEÑO packaged lab17 '));
  const rt=new TTSLabRuntime({resourcesDir,dataDir:tmp});
  rt.freeBytes=()=>20*1024*1024*1024;rt.nvidiaPresent=async()=>true;
  rt.validateCudaSite=async site=>({ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true,torch_cuda:'12.4',site});
  rt.validateInstalledEnginesAgainstCuda=async()=>[];
  let installs=0;
  rt.runPip=async args=>{installs++;const idx=args.indexOf('--target'),site=args[idx+1];await new Promise(r=>setTimeout(r,50));for(const rel of CUDA_CRITICAL_FILES){const p=path.join(site,...rel.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'packaged:'+rel);}};

  const [a,b]=await Promise.all([rt.installCudaRuntime({force:true}),rt.installCudaRuntime({force:true})]);
  assert(a.ok&&b.ok&&installs===1,'El mutex CUDA empaquetado no serializa la instalación');
  assert.strictEqual(rt.cudaInstalled(),true);
  fs.rmSync(path.join(rt.cudaSite,'torch','torch_version.py'),{force:true});
  assert.strictEqual(rt.cudaInstalled(),false,'El paquete no detecta torch.torch_version ausente');

  const source=fs.readFileSync(runtimePath,'utf8'),ui=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  assert(source.includes('_installCudaRuntimeTransaction')&&source.includes('backupRoot')&&source.includes('cudaInstallPromise'),'Runtime transaccional/mutex no empaquetado');
  assert(source.includes('minFreeBytes')&&source.includes('legacyCudaRoot')&&source.includes("'--no-cache-dir'"),'Protecciones de disco/migración no empaquetadas');
  assert(source.includes('validateInstalledEnginesAgainstCuda')&&source.includes('baselineHealthy')&&source.includes('engineFailures'),'Prueba cruzada Chatterbox/Qwen no empaquetada');
  assert(ui.includes('Runtime CUDA necesita reparación')&&ui.includes('Reparar runtime CUDA')&&ui.includes('shared-cuda-v2'),'UI de reparación CUDA v2 no empaquetada');

  fs.rmSync(tmp,{recursive:true,force:true});tmp='';
  console.log('PACKAGED V2 RUNTIME ISOLATION lab.23 OK · CUDA v2 · mutex · transaction · torch_version corruption · Unicode path');
  app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
