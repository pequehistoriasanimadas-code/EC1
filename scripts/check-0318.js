'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ok=(v,m)=>{if(!v)throw new Error(m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const pkg=JSON.parse(read('package.json'));ok(pkg.version==='0.3.18','package version debe ser 0.3.18');
const ttsPy=read('scripts/tts.py');for(const token of ['--onnx-provider','CUDAExecutionProvider','preload_dlls','--gpu-mem-limit-mb','CPUExecutionProvider'])ok(ttsPy.includes(token),`tts.py no contiene ${token}`);
const documents=read('src/services/documents.js');ok(/version0317Policy[\s\S]*version0318Policy/.test(documents),'0.3.18 no se instala después de la optimización CPU 0.3.17');ok(/version0318RendererLoader/.test(documents),'falta loader UI 0.3.18');
const policy=read('src/services/version0318Policy.js');for(const token of ['onnxruntime-gpu[cuda,cudnn]==','GPU_ORT_VERSION=\'1.26.0\'','CUDA_MIN_DRIVER=525','gpu-runtime','benchmarkGpu','cuda-fallback','gpuMemoryLimitMb'])ok(policy.includes(token),`falta ${token} en política GPU 0.3.18`);
const preload=read('src/preload.js');ok(/gpuTtsStatus/.test(preload)&&/installGpuTts/.test(preload)&&/benchmarkGpuTts/.test(preload)&&/tts:gpuEvent/.test(preload),'preload no expone controles GPU');
const ui=read('src/renderer-0318.js');ok(/Aceleración NVIDIA/.test(ui)&&/Comparar CPU vs GPU/.test(ui)&&/RTF/.test(ui)&&/fallback/.test(ui),'UI GPU no presenta comparación/fallback');
const loader=read('src/services/version0318RendererLoader.js');ok(/renderer-0318\.js/.test(loader),'renderer 0.3.18 no se carga');

require(path.join(root,'src/services/documents.js'));
const {SettingsStore}=require(path.join(root,'src/services/settings.js'));
const {KokoroTTS}=require(path.join(root,'src/services/kokoro.js'));
const {driverCompatible,shouldUseCuda,GPU_ORT_VERSION}=require(path.join(root,'src/services/version0318Policy.js'));

ok(driverCompatible('560.94'),'driver 560.94 debería ser compatible con CUDA 12.x');ok(driverCompatible('580.10'),'drivers nuevos deben conservar compatibilidad');ok(!driverCompatible('520.00'),'driver 520 no debe considerarse compatible');
ok(shouldUseCuda(1.43,.95),'GPU con RTF <1 debe recomendarse');ok(shouldUseCuda(1.43,1.10),'mejora GPU >15% debe recomendarse aunque no llegue a 1.0');ok(!shouldUseCuda(1.43,1.31),'mejora marginal no debe cambiar automáticamente a GPU');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ec-0318-check-'));
try{
  const store=new SettingsStore(temp),s=store.load();s.tts.resourceMode='performance';s.tts.autoTuned=true;s.tts.performanceThreads=6;s.tts.performanceConfig={intraMode:'auto',intra:0,inter:1,executionMode:'sequential',spinDurationUs:1000,spinBackoffMax:8};s.tts.acceleration='cuda';store.save(s);
  const gpuDir=path.join(temp,'gpu-runtime');fs.mkdirSync(path.join(gpuDir,'onnxruntime','capi'),{recursive:true});fs.mkdirSync(path.join(gpuDir,'nvidia'),{recursive:true});fs.writeFileSync(path.join(gpuDir,'onnxruntime','capi','onnxruntime_providers_cuda.dll'),'stub');
  const kokoro=new KokoroTTS({resourcesDir:root,dataDir:temp});let p=kokoro.profile();ok(p.provider==='cuda','perfil Rápido no activa CUDA cuando runtime está disponible');ok(/NVIDIA CUDA/.test(p.label),'perfil CUDA no se identifica en UI');ok(p.gpuMemoryLimitMb>=512,'falta límite de VRAM');
  fs.rmSync(gpuDir,{recursive:true,force:true});p=kokoro.profile();ok(p.provider==='cpu','si runtime GPU falta, Kokoro debe volver automáticamente a CPU');

  global.__ec0318HardwareRecommendation={settingsFile:store.file,acceleration:'cuda',summary:{gpuRtf:.8,cpuRtf:1.43}};const stale=store.load();stale.tts.acceleration='cpu';store.save(stale);ok(store.load().tts.acceleration==='cuda','un guardado posterior puede pisar recomendación GPU');delete global.__ec0318HardwareRecommendation;
  console.log(`EC 0.3.18 checks OK · CUDA 12.x · ORT GPU ${GPU_ORT_VERSION} on-demand · CPU fallback · selección por ganancia`);
}finally{try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
