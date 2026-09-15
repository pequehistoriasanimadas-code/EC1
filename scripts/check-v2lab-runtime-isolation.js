'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const resilience=require(path.resolve(__dirname,'..','src','services','releaseV2CudaInstallResilienceLab29.js'));
resilience.installReleaseV2CudaInstallResilienceLab29();
const chatterPerf=require(path.resolve(__dirname,'..','src','services','releaseV2ChatterboxPerformanceLab29.js'));
chatterPerf.installReleaseV2ChatterboxPerformanceLab29();
const {TTSLabRuntime,CUDA_RUNTIME,CUDA_CRITICAL_FILES}=require(path.resolve(__dirname,'..','src','services','ttsLabRuntime.js'));
const {selectGpuRequestIndex,gpuWorkerLimit}=require(path.resolve(__dirname,'..','src','services','automation0325.js'));
const {CUDA_VALIDATE_TIMEOUT_MS}=resilience;

function makePython(resources){
  const p=path.join(resources,'runtime','python','python.exe');
  fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'fake');
}
function writeCritical(site,tag='v2'){
  for(const rel of CUDA_CRITICAL_FILES){const p=path.join(site,...rel.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.from(tag+':'+rel));}
}
function writeMarker(rt,root=rt.cudaRoot){
  const site=path.join(root,'site-packages'),manifest=rt.cudaManifestForSite(site);assert(manifest);
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(rt.cudaMarker(root),JSON.stringify({revision:CUDA_RUNTIME.revision,slot:CUDA_RUNTIME.slot,torch:CUDA_RUNTIME.torch,torchaudio:CUDA_RUNTIME.torchaudio,manifest},null,2));
}
function makeEnginePackage(rt,id){
  fs.mkdirSync(rt.siteDir(id),{recursive:true});fs.writeFileSync(path.join(rt.siteDir(id),'sentinel.txt'),id);
  const e=rt.engine(id);fs.mkdirSync(path.dirname(rt.marker(id)),{recursive:true});fs.writeFileSync(rt.marker(id),JSON.stringify({engine:id,installRevision:e.installRevision,installedAt:new Date().toISOString()}));
}

(async()=>{
  const boot=fs.readFileSync(path.resolve(__dirname,'..','src','bootstrap-v2lab.js'),'utf8');
  assert(boot.includes("releaseV2CudaInstallResilienceLab29').installReleaseV2CudaInstallResilienceLab29()"),'El Portable debe instalar la protección CUDA antes de usar los motores TTS');
  assert(boot.includes("releaseV2ChatterboxPerformanceLab29').installReleaseV2ChatterboxPerformanceLab29()"),'El Portable debe instalar la política global de rendimiento Chatterbox');
  assert.strictEqual(CUDA_RUNTIME.revision,2);
  assert.strictEqual(CUDA_RUNTIME.slot,'shared-cuda-v2');
  assert(CUDA_CRITICAL_FILES.includes('torch/torch_version.py'));
  assert(Number(CUDA_VALIDATE_TIMEOUT_MS)>=180000,'La validación CUDA en frío debe tolerar al menos 180 s en Windows');

  const base=fs.mkdtempSync(path.join(os.tmpdir(),'GEC ÁREA DISEÑO lab17 '));
  try{
    const resources=path.join(base,'Portable Folder con Ñ'),data=path.join(base,'EC Automatic News Data');
    makePython(resources);
    const rt=new TTSLabRuntime({resourcesDir:resources,dataDir:data});
    rt.freeBytes=()=>20*1024*1024*1024;
    rt.nvidiaPresent=async()=>true;
    rt.validateCudaSite=async site=>({ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true,torch_cuda:'12.4',site});
    let pipCount=0;
    rt.runPip=async args=>{pipCount++;const idx=args.indexOf('--target');assert(idx>=0);const site=args[idx+1];await new Promise(r=>setTimeout(r,80));writeCritical(site,'install-'+pipCount);};

    fs.mkdirSync(rt.voiceDir,{recursive:true});fs.writeFileSync(path.join(rt.voiceDir,'LOCUTOR.wav'),'voice');
    fs.mkdirSync(rt.fineTunedDir,{recursive:true});fs.writeFileSync(path.join(rt.fineTunedDir,'AURELIO.keep'),'fine');
    fs.mkdirSync(rt.modelsDir,{recursive:true});fs.writeFileSync(path.join(rt.modelsDir,'hf.keep'),'model-cache');

    makeEnginePackage(rt,'chatterbox');makeEnginePackage(rt,'qwen3tts');
    const validated=[];
    rt.validateEngineRuntime=async(id,{cudaSite}={})=>{validated.push({id,cudaSite});return{ok:true,engine:id};};

    const [a,b]=await Promise.all([rt.installCudaRuntime({force:true}),rt.installCudaRuntime({force:true})]);
    assert(a.ok&&b.ok);
    assert.strictEqual(pipCount,1,'El mutex CUDA debe ejecutar pip una sola vez');
    assert.strictEqual(rt.cudaInstalled(),true);
    assert(validated.some(x=>x.id==='chatterbox')&&validated.some(x=>x.id==='qwen3tts'),'El runtime candidato debe comprobar ambos motores instalados');
    assert(fs.existsSync(path.join(rt.voiceDir,'LOCUTOR.wav')));
    assert(fs.existsSync(path.join(rt.fineTunedDir,'AURELIO.keep')));
    assert(fs.existsSync(path.join(rt.modelsDir,'hf.keep')));

    fs.rmSync(path.join(rt.cudaSite,'torch','torch_version.py'),{force:true});
    const broken=rt.cudaLightHealth();
    assert.strictEqual(broken.ok,false);
    assert.strictEqual(broken.state,'damaged');
    assert.strictEqual(rt.cudaInstalled(),false);

    writeCritical(rt.cudaSite,'healthy-old');writeMarker(rt);
    fs.writeFileSync(path.join(rt.cudaRoot,'ACTIVE_SENTINEL'),'keep-me');
    rt.runPip=async()=>{throw new Error('simulated pip interruption');};
    let failed=false;try{await rt.installCudaRuntime({force:true});}catch{failed=true;}
    assert(failed,'La prueba debe simular un fallo de pip');
    assert(fs.existsSync(path.join(rt.cudaRoot,'ACTIVE_SENTINEL')),'El runtime anterior debe sobrevivir si falla la instalación candidata');
    assert.strictEqual(rt.cudaInstalled(),true,'El rollback debe conservar el runtime anterior válido');

    const timeoutData=path.join(base,'EC Automatic News Data timeout'),rtTimeout=new TTSLabRuntime({resourcesDir:resources,dataDir:timeoutData});
    rtTimeout.freeBytes=()=>20*1024*1024*1024;
    rtTimeout.nvidiaPresent=async()=>false;
    let timeoutPipCount=0;
    rtTimeout.runPip=async args=>{timeoutPipCount++;const idx=args.indexOf('--target');assert(idx>=0);writeCritical(args[idx+1],'download-complete');};
    rtTimeout.validateInstalledEnginesAgainstCuda=async()=>[];
    rtTimeout.runProcess=async(_exe,_args,opts={})=>{if(opts.label==='Validación CUDA'){const e=new Error('Validación CUDA excedió 180 s');e.code='PROCESS_TIMEOUT';throw e;}return{status:0,stdout:'',stderr:''};};
    let timeoutFailed=false;try{await rtTimeout.installCudaRuntime({force:true});}catch(e){timeoutFailed=e.code==='PROCESS_TIMEOUT'||/Validación CUDA excedió/.test(String(e.message||e));}
    assert(timeoutFailed,'La prueba debe reproducir el timeout de validación CUDA');
    const stageRoot=path.join(rtTimeout.root,`${CUDA_RUNTIME.slot}.candidate`),stageSite=path.join(stageRoot,'site-packages');
    assert(fs.existsSync(stageRoot),'Un timeout de validación no debe borrar el runtime CUDA recién descargado');
    assert(rtTimeout.cudaManifestForSite(stageSite),'El candidato conservado debe mantener sus archivos CUDA críticos');
    const pending=rtTimeout.readJson(rtTimeout.cudaMarker(stageRoot));
    assert(pending?.validationPending===true,'El candidato debe quedar marcado como pendiente de revalidación, no como instalación válida');
    assert.strictEqual(timeoutPipCount,1,'El primer intento debe descargar CUDA una sola vez');

    rtTimeout.runProcess=async(_exe,_args,opts={})=>opts.label==='Validación CUDA'?{status:0,stdout:JSON.stringify({torch:'2.6.0',torchaudio:'2.6.0',cuda:false,torch_cuda:'12.4'}),stderr:''}:{status:0,stdout:'',stderr:''};
    const retried=await rtTimeout.installCudaRuntime({force:true});
    assert(retried.ok,'El reintento debe completar la activación del runtime conservado');
    assert.strictEqual(timeoutPipCount,1,'El reintento no debe volver a descargar PyTorch/CUDA');
    assert.strictEqual(rtTimeout.cudaInstalled(),true,'El runtime revalidado debe quedar activo');
    const activeMarker=rtTimeout.readJson(rtTimeout.cudaMarker(rtTimeout.cudaRoot));
    assert(activeMarker?.validationPending!==true,'Después de una validación real correcta el runtime activo ya no debe quedar pendiente');

    const benchData=path.join(base,'EC Automatic News Data chatterbox benchmark'),rtBench=new TTSLabRuntime({resourcesDir:resources,dataDir:benchData});
    const rtfSequence=[4.32,1.49,1.43,0.95,0.91,0.89];let benchCalls=0;
    rtBench.generate=async()=>{const rtf=rtfSequence[benchCalls]??0.90,idx=benchCalls++,file=path.join(rtBench.audioDir,`bench-${idx}.wav`);fs.writeFileSync(file,'wav');return{path:file,realtimeFactor:rtf,elapsedMs:Math.round(rtf*10000),durationSec:10,cudaPeakAllocatedMb:3200,cudaPeakReservedMb:4200,qwenRuntime:{}};};
    const chatterBench=await rtBench.benchmark('chatterbox',{referenceVoiceId:'ref-test'});
    assert.strictEqual(benchCalls,6,'Chatterbox debe ejecutar 3 warmups reales antes de las 3 corridas estables');
    assert.strictEqual(Number(chatterBench.warmupRuns||0),3,'El resultado debe declarar 3 warmups de Chatterbox');
    assert(Math.abs(Number(chatterBench.stableRealtimeFactor)-0.91)<0.001,`RTF estable debe representar worker caliente (~0.91), no ${chatterBench.stableRealtimeFactor}`);

    assert.strictEqual(typeof gpuWorkerLimit,'function','GPU SWAP debe exponer una política global de tamaño de bloque');
    const mixedQueue=[{kind:'ai'},{kind:'voice'},{kind:'ai'}];
    assert.strictEqual(selectGpuRequestIndex(mixedQueue,0,2,{mode:'gpu-swap',lastKind:'ai',swapBurstCount:1,maxSwapBurst:4}),0,'GPU SWAP debe continuar el bloque AI mientras haya AI pendiente');
    assert.strictEqual(gpuWorkerLimit('gpu-swap',0,15),4,'GPU SWAP debe poder preparar hasta 4 noticias por bloque');
    assert.strictEqual(gpuWorkerLimit('gpu-coordinated',0,15),2,'GPU coordinada conserva el paralelismo actual');
    assert.strictEqual(gpuWorkerLimit('gpu-coordinated',2,15),1,'GPU coordinada sigue reduciendo presión cuando hay backlog de voz');

    fs.mkdirSync(rt.legacyCudaRoot,{recursive:true});fs.writeFileSync(path.join(rt.legacyCudaRoot,'legacy.keep'),'legacy');
    assert(fs.existsSync(path.join(rt.legacyCudaRoot,'legacy.keep')));

    console.log('check-v2lab-runtime-isolation: OK · CUDA v2 transactional · cold-validation timeout resilient · candidate reuse · Chatterbox warm benchmark · GPU SWAP batching · mutex · rollback · Unicode path · user data preserved');
  }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
