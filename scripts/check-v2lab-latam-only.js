'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {normalizeProfileTts,optimizationKey}=require(path.join(root,'src','services','releaseV2Lab.js'));
const {TTSLabRuntime}=require(path.join(root,'src','services','ttsLabRuntime.js'));
const {PROFILE_VERSION}=require(path.join(root,'src','services','releaseV2ProductionFidelity.js'));

(async()=>{
  const pkg=JSON.parse(read('package.json'));
  const ui=read('src/renderer-v2lab.js');
  const worker=read('src/tts_lab_worker.py');
  const runtimeSrc=read('src/services/ttsLabRuntime.js');
  const routing=read('src/services/releaseV2Lab.js');
  const optimizer=read('src/renderer-0321.js');

  assert.strictEqual(pkg.version,'2.0.0-lab.17');
  assert.strictEqual(PROFILE_VERSION,'2.0-lab.17');

  const migrated=normalizeProfileTts({engine:'chatterbox',engineParams:{chatterbox:{variant:'multilingual'}}});
  assert.strictEqual(migrated.engineParams.chatterbox.variant,'latam','Un perfil antiguo Multilingual debe migrar automáticamente a LatAm');
  assert.strictEqual(optimizationKey(migrated),'chatterbox:latam');
  assert(routing.includes("if(rawVariant==='latam'&&s.tts.engineOptimizations.chatterbox")&&routing.includes("else applyOptimization(s,null)"),'Una optimización antigua sin variante no puede ser reetiquetada silenciosamente como LatAm');

  assert(!ui.includes('id="v2ChatterVariant"'),'No debe existir selector de modelo de español');
  assert(!ui.includes('Multilingual V3'),'Multilingual no debe aparecer en la interfaz');
  assert(ui.includes('Español latinoamericano ✓')&&ui.includes('Comprobar consistencia'),'La UI debe mostrar LatAm fijo y la prueba simple de consistencia');
  assert(optimizer.includes("if(e==='chatterbox')return'Chatterbox V3 · LatAm'"),'El optimizador debe identificar Chatterbox solo como LatAm');

  assert(!worker.includes('ChatterboxMultilingualTTS.from_pretrained'),'El worker no puede cargar la ruta Multilingual general');
  assert(!worker.includes('requested = "chatterbox-" + chatterbox_variant'),'El worker no puede elegir variante dinámicamente');
  assert(worker.includes('requested = "chatterbox-latam"'));
  assert(worker.includes('variant = "latam"'));
  assert(worker.includes('if ENGINE == "chatterbox" and bool(params.get("forceSingleChunk"))'));

  assert(runtimeSrc.includes("chatterboxVariant(params={}){return'latam';}"));
  assert(runtimeSrc.includes('chatterbox.latam.')&&!runtimeSrc.includes('chatterboxPreparedMultilingual'));
  assert(runtimeSrc.includes('checkChatterboxConsistency'));
  const consistencyText=runtimeSrc.match(/checkChatterboxConsistency[\s\S]*?const text='([^']+)'/);
  assert(consistencyText&&consistencyText[1].length>540,'La prueba B/C debe dividir realmente el texto con el chunk de producción');
  assert(routing.includes("bind('tts-lab:checkConsistency'"));
  assert(ui.includes("await window.ECAPI.stopLocal?.()"),'La prueba de consistencia debe liberar Qwen local antes de medir Chatterbox');

  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab17-latam-'));
  try{
    const rt=new TTSLabRuntime({resourcesDir:tmp,dataDir:tmp});
    rt.voice=id=>id==='ref-test'?{id,name:'Test',path:path.join(tmp,'ref.wav'),audioInfo:{fingerprint:'abc123',durationSec:18,quality:'good'}}:null;
    const calls=[];
    rt.generate=async(id,text,opts)=>{
      const file=path.join(tmp,'sample-'+calls.length+'.wav');
      fs.writeFileSync(file,Buffer.from('RIFF'+String(calls.length).padStart(16,'0')));
      calls.push({id,text,opts});
      return{path:file,url:'file:///'+file.replace(/\\/g,'/'),durationSec:30,realtimeFactor:.8,chunkDiagnostics:[]};
    };
    const r=await rt.checkChatterboxConsistency({referenceVoiceId:'ref-test',style:'news',params:{variant:'multilingual'}});
    assert(r.ok);
    assert.strictEqual(calls.length,3);
    assert.strictEqual(calls[0].opts.params.variant,'latam');
    assert.strictEqual(calls[1].opts.params.variant,'latam');
    assert.strictEqual(calls[2].opts.params.variant,'latam');
    assert.strictEqual(calls[0].opts.params.forceSingleChunk,true);
    assert.strictEqual(calls[1].opts.params.forceSingleChunk,false);
    assert.strictEqual(calls[2].opts.params.forceSingleChunk,false);
    assert(calls[0].opts.params.productionSeed>0);
    assert.strictEqual(calls[0].opts.params.productionSeed,calls[1].opts.params.productionSeed);
    assert.strictEqual(calls[1].opts.params.productionSeed,calls[2].opts.params.productionSeed);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}

  console.log('check-v2lab-latam-only: OK · Multilingual removed · legacy migration -> LatAm · consistency A/B/C locked');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
