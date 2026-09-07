'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{let tmp='';try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.15');

  const servicePath=path.join(appRoot,'src','services','releaseV2ProductionFidelity.js');
  const localPath=path.join(appRoot,'src','services','localRuntime.js');
  const policyPath=path.join(appRoot,'src','services','version0320LocalPolicy.js');
  const {resolvePipelineMode,normalizeLocalConfig,expectedVsRuntime,PROFILE_VERSION}=require(servicePath);
  const {LocalRuntime}=require(localPath);
  const {installVersion0320LocalPolicy}=require(policyPath);
  assert.strictEqual(PROFILE_VERSION,'2.0-lab.15');

  const source=fs.readFileSync(servicePath,'utf8');
  const automation=fs.readFileSync(path.join(appRoot,'src','services','automation0325.js'),'utf8');
  const main=fs.readFileSync(path.join(appRoot,'src','main.js'),'utf8');
  const worker=fs.readFileSync(path.join(appRoot,'src','tts_lab_worker.py'),'utf8');
  const runtime=fs.readFileSync(path.join(appRoot,'src','services','ttsLabRuntime.js'),'utf8');
  const renderer=fs.readFileSync(path.join(appRoot,'src','renderer-0321.js'),'utf8');
  const preload=fs.readFileSync(path.join(appRoot,'src','preload.js'),'utf8');

  assert(source.includes('active-production-profile.json')&&source.includes('PRODUCTION_PROFILE_MISMATCH'),'Production source of truth no empaquetado');
  assert(main.includes('history,localRuntime,getSettings'),'LocalRuntime directo no empaquetado');
  assert(automation.includes('const local=this.localRuntime')&&automation.includes('GPU_SWAP_LOCAL_STILL_RUNNING'),'GPU SWAP estricto no empaquetado');
  assert(worker.includes('productionSeed')&&worker.includes('productionTemperature')&&worker.includes('chunk_diagnostics'),'Consistencia Qwen no empaquetada');
  assert(runtime.includes('chunkDiagnostics:Array.isArray(r.chunk_diagnostics)'),'Chunk diagnostics no empaquetados');
  assert(renderer.includes('optimizationV2Commit')&&renderer.includes('REOPTIMIZAR PRODUCCIÓN'),'UI production profile no empaquetada');
  assert(preload.includes('optimizationV2Status')&&preload.includes('optimizationV2Commit'),'IPC production profile no empaquetado');

  installVersion0320LocalPolicy();
  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-packaged-lab15-'));
  const rt=new LocalRuntime({resourcesDir,dataDir:tmp});
  rt.configure('tuned',{label:'GPU alta',ctx:4096,gpuLayers:48,batch:384,ubatch:192,threads:4,prio:-1,poll:0,warmup:false});
  assert.strictEqual(rt.profile().gpuLayers,48,'Packaged LocalRuntime tuned cayó a safe_streaming');

  const s={ai:{primary:'local',lastLocalBenchmark:{coexistenceMode:'gpu-swap',swapValidated:false}},tts:{engine:'qwen3tts'},activeOptimizationV2:{valid:true,pipeline:{mode:'gpu-coordinated',validated:true,swapValidated:false,coordinatedValidated:true}}};
  assert.strictEqual(resolvePipelineMode(s),'gpu-coordinated');
  s.activeOptimizationV2.pipeline.mode='gpu-swap';
  assert.strictEqual(resolvePipelineMode(s),'gpu-coordinated');
  s.activeOptimizationV2.pipeline.swapValidated=true;
  assert.strictEqual(resolvePipelineMode(s),'gpu-swap');

  const p={localAi:{required:true,config:normalizeLocalConfig({gpuLayers:48,ctx:4096,batch:384,ubatch:192,threads:4})}};
  assert(expectedVsRuntime(p,{resourceMode:'tuned',profile:p.localAi.config}).ok);
  assert(!expectedVsRuntime(p,{resourceMode:'tuned',profile:{...p.localAi.config,gpuLayers:20}}).ok);

  fs.rmSync(tmp,{recursive:true,force:true});tmp='';
  console.log('PACKAGED V2 PRODUCTION FIDELITY lab.15 OK · tuned 48 · profile/pipeline fidelity · strict swap · stable voice diagnostics');
  app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
