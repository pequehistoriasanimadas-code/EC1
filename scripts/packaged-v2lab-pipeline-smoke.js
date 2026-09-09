'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {app}=require('electron');
const resourcesDir=path.resolve(process.argv[2]||path.join('dist','win-unpacked','resources')),appRoot=path.join(resourcesDir,'app.asar');

app.whenReady().then(()=>{try{
  const automationPath=path.join(appRoot,'src','services','automation0325.js');
  const automationSource=fs.readFileSync(automationPath,'utf8');
  const {selectGpuRequestIndex}=require(automationPath);
  const queue=[];for(let i=1;i<=5;i++)queue.push({kind:'ai',id:'ai'+i},{kind:'voice',id:'voice'+i});
  let burst=0,maxBurst=0,count=0;
  while(queue.length){
    const idx=selectGpuRequestIndex(queue,burst,2);assert(idx>=0,'Selector GPU devolvió índice inválido');
    const req=queue.splice(idx,1)[0];count++;
    if(req.kind==='voice'){burst++;maxBurst=Math.max(maxBurst,burst);}else burst=0;
  }
  assert.strictEqual(count,10,'Smoke de 5 noticias no completó 10 etapas');
  assert(maxBurst<=2,'Smoke detectó starvation de Qwen por prioridad de voz');

  const aiStart=automationSource.indexOf("editorial=await this.runStage('ai'"),aiEnd=automationSource.indexOf('},holder);',aiStart),pron=automationSource.indexOf('this.pronunciation.normalize',aiStart);
  assert(aiStart>=0&&aiEnd>aiStart&&pron>aiEnd,'Pronunciación sigue dentro del bloqueo de Qwen');
  assert(automationSource.includes('gpuQueueTimeoutMs=180000')&&automationSource.includes('performanceSummary()'),'Watchdog/telemetría de pipeline no está empaquetada');

  const queueRenderer=fs.readFileSync(path.join(appRoot,'src','renderer-0332.js'),'utf8');
  assert(queueRenderer.includes('RTF ${rtf.toFixed(2)}')&&queueRenderer.includes('Watchdog GPU'),'UI empaquetada no muestra RTF/watchdog');
  const release=fs.readFileSync(path.join(appRoot,'src','services','releaseV2Lab.js'),'utf8');
  assert(release.includes('installProcessingWarmup')&&release.includes('ttsRuntimeSignature')&&release.includes("tts-lab:stop"),'Warm-up/invalidation/stop TTS no está empaquetado');
  const runtime=require(path.join(appRoot,'src','services','ttsLabRuntime.js'));
  assert(runtime.CACHE_REVISION==='lab11-r1','Cache TTS empaquetada no corresponde a lab.23');
  console.log('PACKAGED V2 PIPELINE lab.23 OK · 5 noticias · pronunciación liberada · anti-starvation · watchdog · RTF');
  app.exit(0);
}catch(e){console.error(e.stack||e);app.exit(1);}});
