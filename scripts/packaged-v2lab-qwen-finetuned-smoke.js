'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{let tmp='';try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.13','Versión empaquetada no es lab.13');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js');
  const {TTSLabRuntime,CACHE_REVISION}=require(runtimePath);
  assert.strictEqual(CACHE_REVISION,'lab11-r1');

  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-qwen-packaged-lab11-'));
  const rt=new TTSLabRuntime({resourcesDir,dataDir:tmp});
  rt.installed=()=>true;rt.ensureWorker=async()=>({ready:true});
  const fine={id:'ft-aurelio',name:'AURELIO_GEC_Qwen3TTS',path:path.join(tmp,'aurelio'),speaker:'aurelio',fingerprint:'aurelio-fp'};
  rt.fineTunedModel=id=>id===fine.id?fine:null;
  const calls=[];
  rt.command=async(id,payload)=>{calls.push(payload);if(payload.cmd==='validate_qwen')return{validated:true,repaired:['speech_tokenizer/preprocessor_config.json'],shared_assets_ok:true};if(payload.cmd==='prepare')return{prepared:true,device:'cuda',gpu_name:'RTX TEST',gpu_vram_mb:12288,torch_version:'2.6.0',torch_cuda:'12.4',cuda_available:true};throw new Error('unexpected '+payload.cmd);};
  const params={voiceMode:'finetuned',fineTunedModelId:fine.id};
  const out=await rt.prepare('qwen3tts',{params});
  const prep=calls.find(x=>x.cmd==='prepare'),val=calls.find(x=>x.cmd==='validate_qwen');
  assert(prep&&val,'El paquete no ejecuta preflight + prepare');
  assert.strictEqual(prep.qwen_mode,'finetuned');
  assert.strictEqual(prep.model_path,fine.path,'El paquete cayó al Qwen Base en vez de Aurelio');
  assert.strictEqual(prep.speaker,'aurelio');
  assert.strictEqual(out.fineTunedFingerprint,'aurelio-fp');
  assert.strictEqual(rt.prepared('qwen3tts',{params}),true);

  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const release=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Lab.js'),'utf8');
  const opt=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Optimization.js'),'utf8');
  const automation=fs.readFileSync(path.join(appRoot,'src','services','automation0325.js'),'utf8');
  const ui=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8');
  assert(worker.includes('speech_tokenizer/preprocessor_config.json')&&worker.includes('force_download=True'),'Autorreparación Qwen no está empaquetada');
  assert(release.includes('ttsModelFingerprint')&&release.includes("tts-lab:validateSelected"),'Fingerprint/preflight no está empaquetado');
  assert(opt.includes("mode:'gpu-swap'")&&opt.includes('swapValidated:true'),'GPU SWAP validado no está empaquetado');
  assert(automation.includes('releaseOppositeForGpuSwap')&&automation.includes('stopAndWait'),'GPU SWAP real no está empaquetado');
  assert(ui.includes('currentOptimizationKey')&&ui.includes('ttsLabValidateSelected'),'UI fine-tuned no está empaquetada');

  fs.rmSync(tmp,{recursive:true,force:true});tmp='';
  console.log('PACKAGED V2 QWEN FINE-TUNED lab.13 OK · Aurelio exacto · repair · fingerprint · GPU SWAP');
  app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
