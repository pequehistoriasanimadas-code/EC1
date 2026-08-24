'use strict';
const fs=require('fs');
const path=require('path');
const os=require('os');
const {app}=require('electron');

const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources'));
const appRoot=path.join(resourcesDir,'app.asar');
const tempDir=path.join(os.tmpdir(),`ec-0318-gpu-smoke-${process.pid}`);
const assert=(ok,message)=>{if(!ok)throw new Error(message);};

app.whenReady().then(async()=>{
  fs.mkdirSync(tempDir,{recursive:true});let kokoro=null;
  try{
    const {SettingsStore}=require(path.join(appRoot,'src','services','settings.js'));
    const {KokoroTTS}=require(path.join(appRoot,'src','services','kokoro.js'));
    require(path.join(appRoot,'src','services','documents.js'));
    const {shouldUseCuda,GPU_ORT_VERSION}=require(path.join(appRoot,'src','services','version0318Policy.js'));
    const ttsSource=fs.readFileSync(path.join(resourcesDir,'runtime','kokoro','tts.py'),'utf8');
    assert(/CUDAExecutionProvider/.test(ttsSource)&&/--onnx-provider/.test(ttsSource),'El tts.py empaquetado no contiene soporte CUDA');

    const store=new SettingsStore(tempDir),s=store.load();s.tts.resourceMode='performance';s.tts.performanceThreads=6;s.tts.performanceConfig={intraMode:'auto',intra:0,inter:1,executionMode:'sequential',spinDurationUs:1000,spinBackoffMax:8};s.tts.acceleration='cuda';s.tts.autoTuned=true;store.save(s);
    kokoro=new KokoroTTS({resourcesDir,dataDir:tempDir});assert(kokoro.ready(),'Kokoro empaquetado incompleto');const p=kokoro.profile();assert(p.provider==='cpu','Sin runtime GPU descargado, el Portable debe mantener CPU como fallback');assert(kokoro.gpuRuntimeInstalled()===false,'El runtime NVIDIA no debe inflar el EXE base');
    assert(shouldUseCuda(1.43,.90),'Una GPU claramente más rápida debe poder recomendarse');assert(!shouldUseCuda(1.43,1.31),'Una mejora GPU marginal no debe desplazar CPU');
    const status=kokoro.gpuStatus();assert(status.runtimeInstalled===false,'gpuStatus reporta un runtime inexistente');assert(status.gpuMemLimitMb===3072,'El límite conservador de VRAM cambió');

    console.log(`PACKAGED GPU 0.3.18 OK · ORT GPU ${GPU_ORT_VERSION} on-demand · EXE base sin CUDA · fallback CPU · selección segura`);
    fs.rmSync(tempDir,{recursive:true,force:true});app.exit(0);
  }catch(e){console.error(e.stack||e);try{kokoro?.stop('0318-gpu-smoke-error');}catch{}try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{}app.exit(1);}
});
