'use strict';

const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn,spawnSync}=require('child_process');
const {KokoroTTS}=require('./kokoro');
const {SettingsStore}=require('./settings');
const {median}=require('./ttsOptimizer');
const {normalizeConfig,configLabel}=require('./version0317Policy');

const GPU_ORT_VERSION='1.26.0';
const GPU_PACKAGE=`onnxruntime-gpu[cuda,cudnn]==${GPU_ORT_VERSION}`;
const CUDA_MIN_DRIVER=525;
const GPU_MEM_LIMIT_MB=3072;
const nowIso=()=>new Date().toISOString();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));

function parseCsvLine(line){return String(line||'').split(',').map(x=>x.trim());}
function driverCompatible(version){const major=Number(String(version||'').split('.')[0]);return Number.isFinite(major)&&major>=CUDA_MIN_DRIVER;}
function shouldUseCuda(cpuRtf,gpuRtf,{minGainPct=15,targetRtf=1}={}){
  const cpu=Number(cpuRtf),gpu=Number(gpuRtf);if(!Number.isFinite(cpu)||!Number.isFinite(gpu)||cpu<=0||gpu<=0||gpu>=cpu)return false;
  const gain=(cpu-gpu)/cpu*100;return gpu<=targetRtf||gain>=minGainPct;
}
function atomicJson(file,value){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');try{fs.renameSync(tmp,file);}catch{fs.copyFileSync(tmp,file);try{fs.rmSync(tmp,{force:true});}catch{}}}

function installSettingsGuard(){
  const proto=SettingsStore.prototype;if(proto.__ec0318GpuSaveInstalled)return;Object.defineProperty(proto,'__ec0318GpuSaveInstalled',{value:true});
  const original=proto.save;proto.save=function(settings){
    const rec=global.__ec0318HardwareRecommendation,match=rec&&path.resolve(String(rec.settingsFile||''))===path.resolve(String(this.file||''));
    if(match&&settings?.tts?.autoTuned===true){settings={...settings,tts:{...settings.tts,acceleration:rec.acceleration,lastHardwareBenchmark:{...rec.summary}}};}
    return original.call(this,settings);
  };
}

function installKokoroGpuPolicy(){
  const proto=KokoroTTS.prototype;if(proto.__ec0318GpuInstalled)return;Object.defineProperty(proto,'__ec0318GpuInstalled',{value:true});
  const baseProfile=proto.profile,baseProfileKey=proto.profileKey,baseEnvFor=proto.envFor,baseStatus=proto.status,baseGenerate=proto.generate,baseHandleWorkerLine=proto.handleWorkerLine;

  proto.gpuRuntimeDir=function(){return path.join(this.dataDir,'gpu-runtime');};
  proto.activeGpuRuntimeDir=function(){return this.__ec0318GpuRuntimeOverride||this.gpuRuntimeDir();};
  proto.gpuRuntimeInstalled=function(dir=this.gpuRuntimeDir()){
    try{return fs.existsSync(path.join(dir,'onnxruntime','capi','onnxruntime_providers_cuda.dll'))&&fs.existsSync(path.join(dir,'nvidia'));}catch{return false;}
  };
  proto.nvidiaSmiExecutable=function(){
    const candidates=['nvidia-smi.exe','nvidia-smi'];if(process.platform==='win32'&&process.env.WINDIR)candidates.unshift(path.join(process.env.WINDIR,'System32','nvidia-smi.exe'));
    for(const cmd of candidates){try{const r=spawnSync(cmd,['--help'],{windowsHide:true,timeout:5000,encoding:'utf8'});if(!r.error&&r.status===0)return cmd;}catch{}}
    return'';
  };
  proto.queryNvidia=function(){
    const exe=this.nvidiaSmiExecutable();if(!exe)return{detected:false,compatible:false,error:'No se detectó NVIDIA-SMI. EC mantendrá Kokoro por CPU.'};
    try{
      const args=['--query-gpu=name,driver_version,memory.total,memory.used,utilization.gpu,utilization.encoder,temperature.gpu','--format=csv,noheader,nounits'];const r=spawnSync(exe,args,{windowsHide:true,timeout:8000,encoding:'utf8'});if(r.status!==0)throw new Error(String(r.stderr||r.stdout||'NVIDIA-SMI falló').trim());
      const line=String(r.stdout||'').split(/\r?\n/).map(x=>x.trim()).find(Boolean),v=parseCsvLine(line);if(v.length<7)throw new Error('NVIDIA-SMI devolvió datos incompletos');
      const driver=v[1],compatible=driverCompatible(driver);return{detected:true,compatible,name:v[0],driver,totalMb:Number(v[2])||0,usedMb:Number(v[3])||0,utilization:Number(v[4])||0,encoder:Number(v[5])||0,temperature:Number(v[6])||0,requiredDriver:`${CUDA_MIN_DRIVER}+`,cudaFamily:'12.x'};
    }catch(e){return{detected:false,compatible:false,error:e.message||String(e)};}
  };
  proto.gpuStatus=function(){
    global.__ecKokoro0318=this;const nvidia=this.queryNvidia(),installed=this.gpuRuntimeInstalled(),s=this.settings(),requested=String(s?.tts?.acceleration||'cpu')==='cuda'?'cuda':'cpu',active=this.workerHealth?.executionProvider||(this.profile().provider||'cpu');return{ok:true,nvidia,runtimeInstalled:installed,runtimeVersion:installed?GPU_ORT_VERSION:'',requested,active,fallingBack:!!this.__ec0318GpuFallback,fallbackReason:this.__ec0318GpuFallbackReason||'',gpuMemLimitMb:GPU_MEM_LIMIT_MB};
  };

  proto.profile=function(){
    global.__ecKokoro0318=this;const base=baseProfile.call(this),s=this.settings(),wantsCuda=base.name==='performance'&&String(s?.tts?.acceleration||'cpu')==='cuda',canCuda=wantsCuda&&this.gpuRuntimeInstalled()&&!this.__ec0318GpuFallback,provider=canCuda?'cuda':'cpu';
    return{...base,provider,gpuMemoryLimitMb:GPU_MEM_LIMIT_MB,label:provider==='cuda'?`${base.label} · NVIDIA CUDA`:base.label};
  };
  proto.profileKey=function(profile){return`${baseProfileKey.call(this,profile)}:${profile.provider||'cpu'}:${Number(profile.gpuMemoryLimitMb||0)}`;};
  proto.envFor=function(profile){
    const env=baseEnvFor.call(this,profile);if((profile?.provider||'cpu')!=='cuda')return env;const dir=this.activeGpuRuntimeDir();env.PYTHONPATH=dir+(env.PYTHONPATH?`${path.delimiter}${env.PYTHONPATH}`:'');return env;
  };
  proto.handleWorkerLine=function(line){
    let parsed=null;const raw=String(line||'').trim();if(raw.startsWith('ECJSON ')){try{parsed=JSON.parse(raw.slice(7));}catch{}}
    const out=baseHandleWorkerLine.call(this,line);if(parsed?.type==='ready'&&parsed.ok&&this.workerHealth){this.workerHealth.executionProvider=String(parsed.execution_provider||'cpu');this.workerHealth.activeProviders=Array.isArray(parsed.active_providers)?parsed.active_providers:[];this.workerHealth.gpuMemoryLimitMb=Number(parsed.gpu_mem_limit_mb||0);}
    return out;
  };
  proto.ensureWorker=async function(profile=this.profile(),force=false){
    const key=this.profileKey(profile);if(!force&&!this.persistentEnabled())return null;if(this.worker&&this.workerReady&&this.workerProfileKey===key)return this.worker;if(this.workerStarting&&this.workerProfileKey===key)return this.workerStarting.promise;if(this.worker)await this.stopAndWait('profile-change');if(!this.ready())throw new Error('El motor de voz no está disponible en esta instalación');if(profile.provider==='cuda'&&!this.gpuRuntimeInstalled(this.activeGpuRuntimeDir()))throw new Error('La aceleración NVIDIA todavía no está preparada');
    const intra=Number(profile.onnxIntra??profile.intra),args=[this.script,'--worker','--model',this.model,'--voices',this.voices,'--onnx-intra',String(Number.isFinite(intra)?intra:1),'--onnx-inter',String(Math.max(1,Number(profile.inter)||1)),'--onnx-mode',profile.executionMode==='parallel'?'parallel':'sequential','--onnx-provider',profile.provider==='cuda'?'cuda':'cpu','--gpu-mem-limit-mb',String(Math.max(512,Number(profile.gpuMemoryLimitMb)||GPU_MEM_LIMIT_MB)),'--spin-duration-us',String(Number.isFinite(Number(profile.spinDurationUs))?Number(profile.spinDurationUs):-1),'--spin-backoff-max',String(Math.max(1,Number(profile.spinBackoffMax)||1))];
    const p=spawn(this.python,args,this.spawnOptions(profile));this.worker=p;this.workerProfile=profile.name;this.workerProfileKey=key;this.workerReady=false;this.workerBuffer='';this.workerHealth=null;this.setProcessPriority(p,profile);this.attachWorker(p);
    let resolveStart,rejectStart;const promise=new Promise((resolve,reject)=>{resolveStart=resolve;rejectStart=reject;}),timer=setTimeout(()=>rejectStart(new Error('El motor de voz tardó demasiado en iniciar')),120000);this.workerStarting={promise,resolve:v=>{clearTimeout(timer);resolveStart(v);},reject:e=>{clearTimeout(timer);rejectStart(e);}};try{await promise;return this.worker;}finally{this.workerStarting=null;}
  };

  proto.generate=function(text,options={}){
    const selected=this.profile();return baseGenerate.call(this,text,options).then(result=>({...result,executionProvider:this.workerHealth?.executionProvider||selected.provider||'cpu',gpuFallback:false})).catch(async e=>{
      if((selected.provider||'cpu')!=='cuda'||this.__ec0318FallbackInProgress)throw e;this.__ec0318FallbackInProgress=true;this.__ec0318GpuFallback=true;this.__ec0318GpuFallbackReason=e.message||String(e);try{await this.stopAndWait('cuda-fallback');const result=await baseGenerate.call(this,text,options);return{...result,executionProvider:'cpu',gpuFallback:true,gpuFallbackReason:this.__ec0318GpuFallbackReason};}finally{this.__ec0318FallbackInProgress=false;}
    });
  };

  proto.freeBytesForData=function(){try{if(typeof fs.statfsSync!=='function')return Number.MAX_SAFE_INTEGER;const x=fs.statfsSync(this.dataDir);return Number(x.bavail)*Number(x.bsize);}catch{return Number.MAX_SAFE_INTEGER;}};
  proto.installGpuRuntime=function({onEvent=()=>{}}={}){
    global.__ecKokoro0318=this;if(this.__ec0318GpuInstallPromise)return this.__ec0318GpuInstallPromise;const task=(async()=>{
      if(process.platform!=='win32')throw new Error('La aceleración NVIDIA de esta prueba está preparada para Windows x64');const nvidia=this.queryNvidia();if(!nvidia.detected)throw new Error(nvidia.error||'No se detectó una GPU NVIDIA');if(!nvidia.compatible)throw new Error(`El controlador NVIDIA ${nvidia.driver||''} no cumple el mínimo ${CUDA_MIN_DRIVER} para CUDA 12.x`);if(this.gpuRuntimeInstalled())return{ok:true,alreadyInstalled:true,nvidia,runtimeVersion:GPU_ORT_VERSION};
      const free=this.freeBytesForData();if(free<4*1024*1024*1024)throw new Error('Se necesitan al menos 4 GB libres para preparar la aceleración NVIDIA');await this.stopAndWait('gpu-runtime-install');const target=this.gpuRuntimeDir(),staging=`${target}.installing`;try{fs.rmSync(staging,{recursive:true,force:true});}catch{}fs.mkdirSync(staging,{recursive:true});onEvent({type:'start',message:`Preparando NVIDIA CUDA para ${nvidia.name}. La descarga puede tardar varios minutos.`});
      const args=['-m','pip','install','--disable-pip-version-check','--no-warn-script-location','--no-cache-dir','--upgrade','--target',staging,GPU_PACKAGE];const child=spawn(this.python,args,{windowsHide:true,cwd:this.resourcesDir,env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONUTF8:'1'}});let tail='';const consume=(chunk,kind)=>{tail=(tail+chunk.toString()).slice(-12000);const lines=chunk.toString().split(/\r?\n|\r/).map(x=>x.trim()).filter(Boolean);for(const line of lines.slice(-3))if(/Downloading|Installing|Successfully installed|Collecting/i.test(line))onEvent({type:'progress',kind,message:line.slice(0,220)});};child.stdout.on('data',d=>consume(d,'stdout'));child.stderr.on('data',d=>consume(d,'stderr'));const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)throw new Error(`No se pudo descargar el runtime NVIDIA (${code}). ${tail.slice(-900)}`);
      this.__ec0318GpuRuntimeOverride=staging;const cap=this.performanceThreadCap(),probe={name:'gpu-probe',label:'Prueba NVIDIA',priority:'below',intra:Math.min(2,cap),onnxIntra:Math.min(2,cap),inter:1,intraMode:'fixed',executionMode:'sequential',spinDurationUs:-1,spinBackoffMax:1,provider:'cuda',gpuMemoryLimitMb:GPU_MEM_LIMIT_MB};onEvent({type:'validate',message:'Comprobando CUDAExecutionProvider con Kokoro…'});try{await this.ensureWorker(probe,true);const ping=await this.workerCommand({cmd:'ping'},30000);if(!ping?.ok||this.workerHealth?.executionProvider!=='cuda')throw new Error('CUDA no quedó activo en Kokoro');}finally{await this.stopAndWait('gpu-runtime-probe');this.__ec0318GpuRuntimeOverride='';}
      try{fs.rmSync(target,{recursive:true,force:true});}catch{}fs.renameSync(staging,target);fs.writeFileSync(path.join(target,'EC-GPU-RUNTIME.json'),JSON.stringify({version:GPU_ORT_VERSION,cuda:'12.8',cudnn:'9.x',installedAt:nowIso(),gpu:nvidia.name,driver:nvidia.driver},null,2),'utf8');this.__ec0318GpuFallback=false;this.__ec0318GpuFallbackReason='';onEvent({type:'done',message:'Aceleración NVIDIA preparada correctamente.'});return{ok:true,nvidia,runtimeVersion:GPU_ORT_VERSION};
    })().catch(e=>{try{fs.rmSync(`${this.gpuRuntimeDir()}.installing`,{recursive:true,force:true});}catch{}onEvent({type:'error',message:e.message||String(e)});throw e;}).finally(()=>{this.__ec0318GpuRuntimeOverride='';this.__ec0318GpuInstallPromise=null;});this.__ec0318GpuInstallPromise=task;return task;
  };

  proto.startNvidiaMonitor=function(intervalMs=400){
    const exe=this.nvidiaSmiExecutable();if(!exe)return()=>({samples:0,gpuAverage:0,gpuPeak:0,encoderPeak:0,memoryUsedMaxMb:0,temperaturePeak:0});const samples=[];let buffer='';const args=['--query-gpu=utilization.gpu,utilization.encoder,memory.used,temperature.gpu','--format=csv,noheader,nounits','-lms',String(Math.max(250,intervalMs))];let child=null;try{child=spawn(exe,args,{windowsHide:true});child.stdout.on('data',d=>{buffer+=d.toString();let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);const v=parseCsvLine(line);if(v.length>=4&&v.every((x,j)=>j>1||Number.isFinite(Number(x))))samples.push({gpu:Number(v[0])||0,encoder:Number(v[1])||0,memory:Number(v[2])||0,temp:Number(v[3])||0});}});}catch{}
    return()=>{try{child?.kill();}catch{}const gpu=samples.map(x=>x.gpu),enc=samples.map(x=>x.encoder),mem=samples.map(x=>x.memory),tmp=samples.map(x=>x.temp);return{samples:samples.length,gpuAverage:gpu.length?Number((gpu.reduce((a,b)=>a+b,0)/gpu.length).toFixed(1)):0,gpuPeak:gpu.length?Math.max(...gpu):0,encoderPeak:enc.length?Math.max(...enc):0,memoryUsedMaxMb:mem.length?Math.max(...mem):0,temperaturePeak:tmp.length?Math.max(...tmp):0};};
  };

  proto.__ec0318BenchmarkProvider=async function({id,label,profile,voice='ef_dora',speed=1,monitorGpu=false}){
    const stamp=`bench-0318-${id}-${Date.now()}`,warmTxt=path.join(this.audioDir,`${stamp}-warm.txt`),warmWav=path.join(this.audioDir,`${stamp}-warm.wav`),txt=path.join(this.audioDir,`${stamp}.txt`),runs=[];fs.writeFileSync(warmTxt,'EC Automatic News prepara el motor de voz antes de comparar CPU y GPU.','utf8');fs.writeFileSync(txt,'EC Automatic News compara el rendimiento real de Kokoro entre el procesador y la tarjeta gráfica. Esta locución permite medir la inferencia de voz con una duración representativa y comprobar si la aceleración NVIDIA reduce el tiempo de preparación sin comprometer la transmisión.','utf8');
    try{await this.stopAndWait('hardware-benchmark-switch');await this.ensureWorker(profile,true);await this.workerCommand({cmd:'generate',text_file:warmTxt,output:warmWav,voice,speed:Number(speed)},180000);if(!fs.existsSync(warmWav)||fs.statSync(warmWav).size<1000)throw new Error('El calentamiento no produjo audio válido');
      for(let n=0;n<2;n++){const stopCpu=this.startCpuMonitor(),stopGpu=monitorGpu?this.startNvidiaMonitor():null,started=Date.now();let meta,cpu,gpu;try{meta=await this.workerCommand({cmd:'generate',text_file:txt,output:path.join(this.audioDir,`${stamp}-${n}.wav`),voice,speed:Number(speed)},180000);}finally{cpu=stopCpu();gpu=stopGpu?stopGpu():null;}const elapsedMs=Date.now()-started,durationSec=Number(meta?.duration_sec||0);if(durationSec<=0)throw new Error('La prueba no devolvió duración de audio');const run={elapsedMs,durationSec,realtimeFactor:Number(((elapsedMs/1000)/durationSec).toFixed(3)),cpuAverage:cpu.average,cpuPeak:cpu.peak,cpuOverloaded:cpu.overloaded,phonemeMs:Number(meta?.phoneme_ms||0),inferenceMs:Number(meta?.inference_ms||0),executionProvider:String(meta?.execution_provider||profile.provider||'cpu'),gpu:gpu||{}};runs.push(run);this.cleanupAudio(path.join(this.audioDir,`${stamp}-${n}.wav`));if(run.cpuOverloaded)break;}
      const rtf=Number(median(runs.map(x=>x.realtimeFactor)).toFixed(3)),cpuAverage=Number(median(runs.map(x=>x.cpuAverage)).toFixed(1)),cpuPeak=Math.max(...runs.map(x=>x.cpuPeak),0),phonemeMs=Number(median(runs.map(x=>x.phonemeMs)).toFixed(1)),inferenceMs=Number(median(runs.map(x=>x.inferenceMs)).toFixed(1)),safe=runs.length===2&&!runs.some(x=>x.cpuOverloaded),gpuRuns=runs.map(x=>x.gpu||{}),gpuAverage=Number(median(gpuRuns.map(x=>Number(x.gpuAverage)||0)).toFixed(1)),gpuPeak=Math.max(...gpuRuns.map(x=>Number(x.gpuPeak)||0),0),encoderPeak=Math.max(...gpuRuns.map(x=>Number(x.encoderPeak)||0),0),memoryUsedMaxMb=Math.max(...gpuRuns.map(x=>Number(x.memoryUsedMaxMb)||0),0),temperaturePeak=Math.max(...gpuRuns.map(x=>Number(x.temperaturePeak)||0),0);return{id,label,provider:profile.provider||'cpu',realtimeFactor:rtf,cpuAverage,cpuPeak:Number(cpuPeak.toFixed(1)),phonemeMs,inferenceMs,safe,gpuAverage,gpuPeak,encoderPeak,memoryUsedMaxMb,temperaturePeak,runs,error:safe?'':`La CPU superó 85% de forma sostenida`};
    }catch(e){return{id,label,provider:profile.provider||'cpu',realtimeFactor:999,cpuAverage:0,cpuPeak:0,phonemeMs:0,inferenceMs:0,safe:false,gpuAverage:0,gpuPeak:0,encoderPeak:0,memoryUsedMaxMb:0,temperaturePeak:0,runs,error:e.message||String(e)};}finally{this.cleanupAudio(warmWav);try{fs.rmSync(warmTxt,{force:true});fs.rmSync(txt,{force:true});}catch{}await this.stopAndWait('hardware-benchmark-finished');}
  };

  proto.benchmarkGpu=function({voice='ef_dora',speed=1}={}){
    global.__ecKokoro0318=this;const task=async()=>{
      const nvidia=this.queryNvidia();if(!nvidia.detected)return{ok:false,error:nvidia.error||'No se detectó NVIDIA',nvidia};if(!nvidia.compatible)return{ok:false,error:`El controlador NVIDIA ${nvidia.driver||''} no es compatible con la prueba CUDA 12.x`,nvidia};if(!this.gpuRuntimeInstalled())return{ok:false,needsInstall:true,error:'Primero prepara la aceleración NVIDIA',nvidia};const baselineCpu=await this.measureCpuBaseline(1200);if(baselineCpu>=75)return{ok:false,error:`La computadora ya tiene ${baselineCpu.toFixed(0)}% de uso de CPU. Espera a que baje antes de comparar CPU y GPU.`,nvidia,baselineCpu};
      this.__ec0318GpuFallback=false;this.__ec0318GpuFallbackReason='';const s=this.settings(),cap=this.performanceThreadCap(),savedThreads=clamp(s?.tts?.performanceThreads||6,1,cap),cfg=normalizeConfig(s?.tts?.performanceConfig||{},savedThreads,cap),cpuProfile={name:'hardware-cpu',label:`CPU · ${configLabel(cfg,savedThreads,cap)}`,priority:'below',intra:cfg.intraMode==='auto'?cap:cfg.intra,onnxIntra:cfg.intra,inter:cfg.inter,intraMode:cfg.intraMode,executionMode:cfg.executionMode,spinDurationUs:cfg.spinDurationUs,spinBackoffMax:cfg.spinBackoffMax,provider:'cpu',gpuMemoryLimitMb:0};
      const cpu=await this.__ec0318BenchmarkProvider({id:'cpu',label:'CPU optimizada',profile:cpuProfile,voice,speed});if(!cpu.safe||cpu.error)return{ok:false,error:`No se pudo medir el baseline CPU: ${cpu.error||'prueba incompleta'}`,nvidia,baselineCpu,cpu};const gpuCandidates=[2];if(cap>=4)gpuCandidates.push(4);const gpuResults=[];for(const threads of gpuCandidates){const p={name:`hardware-cuda-${threads}`,label:`NVIDIA CUDA · ${threads} hilos CPU auxiliares`,priority:'below',intra:threads,onnxIntra:threads,inter:1,intraMode:'fixed',executionMode:'sequential',spinDurationUs:-1,spinBackoffMax:1,provider:'cuda',gpuMemoryLimitMb:GPU_MEM_LIMIT_MB};gpuResults.push(await this.__ec0318BenchmarkProvider({id:`cuda-${threads}`,label:p.label,profile:p,voice,speed,monitorGpu:true}));}
      const validGpu=gpuResults.filter(x=>x.safe&&!x.error&&Number(x.realtimeFactor)<20),gpu=validGpu.sort((a,b)=>Number(a.realtimeFactor)-Number(b.realtimeFactor)||Number(a.cpuAverage)-Number(b.cpuAverage))[0]||null;if(!gpu)return{ok:false,error:`CUDA no completó una prueba válida. ${gpuResults.map(x=>x.error).filter(Boolean).join(' · ')}`,nvidia,baselineCpu,cpu,gpuResults};const gainPct=Number((((cpu.realtimeFactor-gpu.realtimeFactor)/cpu.realtimeFactor)*100).toFixed(1)),useCuda=shouldUseCuda(cpu.realtimeFactor,gpu.realtimeFactor),acceleration=useCuda?'cuda':'cpu',summary={at:nowIso(),gpu:nvidia.name,driver:nvidia.driver,cpuRtf:cpu.realtimeFactor,gpuRtf:gpu.realtimeFactor,gainPct,recommended:acceleration,gpuAverage:gpu.gpuAverage,gpuPeak:gpu.gpuPeak,encoderPeak:gpu.encoderPeak,memoryUsedMaxMb:gpu.memoryUsedMaxMb,temperaturePeak:gpu.temperaturePeak};
      const saved=this.settings();saved.tts={...(saved.tts||{}),resourceMode:'performance',acceleration,lastHardwareBenchmark:summary,autoTuned:true};atomicJson(this.settingsFile,saved);global.__ec0318HardwareRecommendation={settingsFile:this.settingsFile,acceleration,summary};this.__ec0318GpuFallback=false;this.__ec0318GpuFallbackReason='';return{ok:true,nvidia,baselineCpu,cpu,gpu,gpuResults,gainPct,recommended:acceleration,targetReached:Number(gpu.realtimeFactor)<=1,selectionReason:useCuda?(Number(gpu.realtimeFactor)<=1?'La GPU alcanzó RTF ≤ 1.0':`La GPU fue ${gainPct}% más rápida que CPU`):`La mejora de ${gainPct}% no compensa cambiar el motor de producción a GPU`};
    };const queued=this.generationTail.then(task,task);this.generationTail=queued.catch(()=>{});return queued;
  };

  proto.status=function(){global.__ecKokoro0318=this;const base=baseStatus.call(this),p=this.profile(),nvidia=this.queryNvidia();return{...base,profileLabel:p.label,executionProvider:this.workerHealth?.executionProvider||p.provider||'cpu',gpuRuntimeInstalled:this.gpuRuntimeInstalled(),gpuAccelerationRequested:String(this.settings()?.tts?.acceleration||'cpu'),gpuFallback:!!this.__ec0318GpuFallback,gpuFallbackReason:this.__ec0318GpuFallbackReason||'',nvidia:nvidia.detected?{name:nvidia.name,driver:nvidia.driver,totalMb:nvidia.totalMb,usedMb:nvidia.usedMb,utilization:nvidia.utilization,encoder:nvidia.encoder,temperature:nvidia.temperature,compatible:nvidia.compatible}:null};};
}

function installIpc(){
  if(global.__ec0318GpuIpcInstalled)return;let electron=null;try{electron=require('electron');}catch{}if(!electron||typeof electron!=='object'||!electron.ipcMain?.handle)return;global.__ec0318GpuIpcInstalled=true;const emit=payload=>{try{for(const win of electron.BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.send('tts:gpuEvent',payload);}catch{}};const get=()=>{const k=global.__ecKokoro0318;if(!k)throw new Error('Kokoro todavía no terminó de inicializar');return k;};electron.ipcMain.handle('tts:gpuStatus',()=>get().gpuStatus());electron.ipcMain.handle('tts:gpuInstall',()=>get().installGpuRuntime({onEvent:emit}));electron.ipcMain.handle('tts:gpuBenchmark',()=>{const k=get(),s=k.settings();return k.benchmarkGpu({voice:s?.tts?.voice||'ef_dora',speed:Number(s?.tts?.speed)||1});});
}

function installVersion0318Policy(){installSettingsGuard();installKokoroGpuPolicy();installIpc();}
module.exports={installVersion0318Policy,driverCompatible,shouldUseCuda,GPU_ORT_VERSION,GPU_PACKAGE,CUDA_MIN_DRIVER,GPU_MEM_LIMIT_MB};
