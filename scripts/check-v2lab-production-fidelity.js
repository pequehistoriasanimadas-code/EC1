'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {LocalRuntime}=require(path.join(root,'src','services','localRuntime.js'));
const {installVersion0320LocalPolicy}=require(path.join(root,'src','services','version0320LocalPolicy.js'));
const {
  PROFILE_VERSION,
  compatibility,
  profileFile,
  hydrateSettings,
  resolvePipelineMode,
  expectedVsRuntime,
  normalizeLocalConfig,
  sameConfig
}=require(path.join(root,'src','services','releaseV2ProductionFidelity.js'));
const {ttsRuntimeSignature}=require(path.join(root,'src','services','releaseV2Lab.js'));

(async()=>{
  const pkg=JSON.parse(read('package.json'));
  const service=read('src/services/releaseV2ProductionFidelity.js');
  const automation=read('src/services/automation0325.js');
  const main=read('src/main.js');
  const worker=read('src/tts_lab_worker.py');
  const runtime=read('src/services/ttsLabRuntime.js');
  const renderer=read('src/renderer-0321.js');
  const preload=read('src/preload.js');
  const bootstrap=read('src/bootstrap-v2lab.js');

  assert.strictEqual(pkg.version,'2.0.0-lab.27');
  assert.strictEqual(PROFILE_VERSION,'2.0-lab.25');
  assert(service.includes('active-production-profile.json'),'Falta fuente única de verdad persistente');
  const localPolicy=read('src/services/version0320LocalPolicy.js');
  assert(localPolicy.includes('prio:p.prio,poll:p.poll,warmup:p.warmup===true'),'LocalRuntime status debe exponer el perfil tuned completo para evitar falsos mismatch');
  assert(service.includes("s.ai.localResourceMode='tuned'")&&service.includes('s.ai.localTunedConfig=clone(profile.localAi.config)'),'El perfil no hidrata Qwen local');
  assert(service.includes("return'gpu-coordinated'")&&service.includes("legacy==='gpu-swap'&&settings?.ai?.lastLocalBenchmark?.swapValidated===true"),'GPU SWAP no está protegido contra fallback silencioso');
  assert(service.includes('PRODUCTION_PROFILE_MISMATCH')&&service.includes('expectedVsRuntime'),'Falta preflight Perfil esperado = Perfil activo');
  assert(main.includes('history,localRuntime,getSettings'),'AutomationEngine no recibe LocalRuntime directamente');
  assert(automation.includes('this.localRuntime=args?.localRuntime||null'),'AutomationEngine no conserva LocalRuntime');
  assert(automation.includes('const local=this.localRuntime')&&!automation.includes('const local=global.__ec0320LocalRuntime'),'GPU SWAP sigue dependiendo del global heredado');
  assert(automation.includes('GPU_SWAP_LOCAL_STILL_RUNNING'),'GPU SWAP no verifica cierre real');
  assert(worker.includes('productionSeed')&&worker.includes('productionTemperature')&&worker.includes('stable-v1'),'Falta consistencia Qwen de producción');
  assert(worker.includes('talker_top_k = perf["talkerTopK"] or (20 if stable_mode else 50)')&&worker.includes('talker_top_p = perf["talkerTopP"] or (0.90 if stable_mode else 1.0)')&&worker.includes('subtalker_top_k'),'Sampling fine-tuned lab.23 no aplicado');
  assert(worker.includes('chunk_diagnostics')&&runtime.includes('chunkDiagnostics:Array.isArray(r.chunk_diagnostics)'),'Diagnóstico de chunks no cruza worker/runtime');
  assert(renderer.includes('optimizationV2Commit')&&renderer.includes('REOPTIMIZAR PRODUCCIÓN')&&renderer.includes('Perfil de producción:'),'UI no está vinculada al perfil de producción');
  assert(preload.includes('optimizationV2Status')&&preload.includes('optimizationV2Commit'),'Bridge lab.23 incompleto');
  assert(bootstrap.includes('releaseV2ProductionFidelity'),'Capa lab.23 no instalada');

  installVersion0320LocalPolicy();
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-lab17-'));
  try{
    const rt=new LocalRuntime({resourcesDir:tmp,dataDir:tmp});
    rt.configure('tuned',{label:'GPU alta',ctx:4096,gpuLayers:48,batch:384,ubatch:192,threads:4,prio:-1,poll:0,warmup:false});
    const p=rt.profile();
    assert.strictEqual(rt.resourceMode,'tuned');
    assert.strictEqual(p.gpuLayers,48);
    assert.strictEqual(p.batch,384);
    assert.strictEqual(p.ubatch,192);

    const ranked=rt.__ec0320RankCandidates([
      {id:'gpu-48',safe:true,error:'',medianElapsedMs:2000,worstElapsedMs:2500,cpuAverage:6,vramMaxMb:7782,config:{gpuLayers:48}},
      {id:'gpu-99',safe:true,error:'',medianElapsedMs:2000,worstElapsedMs:2500,cpuAverage:7,vramMaxMb:8602,config:{gpuLayers:99}}
    ]);
    assert.strictEqual(ranked[0].id,'gpu-48','Con rendimiento equivalente debe preferirse menor VRAM, no 99 capas');

    const settings={
      ai:{primary:'local',backup1:'none',backup2:'none',lastLocalBenchmark:{coexistenceMode:'gpu-swap',swapValidated:false}},
      tts:{engine:'chatterbox',engineParams:{chatterbox:{variant:'latam'}}},
      activeOptimizationV2:{valid:true,pipeline:{mode:'gpu-coordinated',validated:true,swapValidated:false,coordinatedValidated:true}}
    };
    assert.strictEqual(resolvePipelineMode(settings),'gpu-coordinated');
    settings.activeOptimizationV2.pipeline.mode='gpu-swap';
    assert.strictEqual(resolvePipelineMode(settings),'gpu-coordinated','GPU SWAP sin validación debe bajar a coordinada');
    settings.activeOptimizationV2.pipeline.swapValidated=true;
    assert.strictEqual(resolvePipelineMode(settings),'gpu-swap');

    const profileSettings={
      ai:{primary:'local',backup1:'none',backup2:'none'},
      tts:{engine:'chatterbox',engineParams:{chatterbox:{variant:'latam'}}}
    };
    const profile={
      schemaVersion:1,version:'2.0-lab.25',id:'test-profile',at:new Date().toISOString(),
      fingerprint:'hw-test',hardwareLabel:'test',
      runtimeSignature:ttsRuntimeSignature(profileSettings.tts),
      tts:{engine:'chatterbox',runtimeParams:{},expectedRtf:1.5},
      localAi:{required:true,mode:'tuned',config:normalizeLocalConfig({gpuLayers:48,ctx:4096,batch:384,ubatch:192,threads:4}),expectedTokensPerSec:100},
      pipeline:{mode:'gpu-coordinated',validated:true,swapValidated:false,coordinatedValidated:true},
      voiceConsistency:{mode:'default'}
    };
    fs.mkdirSync(path.dirname(profileFile(tmp)),{recursive:true});
    fs.writeFileSync(profileFile(tmp),JSON.stringify(profile,null,2));
    const hydrated=hydrateSettings(JSON.parse(JSON.stringify(profileSettings)),tmp);
    assert.strictEqual(hydrated.activeOptimizationV2.valid,true);
    assert.strictEqual(compatibility(profileSettings,{...profile,version:'2.0-lab.22'}).ok,true,'La optimización lab.22 de esta misma PC debe seguir siendo válida en lab.23');
    assert.strictEqual(hydrated.ai.localResourceMode,'tuned');
    assert.strictEqual(hydrated.ai.localTunedConfig.gpuLayers,48);
    assert.strictEqual(hydrated.ai.lastLocalBenchmark.coexistenceMode,'gpu-coordinated');

    const match=expectedVsRuntime(profile,{resourceMode:'tuned',profile:profile.localAi.config});
    assert(match.ok,'El perfil activo exacto debe aprobar preflight');
    const mismatch=expectedVsRuntime(profile,{resourceMode:'tuned',profile:{...profile.localAi.config,gpuLayers:20}});
    assert(!mismatch.ok,'20 capas no pueden aprobar un perfil que exige 48');

    const chatterFullProfile={localAi:{required:true,config:normalizeLocalConfig({label:'GPU completa rápida',ctx:4096,gpuLayers:99,batch:512,ubatch:256,threads:6,prio:0,poll:25,warmup:true})}};
    const chatterFullStatus={resourceMode:'tuned',profile:{label:'GPU completa rápida',ctx:4096,gpuLayers:99,batch:512,ubatch:256,threads:6,parallel:1,prio:0,poll:25,warmup:true}};
    const chatterFullMatch=expectedVsRuntime(chatterFullProfile,chatterFullStatus);
    assert(chatterFullMatch.ok,'Chatterbox + GPU completa 99 capas no debe producir falso Perfil optimizado no aplicado');
    const chatterMissingFields=expectedVsRuntime(chatterFullProfile,{resourceMode:'tuned',profile:{ctx:4096,gpuLayers:99,batch:512,ubatch:256,threads:6,parallel:1}});
    assert(!chatterMissingFields.ok&&chatterMissingFields.differences.some(d=>d.field==='warmup'),'La regresión debe detectar exactamente los campos tuned omitidos');

    assert(sameConfig(profile.localAi.config,{...profile.localAi.config,label:'otro texto'}),'La etiqueta no debe invalidar la configuración física');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}

  console.log('check-v2lab-production-fidelity: OK · profile source of truth · tuned 48 layers · pipeline fidelity · strict swap · stable Qwen chunks');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
