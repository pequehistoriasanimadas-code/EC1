'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(async()=>{let tmp='';try{
  const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8'));
  assert.strictEqual(pkg.version,'2.0.0-lab.24');
  const runtimePath=path.join(appRoot,'src','services','ttsLabRuntime.js');
  const {TTSLabRuntime}=require(runtimePath);
  const source=fs.readFileSync(runtimePath,'utf8'),renderer=fs.readFileSync(path.join(appRoot,'src','renderer-v2lab.js'),'utf8'),optimizer=fs.readFileSync(path.join(appRoot,'src','renderer-0321.js'),'utf8'),release=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Lab.js'),'utf8');
  assert(!source.includes('spawnSync'),'El runtime empaquetado todavía contiene spawnSync');
  assert(source.includes('cudaHealthTtlMs')&&source.includes('cachedCudaHealth')&&source.includes('cudaHealthPromise'),'Cache CUDA de sesión no empaquetada');
  assert(source.includes('await this.waitForMaintenance()')&&source.includes('if(existing?.child&&existing.ready)return existing')&&source.includes('await this.ensureCudaRuntimeHealthy()'),'Worker reuse-first no empaquetado');
  assert(renderer.includes('qwenParams=settings?.tts?.engineParams?.qwen3tts')&&!renderer.includes(",q=settings?.tts?.engineParams?.qwen3tts"),'Fix de q shadow no empaquetado');
  assert(renderer.includes("window.__GEC_V2LAB_RENDERER_RESPONSIVE__='lab24'"),'Marcador de renderer lab.23 no empaquetado');
  assert(optimizer.includes("version:'2.0-lab.24'")&&optimizer.includes('GEC valida ambos motores'),'Optimizador lab.23 no empaquetado');
  assert(release.includes('await labRuntime().importFineTunedZip')&&release.includes("type:'tts-lab-import'")===false,'Handler asíncrono debe delegar progreso al runtime');

  tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gec-packaged-lab17-'));
  const rt=new TTSLabRuntime({resourcesDir,dataDir:tmp});
  let ticks=0;const timer=setInterval(()=>ticks++,25);
  const proc=await rt.runProcess('cmd.exe',['/d','/s','/c','ping -n 2 127.0.0.1 >nul'],{timeoutMs:5000,label:'packaged responsive child'});
  clearInterval(timer);
  assert.strictEqual(proc.status,0);
  assert(ticks>=10,`Event loop empaquetado bloqueado (ticks=${ticks})`);

  fs.rmSync(tmp,{recursive:true,force:true});tmp='';
  console.log('PACKAGED V2 RESPONSIVE lab.23 OK · no spawnSync · q fixed · session CUDA cache · event loop alive');
  app.exit(0);
}catch(e){console.error(e.stack||e);try{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}catch{}app.exit(1);}});
