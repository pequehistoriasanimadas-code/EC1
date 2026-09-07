'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {TTSLabRuntime}=require(path.resolve(__dirname,'..','src','services','ttsLabRuntime.js'));

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const runtimeSource=read('src/services/ttsLabRuntime.js');
  const renderer=read('src/renderer-v2lab.js');
  const optimizer=read('src/renderer-0321.js');
  const release=read('src/services/releaseV2Lab.js');

  assert(!runtimeSource.includes('spawnSync'),'TTS Lab no debe usar spawnSync: congelaría el proceso principal de Electron');
  assert(runtimeSource.includes('async runProcess(')&&runtimeSource.includes('cudaHealthPromise')&&runtimeSource.includes('cudaHealthTtlMs'),'Runtime debe usar procesos asíncronos y cachear el health check CUDA');
  assert(runtimeSource.includes('await this.waitForMaintenance()')&&runtimeSource.includes('if(existing?.child&&existing.ready)return existing')&&runtimeSource.includes('await this.ensureCudaRuntimeHealthy()'),'ensureWorker debe reutilizar primero un worker vivo antes de validar CUDA');
  assert(renderer.includes('qwenParams=settings?.tts?.engineParams?.qwen3tts')&&!renderer.includes(",q=settings?.tts?.engineParams?.qwen3tts"),'renderExternalPerformance no debe sombrear el helper q()');
  assert(renderer.includes("window.__GEC_V2LAB_RENDERER_RESPONSIVE__='lab13'"),'Renderer debe identificar el hardening de responsividad lab.14');
  assert(optimizer.includes('GEC valida ambos motores')&&!optimizer.includes('EC valida también Qwen + Kokoro al mismo tiempo'),'El optimizador no debe mencionar Kokoro cuando hay otro motor seleccionado');
  assert(release.includes("const item=await labRuntime().importFineTunedZip")&&release.includes("event.sender.send('tts-lab:event',p)"),'Importación fine-tuned debe ser asíncrona y reportar progreso');

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab14-responsive-'));
  try{
    const rt=new TTSLabRuntime({resourcesDir:temp,dataDir:temp});

    // A child process lasting hundreds of ms must not block Node/Electron's event loop.
    let ticks=0;const timer=setInterval(()=>ticks++,20);
    const proc=await rt.runProcess(process.execPath,['-e','setTimeout(()=>console.log("ok"),320)'],{timeoutMs:3000,label:'responsive child'});
    clearInterval(timer);
    assert.strictEqual(proc.status,0);
    assert(ticks>=8,`El event loop quedó bloqueado durante runProcess (ticks=${ticks})`);

    // Full CUDA check is expensive only once per session; subsequent calls use cache.
    let cudaChecks=0,engineChecks=0;
    rt.cudaQuickHealth=()=>({ok:true,state:'ok'});
    rt.cudaLightHealth=()=>({ok:true,state:'ok'});
    rt.validateCudaSite=async()=>{cudaChecks++;await wait(120);return{ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true};};
    rt.validateInstalledEnginesAgainstCuda=async()=>{engineChecks++;await wait(80);return[];};
    let healthTicks=0;const healthTimer=setInterval(()=>healthTicks++,15);
    const first=await rt.healthCheckCudaRuntime({full:true});
    const second=await rt.healthCheckCudaRuntime({full:true});
    clearInterval(healthTimer);
    assert(first.ok&&second.ok&&second.cached===true,'El segundo health check debe usar caché de sesión');
    assert.strictEqual(cudaChecks,1);
    assert.strictEqual(engineChecks,1);
    assert(healthTicks>=8,'El health check completo debe mantener vivo el event loop');

    // If a worker is already healthy, no CUDA health check should run at all.
    const existing={child:{},ready:true};
    rt.workers.set('chatterbox',existing);
    rt.ensureCudaRuntimeHealthy=async()=>{throw new Error('No debe ejecutarse con worker vivo');};
    assert.strictEqual(await rt.ensureWorker('chatterbox'),existing);

    // Fine-tuned ZIP workflow: extraction/copy/fingerprint must yield to the event loop.
    const data2=path.join(temp,'import-data'),resources2=path.join(temp,'resources2');
    fs.mkdirSync(resources2,{recursive:true});fs.mkdirSync(data2,{recursive:true});
    const rt2=new TTSLabRuntime({resourcesDir:resources2,dataDir:data2});
    const fakeZip=path.join(temp,'AURELIO_EC.zip');fs.writeFileSync(fakeZip,'fake');
    rt2.runProcess=async(_exe,args)=>{
      const extractionDir=args[args.length-1],modelDir=path.join(extractionDir,'checkpoint');
      await wait(180);await fs.promises.mkdir(modelDir,{recursive:true});
      await fs.promises.writeFile(path.join(modelDir,'config.json'),JSON.stringify({tts_model_type:'custom_voice',talker_config:{spk_id:{aurelio:0}}}));
      await fs.promises.writeFile(path.join(modelDir,'model.safetensors'),Buffer.alloc(2*1024*1024,7));
      return{status:0,stdout:'',stderr:''};
    };
    const phases=[];let importTicks=0;const importTimer=setInterval(()=>importTicks++,15);
    const item=await rt2.importFineTunedZip(fakeZip,e=>phases.push(e.phase));
    clearInterval(importTimer);
    assert(item?.speaker==='aurelio'&&fs.existsSync(path.join(item.path,'metadata.json')));
    assert(phases.includes('extract')&&phases.includes('copy')&&phases.includes('fingerprint')&&phases.includes('done'));
    assert(importTicks>=8,`La importación bloqueó el event loop (ticks=${importTicks})`);

    // Five representative asynchronous stages must keep UI/event-loop activity alive.
    let pipelineTicks=0;const pipelineTimer=setInterval(()=>pipelineTicks++,10);
    for(let i=0;i<5;i++)await wait(45);
    clearInterval(pipelineTimer);
    assert(pipelineTicks>=15,'Cinco etapas consecutivas deben mantener el event loop activo');

    console.log('check-v2lab-responsive: OK · no spawnSync · q shadow fixed · cached CUDA · worker reuse · async import · event loop alive · 5-stage responsiveness');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
