'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','services','automation0325.js'),'utf8');
const {selectGpuRequestIndex}=require(path.join(root,'src','services','automation0325.js'));

assert.strictEqual(selectGpuRequestIndex([{kind:'ai'},{kind:'voice'}],0,2),1,'La voz debe tener prioridad inicial');
assert.strictEqual(selectGpuRequestIndex([{kind:'ai'},{kind:'voice'}],1,2),1,'La voz puede usar dos turnos consecutivos');
assert.strictEqual(selectGpuRequestIndex([{kind:'ai'},{kind:'voice'}],2,2),0,'Qwen debe recibir turno tras dos voces para evitar starvation');
assert.strictEqual(selectGpuRequestIndex([{kind:'voice'},{kind:'voice'}],9,2),0,'Si solo hay voz no debe bloquearse');
assert.strictEqual(selectGpuRequestIndex([{kind:'ai'}],0,2),0,'Si solo hay IA debe avanzar');

const queue=[];
for(let i=1;i<=5;i++){queue.push({kind:'ai',id:'ai'+i},{kind:'voice',id:'voice'+i});}
let burst=0,maxBurst=0,processed=[];
while(queue.length){
  const idx=selectGpuRequestIndex(queue,burst,2),req=queue.splice(idx,1)[0];
  processed.push(req.id);
  if(req.kind==='voice'){burst++;maxBurst=Math.max(maxBurst,burst);}else burst=0;
}
assert.strictEqual(processed.length,10,'La simulación de 5 noticias debe completar las 10 etapas GPU');
assert(maxBurst<=2,'La cola no debe encadenar más de dos voces si Qwen espera');
assert(processed.includes('ai5')&&processed.includes('voice5'),'La quinta noticia no debe quedar bloqueada');

const aiStart=source.indexOf("editorial=await this.runStage('ai'");
const aiEnd=source.indexOf('},holder);',aiStart);
const pronunciation=source.indexOf('this.pronunciation.normalize',aiStart);
assert(aiStart>=0&&aiEnd>aiStart&&pronunciation>aiEnd,'Pronunciación debe ejecutarse fuera del bloqueo GPU de Qwen');
assert(source.includes('gpuQueueTimeoutMs=180000')&&source.includes("GPU_QUEUE_TIMEOUT"),'Debe existir watchdog de espera de cola GPU');
assert(source.includes('performanceSummary()')&&source.includes('voiceWaitMedianMs')&&source.includes('totalP95Ms'),'Debe conservar métricas históricas mediana/P95');
assert(source.includes("voiceBacklog>=2?1:2"),'Backpressure debe reducir workers si se acumula voz');
assert(source.includes("engine==='qwen3tts'?'gpu-swap':'gpu-coordinated'"),'Qwen3-TTS sin optimizar debe usar GPU SWAP seguro');
assert(source.includes('releaseOppositeForGpuSwap')&&source.includes('stopAndWait'),'GPU SWAP debe esperar liberación real de los runtimes');
console.log('check-v2lab-pipeline: OK · 5 noticias · anti-starvation · pronunciación fuera de GPU · watchdog/backpressure · GPU SWAP seguro');
