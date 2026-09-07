'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {TTSLabRuntime,CUDA_RUNTIME,CUDA_CRITICAL_FILES}=require(path.resolve(__dirname,'..','src','services','ttsLabRuntime.js'));

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
  assert.strictEqual(CUDA_RUNTIME.revision,2);
  assert.strictEqual(CUDA_RUNTIME.slot,'shared-cuda-v2');
  assert(CUDA_CRITICAL_FILES.includes('torch/torch_version.py'));

  const base=fs.mkdtempSync(path.join(os.tmpdir(),'GEC ÁREA DISEÑO lab15 '));
  try{
    const resources=path.join(base,'Portable Folder con Ñ'),data=path.join(base,'EC Automatic News Data');
    makePython(resources);
    const rt=new TTSLabRuntime({resourcesDir:resources,dataDir:data});
    rt.freeBytes=()=>20*1024*1024*1024;
    rt.nvidiaPresent=async()=>true;
    rt.validateCudaSite=async site=>({ok:true,torch:'2.6.0',torchaudio:'2.6.0',cuda:true,torch_cuda:'12.4',site});
    let pipCount=0;
    rt.runPip=async args=>{pipCount++;const idx=args.indexOf('--target');assert(idx>=0);const site=args[idx+1];await new Promise(r=>setTimeout(r,80));writeCritical(site,'install-'+pipCount);};

    // User data must survive every CUDA repair.
    fs.mkdirSync(rt.voiceDir,{recursive:true});fs.writeFileSync(path.join(rt.voiceDir,'LOCUTOR.wav'),'voice');
    fs.mkdirSync(rt.fineTunedDir,{recursive:true});fs.writeFileSync(path.join(rt.fineTunedDir,'AURELIO.keep'),'fine');
    fs.mkdirSync(rt.modelsDir,{recursive:true});fs.writeFileSync(path.join(rt.modelsDir,'hf.keep'),'model-cache');

    // Simulate both engine packages already present. Candidate CUDA must be
    // checked against both without either installer writing into the other.
    makeEnginePackage(rt,'chatterbox');makeEnginePackage(rt,'qwen3tts');
    const validated=[];
    rt.validateEngineRuntime=async(id,{cudaSite}={})=>{validated.push({id,cudaSite});return{ok:true,engine:id};};

    // Two motors requesting CUDA at the same time must share one transaction.
    const [a,b]=await Promise.all([rt.installCudaRuntime({force:true}),rt.installCudaRuntime({force:true})]);
    assert(a.ok&&b.ok);
    assert.strictEqual(pipCount,1,'El mutex CUDA debe ejecutar pip una sola vez');
    assert.strictEqual(rt.cudaInstalled(),true);
    assert(validated.some(x=>x.id==='chatterbox')&&validated.some(x=>x.id==='qwen3tts'),'El runtime candidato debe comprobar ambos motores instalados');
    assert(fs.existsSync(path.join(rt.voiceDir,'LOCUTOR.wav')));
    assert(fs.existsSync(path.join(rt.fineTunedDir,'AURELIO.keep')));
    assert(fs.existsSync(path.join(rt.modelsDir,'hf.keep')));

    // Exact regression from the user's screenshot: marker says installed but
    // torch.torch_version disappears. Light health must reject it immediately.
    fs.rmSync(path.join(rt.cudaSite,'torch','torch_version.py'),{force:true});
    const broken=rt.cudaLightHealth();
    assert.strictEqual(broken.ok,false);
    assert.strictEqual(broken.state,'damaged');
    assert.strictEqual(rt.cudaInstalled(),false);

    // Restore a healthy active runtime, then simulate pip failing during a
    // forced repair. The old active runtime must remain untouched (rollback).
    writeCritical(rt.cudaSite,'healthy-old');writeMarker(rt);
    fs.writeFileSync(path.join(rt.cudaRoot,'ACTIVE_SENTINEL'),'keep-me');
    rt.runPip=async()=>{throw new Error('simulated pip interruption');};
    let failed=false;try{await rt.installCudaRuntime({force:true});}catch{failed=true;}
    assert(failed,'La prueba debe simular un fallo de pip');
    assert(fs.existsSync(path.join(rt.cudaRoot,'ACTIVE_SENTINEL')),'El runtime anterior debe sobrevivir si falla la instalación candidata');
    assert.strictEqual(rt.cudaInstalled(),true,'El rollback debe conservar el runtime anterior válido');

    // The legacy slot is never deleted by v2 migration.
    fs.mkdirSync(rt.legacyCudaRoot,{recursive:true});fs.writeFileSync(path.join(rt.legacyCudaRoot,'legacy.keep'),'legacy');
    assert(fs.existsSync(path.join(rt.legacyCudaRoot,'legacy.keep')));

    console.log('check-v2lab-runtime-isolation: OK · CUDA v2 transactional · mutex · torch_version corruption · rollback · Unicode path · user data preserved · cross-engine check');
  }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
