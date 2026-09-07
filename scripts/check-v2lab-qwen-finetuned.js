'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {TTSLabRuntime,CACHE_REVISION}=require(path.join(root,'src','services','ttsLabRuntime.js'));

(async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-qwen-lab11-'));
  try{
    const rt=new TTSLabRuntime({resourcesDir:tmp,dataDir:tmp});
    rt.installed=()=>true;
    rt.ensureWorker=async()=>({ready:true});
    const models={
      'ft-a':{id:'ft-a',name:'AURELIO_GEC_Qwen3TTS',path:path.join(tmp,'aurelio'),speaker:'aurelio',fingerprint:'fp-a'},
      'ft-b':{id:'ft-b',name:'OTRO',path:path.join(tmp,'otro'),speaker:'otro',fingerprint:'fp-b'}
    };
    rt.fineTunedModel=id=>models[id]||null;
    const calls=[];
    rt.command=async(id,payload)=>{
      calls.push({id,payload});
      if(payload.cmd==='validate_qwen')return{validated:true,repaired:['speech_tokenizer/preprocessor_config.json'],shared_assets_ok:true};
      if(payload.cmd==='prepare')return{prepared:true,device:'cuda',gpu_name:'RTX TEST',gpu_vram_mb:12288,torch_version:'2.6.0',torch_cuda:'12.4',cuda_available:true,repaired_assets:['overlay:speech_tokenizer/preprocessor_config.json']};
      throw new Error('unexpected '+payload.cmd);
    };

    const params={voiceMode:'finetuned',fineTunedModelId:'ft-a',temperature:.78,speed:1};
    const prepared=await rt.prepare('qwen3tts',{params});
    const prepCall=calls.find(x=>x.payload.cmd==='prepare');
    const validateCall=calls.find(x=>x.payload.cmd==='validate_qwen');
    assert(prepCall,'Debe ejecutar prepare del modelo seleccionado');
    assert.strictEqual(validateCall,undefined,'Lab.14 evita una segunda validación redundante: prepare valida y materializa el overlay en el worker');
    assert.strictEqual(prepCall.payload.qwen_mode,'finetuned');
    assert.strictEqual(prepCall.payload.model_path,models['ft-a'].path,'Preparar no debe caer al modelo Base');
    assert.strictEqual(prepCall.payload.speaker,'aurelio');
    assert.strictEqual(prepared.fineTunedModelId,'ft-a');
    assert.strictEqual(prepared.fineTunedFingerprint,'fp-a');
    assert(prepared.repairedAssets.includes('overlay:speech_tokenizer/preprocessor_config.json'));
    assert.strictEqual(rt.prepared('qwen3tts',{params}),true,'El checkpoint exacto debe quedar preparado');
    assert.strictEqual(rt.prepared('qwen3tts',{params:{voiceMode:'finetuned',fineTunedModelId:'ft-b'}}),false,'Otro fine-tuned no puede heredar estado preparado');
    assert.strictEqual(CACHE_REVISION,'lab11-r1');

    const marker=rt.preparedInfo('qwen3tts');
    assert.strictEqual(marker.selectionKey,'finetuned:ft-a:fp-a');
    assert.strictEqual(marker.fineTunedFingerprint,'fp-a');

    const worker=read('src/tts_lab_worker.py');
    assert(worker.includes('speech_tokenizer/preprocessor_config.json'),'Worker debe comprobar el feature extractor de speech_tokenizer');
    assert(worker.includes('force_download=True'),'Worker debe poder reparar un archivo faltante/corrupto');
    assert(worker.includes('QWEN_BASE_MODEL_FILES'),'Zero-shot debe descargar Base completo y fine-tuned solo activos compartidos');
    assert(worker.includes('ensure_qwen_assets(model_path')&&worker.includes('GEC_TTS_MODEL_OVERLAYS')&&worker.includes('return overlay, repaired'),'Fine-tuned debe materializar un overlay separado sin modificar el checkpoint importado');
    assert(worker.includes('_release_model_memory()')&&worker.includes('torch.cuda.empty_cache()'),'Worker debe liberar memoria CUDA al cambiar/detener modelos');

    const release=read('src/services/releaseV2Lab.js');
    assert(release.includes('qwen3tts:finetuned:')&&release.includes('ttsModelFingerprint'),'La optimización debe ligarse al checkpoint concreto');
    assert(release.includes("tts-lab:validateSelected"),'Debe existir preflight IPC del Qwen seleccionado');

    const opt=read('src/services/releaseV2Optimization.js');
    assert(opt.includes("mode:'gpu-swap'")&&opt.includes('swapValidated:true'),'Optimización debe disponer de GPU SWAP validado');
    assert(opt.includes('coordinatedValidated:true')&&opt.includes('coordinatedTpsRatio')&&opt.includes('tpsRatio>=.70'),'GPU coordinada debe superar una prueba secuencial residente y conservar al menos 70% del rendimiento');
    assert(opt.includes('v2-swap-validation-release-local'),'GPU SWAP debe probar liberación real del Qwen local');

    const automation=read('src/services/automation0325.js');
    assert(automation.includes("mode==='gpu-swap'")&&automation.includes('releaseOppositeForGpuSwap'),'Pipeline real debe ejecutar GPU SWAP');
    assert(automation.includes("gpu-swap-before-ai")&&automation.includes("gpu-swap-before-voice"),'GPU SWAP debe liberar el motor opuesto en cada etapa');

    const ui=read('src/renderer-v2lab.js'),optimizerUi=read('src/renderer-0321.js');
    assert(!ui.includes('ttsLabValidateSelected')&&ui.includes('currentOptimizationKey')&&ui.includes('ttsModelFingerprint'),'UI lab.15 debe evitar la prevalidación duplicada e invalidar tuning al cambiar fine-tuned');
    assert(optimizerUi.includes("version:'2.0-lab.15'")&&optimizerUi.includes('Qwen local (texto)')&&optimizerUi.includes('GPU SWAP'),'Optimizador lab.15 debe distinguir texto/voz y mostrar GPU SWAP');
    assert(optimizerUi.includes('await window.ECAPI.ttsLabStop')&&optimizerUi.includes('await window.ECAPI.stopLocal'),'Optimización debe limpiar ambos runtimes al finalizar');

    console.log('check-v2lab-qwen-finetuned: OK · Aurelio exacto · reparación speech_tokenizer · tuning por fingerprint · GPU SWAP · cleanup');
  }finally{try{fs.rmSync(tmp,{recursive:true,force:true});}catch{}}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
